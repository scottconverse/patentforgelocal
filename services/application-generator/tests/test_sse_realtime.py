"""Tests for realtime SSE progress events from the /generate endpoint."""

import asyncio
import json
from unittest.mock import patch

import pytest
from httpx import AsyncClient, ASGITransport
from sse_starlette.sse import AppStatus

from src.models import ApplicationGenerateResult
from src.server import app


_GENERATE_BODY = {
    "invention_narrative": "A self-heating coffee mug",
    "claims_text": "1. A mug with internal heating.",
    "settings": {"api_key": "fake-key", "default_model": "claude-haiku-4-5-20251001"},
}

_AGENT_NODES = ["background", "summary", "detailed_description", "abstract", "figures", "format_ids", "finalize"]

_MOCK_RESULT = ApplicationGenerateResult(
    title="Self-Heating Mug",
    background="Background text",
    summary="Summary text",
    detailed_description="Detailed text",
    abstract="Abstract text",
    figure_descriptions="Figure text",
    ids_table="| Patent | Title |",
    status="SUCCESS",
    total_input_tokens=1000,
    total_output_tokens=500,
    total_estimated_cost_usd=0.05,
)


def _make_mock_pipeline(result: ApplicationGenerateResult | None = None, nodes: list[str] | None = None):
    """Create a mock pipeline that calls on_step for each node, then returns result."""
    nodes = nodes or _AGENT_NODES
    result = result or _MOCK_RESULT

    async def mock_run(**kwargs):
        on_step = kwargs.get("on_step")
        for node in nodes:
            if on_step:
                on_step(node, node)
            await asyncio.sleep(0)  # yield control so queue is processed
        return result

    return mock_run


def _parse_sse_events(response_text: str) -> list[dict]:
    """Parse raw SSE text into a list of {event, data} dicts.

    Handles both \\n and \\r\\n line endings (sse-starlette uses \\r\\n).
    """
    events = []
    current_event = None
    current_data = None
    for raw_line in response_text.split("\n"):
        line = raw_line.strip()
        if line.startswith("event:"):
            current_event = line[len("event:"):].strip()
        elif line.startswith("data:"):
            current_data = line[len("data:"):].strip()
        elif line.startswith(":"):
            events.append({"comment": line[1:].strip()})
        elif line == "" and current_event is not None:
            events.append({"event": current_event, "data": current_data})
            current_event = None
            current_data = None
    if current_event is not None and current_data is not None:
        events.append({"event": current_event, "data": current_data})
    return events


async def _post_generate(mock_fn) -> str:
    """POST to /generate with a mocked pipeline and return the raw SSE body."""
    # Reset sse-starlette's singleton Event to the current event loop to avoid
    # "bound to a different event loop" errors across pytest-asyncio tests.
    AppStatus.should_exit_event = asyncio.Event()
    with patch("src.graph.run_application_pipeline", mock_fn):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/generate", json=_GENERATE_BODY, timeout=10)
            assert resp.status_code == 200
            return resp.text


