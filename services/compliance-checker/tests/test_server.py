"""Tests for FastAPI server endpoints."""

from unittest.mock import patch
from fastapi.testclient import TestClient

from src.server import app


client = TestClient(app)


class TestServerEndpoints:
    def test_health(self):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "promptHashes" in data

    def test_check_rejects_empty_claims(self):
        response = client.post("/check", json={
            "claims": [],
            "specification_text": "",
            "invention_narrative": "",
            "settings": {"default_model": "claude-sonnet-4-20250514"},
        })
        assert response.status_code == 422

    def test_check_rejects_missing_model(self):
        response = client.post("/check", json={
            "claims": [{"claim_number": 1, "claim_type": "INDEPENDENT", "text": "A method"}],
            "specification_text": "",
            "invention_narrative": "",
            "settings": {},
        })
        assert response.status_code == 422
