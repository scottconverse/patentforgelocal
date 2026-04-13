"""Tests for token usage formatting and Ollama URL resolution."""

from src.cost import format_token_usage


class TestFormatTokenUsage:
    def test_basic_formatting(self):
        result = format_token_usage(1_000_000, 1_000_000)
        assert result == "1,000,000 in / 1,000,000 out"

    def test_zero_tokens(self):
        assert format_token_usage(0, 0) == "0 in / 0 out"

    def test_small_token_count(self):
        result = format_token_usage(1000, 500)
        assert result == "1,000 in / 500 out"


class TestResolveOllamaUrl:
    """Tests for server.resolve_ollama_url — request URL takes priority over env var."""

    def test_request_url_preferred_over_env_var(self):
        import src.server as srv
        original_env = srv.OLLAMA_HOST
        srv.OLLAMA_HOST = "http://env-host:11434"
        try:
            result = srv.resolve_ollama_url("http://request-host:11434")
            assert result == "http://request-host:11434"
        finally:
            srv.OLLAMA_HOST = original_env

    def test_env_var_used_when_no_request_url(self):
        import src.server as srv
        original_env = srv.OLLAMA_HOST
        srv.OLLAMA_HOST = "http://env-host:11434"
        try:
            result = srv.resolve_ollama_url("")
            assert result == "http://env-host:11434"
        finally:
            srv.OLLAMA_HOST = original_env

    def test_returns_empty_when_both_absent(self):
        import src.server as srv
        original_env = srv.OLLAMA_HOST
        srv.OLLAMA_HOST = ""
        try:
            result = srv.resolve_ollama_url("")
            assert result == ""
        finally:
            srv.OLLAMA_HOST = original_env

    def test_request_url_not_overridden_by_nonempty_env(self):
        """Key regression test: a stale env var must never silently override a configured URL."""
        import src.server as srv
        original_env = srv.OLLAMA_HOST
        srv.OLLAMA_HOST = "http://stale-env:11434"
        try:
            user_url = "http://user-configured:11434"
            result = srv.resolve_ollama_url(user_url)
            assert result == user_url
            assert result != "http://stale-env:11434"
        finally:
            srv.OLLAMA_HOST = original_env
