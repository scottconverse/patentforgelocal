"""Tests for token usage formatting utility."""

from src.cost import format_token_usage


def test_basic_formatting():
    result = format_token_usage(10000, 5000)
    assert result == "10,000 in / 5,000 out"


def test_zero_tokens():
    assert format_token_usage(0, 0) == "0 in / 0 out"


def test_large_numbers():
    result = format_token_usage(1_000_000, 500_000)
    assert result == "1,000,000 in / 500,000 out"
