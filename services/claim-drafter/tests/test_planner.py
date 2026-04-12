"""
Tests for the Planner agent.
Mocks the Anthropic SDK to verify state transitions and prompt construction.
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


def _make_mock_response(text: str):
    """Create a mock Anthropic API response."""
    mock_content = MagicMock()
    mock_content.text = text
    mock_response = MagicMock()
    mock_response.content = [mock_content]
    return mock_response


class TestPlannerAgent:
    @pytest.mark.asyncio
    async def test_produces_strategy_and_updates_state(self):
        state = GraphState(
            invention_narrative="A widget that processes data.",
            prior_art_context="US1234 - Prior Widget",
            api_key="test-key",
            default_model="claude-haiku-4-5-20251001",
        )

        with patch("src.agents.planner.anthropic") as mock_anthropic:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(
                return_value=_make_mock_response(MOCK_STRATEGY),
            )
            mock_anthropic.AsyncAnthropic.return_value = mock_client

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
            api_key="test-key",
            default_model="claude-sonnet-4-20250514",
            research_model="claude-haiku-4-5-20251001",
        )

        with patch("src.agents.planner.anthropic") as mock_anthropic:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(
                return_value=_make_mock_response(MOCK_STRATEGY),
            )
            mock_anthropic.AsyncAnthropic.return_value = mock_client

            await run_planner(state)

            # Verify the research model was used, not the default
            call_kwargs = mock_client.messages.create.call_args.kwargs
            assert call_kwargs["model"] == "claude-haiku-4-5-20251001"

    @pytest.mark.asyncio
    async def test_falls_back_to_default_model_when_no_research_model(self):
        state = GraphState(
            invention_narrative="A widget.",
            api_key="test-key",
            default_model="claude-sonnet-4-20250514",
            research_model="",
        )

        with patch("src.agents.planner.anthropic") as mock_anthropic:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(
                return_value=_make_mock_response(MOCK_STRATEGY),
            )
            mock_anthropic.AsyncAnthropic.return_value = mock_client

            await run_planner(state)

            call_kwargs = mock_client.messages.create.call_args.kwargs
            assert call_kwargs["model"] == "claude-sonnet-4-20250514"

    @pytest.mark.asyncio
    async def test_includes_invention_and_prior_art_in_user_message(self):
        state = GraphState(
            invention_narrative="My special widget invention.",
            prior_art_context="US9999 - Existing widget patent",
            api_key="test-key",
        )

        with patch("src.agents.planner.anthropic") as mock_anthropic:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(
                return_value=_make_mock_response(MOCK_STRATEGY),
            )
            mock_anthropic.AsyncAnthropic.return_value = mock_client

            await run_planner(state)

            call_kwargs = mock_client.messages.create.call_args.kwargs
            user_msg = call_kwargs["messages"][0]["content"]
            assert "My special widget invention" in user_msg
            assert "US9999" in user_msg

    @pytest.mark.asyncio
    async def test_handles_api_error_gracefully(self):
        state = GraphState(
            invention_narrative="A widget.",
            api_key="bad-key",
        )

        with patch("src.agents.planner.anthropic") as mock_anthropic:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(
                side_effect=Exception("Authentication error: invalid API key"),
            )
            mock_anthropic.AsyncAnthropic.return_value = mock_client

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
