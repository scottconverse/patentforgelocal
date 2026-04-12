"""Tests for internal service authentication."""

import os
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient


class TestAuth:
    def test_auth_disabled_when_no_secret(self):
        with patch.dict(os.environ, {"INTERNAL_SERVICE_SECRET": ""}, clear=False):
            # Re-import to pick up env change
            from src.server import app
            client = TestClient(app)
            response = client.get("/health")
            assert response.status_code == 200

    def test_health_always_accessible(self):
        from src.server import app
        client = TestClient(app)
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "patentforge-compliance-checker"
        assert "promptHashes" in data
