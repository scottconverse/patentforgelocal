"""
Retry logic for local Ollama inference via OpenAI-compatible API.

Standardized delays for local inference:
  - 5xx / connection errors: 5s, 10s, 15s

Usage:
    response = await call_ollama_with_retry(
        client, model=model, max_tokens=n, system=prompt, messages=[...]
    )
"""

from __future__ import annotations
import asyncio
import openai

MAX_RETRIES = 3
SERVER_ERROR_DELAYS = [5, 10, 15]  # seconds — local inference recovers fast


async def call_ollama_with_retry(
    client: openai.AsyncOpenAI,
    *,
    model: str,
    max_tokens: int,
    system: str,
    messages: list,
    timeout: float = 300.0,
) -> openai.types.chat.ChatCompletion:
    """
    Call client.chat.completions.create() with retry/backoff on 5xx and
    connection errors.

    The system prompt is injected as the first message in the messages array
    (role: system), matching the OpenAI chat-completions format that Ollama
    implements.

    Retries up to MAX_RETRIES times. Raises the last exception if all retries
    are exhausted or if the error is not retryable (4xx).
    """
    full_messages = [{"role": "system", "content": system}] + messages
    last_exc: BaseException | None = None

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
            if e.status_code >= 500:
                if attempt < MAX_RETRIES:
                    delay = SERVER_ERROR_DELAYS[attempt]
                    await asyncio.sleep(delay)
                    continue
                raise
            else:
                # Non-retryable 4xx — fail immediately
                raise
        except openai.APIConnectionError:
            last_exc = openai.APIConnectionError.__new__(openai.APIConnectionError)
            if attempt < MAX_RETRIES:
                delay = SERVER_ERROR_DELAYS[attempt]
                await asyncio.sleep(delay)
                continue
            raise

    # Should not reach here, but satisfy type checker
    if last_exc:
        raise last_exc
    raise RuntimeError("call_ollama_with_retry: unexpected exit from retry loop")
