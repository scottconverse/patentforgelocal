"""Tests for the SSE streaming endpoint POST /check/stream."""

import asyncio
import json
from unittest.mock import patch, AsyncMock

import pytest
from fastapi.testclient import TestClient
from sse_starlette.sse import AppStatus

from src.server import app


@pytest.fixture(autouse=True)
def _reset_sse_app_status():
    """Reset sse-starlette's module-level AppStatus between tests.

    AppStatus uses an asyncio.Event that gets bound to the first event loop.
    Subsequent TestClient invocations create new loops, causing
    'bound to a different event loop' errors. Resetting it fixes this.
    """
    yield
    AppStatus.should_exit_event = asyncio.Event()


client = TestClient(app)

# Reusable request body for tests
_VALID_REQUEST = {
    "claims": [
        {"claim_number": 1, "claim_type": "INDEPENDENT", "text": "A method for testing."}
    ],
    "specification_text": "The invention is a test.",
    "invention_narrative": "A test system.",
    "settings": {"default_model": "claude-sonnet-4-20250514"},
}

# Mock agent factory — same pattern as test_graph.py
def _make_mock_agent(field_name: str, results: list[dict]):
    async def mock_agent(state):
        if isinstance(state, dict):
            state[field_name] = json.dumps(results)
            state["total_input_tokens"] = state.get("total_input_tokens", 0) + 100
            state["total_output_tokens"] = state.get("total_output_tokens", 0) + 50
            return state
        setattr(state, field_name, json.dumps(results))
        state.total_input_tokens += 100
        state.total_output_tokens += 50
        return state
    return mock_agent


_PASS_RESULT = [{"rule": "test", "status": "PASS", "claim_number": 1, "detail": "OK"}]
_FAIL_RESULT = [{"rule": "112b", "status": "FAIL", "claim_number": 1, "detail": "Bad claim"}]


def _parse_sse_events(raw_text: str) -> list[dict]:
    """Parse SSE text into a list of {event, data} dicts."""
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
    # Handle case where last event has no trailing blank line
    if current_event is not None and current_data is not None:
        events.append({"event": current_event, "data": current_data})
    return events


