"""Tests for internal service authentication."""

import pytest
from fastapi.testclient import TestClient


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
            client = TestClient(srv.app)
            resp = client.post("/generate/sync", json={
                "invention_narrative": "test",
                "claims_text": "1. A method.",
                "settings": {"api_key": "fake", "default_model": "claude-haiku-4-5-20251001"},
            })
            assert resp.status_code == 403
        finally:
            srv.INTERNAL_SECRET = original

    def test_generate_accepted_with_correct_secret(self):
        """Verifies correct secret passes auth. Endpoint returns 500 because graph.py
        doesn't exist yet — that's expected. The key assertion is it's NOT 403."""
        import src.server as srv
        original = srv.INTERNAL_SECRET
        srv.INTERNAL_SECRET = "test-secret-123"
        try:
            client = TestClient(srv.app, raise_server_exceptions=False)
            resp = client.post(
                "/generate/sync",
                json={
                    "invention_narrative": "test",
                    "claims_text": "1. A method.",
                    "settings": {"api_key": "fake", "default_model": "claude-haiku-4-5-20251001"},
                },
                headers={"X-Internal-Secret": "test-secret-123"},
            )
            # Gets past auth — returns 500 because graph.py doesn't exist yet.
            # We just verify it's not 403 (auth passed).
            assert resp.status_code != 403
        finally:
            srv.INTERNAL_SECRET = original

    def test_generate_rejected_with_wrong_secret(self):
        import src.server as srv
        original = srv.INTERNAL_SECRET
        srv.INTERNAL_SECRET = "correct"
        try:
            client = TestClient(srv.app)
            resp = client.post(
                "/generate/sync",
                json={
                    "invention_narrative": "test",
                    "claims_text": "1. A method.",
                    "settings": {"api_key": "fake", "default_model": "claude-haiku-4-5-20251001"},
                },
                headers={"X-Internal-Secret": "wrong"},
            )
            assert resp.status_code == 403
        finally:
            srv.INTERNAL_SECRET = original
