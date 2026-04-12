"""
Tests for the /draft SSE streaming endpoint.
Verifies real-time step events, complete event, and error handling.
"""

import json
from unittest.mock import patch, AsyncMock

import pytest
import httpx
from sse_starlette.sse import AppStatus

from src.server import app
from src.models import ClaimDraftResult, Claim


@pytest.fixture(autouse=True)
def _reset_sse_app_status():
    """
    Reset sse_starlette's AppStatus between tests.
    The library creates an anyio.Event lazily on the first SSE response,
    which gets bound to that event loop. Subsequent tests run on a new loop,
    causing "bound to a different event loop" errors. Resetting to None
    forces a fresh Event on the current loop.
    """
    AppStatus.should_exit_event = None
    AppStatus.should_exit = False
    yield
    AppStatus.should_exit_event = None
    AppStatus.should_exit = False


# ── Helpers ──────────────────────────────────────────────────────────────────

MINIMAL_REQUEST = {
    "invention_narrative": "A widget that does things",
    "settings": {"api_key": "fake-key", "default_model": "claude-haiku-4-5-20251001"},
}


async def _fake_stream_success(*args, **kwargs):
    """Simulate a successful pipeline with plan, draft, examine, finalize nodes."""
    yield {"event": "step", "node": "plan", "detail": "Claim strategy planned"}
    yield {"event": "step", "node": "draft", "detail": "12 claims drafted"}
    yield {"event": "step", "node": "examine", "detail": "Claims reviewed"}
    yield {"event": "step", "node": "finalize", "detail": "12 claims finalized"}
    yield {
        "event": "complete",
        "result": ClaimDraftResult(
            claims=[
                Claim(claim_number=1, claim_type="INDEPENDENT", text="A method of doing things."),
            ],
            claim_count=1,
            planner_strategy="Broad independent + narrow dependents",
            examiner_feedback="Claims are well-formed.",
            status="COMPLETE",
        ),
    }


async def _fake_stream_with_revision(*args, **kwargs):
    """Simulate a pipeline that includes a revision pass."""
    yield {"event": "step", "node": "plan", "detail": "Claim strategy planned"}
    yield {"event": "step", "node": "draft", "detail": "8 claims drafted"}
    yield {"event": "step", "node": "examine", "detail": "Claims reviewed"}
    yield {"event": "step", "node": "revise", "detail": "Claims revised"}
    yield {"event": "step", "node": "finalize", "detail": "10 claims finalized"}
    yield {
        "event": "complete",
        "result": ClaimDraftResult(
            claims=[
                Claim(claim_number=1, claim_type="INDEPENDENT", text="A revised method."),
            ],
            claim_count=1,
            status="COMPLETE",
        ),
    }


async def _fake_stream_error(*args, **kwargs):
    """Simulate a pipeline that errors during the draft step."""
    yield {"event": "step", "node": "plan", "detail": "Claim strategy planned"}
    yield {"event": "error", "message": "Anthropic API returned 401: Invalid API key"}


async def _fake_stream_immediate_error(*args, **kwargs):
    """Simulate a pipeline that errors on the first node."""
    yield {"event": "error", "message": "No API key provided"}


def _parse_sse_events(raw_text: str) -> list[dict]:
    """Parse raw SSE text into a list of {event, data} dicts."""
    events = []
    current_event = None
    current_data = None

    for line in raw_text.split("\n"):
        line = line.strip()
        if line.startswith("event:"):
            current_event = line[len("event:"):].strip()
        elif line.startswith("data:"):
            current_data = line[len("data:"):].strip()
        elif line == "" and current_event is not None and current_data is not None:
            events.append({"event": current_event, "data": current_data})
            current_event = None
            current_data = None

    # Catch final event if no trailing blank line
    if current_event is not None and current_data is not None:
        events.append({"event": current_event, "data": current_data})

    return events


async def _collect_sse_response(mock_target, mock_side_effect) -> str:
    """
    Make a POST to /draft with the given mock and collect the full SSE response body.
    Uses httpx.AsyncClient + ASGITransport to avoid sse_starlette event-loop issues.
    """
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        with patch(mock_target, side_effect=mock_side_effect):
            resp = await client.post("/draft", json=MINIMAL_REQUEST)
            return resp.text, resp.headers


# ── Tests ────────────────────────────────────────────────────────────────────

class TestSSEContentType:
    """The /draft endpoint must return text/event-stream."""

    @pytest.mark.asyncio
    async def test_returns_event_stream_content_type(self):
        text, headers = await _collect_sse_response(
            "src.server.stream_claim_pipeline", _fake_stream_success
        )
        content_type = headers.get("content-type", "")
        assert "text/event-stream" in content_type


