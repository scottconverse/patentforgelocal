"""Tests for cost estimation."""

from src.cost import estimate_cost


def test_sonnet_cost():
    cost = estimate_cost("claude-sonnet-4-20250514", 10000, 5000)
    expected = (10000 / 1_000_000) * 3.00 + (5000 / 1_000_000) * 15.00
    assert abs(cost - expected) < 0.000001


def test_haiku_cost():
    cost = estimate_cost("claude-haiku-4-5-20251001", 10000, 5000)
    expected = (10000 / 1_000_000) * 0.80 + (5000 / 1_000_000) * 4.00
    assert abs(cost - expected) < 0.000001


def test_unknown_model_uses_default():
    cost = estimate_cost("unknown-model", 10000, 5000)
    expected = (10000 / 1_000_000) * 3.00 + (5000 / 1_000_000) * 15.00
    assert abs(cost - expected) < 0.000001


def test_zero_tokens():
    assert estimate_cost("claude-sonnet-4-20250514", 0, 0) == 0.0
