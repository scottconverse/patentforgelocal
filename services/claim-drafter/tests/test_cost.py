"""Tests for cost estimation utility."""

from src.cost import estimate_cost


class TestEstimateCost:
    def test_haiku_pricing(self):
        cost = estimate_cost("claude-haiku-4-5-20251001", 1000, 500)
        # input: 1000/1M * 0.80 = 0.0008, output: 500/1M * 4.00 = 0.002
        assert abs(cost - 0.0028) < 0.0001

    def test_sonnet_pricing(self):
        cost = estimate_cost("claude-sonnet-4-20250514", 10000, 5000)
        # input: 10000/1M * 3.00 = 0.03, output: 5000/1M * 15.00 = 0.075
        assert abs(cost - 0.105) < 0.001

    def test_opus_pricing(self):
        cost = estimate_cost("claude-opus-4-20250514", 10000, 5000)
        # input: 10000/1M * 15.00 = 0.15, output: 5000/1M * 75.00 = 0.375
        assert abs(cost - 0.525) < 0.001

    def test_unknown_model_uses_default(self):
        cost = estimate_cost("unknown-model", 1000000, 0)
        # Default input: 1M/1M * 3.00 = 3.00
        assert abs(cost - 3.0) < 0.01

    def test_zero_tokens(self):
        cost = estimate_cost("claude-sonnet-4-20250514", 0, 0)
        assert cost == 0.0
