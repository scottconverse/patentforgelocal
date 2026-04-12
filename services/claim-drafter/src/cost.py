"""
Cost estimation for Claude API calls.
Uses approximate per-token pricing for Anthropic models.
"""

# Approximate pricing per 1M tokens (input/output) as of 2026-03
MODEL_PRICING = {
    "claude-haiku-4-5-20251001": {"input": 0.80, "output": 4.00},
    "claude-sonnet-4-20250514": {"input": 3.00, "output": 15.00},
    "claude-opus-4-20250514": {"input": 15.00, "output": 75.00},
}

# Default fallback if model not recognized
DEFAULT_PRICING = {"input": 3.00, "output": 15.00}


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Estimate USD cost for an API call based on model and token counts."""
    pricing = MODEL_PRICING.get(model, DEFAULT_PRICING)
    input_cost = (input_tokens / 1_000_000) * pricing["input"]
    output_cost = (output_tokens / 1_000_000) * pricing["output"]
    return round(input_cost + output_cost, 6)
