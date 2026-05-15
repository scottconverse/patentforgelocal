"""Tests for internal service authentication.

Mocks the pipeline at the module boundary (run_application_pipeline) so tests
don't depend on live Ollama and don't hang while LiteLLM tries to connect.
"""

from unittest.mock import patch, AsyncMock

import pytest
from fastapi.testclient import TestClient

from src.models import ApplicationGenerateResult


def _stub_pipeline_error_result() -> ApplicationGenerateResult:
    """Pipeline result that matches the historical 'Ollama unreachable' behavior."""
    return ApplicationGenerateResult(
        status="ERROR",
        error_message="stub: pipeline mocked at module boundary for test_auth",
    )


class TestInternalAuth:
    def test_health_always_accessible(self):
        from src.server import app
        client = TestClient(app)
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["service"] == "patentforge-application-generator"

    def test_generate_rejected_without_secret(self):
        import src.server as srv
        original = srv.INTERNAL_SECRET
        srv.INTERNAL_SECRET = "test-secret-123"
        try:
            with patch("src.graph.run_application_pipeline", new_callable=AsyncMock) as mock_run:
                mock_run.return_value = _stub_pipeline_error_result()
                client = TestClient(srv.app)
                resp = client.post("/generate/sync", json={
                    "invention_narrative": "test",
                    "claims_text": "1. A method.",
                    "settings": {"ollama_url": "http://127.0.0.1:11434", "default_model": "gemma4:e4b"},
                })
            assert resp.status_code == 403
        finally:
            srv.INTERNAL_SECRET = original

    def test_generate_accepted_with_correct_secret(self):
        """Verifies correct secret passes auth. Pipeline is mocked at module boundary,
        so it returns a stub error result rather than trying to reach Ollama."""
        import src.server as srv
        original = srv.INTERNAL_SECRET
        srv.INTERNAL_SECRET = "test-secret-123"
        try:
            with patch("src.graph.run_application_pipeline", new_callable=AsyncMock) as mock_run:
                mock_run.return_value = _stub_pipeline_error_result()
                client = TestClient(srv.app, raise_server_exceptions=False)
                resp = client.post(
                    "/generate/sync",
                    json={
                        "invention_narrative": "test",
                        "claims_text": "1. A method.",
                        "settings": {"ollama_url": "http://127.0.0.1:11434", "default_model": "gemma4:e4b"},
                    },
                    headers={"X-Internal-Secret": "test-secret-123"},
                )
            # Got past auth — pipeline mock returned ERROR status (200 OK).
            assert resp.status_code != 403
        finally:
            srv.INTERNAL_SECRET = original

    def test_generate_rejected_with_wrong_secret(self):
        import src.server as srv
        original = srv.INTERNAL_SECRET
        srv.INTERNAL_SECRET = "correct"
        try:
            with patch("src.graph.run_application_pipeline", new_callable=AsyncMock) as mock_run:
                mock_run.return_value = _stub_pipeline_error_result()
                client = TestClient(srv.app)
                resp = client.post(
                    "/generate/sync",
                    json={
                        "invention_narrative": "test",
                        "claims_text": "1. A method.",
                        "settings": {"ollama_url": "http://127.0.0.1:11434", "default_model": "gemma4:e4b"},
                    },
                    headers={"X-Internal-Secret": "wrong"},
                )
            assert resp.status_code == 403
        finally:
            srv.INTERNAL_SECRET = original
