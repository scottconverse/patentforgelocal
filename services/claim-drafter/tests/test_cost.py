"""Tests for token usage formatting utility."""

from src.cost import format_token_usage


class TestFormatTokenUsage:
    def test_basic_formatting(self):
        result = format_token_usage(1000, 500)
        assert result == "1,000 in / 500 out"

    def test_zero_tokens(self):
        result = format_token_usage(0, 0)
        assert result == "0 in / 0 out"

    def test_large_numbers(self):
        result = format_token_usage(1_000_000, 500_000)
        assert result == "1,000,000 in / 500,000 out"
