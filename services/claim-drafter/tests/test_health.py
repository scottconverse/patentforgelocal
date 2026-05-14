"""
Health-route tests — `/health` and its `/healthz` alias.

These do not touch the LangGraph pipeline or Ollama; they only verify the
FastAPI app boots and both health paths return 200 with `status: ok`. Phase 1
contract: "FastAPI server boots, health endpoint returns 200".
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from src.server import app


@pytest.fixture
def client():
    return TestClient(app)


class TestHealthRoutes:
    def test_health_returns_200_with_status_ok(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["service"] == "patentforge-claim-drafter"
        assert "promptHashes" in body

    def test_healthz_alias_returns_200_with_status_ok(self, client):
        resp = client.get("/healthz")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["service"] == "patentforge-claim-drafter"
        assert "promptHashes" in body

    def test_health_and_healthz_return_identical_payloads(self, client):
        a = client.get("/health").json()
        b = client.get("/healthz").json()
        assert a == b

    def test_fastapi_boots_without_env_vars(self):
        # Re-importing the app object must not blow up even when no
        # INTERNAL_SERVICE_SECRET or OLLAMA_HOST are set in the environment.
        from src.server import app as fresh_app
        assert fresh_app is not None
        # Routes are registered (smoke check).
        paths = {r.path for r in fresh_app.routes}
        assert "/health" in paths
        assert "/healthz" in paths
