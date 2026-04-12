"""Tests for definiteness checker agent."""

import json
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from src.agents.definiteness import run_definiteness
from src.models import GraphState


@pytest.fixture
def base_state():
    return GraphState(
        claims_text="1. A method comprising: a processor executing instructions.",
        specification_text="The invention uses a processor to execute instructions.",
        invention_narrative="A system that processes data.",
        api_key="test-key",
        default_model="claude-sonnet-4-20250514",
    )


def _mock_response(text: str, input_tokens: int = 100, output_tokens: int = 200):
    response = MagicMock()
    response.content = [MagicMock(text=text)]
    response.usage = MagicMock(input_tokens=input_tokens, output_tokens=output_tokens)
    return response


class TestDefiniteness:
    @patch("src.agents.definiteness.anthropic.AsyncAnthropic")
    async def test_pass_result(self, mock_cls, base_state):
        result_json = json.dumps([{
            "rule": "112b_definiteness",
            "status": "PASS",
            "claim_number": 1,
            "detail": "All elements supported",
            "citation": "MPEP 2173.05(e)",
            "suggestion": None,
        }])
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=_mock_response(f"```json\n{result_json}\n```"))
        mock_cls.return_value = mock_client

        state = await run_definiteness(base_state)

        results = json.loads(state.definiteness_results)
        assert len(results) == 1
        assert results[0]["status"] == "PASS"
        assert state.total_input_tokens == 100
        assert state.total_output_tokens == 200

    @patch("src.agents.definiteness.anthropic.AsyncAnthropic")
    async def test_fail_result(self, mock_cls, base_state):
        result_json = json.dumps([{
            "rule": "112b_definiteness",
            "status": "FAIL",
            "claim_number": 1,
            "detail": "Issue found",
            "citation": "MPEP 2173.05(e)",
            "suggestion": "Fix the issue",
        }])
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=_mock_response(f"```json\n{result_json}\n```"))
        mock_cls.return_value = mock_client

        state = await run_definiteness(base_state)

        results = json.loads(state.definiteness_results)
        assert results[0]["status"] == "FAIL"

    @patch("src.agents.definiteness.anthropic.AsyncAnthropic")
    async def test_api_error_sets_state_error(self, mock_cls, base_state):
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(side_effect=Exception("API timeout"))
        mock_cls.return_value = mock_client

        state = await run_definiteness(base_state)

        assert state.error is not None
        assert "API timeout" in state.error

    @patch("src.agents.definiteness.anthropic.AsyncAnthropic")
    async def test_malformed_json_handled(self, mock_cls, base_state):
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=_mock_response("Not JSON at all"))
        mock_cls.return_value = mock_client

        state = await run_definiteness(base_state)

        assert state.error is not None or state.definiteness_results == "[]"

    @patch("src.agents.definiteness.anthropic.AsyncAnthropic")
    async def test_cost_accumulated(self, mock_cls, base_state):
        base_state.total_input_tokens = 50
        base_state.total_output_tokens = 100
        result_json = json.dumps([{"rule": "112b_definiteness", "status": "PASS", "claim_number": 1, "detail": "OK"}])
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=_mock_response(f"```json\n{result_json}\n```", 200, 300))
        mock_cls.return_value = mock_client

        state = await run_definiteness(base_state)

        assert state.total_input_tokens == 250
        assert state.total_output_tokens == 400
