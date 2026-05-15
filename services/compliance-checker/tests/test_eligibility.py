"""Tests for eligibility checker agent.

Mocks call_llm_with_retry (the LiteLLM boundary).
"""

import json
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from src.agents.eligibility import run_eligibility
from src.models import GraphState


@pytest.fixture
def base_state():
    return GraphState(
        claims_text="1. A method comprising: a processor executing instructions.",
        specification_text="The invention uses a processor to execute instructions.",
        invention_narrative="A system that processes data.",
        ollama_url="http://127.0.0.1:11434",
        default_model="gemma4:e4b",
    )


def _mock_response(text: str, prompt_tokens: int = 100, completion_tokens: int = 200):
    mock_message = MagicMock()
    mock_message.content = text
    mock_choice = MagicMock()
    mock_choice.message = mock_message
    mock_usage = MagicMock()
    mock_usage.prompt_tokens = prompt_tokens
    mock_usage.completion_tokens = completion_tokens
    response = MagicMock()
    response.choices = [mock_choice]
    response.usage = mock_usage
    return response


class TestEligibility:
    @patch("src.agents.eligibility.call_llm_with_retry", new_callable=AsyncMock)
    async def test_pass_result(self, mock_call, base_state):
        result_json = json.dumps([{
            "rule": "101_eligibility",
            "status": "PASS",
            "claim_number": 1,
            "detail": "All elements supported",
            "citation": "MPEP 2106",
            "suggestion": None,
        }])
        mock_call.return_value = _mock_response(f"```json\n{result_json}\n```")

        state = await run_eligibility(base_state)

        results = json.loads(state.eligibility_results)
        assert len(results) == 1
        assert results[0]["status"] == "PASS"
        assert state.total_input_tokens == 100
        assert state.total_output_tokens == 200

    @patch("src.agents.eligibility.call_llm_with_retry", new_callable=AsyncMock)
    async def test_fail_result(self, mock_call, base_state):
        result_json = json.dumps([{
            "rule": "101_eligibility",
            "status": "FAIL",
            "claim_number": 1,
            "detail": "Issue found",
            "citation": "MPEP 2106",
            "suggestion": "Fix the issue",
        }])
        mock_call.return_value = _mock_response(f"```json\n{result_json}\n```")

        state = await run_eligibility(base_state)

        results = json.loads(state.eligibility_results)
        assert results[0]["status"] == "FAIL"

    @patch("src.agents.eligibility.call_llm_with_retry", new_callable=AsyncMock)
    async def test_api_error_sets_state_error(self, mock_call, base_state):
        mock_call.side_effect = Exception("API timeout")

        state = await run_eligibility(base_state)

        assert state.error is not None
        assert "API timeout" in state.error

    @patch("src.agents.eligibility.call_llm_with_retry", new_callable=AsyncMock)
    async def test_malformed_json_handled(self, mock_call, base_state):
        mock_call.return_value = _mock_response("Not JSON at all")

        state = await run_eligibility(base_state)

        assert state.error is not None or state.eligibility_results == "[]"

    @patch("src.agents.eligibility.call_llm_with_retry", new_callable=AsyncMock)
    async def test_cost_accumulated(self, mock_call, base_state):
        base_state.total_input_tokens = 50
        base_state.total_output_tokens = 100
        result_json = json.dumps([{"rule": "101_eligibility", "status": "PASS", "claim_number": 1, "detail": "OK"}])
        mock_call.return_value = _mock_response(f"```json\n{result_json}\n```", 200, 300)

        state = await run_eligibility(base_state)

        assert state.total_input_tokens == 250
        assert state.total_output_tokens == 400