class TestSSEStepEvents:
    """Step events are emitted for each agent node in real-time."""

    @pytest.mark.asyncio
    async def test_emits_step_events_for_each_node(self):
        text, _ = await _collect_sse_response(
            "src.server.stream_claim_pipeline", _fake_stream_success
        )
        events = _parse_sse_events(text)

        step_events = [e for e in events if e["event"] == "step"]
        assert len(step_events) == 4  # plan, draft, examine, finalize

        # Verify each step event has the expected structure
        for se in step_events:
            data = json.loads(se["data"])
            assert "step" in data
            assert "status" in data
            assert data["status"] == "complete"
            assert "detail" in data

    @pytest.mark.asyncio
    async def test_step_events_have_correct_node_names(self):
        text, _ = await _collect_sse_response(
            "src.server.stream_claim_pipeline", _fake_stream_success
        )
        events = _parse_sse_events(text)

        step_events = [e for e in events if e["event"] == "step"]
        node_names = [json.loads(e["data"])["step"] for e in step_events]
        assert node_names == ["plan", "draft", "examine", "finalize"]

    @pytest.mark.asyncio
    async def test_step_events_include_detail_strings(self):
        text, _ = await _collect_sse_response(
            "src.server.stream_claim_pipeline", _fake_stream_success
        )
        events = _parse_sse_events(text)

        step_events = [e for e in events if e["event"] == "step"]
        details = [json.loads(e["data"])["detail"] for e in step_events]
        assert details[0] == "Claim strategy planned"
        assert "12 claims drafted" in details[1]
        assert details[2] == "Claims reviewed"

    @pytest.mark.asyncio
    async def test_emits_revise_step_when_revision_occurs(self):
        text, _ = await _collect_sse_response(
            "src.server.stream_claim_pipeline", _fake_stream_with_revision
        )
        events = _parse_sse_events(text)

        step_events = [e for e in events if e["event"] == "step"]
        node_names = [json.loads(e["data"])["step"] for e in step_events]
        assert "revise" in node_names
        assert len(step_events) == 5  # plan, draft, examine, revise, finalize


class TestSSECompleteEvent:
    """A complete event is emitted with the full ClaimDraftResult."""

    @pytest.mark.asyncio
    async def test_emits_complete_event(self):
        text, _ = await _collect_sse_response(
            "src.server.stream_claim_pipeline", _fake_stream_success
        )
        events = _parse_sse_events(text)

        complete_events = [e for e in events if e["event"] == "complete"]
        assert len(complete_events) == 1

    @pytest.mark.asyncio
    async def test_complete_event_contains_full_result(self):
        text, _ = await _collect_sse_response(
            "src.server.stream_claim_pipeline", _fake_stream_success
        )
        events = _parse_sse_events(text)

        complete_events = [e for e in events if e["event"] == "complete"]
        result_data = json.loads(complete_events[0]["data"])

        assert result_data["status"] == "COMPLETE"
        assert result_data["claim_count"] == 1
        assert len(result_data["claims"]) == 1
        assert result_data["claims"][0]["claim_type"] == "INDEPENDENT"
        assert result_data["planner_strategy"] == "Broad independent + narrow dependents"
        assert result_data["examiner_feedback"] == "Claims are well-formed."

    @pytest.mark.asyncio
    async def test_complete_event_is_last(self):
        text, _ = await _collect_sse_response(
            "src.server.stream_claim_pipeline", _fake_stream_success
        )
        events = _parse_sse_events(text)

        # Filter to only step/complete/error events
        meaningful = [e for e in events if e["event"] in ("step", "complete", "error")]
        assert meaningful[-1]["event"] == "complete"


class TestSSEErrorEvent:
    """Error events are emitted on pipeline failure."""

    @pytest.mark.asyncio
    async def test_emits_error_event_on_pipeline_failure(self):
        text, _ = await _collect_sse_response(
            "src.server.stream_claim_pipeline", _fake_stream_error
        )
        events = _parse_sse_events(text)

        error_events = [e for e in events if e["event"] == "error"]
        assert len(error_events) == 1

        error_data = json.loads(error_events[0]["data"])
        assert "message" in error_data
        assert "401" in error_data["message"]

    @pytest.mark.asyncio
    async def test_step_events_emitted_before_error(self):
        """Steps completed before the error should still be emitted."""
        text, _ = await _collect_sse_response(
            "src.server.stream_claim_pipeline", _fake_stream_error
        )
        events = _parse_sse_events(text)

        step_events = [e for e in events if e["event"] == "step"]
        assert len(step_events) == 1  # plan completed before error
        assert json.loads(step_events[0]["data"])["step"] == "plan"

    @pytest.mark.asyncio
    async def test_emits_error_event_on_immediate_failure(self):
        text, _ = await _collect_sse_response(
            "src.server.stream_claim_pipeline", _fake_stream_immediate_error
        )
        events = _parse_sse_events(text)

        error_events = [e for e in events if e["event"] == "error"]
        assert len(error_events) == 1
        step_events = [e for e in events if e["event"] == "step"]
        assert len(step_events) == 0

    @pytest.mark.asyncio
    async def test_emits_error_event_on_exception(self):
        """Unhandled exceptions in the pipeline are caught and emitted as error events."""

        async def _raise(*args, **kwargs):
            raise RuntimeError("Unexpected crash")
            # Make it a generator that raises
            yield  # pragma: no cover — unreachable, makes this an async generator

        text, _ = await _collect_sse_response(
            "src.server.stream_claim_pipeline", _raise
        )
        events = _parse_sse_events(text)

        error_events = [e for e in events if e["event"] == "error"]
        assert len(error_events) == 1
        error_data = json.loads(error_events[0]["data"])
        assert "Unexpected crash" in error_data["message"]


class TestDraftSyncUnchanged:
    """/draft/sync must continue working exactly as before."""

    @pytest.mark.asyncio
    async def test_sync_endpoint_still_returns_json(self):
        mock_result = ClaimDraftResult(claims=[], claim_count=0, status="COMPLETE")
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            with patch("src.server.run_claim_pipeline", return_value=mock_result):
                resp = await client.post("/draft/sync", json=MINIMAL_REQUEST)
                assert resp.status_code == 200
                data = resp.json()
                assert data["status"] == "COMPLETE"
                assert "claims" in data
