"""
Unified LLM client wrapping LiteLLM.

Dispatches on settings.provider:
  - LOCAL → ollama/<model> via Ollama at settings.base_url
  - CLOUD → anthropic/<model> via Anthropic API

LiteLLM returns an OpenAI-shape response (litellm.ModelResponse) in both cases,
matching openai.types.chat.ChatCompletion.

Tests mock at the call_llm_with_retry boundary (per merge-decisions.md #16).
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Literal

import litellm

MAX_RETRIES = 3


@dataclass
class LLMSettings:
    """Provider configuration for a single LLM call."""
    provider: Literal["LOCAL", "CLOUD"] = "LOCAL"
    api_key: str = ""           # CLOUD: Anthropic key. LOCAL: ignored.
    base_url: str = ""          # LOCAL: Ollama host. CLOUD: ignored.


async def call_llm_with_retry(
    settings: LLMSettings,
    *,
    model: str,
    max_tokens: int,
    system: str,
    messages: list,
    timeout: float = 300.0,
) -> Any:
    """Call LiteLLM with provider-aware kwargs and built-in retries."""
    full_messages = [{"role": "system", "content": system}] + messages

    if settings.provider == "LOCAL":
        kwargs: dict[str, Any] = dict(
            model=f"ollama/{model}",
            api_base=settings.base_url or "http://127.0.0.1:11434",
            max_tokens=max_tokens,
            messages=full_messages,
            timeout=timeout,
            num_retries=MAX_RETRIES,
        )
    elif settings.provider == "CLOUD":
        kwargs = dict(
            model=f"anthropic/{model}",
            api_key=settings.api_key,
            max_tokens=max_tokens,
            messages=full_messages,
            timeout=timeout,
            num_retries=MAX_RETRIES,
        )
    else:
        raise ValueError(
            f"Unknown provider: {settings.provider!r}. Expected 'LOCAL' or 'CLOUD'."
        )

    return await litellm.acompletion(**kwargs)


def compute_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
    settings: LLMSettings,
) -> float:
    """Provider-aware cost in USD. LOCAL → 0.0. CLOUD → LiteLLM pricing table."""
    if settings.provider == "LOCAL":
        return 0.0
    try:
        return float(
            litellm.completion_cost(
                model=f"anthropic/{model}",
                prompt_tokens=input_tokens,
                completion_tokens=output_tokens,
            )
        )
    except Exception:
        return 0.0