class TestStreamEndpoint:
    """Tests for POST /check/stream SSE endpoint."""

    def test_stream_rejects_empty_claims(self):
        response = client.post("/check/stream", json={
            "claims": [],
            "specification_text": "",
            "invention_narrative": "",
            "settings": {"default_model": "claude-sonnet-4-20250514"},
        })
        assert response.status_code == 422

    def test_stream_rejects_missing_model(self):
        response = client.post("/check/stream", json={
            "claims": [{"claim_number": 1, "claim_type": "INDEPENDENT", "text": "A method"}],
            "specification_text": "",
            "invention_narrative": "",
            "settings": {},
        })
        assert response.status_code == 422

    @patch("src.graph.run_eligibility")
    @patch("src.graph.run_formalities")
    @patch("src.graph.run_definiteness")
    @patch("src.graph.run_written_description")
    def test_stream_emits_step_events_for_all_checks(
        self, mock_wd, mock_def, mock_form, mock_elig
    ):
        mock_wd.side_effect = _make_mock_agent("written_description_results", _PASS_RESULT)
        mock_def.side_effect = _make_mock_agent("definiteness_results", _PASS_RESULT)
        mock_form.side_effect = _make_mock_agent("formalities_results", _PASS_RESULT)
        mock_elig.side_effect = _make_mock_agent("eligibility_results", _PASS_RESULT)

        with client.stream("POST", "/check/stream", json=_VALID_REQUEST) as response:
            assert response.status_code == 200
            body = response.read().decode("utf-8")

        events = _parse_sse_events(body)
        step_events = [e for e in events if e["event"] == "step"]
        complete_events = [e for e in events if e["event"] == "complete"]

        # Must have exactly 4 step events (one per rule check)
        assert len(step_events) == 4

        # Check expected step names
        step_names = [json.loads(e["data"])["step"] for e in step_events]
        assert "written_description" in step_names
        assert "definiteness" in step_names
        assert "formalities" in step_names
        assert "eligibility" in step_names

        # Each step event has the expected shape
        for se in step_events:
            data = json.loads(se["data"])
            assert data["status"] == "complete"
            assert "detail" in data
            assert "results_count" in data

        # Must have exactly 1 complete event
        assert len(complete_events) == 1

    @patch("src.graph.run_eligibility")
    @patch("src.graph.run_formalities")
    @patch("src.graph.run_definiteness")
    @patch("src.graph.run_written_description")
    def test_stream_complete_event_contains_full_response(
        self, mock_wd, mock_def, mock_form, mock_elig
    ):
        mock_wd.side_effect = _make_mock_agent("written_description_results", _PASS_RESULT)
        mock_def.side_effect = _make_mock_agent("definiteness_results", _PASS_RESULT)
        mock_form.side_effect = _make_mock_agent("formalities_results", _PASS_RESULT)
        mock_elig.side_effect = _make_mock_agent("eligibility_results", _PASS_RESULT)

        with client.stream("POST", "/check/stream", json=_VALID_REQUEST) as response:
            body = response.read().decode("utf-8")

        events = _parse_sse_events(body)
        complete_event = next(e for e in events if e["event"] == "complete")
        data = json.loads(complete_event["data"])

        assert data["status"] == "COMPLETE"
        assert data["overall_pass"] is True
        assert len(data["results"]) == 4
        assert data["total_input_tokens"] == 400
        assert data["total_output_tokens"] == 200

    @patch("src.graph.run_eligibility")
    @patch("src.graph.run_formalities")
    @patch("src.graph.run_definiteness")
    @patch("src.graph.run_written_description")
    def test_stream_results_count_matches_per_step(
        self, mock_wd, mock_def, mock_form, mock_elig
    ):
        """Verify results_count in each step event matches the agent output."""
        multi_result = [
            {"rule": "r1", "status": "PASS", "claim_number": 1, "detail": "OK"},
            {"rule": "r2", "status": "WARN", "claim_number": 1, "detail": "Maybe"},
            {"rule": "r3", "status": "PASS", "claim_number": 2, "detail": "Fine"},
        ]
        mock_wd.side_effect = _make_mock_agent("written_description_results", multi_result)
        mock_def.side_effect = _make_mock_agent("definiteness_results", _PASS_RESULT)
        mock_form.side_effect = _make_mock_agent("formalities_results", _PASS_RESULT)
        mock_elig.side_effect = _make_mock_agent("eligibility_results", _PASS_RESULT)

        with client.stream("POST", "/check/stream", json=_VALID_REQUEST) as response:
            body = response.read().decode("utf-8")

        events = _parse_sse_events(body)
        step_events = [e for e in events if e["event"] == "step"]

        wd_step = next(e for e in step_events if json.loads(e["data"])["step"] == "written_description")
        assert json.loads(wd_step["data"])["results_count"] == 3

        def_step = next(e for e in step_events if json.loads(e["data"])["step"] == "definiteness")
        assert json.loads(def_step["data"])["results_count"] == 1

    @patch("src.graph.run_eligibility")
    @patch("src.graph.run_formalities")
    @patch("src.graph.run_definiteness")
    @patch("src.graph.run_written_description")
    def test_stream_failure_in_results_reflected(
        self, mock_wd, mock_def, mock_form, mock_elig
    ):
        mock_wd.side_effect = _make_mock_agent("written_description_results", _PASS_RESULT)
        mock_def.side_effect = _make_mock_agent("definiteness_results", _FAIL_RESULT)
        mock_form.side_effect = _make_mock_agent("formalities_results", _PASS_RESULT)
        mock_elig.side_effect = _make_mock_agent("eligibility_results", _PASS_RESULT)

        with client.stream("POST", "/check/stream", json=_VALID_REQUEST) as response:
            body = response.read().decode("utf-8")

        events = _parse_sse_events(body)
        complete_event = next(e for e in events if e["event"] == "complete")
        data = json.loads(complete_event["data"])

        assert data["overall_pass"] is False
        assert any(r["status"] == "FAIL" for r in data["results"])

    @patch("src.graph.run_eligibility")
    @patch("src.graph.run_formalities")
    @patch("src.graph.run_definiteness")
    @patch("src.graph.run_written_description")
    def test_stream_error_event_on_exception(
        self, mock_wd, mock_def, mock_form, mock_elig
    ):
        """If an agent raises, the stream emits an error event."""
        async def exploding_agent(state):
            raise RuntimeError("Agent exploded")

        mock_wd.side_effect = exploding_agent
        mock_def.side_effect = _make_mock_agent("definiteness_results", _PASS_RESULT)
        mock_form.side_effect = _make_mock_agent("formalities_results", _PASS_RESULT)
        mock_elig.side_effect = _make_mock_agent("eligibility_results", _PASS_RESULT)

        with client.stream("POST", "/check/stream", json=_VALID_REQUEST) as response:
            body = response.read().decode("utf-8")

        events = _parse_sse_events(body)
        error_events = [e for e in events if e["event"] == "error"]
        assert len(error_events) >= 1

        err_data = json.loads(error_events[0]["data"])
        assert "message" in err_data

    @patch("src.graph.run_eligibility")
    @patch("src.graph.run_formalities")
    @patch("src.graph.run_definiteness")
    @patch("src.graph.run_written_description")
    def test_stream_content_type_is_event_stream(
        self, mock_wd, mock_def, mock_form, mock_elig
    ):
        mock_wd.side_effect = _make_mock_agent("written_description_results", _PASS_RESULT)
        mock_def.side_effect = _make_mock_agent("definiteness_results", _PASS_RESULT)
        mock_form.side_effect = _make_mock_agent("formalities_results", _PASS_RESULT)
        mock_elig.side_effect = _make_mock_agent("eligibility_results", _PASS_RESULT)

        with client.stream("POST", "/check/stream", json=_VALID_REQUEST) as response:
            assert "text/event-stream" in response.headers.get("content-type", "")
            response.read()

    @patch("src.graph.run_eligibility")
    @patch("src.graph.run_formalities")
    @patch("src.graph.run_definiteness")
    @patch("src.graph.run_written_description")
    def test_stream_step_details_match_spec(
        self, mock_wd, mock_def, mock_form, mock_elig
    ):
        """Verify the detail strings match the spec exactly."""
        mock_wd.side_effect = _make_mock_agent("written_description_results", _PASS_RESULT)
        mock_def.side_effect = _make_mock_agent("definiteness_results", _PASS_RESULT)
        mock_form.side_effect = _make_mock_agent("formalities_results", _PASS_RESULT)
        mock_elig.side_effect = _make_mock_agent("eligibility_results", _PASS_RESULT)

        with client.stream("POST", "/check/stream", json=_VALID_REQUEST) as response:
            body = response.read().decode("utf-8")

        events = _parse_sse_events(body)
        step_events = {json.loads(e["data"])["step"]: json.loads(e["data"]) for e in events if e["event"] == "step"}

        assert step_events["eligibility"]["detail"] == "35 USC 101 eligibility check complete"
        assert step_events["definiteness"]["detail"] == "35 USC 112(b) definiteness check complete"
        assert step_events["written_description"]["detail"] == "35 USC 112(a) written description check complete"
        assert step_events["formalities"]["detail"] == "MPEP 608 formalities check complete"


class TestCheckEndpointUnchanged:
    """Verify the original /check endpoint still works after adding /check/stream."""

    def test_health_still_works(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_check_validation_still_works(self):
        response = client.post("/check", json={
            "claims": [],
            "specification_text": "",
            "invention_narrative": "",
            "settings": {"default_model": "claude-sonnet-4-20250514"},
        })
        assert response.status_code == 422

    @patch("src.graph.run_eligibility")
    @patch("src.graph.run_formalities")
    @patch("src.graph.run_definiteness")
    @patch("src.graph.run_written_description")
    def test_check_still_returns_json(
        self, mock_wd, mock_def, mock_form, mock_elig
    ):
        mock_wd.side_effect = _make_mock_agent("written_description_results", _PASS_RESULT)
        mock_def.side_effect = _make_mock_agent("definiteness_results", _PASS_RESULT)
        mock_form.side_effect = _make_mock_agent("formalities_results", _PASS_RESULT)
        mock_elig.side_effect = _make_mock_agent("eligibility_results", _PASS_RESULT)

        response = client.post("/check", json=_VALID_REQUEST)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "COMPLETE"
        assert len(data["results"]) == 4
