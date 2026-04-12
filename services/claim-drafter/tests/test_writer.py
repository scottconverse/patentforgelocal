"""
Tests for the Writer agent.
Mocks Anthropic SDK to verify state transitions, revision mode, and prompt construction.
"""

from unittest.mock import AsyncMock, patch, MagicMock
import pytest

from src.agents.writer import run_writer
from src.models import GraphState


MOCK_CLAIMS_DRAFT = """### CLAIM 1 (Independent - Broad - Method)

A method comprising: receiving data; processing data; and outputting results.

### CLAIM 2 (Dependent on Claim 1)

The method of claim 1, wherein the data is sensor data.

### CLAIM 3 (Independent - Medium - System)

A system comprising: a processor; and a memory.
"""

MOCK_REVISED_CLAIMS = """### CLAIM 1 (Independent - Broad - Method)

A method comprising: wirelessly receiving sensor data; processing the data using a trained ML model; and outputting irrigation timing recommendations.

### CLAIM 2 (Dependent on Claim 1)

The method of claim 1, wherein the sensor data includes soil moisture at multiple depths.
"""


def _make_mock_response(text: str):
    mock_content = MagicMock()
    mock_content.text = text
    mock_response = MagicMock()
    mock_response.content = [mock_content]
    return mock_response


class TestWriterAgent:
    @pytest.mark.asyncio
    async def test_initial_draft_updates_state(self):
        state = GraphState(
            invention_narrative="A widget.",
            planner_strategy="Strategy: broad method, medium system, narrow apparatus.",
            api_key="test-key",
        )

        with patch("src.agents.writer.anthropic") as mock_anthropic:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(
                return_value=_make_mock_response(MOCK_CLAIMS_DRAFT),
            )
            mock_anthropic.AsyncAnthropic.return_value = mock_client

            result = await run_writer(state)

        assert result.step == "draft_complete"
        assert result.error is None
        assert "CLAIM 1" in result.draft_claims_raw
        assert result.revised_claims_raw == ""

    @pytest.mark.asyncio
    async def test_revision_mode_when_examiner_feedback_present(self):
        state = GraphState(
            invention_narrative="A widget.",
            planner_strategy="Strategy here.",
            draft_claims_raw=MOCK_CLAIMS_DRAFT,
            examiner_feedback="Claim 1 is too broad. Narrow it.",
            needs_revision=True,
            api_key="test-key",
        )

        with patch("src.agents.writer.anthropic") as mock_anthropic:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(
                return_value=_make_mock_response(MOCK_REVISED_CLAIMS),
            )
            mock_anthropic.AsyncAnthropic.return_value = mock_client

            result = await run_writer(state)

        assert result.step == "revise_complete"
        assert "CLAIM 1" in result.revised_claims_raw
        assert "revised" in result.revision_notes.lower()

    @pytest.mark.asyncio
    async def test_uses_default_model(self):
        state = GraphState(
            invention_narrative="A widget.",
            planner_strategy="Strategy.",
            api_key="test-key",
            default_model="claude-sonnet-4-20250514",
        )

        with patch("src.agents.writer.anthropic") as mock_anthropic:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(
                return_value=_make_mock_response(MOCK_CLAIMS_DRAFT),
            )
            mock_anthropic.AsyncAnthropic.return_value = mock_client

            await run_writer(state)

            call_kwargs = mock_client.messages.create.call_args.kwargs
            assert call_kwargs["model"] == "claude-sonnet-4-20250514"

    @pytest.mark.asyncio
    async def test_revision_includes_examiner_feedback_in_prompt(self):
        state = GraphState(
            invention_narrative="A widget.",
            planner_strategy="Strategy.",
            draft_claims_raw="Original claims.",
            examiner_feedback="Claim 1 too broad. Add limitation X.",
            needs_revision=True,
            api_key="test-key",
        )

        with patch("src.agents.writer.anthropic") as mock_anthropic:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(
                return_value=_make_mock_response(MOCK_REVISED_CLAIMS),
            )
            mock_anthropic.AsyncAnthropic.return_value = mock_client

            await run_writer(state)

            call_kwargs = mock_client.messages.create.call_args.kwargs
            user_msg = call_kwargs["messages"][0]["content"]
            assert "Examiner Feedback" in user_msg
            assert "Claim 1 too broad" in user_msg

    @pytest.mark.asyncio
    async def test_handles_api_error(self):
        state = GraphState(
            invention_narrative="A widget.",
            planner_strategy="Strategy.",
            api_key="bad-key",
        )

        with patch("src.agents.writer.anthropic") as mock_anthropic:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(
                side_effect=Exception("API error"),
            )
            mock_anthropic.AsyncAnthropic.return_value = mock_client

            result = await run_writer(state)

        assert result.error is not None
        assert "Writer failed" in result.error
