"""Token usage formatting + provider-aware cost computation."""

from __future__ import annotations
from .llm_client import LLMSettings, compute_cost as _llm_compute_cost


def format_token_usage(input_tokens: int, output_tokens: int) -> str:
    return f"{input_tokens:,} in / {output_tokens:,} out"


def compute_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
    settings: LLMSettings,
) -> float:
    """Provider-aware cost in USD. Delegates to llm_client.compute_cost."""
    return _llm_compute_cost(model, input_tokens, output_tokens, settings)
