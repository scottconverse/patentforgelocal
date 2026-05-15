"""
Tests for internal service authentication on the claim-drafter.

Mocks the pipeline at the module boundary (run_claim_pipeline /
stream_claim_pipeline) so tests don't depend on live Ollama and don't hang
when LiteLLM tries to reach an unreachable endpoint.
"""

from unittest.mock import patch, AsyncMock

import pytest
from fastapi.testclient import TestClient

from src.models import ClaimDraftResult


def _stub_pipeline_error_result() -> ClaimDraftResult:
    """Pipeline result that matches the historical 'Ollama unreachable' behavior."""
    return ClaimDraftResult(
        status="ERROR",
        error_message="stub: pipeline mocked at module boundary for test_auth",
    )


class TestInternalAuth:
    """Test the X-Internal-Secret header check."""

    def test_health_endpoint_is_always_accessible(self):
        """Health check should work without auth (for Docker health checks)."""
        from src.server import app
        client = TestClient(app)
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_draft_accessible_when_no_secret_configured(self):
        """When INTERNAL_SERVICE_SECRET is not set, auth is disabled (dev mode)."""
        from src.server import app
        with patch("src.server.run_claim_pipeline", new_callable=AsyncMock) as mock_run:
            mock_run.return_value = _stub_pipeline_error_result()
            client = TestClient(app)
            resp = client.post("/draft/sync", json={
                "invention_narrative": "test",
                "settings": {"ollama_url": "http://127.0.0.1:11434", "default_model": "gemma4:e4b"}
            })
        # Should get past auth. Pipeline (mocked) returns status=ERROR.
        assert resp.status_code == 200
        assert resp.json()["status"] == "ERROR"

    def test_draft_rejected_when_secret_set_and_not_provided(self):
        """When secret is configured, requests without it get 403."""
        import src.server as srv
        original = srv.INTERNAL_SECRET
        srv.INTERNAL_SECRET = "test-secret-123"
        try:
            with patch("src.server.run_claim_pipeline", new_callable=AsyncMock) as mock_run:
                mock_run.return_value = _stub_pipeline_error_result()
                client = TestClient(srv.app)
                resp = client.post("/draft/sync", json={
                    "invention_narrative": "test",
                    "settings": {"ollama_url": "http://127.0.0.1:11434", "default_model": "gemma4:e4b"}
                })
            assert resp.status_code == 403
            assert "internal service secret" in resp.json()["detail"].lower()
        finally:
            srv.INTERNAL_SECRET = original

    def test_draft_accepted_with_correct_secret(self):
        """When secret matches, request passes auth."""
        import src.server as srv
        original = srv.INTERNAL_SECRET
        srv.INTERNAL_SECRET = "test-secret-123"
        try:
            with patch("src.server.run_claim_pipeline", new_callable=AsyncMock) as mock_run:
                mock_run.return_value = _stub_pipeline_error_result()
                client = TestClient(srv.app)
                resp = client.post(
                    "/draft/sync",
                    json={
                        "invention_narrative": "test",
                        "settings": {"ollama_url": "http://127.0.0.1:11434", "default_model": "gemma4:e4b"}
                    },
                    headers={"X-Internal-Secret": "test-secret-123"},
                )
            # Should get past auth. Pipeline (mocked) returns status=ERROR.
            assert resp.status_code == 200
            assert resp.json()["status"] == "ERROR"
        finally:
            srv.INTERNAL_SECRET = original

    def test_draft_rejected_with_wrong_secret(self):
        """Wrong secret gets 403."""
        import src.server as srv
        original = srv.INTERNAL_SECRET
        srv.INTERNAL_SECRET = "correct-secret"
        try:
            with patch("src.server.run_claim_pipeline", new_callable=AsyncMock) as mock_run:
                mock_run.return_value = _stub_pipeline_error_result()
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
