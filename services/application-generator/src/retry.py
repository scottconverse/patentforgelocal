"""
Retry logic for Anthropic API calls.

Standardized delays matching the feasibility service (TypeScript):
  - 429 (rate limit):   60s, 90s, 120s
  - 500/502/503/529:    30s, 45s,  60s

Usage:
    response = await call_anthropic_with_retry(
        client, model=model, max_tokens=n, system=prompt, messages=[...]
    )
"""

from __future__ import annotations
import asyncio
import anthropic

MAX_RETRIES = 3
RATE_LIMIT_DELAYS = [60, 90, 120]   # seconds — matches feasibility service
SERVER_ERROR_DELAYS = [30, 45, 60]  # seconds


async def call_anthropic_with_retry(
    client: anthropic.AsyncAnthropic,
    *,
    model: str,
    max_tokens: int,
    system: str,
    messages: list,
    timeout: float = 300.0,
) -> anthropic.types.Message:
    """
    Call client.messages.create() with retry/backoff on 429 and 5xx errors.

    Retries up to MAX_RETRIES times. Raises the last exception if all retries
    are exhausted or if the error is not retryable (4xx other than 429).
    """
    last_exc: BaseException | None = None

    for attempt in range(MAX_RETRIES + 1):
        try:
            return await client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system,
                messages=messages,
                timeout=timeout,
            )
        except anthropic.APIStatusError as e:
            last_exc = e
            if e.status_code == 429:
                if attempt < MAX_RETRIES:
                    delay = RATE_LIMIT_DELAYS[attempt]
                    await asyncio.sleep(delay)
                    continue
                raise
            elif e.status_code in (500, 502, 503, 529):
                if attempt < MAX_RETRIES:
                    delay = SERVER_ERROR_DELAYS[attempt]
                    await asyncio.sleep(delay)
                    continue
                raise
            else:
                # Non-retryable 4xx (auth, not found, etc.) — fail immediately
                raise
        except anthropic.APIConnectionError:
            # Network-level errors (DNS, timeout, connection refused) — retry
            last_exc = anthropic.APIConnectionError.__new__(anthropic.APIConnectionError)
            if attempt < MAX_RETRIES:
                delay = SERVER_ERROR_DELAYS[attempt]
                await asyncio.sleep(delay)
                continue
            raise

    # Should not reach here, but satisfy type checker
    if last_exc:
        raise last_exc
    raise RuntimeError("call_anthropic_with_retry: unexpected exit from retry loop")
