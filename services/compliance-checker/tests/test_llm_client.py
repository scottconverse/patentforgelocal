"""
Tests for the LiteLLM-based LLMClient wrapper (compliance-checker service).

Verifies provider dispatch + retry config + error propagation.
Per merge-decisions.md #16: dedicated dispatch test for this service.
"""

from __future__ import annotations
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from src.llm_client import (
    LLMSettings,
    MAX_RETRIES,
    call_llm_with_retry,
    compute_cost,
)


def _make_mock_response():
    mock = MagicMock()
    mock.choices = [MagicMock()]
    mock.choices[0].message.content = "ok"
    mock.usage.prompt_tokens = 10
    mock.usage.completion_tokens = 20
    return mock


@pytest.mark.asyncio
async def test_local_dispatches_to_ollama_via_litellm():
    settings = LLMSettings(provider="LOCAL", base_url="http://10.0.0.5:11434")
    with patch("src.llm_client.litellm.acompletion", new_callable=AsyncMock) as mock:
        mock.return_value = _make_mock_response()
        await call_llm_with_retry(
            settings, model="gemma4:e4b", max_tokens=1024,
            system="sys", messages=[{"role": "user", "content": "hi"}], timeout=60.0,
        )
    kwargs = mock.call_args.kwargs
    assert kwargs["model"] == "ollama/gemma4:e4b"
    assert kwargs["api_base"] == "http://10.0.0.5:11434"
    assert kwargs["num_retries"] == MAX_RETRIES
    assert kwargs["messages"][0] == {"role": "system", "content": "sys"}
    assert "api_key" not in kwargs


@pytest.mark.asyncio
async def test_local_uses_default_base_url_when_empty():
    settings = LLMSettings(provider="LOCAL", base_url="")
    with patch("src.llm_client.litellm.acompletion", new_callable=AsyncMock) as mock:
        mock.return_value = _make_mock_response()
        await call_llm_with_retry(
            settings, model="m", max_tokens=1, system="", messages=[{"role": "user", "content": "x"}],
        )
    assert mock.call_args.kwargs["api_base"] == "http://127.0.0.1:11434"


@pytest.mark.asyncio
async def test_cloud_dispatches_to_anthropic_via_litellm():
    settings = LLMSettings(provider="CLOUD", api_key="sk-test-abc")
    with patch("src.llm_client.litellm.acompletion", new_callable=AsyncMock) as mock:
        mock.return_value = _make_mock_response()
        await call_llm_with_retry(
            settings, model="claude-haiku-4-5", max_tokens=2000,
            system="s", messages=[{"role": "user", "content": "h"}], timeout=120.0,
        )
    kwargs = mock.call_args.kwargs
    assert kwargs["model"] == "anthropic/claude-haiku-4-5"
    assert kwargs["api_key"] == "sk-test-abc"
    assert kwargs["num_retries"] == MAX_RETRIES
    assert "api_base" not in kwargs


@pytest.mark.asyncio
async def test_unknown_provider_raises_value_error():
    settings = LLMSettings(provider="UNKNOWN")  # type: ignore[arg-type]
    with patch("src.llm_client.litellm.acompletion", new_callable=AsyncMock) as mock:
        with pytest.raises(ValueError, match="Unknown provider"):
            await call_llm_with_retry(settings, model="x", max_tokens=1, system="", messages=[])
    mock.assert_not_called()


@pytest.mark.asyncio
async def test_litellm_exception_propagates():
    settings = LLMSettings(provider="LOCAL")
    with patch("src.llm_client.litellm.acompletion", new_callable=AsyncMock) as mock:
        mock.side_effect = RuntimeError("model not found")
        with pytest.raises(RuntimeError, match="model not found"):
            await call_llm_with_retry(
                settings, model="bogus", max_tokens=1, system="",
                messages=[{"role": "user", "content": "x"}],
            )


def test_compute_cost_local_returns_zero():
    settings = LLMSettings(provider="LOCAL")
    assert compute_cost("gemma4:e4b", 10_000, 5_000, settings) == 0.0


def test_compute_cost_cloud_uses_litellm_completion_cost():
    settings = LLMSettings(provider="CLOUD", api_key="sk")
    with patch("src.llm_client.litellm.completion_cost") as mock:
        mock.return_value = 0.42
        cost = compute_cost("claude-haiku-4-5", 1000, 500, settings)
    assert cost == 0.42
    assert mock.call_args.kwargs["model"] == "anthropic/claude-haiku-4-5"


def test_compute_cost_cloud_falls_back_to_zero_on_unknown_model():
    settings = LLMSettings(provider="CLOUD", api_key="sk")
    with patch("src.llm_client.litellm.completion_cost", side_effect=Exception("unknown")):
        assert compute_cost("future-model", 10, 5, settings) == 0.0


def test_llm_settings_defaults_to_local():
    s = LLMSettings()
    assert s.provider == "LOCAL"
    assert s.api_key == ""
    assert s.base_url == ""


def test_max_retries_constant():
    assert MAX_RETRIES == 3
