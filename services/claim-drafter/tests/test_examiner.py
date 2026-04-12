"""
Tests for the Examiner agent.
Mocks Anthropic SDK to verify state transitions and revision flag detection.
"""

from unittest.mock import AsyncMock, patch, MagicMock
import pytest

from src.agents.examiner import run_examiner, _parse_revision_verdict
from src.models import GraphState


MOCK_FEEDBACK_NO_REVISION = """# Examination Report

## Claim 1 Analysis
Claim 1 is adequate for research purposes.

## Overall Assessment
```json
{"revision_needed": false, "quality": "ADEQUATE"}
```"""

MOCK_FEEDBACK_WITH_REVISION = """# Examination Report

## Claim 1 Analysis
CRITICAL: Claim 1 is anticipated by US10845342.

## Overall Assessment
```json
{"revision_needed": true, "quality": "NEEDS WORK"}
```"""


def _make_mock_response(text: str):
    mock_content = MagicMock()
    mock_content.text = text
    mock_response = MagicMock()
    mock_response.content = [mock_content]
    return mock_response


class TestExaminerAgent:
    @pytest.mark.asyncio
    async def test_examiner_sets_no_revision_needed(self):
        state = GraphState(
            invention_narrative="A widget.",
            planner_strategy="Strategy.",
            draft_claims_raw="1. A method comprising: step a.",
            prior_art_context="US1234 - Prior Widget",
            api_key="test-key",
        )

        with patch("src.agents.examiner.anthropic") as mock_anthropic:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(
                return_value=_make_mock_response(MOCK_FEEDBACK_NO_REVISION),
            )
            mock_anthropic.AsyncAnthropic.return_value = mock_client

            result = await run_examiner(state)

        assert result.step == "examine_complete"
        assert result.needs_revision is False
        assert "ADEQUATE" in result.examiner_feedback

    @pytest.mark.asyncio
    async def test_examiner_sets_revision_needed(self):
        state = GraphState(
            invention_narrative="A widget.",
            planner_strategy="Strategy.",
            draft_claims_raw="1. A method comprising: step a.",
            prior_art_context="US1234 - Prior Widget",
            api_key="test-key",
        )

        with patch("src.agents.examiner.anthropic") as mock_anthropic:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(
                return_value=_make_mock_response(MOCK_FEEDBACK_WITH_REVISION),
            )
            mock_anthropic.AsyncAnthropic.return_value = mock_client

            result = await run_examiner(state)

        assert result.step == "examine_complete"
        assert result.needs_revision is True
        assert "NEEDS WORK" in result.examiner_feedback

    @pytest.mark.asyncio
    async def test_examiner_includes_prior_art_in_prompt(self):
        state = GraphState(
            invention_narrative="A widget.",
            draft_claims_raw="Claims here.",
            prior_art_context="US5555 - Important prior art patent",
            api_key="test-key",
        )

        with patch("src.agents.examiner.anthropic") as mock_anthropic:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(
                return_value=_make_mock_response(MOCK_FEEDBACK_NO_REVISION),
            )
            mock_anthropic.AsyncAnthropic.return_value = mock_client

            await run_examiner(state)

            call_kwargs = mock_client.messages.create.call_args.kwargs
            user_msg = call_kwargs["messages"][0]["content"]
            assert "US5555" in user_msg
            assert "Claims here." in user_msg

    @pytest.mark.asyncio
    async def test_examiner_handles_api_error(self):
        state = GraphState(
            invention_narrative="A widget.",
            draft_claims_raw="Claims.",
            api_key="bad-key",
        )

        with patch("src.agents.examiner.anthropic") as mock_anthropic:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(
                side_effect=Exception("Rate limited"),
            )
            mock_anthropic.AsyncAnthropic.return_value = mock_client

            result = await run_examiner(state)

        assert result.error is not None
        assert "Examiner failed" in result.error

    @pytest.mark.asyncio
    async def test_examiner_uses_default_model(self):
        state = GraphState(
            invention_narrative="A widget.",
            draft_claims_raw="Claims.",
            api_key="test-key",
            default_model="claude-opus-4-20250514",
        )

        with patch("src.agents.examiner.anthropic") as mock_anthropic:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(
                return_value=_make_mock_response(MOCK_FEEDBACK_NO_REVISION),
            )
            mock_anthropic.AsyncAnthropic.return_value = mock_client

            await run_examiner(state)

            call_kwargs = mock_client.messages.create.call_args.kwargs
            assert call_kwargs["model"] == "claude-opus-4-20250514"


class TestParseRevisionVerdict:
    """Tests for the JSON verdict parser."""

    def test_parses_json_block_revision_true(self):
        feedback = '# Review\n```json\n{"revision_needed": true, "quality": "NEEDS WORK"}\n```'
        assert _parse_revision_verdict(feedback) is True

    def test_parses_json_block_revision_false(self):
        feedback = '# Review\n```json\n{"revision_needed": false, "quality": "ADEQUATE"}\n```'
        assert _parse_revision_verdict(feedback) is False

    def test_parses_raw_json_without_code_block(self):
        feedback = '# Review\n{"revision_needed": true, "quality": "NEEDS WORK"}'
        assert _parse_revision_verdict(feedback) is True

    def test_falls_back_to_sentinel_pattern(self):
        feedback = "# Review\n\nREVISION_NEEDED: YES"
        assert _parse_revision_verdict(feedback) is True

    def test_defaults_to_false_on_no_verdict(self):
        feedback = "# Review\nThe claims look fine but I have no structured verdict."
        assert _parse_revision_verdict(feedback) is False

    def test_defaults_to_false_on_malformed_json(self):
        feedback = '# Review\n```json\n{broken json\n```'
        assert _parse_revision_verdict(feedback) is False

    def test_handles_json_with_extra_whitespace(self):
        feedback = '```json\n  { "revision_needed" :  true ,  "quality" : "NEEDS WORK" }  \n```'
        assert _parse_revision_verdict(feedback) is True
