"""
Retry logic for Ollama API calls via the OpenAI SDK.

Retries on connection errors and server errors (5xx).
No rate-limit retry needed (local Ollama has no rate limits).
"""

from __future__ import annotations
import asyncio
import openai

MAX_RETRIES = 3
RETRY_DELAYS = [5, 10, 15]


async def call_ollama_with_retry(
    client: openai.AsyncOpenAI,
    *,
    model: str,
    max_tokens: int,
    system: str,
    messages: list,
    timeout: float = 300.0,
) -> openai.types.chat.ChatCompletion:
    """Call client.chat.completions.create() with retry on errors."""
    last_exc: BaseException | None = None
    full_messages = [{"role": "system", "content": system}] + messages

    for attempt in range(MAX_RETRIES + 1):
        try:
            return await client.chat.completions.create(
                model=model,
                max_tokens=max_tokens,
                messages=full_messages,
                timeout=timeout,
            )
        except openai.APIStatusError as e:
            last_exc = e
            if e.status_code >= 500 and attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_DELAYS[attempt])
                continue
            raise
        except openai.APIConnectionError as e:
            last_exc = e
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_DELAYS[attempt])
                continue
            raise

    if last_exc:
        raise last_exc
    raise RuntimeError("call_ollama_with_retry: unexpected exit")
