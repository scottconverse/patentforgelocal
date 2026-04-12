"""
Cost estimation for Claude API calls.
Uses approximate per-token pricing for Anthropic models.
"""

MODEL_PRICING = {
    "claude-haiku-4-5-20251001": {"input": 0.80, "output": 4.00},
    "claude-sonnet-4-20250514": {"input": 3.00, "output": 15.00},
    "claude-opus-4-20250514": {"input": 15.00, "output": 75.00},
}

DEFAULT_PRICING = {"input": 3.00, "output": 15.00}


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Estimate USD cost for an API call based on model and token counts."""
    pricing = MODEL_PRICING.get(model, DEFAULT_PRICING)
    input_cost = (input_tokens / 1_000_000) * pricing["input"]
    output_cost = (output_tokens / 1_000_000) * pricing["output"]
    return round(input_cost + output_cost, 6)


def format_api_error(e: Exception) -> str:
    """Extract a clean, human-readable message from an Anthropic API exception.

    Anthropic SDK errors serialize as:
      'Error code: 400 - {\'type\': \'error\', \'error\': {\'type\': ..., \'message\': \'...\'}}'
    This helper extracts just the inner message string for display to users,
    and adds actionable guidance for common billing/auth errors.

    Uses attribute inspection (not isinstance) so it works across SDK versions.
    """
    # Try body['error']['message'] — the Anthropic structured error format
    raw_msg: str | None = None
    try:
        body = getattr(e, "body", None)
        if isinstance(body, dict):
            inner = body.get("error", {})
            if isinstance(inner, dict):
                msg = inner.get("message")
                if msg:
                    raw_msg = str(msg)
    except Exception:
        pass

    if raw_msg is None:
        raw_msg = str(e)

    # Add actionable guidance for known error conditions
    lower = raw_msg.lower()
    if "credit balance" in lower or "billing" in lower or "credits" in lower:
        return (
            f"{raw_msg} — "
            "Go to Settings to update your Anthropic API key, or visit "
            "console.anthropic.com/billing to add credits."
        )
    if "invalid api key" in lower or "authentication" in lower or "api key" in lower or "api-key" in lower:
        return (
            f"{raw_msg} — "
            "Go to Settings to verify your Anthropic API key is correct."
        )

    return raw_msg
