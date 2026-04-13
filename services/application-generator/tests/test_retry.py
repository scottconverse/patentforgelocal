"""Tests for Ollama API retry/backoff utility."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import openai
import httpx
import pytest

from src.retry import (
    MAX_RETRIES,
    SERVER_ERROR_DELAYS,
    call_ollama_with_retry,
)


def _make_client(side_effects):
    """Build a mock AsyncOpenAI client whose chat.completions.create has the given side effects."""
    client = MagicMock(spec=openai.AsyncOpenAI)
    client.chat = MagicMock()
    client.chat.completions = MagicMock()
    client.chat.completions.create = AsyncMock(side_effect=side_effects)
    return client


def _server_error(status: int = 503):
    mock_request = httpx.Request("POST", "http://localhost:11434/v1/chat/completions")
    mock_response = httpx.Response(status_code=status, request=mock_request)
    return openai.APIStatusError(
        message=f"Server error {status}",
        response=mock_response,
        body=None,
    )


def _connection_error():
    return openai.APIConnectionError(request=httpx.Request("POST", "http://localhost:11434/v1/chat/completions"))


CALL_KWARGS = dict(
    model="gemma4:26b",
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
        result = await call_ollama_with_retry(client, **CALL_KWARGS)

    assert result is mock_response
    mock_sleep.assert_not_called()


@pytest.mark.asyncio
async def test_success_after_one_server_error():
    """503 on first attempt -> waits -> succeeds on second attempt."""
    mock_response = MagicMock()
    client = _make_client([_server_error(503), mock_response])

    with patch("src.retry.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        result = await call_ollama_with_retry(client, **CALL_KWARGS)

    assert result is mock_response
    mock_sleep.assert_called_once_with(SERVER_ERROR_DELAYS[0])


@pytest.mark.asyncio
async def test_success_after_connection_error():
    """Connection error on first attempt -> waits -> succeeds on second attempt."""
    mock_response = MagicMock()
    client = _make_client([_connection_error(), mock_response])

    with patch("src.retry.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        result = await call_ollama_with_retry(client, **CALL_KWARGS)

    assert result is mock_response
    mock_sleep.assert_called_once_with(SERVER_ERROR_DELAYS[0])


@pytest.mark.asyncio
async def test_server_error_uses_correct_delay_sequence():
    """Server error retries use the 5s/10s delay sequence."""
    mock_response = MagicMock()
    client = _make_client([_server_error(503), _server_error(502), mock_response])

    with patch("src.retry.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        result = await call_ollama_with_retry(client, **CALL_KWARGS)

    assert result is mock_response
    assert mock_sleep.call_count == 2
    assert mock_sleep.call_args_list[0][0][0] == SERVER_ERROR_DELAYS[0]  # 5s
    assert mock_sleep.call_args_list[1][0][0] == SERVER_ERROR_DELAYS[1]  # 10s


@pytest.mark.asyncio
async def test_server_error_raises_after_max_retries():
    """503 on every attempt -> raises after MAX_RETRIES exhausted."""
    errors = [_server_error(503)] * (MAX_RETRIES + 1)
    client = _make_client(errors)

    with patch("src.retry.asyncio.sleep", new_callable=AsyncMock):
        with pytest.raises(openai.APIStatusError):
            await call_ollama_with_retry(client, **CALL_KWARGS)

    assert client.chat.completions.create.call_count == MAX_RETRIES + 1


@pytest.mark.asyncio
async def test_connection_error_raises_after_max_retries():
    """Connection errors on every attempt -> raises after MAX_RETRIES exhausted."""
    errors = [_connection_error()] * (MAX_RETRIES + 1)
    client = _make_client(errors)

    with patch("src.retry.asyncio.sleep", new_callable=AsyncMock):
        with pytest.raises(openai.APIConnectionError):
            await call_ollama_with_retry(client, **CALL_KWARGS)

    assert client.chat.completions.create.call_count == MAX_RETRIES + 1


@pytest.mark.asyncio
async def test_non_retryable_4xx_raises_immediately():
    """400 (client error) is not retried — raises immediately on first attempt."""
    client = _make_client([_server_error(400)])

    with patch("src.retry.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        with pytest.raises(openai.APIStatusError):
            await call_ollama_with_retry(client, **CALL_KWARGS)

    mock_sleep.assert_not_called()
    assert client.chat.completions.create.call_count == 1


@pytest.mark.asyncio
async def test_server_error_502_retried():
    """502 is retried with server error delays."""
    mock_response = MagicMock()
    client = _make_client([_server_error(502), mock_response])

    with patch("src.retry.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        result = await call_ollama_with_retry(client, **CALL_KWARGS)

    assert result is mock_response
    mock_sleep.assert_called_once_with(SERVER_ERROR_DELAYS[0])


@pytest.mark.asyncio
async def test_delay_constants_match_spec():
    """Verify delay values match the local Ollama retry spec."""
    assert SERVER_ERROR_DELAYS == [5, 10, 15]
    assert MAX_RETRIES == 3
