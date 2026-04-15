"""
Tests for the Planner agent.
Mocks the OpenAI SDK (Ollama-compatible) to verify state transitions and prompt construction.
"""

from unittest.mock import AsyncMock, patch, MagicMock
import asyncio
import pytest

from src.agents.planner import run_planner, _load_prompt
from src.models import GraphState


MOCK_STRATEGY = """# Claim Strategy Document

## 1. Scope Boundaries
### Broadest Defensible Scope
A method using ML for irrigation prediction.

### Medium Scope
System with federated learning across farms.

### Narrowest
Specific sensor node with LoRa and 3-depth probes.

## 2. Claim Type Mapping
| Scope Level | Statutory Type |
|---|---|
| Broad | Method |
| Medium | System |
| Narrow | Apparatus |

## 3. Key Limitations
- Broad: ML prediction, wireless collection
- Medium: Federated learning, multi-farm, privacy-preserving
- Narrow: Capacitive probes, 3 depths, solar+supercap, IP67, LoRa

## 4. Prior Art Avoidance
- US10845342: Distinguish by ML prediction vs fixed thresholds
- US11234567: Distinguish by irrigation focus vs crop yield
- US10567890: Distinguish by wireless + ML layer

## 5. Dependent Claim Strategy
- Under Claim 1: multi-depth, specific depths, ML training, wireless protocol, data types
- Under Claim 2: federated specifics, model aggregation, LoRa, app delivery
- Under Claim 3: probe type, power architecture, enclosure, mesh topology

## 6. Total Claim Budget
18 total: 3 independent + 15 dependent (5+5+5)

REVISION_NEEDED: NO"""


def _make_mock_response(text: str, prompt_tokens: int = 100, completion_tokens: int = 200):
    """Create a mock OpenAI chat completion response."""
    mock_message = MagicMock()
    mock_message.content = text
    mock_choice = MagicMock()
    mock_choice.message = mock_message
    mock_usage = MagicMock()
    mock_usage.prompt_tokens = prompt_tokens
    mock_usage.completion_tokens = completion_tokens
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    mock_response.usage = mock_usage
    return mock_response


class TestPlannerAgent:
    @pytest.mark.asyncio
    async def test_produces_strategy_and_updates_state(self):
        state = GraphState(
            invention_narrative="A widget that processes data.",
            prior_art_context="US1234 - Prior Widget",
            ollama_url="http://127.0.0.1:11434",
            default_model="gemma4:e4b",
        )

        with patch("src.agents.planner.openai") as mock_openai:
            mock_client = AsyncMock()
            mock_client.chat.completions.create = AsyncMock(
                return_value=_make_mock_response(MOCK_STRATEGY),
            )
            mock_openai.AsyncOpenAI.return_value = mock_client

            result = await run_planner(state)

        assert result.step == "plan_complete"
        assert result.error is None
        assert "Scope Boundaries" in result.planner_strategy
        assert "Claim Type Mapping" in result.planner_strategy
        assert "Prior Art Avoidance" in result.planner_strategy
        assert "Dependent Claim Strategy" in result.planner_strategy
        assert "Total Claim Budget" in result.planner_strategy

    @pytest.mark.asyncio
    async def test_uses_research_model_when_available(self):
        state = GraphState(
            invention_narrative="A widget.",
            ollama_url="http://127.0.0.1:11434",
            default_model="gemma4:e4b",
            research_model="gemma4:12b",
        )

        with patch("src.agents.planner.openai") as mock_openai:
            mock_client = AsyncMock()
            mock_client.chat.completions.create = AsyncMock(
                return_value=_make_mock_response(MOCK_STRATEGY),
            )
            mock_openai.AsyncOpenAI.return_value = mock_client

            await run_planner(state)

            # Verify the research model was used, not the default
            call_kwargs = mock_client.chat.completions.create.call_args.kwargs
            assert call_kwargs["model"] == "gemma4:12b"

    @pytest.mark.asyncio
    async def test_falls_back_to_default_model_when_no_research_model(self):
        state = GraphState(
            invention_narrative="A widget.",
            ollama_url="http://127.0.0.1:11434",
            default_model="gemma4:e4b",
            research_model="",
        )

        with patch("src.agents.planner.openai") as mock_openai:
            mock_client = AsyncMock()
            mock_client.chat.completions.create = AsyncMock(
                return_value=_make_mock_response(MOCK_STRATEGY),
            )
            mock_openai.AsyncOpenAI.return_value = mock_client

            await run_planner(state)

            call_kwargs = mock_client.chat.completions.create.call_args.kwargs
            assert call_kwargs["model"] == "gemma4:e4b"

    @pytest.mark.asyncio
    async def test_includes_invention_and_prior_art_in_user_message(self):
        state = GraphState(
            invention_narrative="My special widget invention.",
            prior_art_context="US9999 - Existing widget patent",
            ollama_url="http://127.0.0.1:11434",
        )

        with patch("src.agents.planner.openai") as mock_openai:
            mock_client = AsyncMock()
            mock_client.chat.completions.create = AsyncMock(
                return_value=_make_mock_response(MOCK_STRATEGY),
            )
            mock_openai.AsyncOpenAI.return_value = mock_client

            await run_planner(state)

            call_kwargs = mock_client.chat.completions.create.call_args.kwargs
            # Messages: [system, user] — user is at index 1
            user_msg = call_kwargs["messages"][1]["content"]
            assert "My special widget invention" in user_msg
            assert "US9999" in user_msg

    @pytest.mark.asyncio
    async def test_handles_api_error_gracefully(self):
        state = GraphState(
            invention_narrative="A widget.",
            ollama_url="http://127.0.0.1:11434",
        )

        with patch("src.agents.planner.openai") as mock_openai:
            mock_client = AsyncMock()
            mock_client.chat.completions.create = AsyncMock(
                side_effect=Exception("Connection refused"),
            )
            mock_openai.AsyncOpenAI.return_value = mock_client

            result = await run_planner(state)

        assert result.error is not None
        assert "Planner failed" in result.error
        assert result.planner_strategy == ""

    def test_prompt_loads_with_common_rules(self):
        prompt = _load_prompt()
        # Should contain both common rules and planner-specific content
        assert "NOT a patent attorney" in prompt  # from common-rules.md
        assert "Scope Boundaries" in prompt  # from planner.md
        assert "Claim Type Mapping" in prompt  # from planner.md
