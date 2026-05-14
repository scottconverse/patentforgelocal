"""
Tests for internal service authentication on the claim-drafter.

These tests do NOT make real HTTP calls to Ollama. The pipeline is mocked at
`src.server.run_claim_pipeline` (the symbol bound inside the server module
when it imports the function), so /draft/sync exercises the auth + request-
parsing path but returns a stub ClaimDraftResult with status=ERROR.
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from src.models import ClaimDraftResult


def _stub_error_result() -> ClaimDraftResult:
    """ClaimDraftResult shaped like what the real pipeline would return on Ollama-down."""
    return ClaimDraftResult(
        status="ERROR",
        error_message="stub: pipeline mocked in unit test (no real Ollama call)",
    )


@pytest.fixture
def mocked_pipeline():
    """Patch the pipeline-runner bindings inside `src.server` so /draft/sync and
    /draft do not actually hit Ollama. Yields the mocks so individual tests can
    assert on call counts if needed."""
    with patch("src.server.run_claim_pipeline", new_callable=AsyncMock) as run_mock, \
         patch("src.server.stream_claim_pipeline") as stream_mock:
        run_mock.return_value = _stub_error_result()
        # stream_claim_pipeline is a generator factory; an empty async-gen is fine
        # for the auth tests because they don't read from the stream.
        async def _empty_stream(**kwargs):
            if False:
                yield  # pragma: no cover
        stream_mock.side_effect = lambda **kwargs: _empty_stream()
        yield run_mock, stream_mock


class TestInternalAuth:
    """Test the X-Internal-Secret header check."""

    def test_health_endpoint_is_always_accessible(self):
        """Health check should work without auth (for Docker health checks)."""
        from src.server import app
        client = TestClient(app)
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_draft_accessible_when_no_secret_configured(self, mocked_pipeline):
        """When INTERNAL_SERVICE_SECRET is not set, auth is disabled (dev mode)."""
        from src.server import app
        client = TestClient(app)
        resp = client.post("/draft/sync", json={
            "invention_narrative": "test",
            "settings": {"ollama_url": "http://127.0.0.1:11434", "default_model": "gemma4:e4b"}
        })
        # Should get past auth. Pipeline is mocked to return ERROR status.
        assert resp.status_code == 200
        assert resp.json()["status"] == "ERROR"

    def test_draft_rejected_when_secret_set_and_not_provided(self, mocked_pipeline):
        """When secret is configured, requests without it get 403."""
        import src.server as srv
        original = srv.INTERNAL_SECRET
        srv.INTERNAL_SECRET = "test-secret-123"
        try:
            client = TestClient(srv.app)
            resp = client.post("/draft/sync", json={
                "invention_narrative": "test",
                "settings": {"ollama_url": "http://127.0.0.1:11434", "default_model": "gemma4:e4b"}
            })
            assert resp.status_code == 403
            assert "internal service secret" in resp.json()["detail"].lower()
        finally:
            srv.INTERNAL_SECRET = original

    def test_draft_accepted_with_correct_secret(self, mocked_pipeline):
        """When secret matches, request passes auth."""
        import src.server as srv
        original = srv.INTERNAL_SECRET
        srv.INTERNAL_SECRET = "test-secret-123"
        try:
            client = TestClient(srv.app)
            resp = client.post(
                "/draft/sync",
                json={
                    "invention_narrative": "test",
                    "settings": {"ollama_url": "http://127.0.0.1:11434", "default_model": "gemma4:e4b"}
                },
                headers={"X-Internal-Secret": "test-secret-123"},
            )
            # Should get past auth. Pipeline mocked → ERROR status.
            assert resp.status_code == 200
            assert resp.json()["status"] == "ERROR"
        finally:
            srv.INTERNAL_SECRET = original

    def test_draft_rejected_with_wrong_secret(self, mocked_pipeline):
        """Wrong secret gets 403."""
        import src.server as srv
        original = srv.INTERNAL_SECRET
        srv.INTERNAL_SECRET = "correct-secret"
        try:
            client = TestClient(srv.app)
            resp = client.post(
                "/draft/sync",
                json={
                    "invention_narrative": "test",
                    "settings": {"ollama_url": "http://127.0.0.1:11434", "default_model": "gemma4:e4b"}
                },
                headers={"X-Internal-Secret": "wrong-secret"},
            )
            assert resp.status_code == 403
        finally:
            srv.INTERNAL_SECRET = original
