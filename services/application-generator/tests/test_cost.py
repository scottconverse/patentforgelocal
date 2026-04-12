"""Tests for cost estimation and API error formatting."""

import pytest
from src.cost import estimate_cost, format_api_error


class TestEstimateCost:
    def test_known_model_haiku(self):
        cost = estimate_cost("claude-haiku-4-5-20251001", 1_000_000, 1_000_000)
        # $0.80/M input + $4.00/M output = $4.80
        assert abs(cost - 4.80) < 0.01

    def test_known_model_sonnet(self):
        cost = estimate_cost("claude-sonnet-4-20250514", 1_000_000, 1_000_000)
        # $3.00/M input + $15.00/M output = $18.00
        assert abs(cost - 18.00) < 0.01

    def test_unknown_model_uses_default(self):
        cost_default = estimate_cost("claude-sonnet-4-20250514", 500_000, 100_000)
        cost_unknown = estimate_cost("claude-unknown-model", 500_000, 100_000)
        # Default pricing matches sonnet pricing
        assert cost_default == cost_unknown

    def test_zero_tokens(self):
        assert estimate_cost("claude-sonnet-4-20250514", 0, 0) == 0.0

    def test_small_token_count(self):
        cost = estimate_cost("claude-sonnet-4-20250514", 1000, 500)
        # 1000 input @ $3/M = $0.003, 500 output @ $15/M = $0.0075 → ~$0.0105
        assert cost > 0
        assert cost < 0.02


class TestFormatApiError:
    def test_generic_exception(self):
        e = ValueError("something went wrong")
        result = format_api_error(e)
        assert result == "something went wrong"

    def test_generic_exception_preserves_message(self):
        e = RuntimeError("connection refused")
        result = format_api_error(e)
        assert "connection refused" in result

    def test_non_anthropic_exception_returns_str(self):
        e = Exception("plain error")
        result = format_api_error(e)
        assert result == "plain error"

    def test_returns_string_type(self):
        """format_api_error always returns a str, never raises."""
        for exc in [ValueError("x"), RuntimeError("y"), Exception("z")]:
            result = format_api_error(exc)
            assert isinstance(result, str)

    def test_anthropic_structured_body_extracts_message(self):
        """When an exception has a body dict in Anthropic error format, extract inner message."""
        # Simulate what Anthropic APIStatusError looks like at runtime
        e = ValueError("Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low'}}")
        e.body = {"type": "error", "error": {"type": "invalid_request_error", "message": "Your credit balance is too low"}}  # type: ignore[attr-defined]
        result = format_api_error(e)
        # Should NOT contain raw JSON dict syntax
        assert "{'type'" not in result
        assert "Error code:" not in result
        # Should contain the human-readable message
        assert "Your credit balance is too low" in result

    def test_billing_error_adds_actionable_guidance(self):
        """Credit balance errors get a link to billing settings."""
        e = ValueError("Error code: 400 - ...")
        e.body = {"type": "error", "error": {"type": "invalid_request_error", "message": "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}  # type: ignore[attr-defined]
        result = format_api_error(e)
        assert "credit balance" in result.lower()
        assert "Settings" in result or "console.anthropic.com" in result
        assert "{'type'" not in result

    def test_auth_error_adds_actionable_guidance(self):
        """Invalid API key errors get guidance to check Settings."""
        e = ValueError("Error code: 401 - ...")
        e.body = {"type": "error", "error": {"type": "authentication_error", "message": "invalid api key"}}  # type: ignore[attr-defined]
        result = format_api_error(e)
        assert "Settings" in result
        assert "{'type'" not in result

    def test_hyphenated_api_key_error_adds_guidance(self):
        """'invalid x-api-key' (no body) still gets actionable guidance via str(e) path."""
        e = ValueError("invalid x-api-key")
        result = format_api_error(e)
        assert "Settings" in result

    def test_body_without_error_key_falls_back_to_str(self):
        """If body dict doesn't have 'error' key, falls back to str(e)."""
        e = RuntimeError("something broke")
        e.body = {"unexpected": "structure"}  # type: ignore[attr-defined]
        result = format_api_error(e)
        assert result == "something broke"

    def test_non_dict_body_falls_back_to_str(self):
        """If body is not a dict (e.g. a string), falls back to str(e)."""
        e = RuntimeError("raw error")
        e.body = "not a dict"  # type: ignore[attr-defined]
        result = format_api_error(e)
        assert result == "raw error"


class TestResolveApiKey:
    """Tests for server.resolve_api_key — request key takes priority over env var."""

    def test_request_key_preferred_over_env_var(self):
        import src.server as srv
        original_env = srv.ANTHROPIC_API_KEY_ENV
        srv.ANTHROPIC_API_KEY_ENV = "env-key-abc"
        try:
            result = srv.resolve_api_key("request-key-xyz")
            assert result == "request-key-xyz"
        finally:
            srv.ANTHROPIC_API_KEY_ENV = original_env

    def test_env_var_used_when_no_request_key(self):
        import src.server as srv
        original_env = srv.ANTHROPIC_API_KEY_ENV
        srv.ANTHROPIC_API_KEY_ENV = "env-key-abc"
        try:
            result = srv.resolve_api_key("")
            assert result == "env-key-abc"
        finally:
            srv.ANTHROPIC_API_KEY_ENV = original_env

    def test_returns_empty_when_both_absent(self):
        import src.server as srv
        original_env = srv.ANTHROPIC_API_KEY_ENV
        srv.ANTHROPIC_API_KEY_ENV = ""
        try:
            result = srv.resolve_api_key("")
            assert result == ""
        finally:
            srv.ANTHROPIC_API_KEY_ENV = original_env

    def test_request_key_not_overridden_by_nonempty_env(self):
        """Key regression test: a stale env var must never silently override a configured key."""
        import src.server as srv
        original_env = srv.ANTHROPIC_API_KEY_ENV
        srv.ANTHROPIC_API_KEY_ENV = "stale-env-key"
        try:
            user_key = "sk-ant-user-configured-key"
            result = srv.resolve_api_key(user_key)
            assert result == user_key
            assert result != "stale-env-key"
        finally:
            srv.ANTHROPIC_API_KEY_ENV = original_env
