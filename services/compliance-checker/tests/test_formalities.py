"""Tests for formalities checker agent."""

import json
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from src.agents.formalities import run_formalities
from src.models import GraphState


@pytest.fixture
def base_state():
    return GraphState(
        claims_text="1. A method comprising: a processor executing instructions.",
        specification_text="The invention uses a processor to execute instructions.",
        invention_narrative="A system that processes data.",
        ollama_url="http://127.0.0.1:11434",
        default_model="gemma4:26b",
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


class TestFormalities:
    @patch("src.agents.formalities.openai.AsyncOpenAI")
    async def test_pass_result(self, mock_cls, base_state):
        result_json = json.dumps([{
            "rule": "mpep_608_formalities",
            "status": "PASS",
            "claim_number": 1,
            "detail": "All elements supported",
            "citation": "MPEP 608.01(m)",
            "suggestion": None,
        }])
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=_mock_response(f"```json\n{result_json}\n```"))
        mock_cls.return_value = mock_client

        state = await run_formalities(base_state)

        results = json.loads(state.formalities_results)
        assert len(results) == 1
        assert results[0]["status"] == "PASS"
        assert state.total_input_tokens == 100
        assert state.total_output_tokens == 200

    @patch("src.agents.formalities.openai.AsyncOpenAI")
    async def test_fail_result(self, mock_cls, base_state):
        result_json = json.dumps([{
            "rule": "mpep_608_formalities",
            "status": "FAIL",
            "claim_number": 1,
            "detail": "Issue found",
            "citation": "MPEP 608.01(m)",
            "suggestion": "Fix the issue",
        }])
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=_mock_response(f"```json\n{result_json}\n```"))
        mock_cls.return_value = mock_client

        state = await run_formalities(base_state)

        results = json.loads(state.formalities_results)
        assert results[0]["status"] == "FAIL"

    @patch("src.agents.formalities.openai.AsyncOpenAI")
    async def test_api_error_sets_state_error(self, mock_cls, base_state):
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(side_effect=Exception("API timeout"))
        mock_cls.return_value = mock_client

        state = await run_formalities(base_state)

        assert state.error is not None
        assert "API timeout" in state.error

    @patch("src.agents.formalities.openai.AsyncOpenAI")
    async def test_malformed_json_handled(self, mock_cls, base_state):
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=_mock_response("Not JSON at all"))
        mock_cls.return_value = mock_client

        state = await run_formalities(base_state)

        assert state.error is not None or state.formalities_results == "[]"

    @patch("src.agents.formalities.openai.AsyncOpenAI")
    async def test_cost_accumulated(self, mock_cls, base_state):
        base_state.total_input_tokens = 50
        base_state.total_output_tokens = 100
        result_json = json.dumps([{"rule": "mpep_608_formalities", "status": "PASS", "claim_number": 1, "detail": "OK"}])
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=_mock_response(f"```json\n{result_json}\n```", 200, 300))
        mock_cls.return_value = mock_client

        state = await run_formalities(base_state)

        assert state.total_input_tokens == 250
        assert state.total_output_tokens == 400
