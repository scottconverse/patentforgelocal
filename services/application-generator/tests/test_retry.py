"""Tests for Anthropic API retry/backoff utility."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import anthropic
import pytest

from src.retry import (
    MAX_RETRIES,
    RATE_LIMIT_DELAYS,
    SERVER_ERROR_DELAYS,
    call_anthropic_with_retry,
)


def _make_client(side_effects):
    """Build a mock AsyncAnthropic client whose messages.create has the given side effects."""
    client = MagicMock(spec=anthropic.AsyncAnthropic)
    client.messages = MagicMock()
    client.messages.create = AsyncMock(side_effect=side_effects)
    return client


def _rate_limit_error():
    err = anthropic.RateLimitError.__new__(anthropic.RateLimitError)
    err.status_code = 429
    err.message = "Rate limited"
    return err


def _server_error(status: int = 503):
    err = anthropic.InternalServerError.__new__(anthropic.InternalServerError)
    err.status_code = status
    err.message = f"Server error {status}"
    return err


def _api_status_error(status: int):
    err = anthropic.APIStatusError.__new__(anthropic.APIStatusError)
    err.status_code = status
    err.message = f"API error {status}"
    return err


CALL_KWARGS = dict(
    model="claude-haiku-4-5-20251001",
    max_tokens=1024,
    system="test system",
    messages=[{"role": "user", "content": "test"}],
)


@pytest.mark.asyncio
async def test_success_on_first_attempt():
    """No retries needed — returns response immediately."""
    mock_response = MagicMock()
    client = _make_client([mock_response])

    with patch("src.retry.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        result = await call_anthropic_with_retry(client, **CALL_KWARGS)

    assert result is mock_response
    mock_sleep.assert_not_called()


@pytest.mark.asyncio
async def test_success_after_one_rate_limit():
    """429 on first attempt → waits → succeeds on second attempt."""
    mock_response = MagicMock()
    client = _make_client([_rate_limit_error(), mock_response])

    with patch("src.retry.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        result = await call_anthropic_with_retry(client, **CALL_KWARGS)

    assert result is mock_response
    mock_sleep.assert_called_once_with(RATE_LIMIT_DELAYS[0])


@pytest.mark.asyncio
async def test_rate_limit_uses_correct_delay_sequence():
    """429 retries use the 60s/90s delay sequence."""
    mock_response = MagicMock()
    client = _make_client([_rate_limit_error(), _rate_limit_error(), mock_response])

    with patch("src.retry.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        result = await call_anthropic_with_retry(client, **CALL_KWARGS)

    assert result is mock_response
    assert mock_sleep.call_count == 2
    assert mock_sleep.call_args_list[0][0][0] == RATE_LIMIT_DELAYS[0]  # 60s
    assert mock_sleep.call_args_list[1][0][0] == RATE_LIMIT_DELAYS[1]  # 90s


@pytest.mark.asyncio
async def test_rate_limit_raises_after_max_retries():
    """429 on every attempt → raises after MAX_RETRIES exhausted."""
    errors = [_rate_limit_error()] * (MAX_RETRIES + 1)
    client = _make_client(errors)

    with patch("src.retry.asyncio.sleep", new_callable=AsyncMock):
        with pytest.raises(anthropic.RateLimitError):
            await call_anthropic_with_retry(client, **CALL_KWARGS)

    assert client.messages.create.call_count == MAX_RETRIES + 1


@pytest.mark.asyncio
async def test_success_after_server_error():
    """502 on first attempt → waits → succeeds on second attempt."""
    mock_response = MagicMock()
    client = _make_client([_server_error(502), mock_response])

    with patch("src.retry.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        result = await call_anthropic_with_retry(client, **CALL_KWARGS)

    assert result is mock_response
    mock_sleep.assert_called_once_with(SERVER_ERROR_DELAYS[0])


@pytest.mark.asyncio
async def test_server_error_503_retried():
    """503 is retried with server error delays."""
    mock_response = MagicMock()
    client = _make_client([_server_error(503), mock_response])

    with patch("src.retry.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        result = await call_anthropic_with_retry(client, **CALL_KWARGS)

    assert result is mock_response
    mock_sleep.assert_called_once_with(SERVER_ERROR_DELAYS[0])


@pytest.mark.asyncio
async def test_non_retryable_4xx_raises_immediately():
    """401 (auth error) is not retried — raises immediately on first attempt."""
    client = _make_client([_api_status_error(401)])

    with patch("src.retry.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        with pytest.raises(anthropic.APIStatusError):
            await call_anthropic_with_retry(client, **CALL_KWARGS)

    mock_sleep.assert_not_called()
    assert client.messages.create.call_count == 1


@pytest.mark.asyncio
async def test_server_error_raises_after_max_retries():
    """503 on every attempt → raises after MAX_RETRIES exhausted."""
    errors = [_server_error(503)] * (MAX_RETRIES + 1)
    client = _make_client(errors)

    with patch("src.retry.asyncio.sleep", new_callable=AsyncMock):
        with pytest.raises(anthropic.InternalServerError):
            await call_anthropic_with_retry(client, **CALL_KWARGS)

    assert client.messages.create.call_count == MAX_RETRIES + 1


@pytest.mark.asyncio
async def test_delay_constants_match_spec():
    """Verify delay values match the feasibility service spec."""
    assert RATE_LIMIT_DELAYS == [60, 90, 120]
    assert SERVER_ERROR_DELAYS == [30, 45, 60]
    assert MAX_RETRIES == 3