class TestSSERealtime:
    """Verify the /generate endpoint emits step events in real time."""

    @pytest.mark.asyncio
    async def test_step_events_emitted_for_each_node(self):
        """Each LangGraph node completion should emit a step event immediately."""
        body = await _post_generate(_make_mock_pipeline())

        events = _parse_sse_events(body)
        step_events = [e for e in events if e.get("event") == "step"]
        complete_events = [e for e in events if e.get("event") == "complete"]

        assert len(step_events) == len(_AGENT_NODES), (
            f"Expected {len(_AGENT_NODES)} step events, got {len(step_events)}: {step_events}"
        )

        for i, node in enumerate(_AGENT_NODES):
            data = json.loads(step_events[i]["data"])
            assert data["step"] == node
            assert data["status"] == "complete"
            assert "detail" in data

        assert len(complete_events) == 1

    @pytest.mark.asyncio
    async def test_complete_event_contains_full_result(self):
        """The final complete event should contain the full ApplicationGenerateResult."""
        body = await _post_generate(_make_mock_pipeline())

        events = _parse_sse_events(body)
        complete_events = [e for e in events if e.get("event") == "complete"]
        assert len(complete_events) == 1

        result_data = json.loads(complete_events[0]["data"])
        assert result_data["status"] == "SUCCESS"
        assert result_data["title"] == "Self-Heating Mug"
        assert result_data["background"] == "Background text"
        assert result_data["total_input_tokens"] == 1000

    @pytest.mark.asyncio
    async def test_error_event_on_pipeline_failure(self):
        """Pipeline exceptions should emit an error event, not crash the SSE stream."""
        async def failing_pipeline(**kwargs):
            raise RuntimeError("LLM rate limited")

        body = await _post_generate(failing_pipeline)

        events = _parse_sse_events(body)
        error_events = [e for e in events if e.get("event") == "error"]
        assert len(error_events) == 1

        error_data = json.loads(error_events[0]["data"])
        assert "LLM rate limited" in error_data["message"]

    @pytest.mark.asyncio
    async def test_step_events_have_human_readable_detail(self):
        """Each step event should contain a human-readable detail string."""
        body = await _post_generate(_make_mock_pipeline())

        events = _parse_sse_events(body)
        step_events = [e for e in events if e.get("event") == "step"]

        expected_details = {
            "background": "Background section generated",
            "summary": "Summary section generated",
            "detailed_description": "Detailed description generated",
            "abstract": "Abstract generated",
            "figures": "Figure descriptions generated",
            "format_ids": "IDS table formatted",
            "finalize": "Output finalized",
        }

        for event in step_events:
            data = json.loads(event["data"])
            node = data["step"]
            if node in expected_details:
                assert data["detail"] == expected_details[node], (
                    f"Wrong detail for {node}: {data['detail']}"
                )

    @pytest.mark.asyncio
    async def test_step_events_precede_complete_event(self):
        """All step events must come before the complete event in the SSE stream."""
        body = await _post_generate(_make_mock_pipeline())

        events = _parse_sse_events(body)
        typed_events = [e for e in events if "event" in e]

        complete_idx = None
        for i, e in enumerate(typed_events):
            if e["event"] == "complete":
                complete_idx = i
                break

        assert complete_idx is not None, "No complete event found"

        for i in range(complete_idx):
            assert typed_events[i]["event"] == "step", (
                f"Event at index {i} is '{typed_events[i]['event']}', expected 'step'"
            )

    @pytest.mark.asyncio
    async def test_no_step_events_on_immediate_error(self):
        """If pipeline fails before any node, only error event should be emitted."""
        async def immediate_failure(**kwargs):
            raise ValueError("Invalid API key")

        body = await _post_generate(immediate_failure)

        events = _parse_sse_events(body)
        step_events = [e for e in events if e.get("event") == "step"]
        error_events = [e for e in events if e.get("event") == "error"]

        assert len(step_events) == 0
        assert len(error_events) == 1

    @pytest.mark.asyncio
    async def test_partial_steps_then_error(self):
        """If pipeline fails mid-way, emit steps completed so far plus error."""
        async def partial_failure(**kwargs):
            on_step = kwargs.get("on_step")
            if on_step:
                on_step("background", "background")
                on_step("summary", "summary")
            raise RuntimeError("Rate limit on detailed_description")

        body = await _post_generate(partial_failure)

        events = _parse_sse_events(body)
        step_events = [e for e in events if e.get("event") == "step"]
        error_events = [e for e in events if e.get("event") == "error"]

        assert len(step_events) == 2
        assert json.loads(step_events[0]["data"])["step"] == "background"
        assert json.loads(step_events[1]["data"])["step"] == "summary"
        assert len(error_events) == 1
        assert "Rate limit" in json.loads(error_events[0]["data"])["message"]


class TestSSEStepDetails:
    """Verify _STEP_DETAILS mapping is complete and correct."""

    def test_step_details_covers_all_nodes(self):
        from src.server import _STEP_DETAILS
        from src.graph import build_graph

        graph = build_graph()
        node_names = set(graph.nodes.keys())

        for node in node_names:
            assert node in _STEP_DETAILS, f"Missing detail for node: {node}"

    def test_step_details_values_are_nonempty(self):
        from src.server import _STEP_DETAILS

        for node, detail in _STEP_DETAILS.items():
            assert isinstance(detail, str) and len(detail) > 0, (
                f"Empty or non-string detail for {node}"
            )


class TestSyncEndpointUnchanged:
    """Verify /generate/sync still works independently of SSE changes."""

    @pytest.mark.asyncio
    async def test_sync_endpoint_returns_json(self):
        """The /generate/sync endpoint should return a JSON result, not SSE."""
        async def mock_sync(**kwargs):
            return _MOCK_RESULT

        with patch("src.graph.run_application_pipeline", mock_sync):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post("/generate/sync", json=_GENERATE_BODY, timeout=10)

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "SUCCESS"
        assert data["title"] == "Self-Heating Mug"

    @pytest.mark.asyncio
    async def test_sync_endpoint_does_not_use_on_step(self):
        """The /generate/sync endpoint should not pass on_step to the pipeline."""
        captured_kwargs = {}

        async def capture_kwargs(**kwargs):
            captured_kwargs.update(kwargs)
            return _MOCK_RESULT

        with patch("src.graph.run_application_pipeline", capture_kwargs):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                await client.post("/generate/sync", json=_GENERATE_BODY, timeout=10)

        assert "on_step" not in captured_kwargs or captured_kwargs.get("on_step") is None
