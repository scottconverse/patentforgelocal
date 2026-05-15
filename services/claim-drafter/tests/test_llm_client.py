"""
Tests for the LiteLLM-based LLMClient wrapper.

Verifies provider dispatch (LOCAL → ollama/<model>, CLOUD → anthropic/<model>),
retry-config passthrough (num_retries=MAX_RETRIES), and error propagation.

Per merge-decisions.md #16: this file is the dedicated dispatch test for
claim-drafter. Other tests (agents, etc.) mock at the call_llm_with_retry
boundary, NOT at litellm.acompletion.
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


def _make_mock_response(content: str = "ok", prompt_tokens: int = 10, completion_tokens: int = 20):
    mock = MagicMock()
    mock.choices = [MagicMock()]
    mock.choices[0].message.content = content
    mock.usage.prompt_tokens = prompt_tokens
    mock.usage.completion_tokens = completion_tokens
    return mock


# ── Provider dispatch ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_local_dispatches_to_ollama_via_litellm():
    """LOCAL provider routes through litellm.acompletion with model='ollama/<m>' and api_base set."""
    settings = LLMSettings(provider="LOCAL", base_url="http://10.0.0.5:11434")

    with patch("src.llm_client.litellm.acompletion", new_callable=AsyncMock) as mock_acompletion:
        mock_acompletion.return_value = _make_mock_response()

        await call_llm_with_retry(
            settings,
            model="gemma4:e4b",
            max_tokens=1024,
            system="sys",
            messages=[{"role": "user", "content": "hi"}],
            timeout=60.0,
        )

    assert mock_acompletion.call_count == 1
    kwargs = mock_acompletion.call_args.kwargs
    assert kwargs["model"] == "ollama/gemma4:e4b"
    assert kwargs["api_base"] == "http://10.0.0.5:11434"
    assert kwargs["max_tokens"] == 1024
    assert kwargs["timeout"] == 60.0
    assert kwargs["num_retries"] == MAX_RETRIES
    # System message prepended to user messages
    assert kwargs["messages"][0] == {"role": "system", "content": "sys"}
    assert kwargs["messages"][1] == {"role": "user", "content": "hi"}
    # api_key not required for LOCAL
    assert "api_key" not in kwargs


@pytest.mark.asyncio
async def test_local_uses_default_base_url_when_empty():
    """LOCAL with empty base_url falls back to the localhost Ollama default."""
    settings = LLMSettings(provider="LOCAL", base_url="")

    with patch("src.llm_client.litellm.acompletion", new_callable=AsyncMock) as mock_acompletion:
        mock_acompletion.return_value = _make_mock_response()
        await call_llm_with_retry(
            settings,
            model="gemma4:e4b",
            max_tokens=512,
            system="",
            messages=[{"role": "user", "content": "x"}],
        )

    kwargs = mock_acompletion.call_args.kwargs
    assert kwargs["api_base"] == "http://127.0.0.1:11434"


@pytest.mark.asyncio
async def test_cloud_dispatches_to_anthropic_via_litellm():
    """CLOUD provider routes through litellm.acompletion with model='anthropic/<m>' and api_key set."""
    settings = LLMSettings(provider="CLOUD", api_key="sk-test-abc123")

    with patch("src.llm_client.litellm.acompletion", new_callable=AsyncMock) as mock_acompletion:
        mock_acompletion.return_value = _make_mock_response()

        await call_llm_with_retry(
            settings,
            model="claude-haiku-4-5-20251001",
            max_tokens=2000,
            system="sys",
            messages=[{"role": "user", "content": "hi"}],
            timeout=120.0,
        )

    assert mock_acompletion.call_count == 1
    kwargs = mock_acompletion.call_args.kwargs
    assert kwargs["model"] == "anthropic/claude-haiku-4-5-20251001"
    assert kwargs["api_key"] == "sk-test-abc123"
    assert kwargs["max_tokens"] == 2000
    assert kwargs["timeout"] == 120.0
    assert kwargs["num_retries"] == MAX_RETRIES
    # api_base not used for CLOUD (LiteLLM defaults to api.anthropic.com)
    assert "api_base" not in kwargs


@pytest.mark.asyncio
async def test_unknown_provider_raises_value_error():
    """Unknown provider string raises ValueError before hitting LiteLLM."""
    settings = LLMSettings(provider="UNKNOWN")  # type: ignore[arg-type]

    with patch("src.llm_client.litellm.acompletion", new_callable=AsyncMock) as mock_acompletion:
        with pytest.raises(ValueError, match="Unknown provider"):
            await call_llm_with_retry(
                settings,
                model="x",
                max_tokens=1,
                system="",
                messages=[],
            )

    # Ensure we never called LiteLLM with bad input
    mock_acompletion.assert_not_called()


@pytest.mark.asyncio
async def test_litellm_exception_propagates():
    """If litellm.acompletion raises, the exception propagates to the caller."""
    settings = LLMSettings(provider="LOCAL")

    with patch("src.llm_client.litellm.acompletion", new_callable=AsyncMock) as mock_acompletion:
        mock_acompletion.side_effect = RuntimeError("model not found")
        with pytest.raises(RuntimeError, match="model not found"):
            await call_llm_with_retry(
                settings,
                model="bogus",
                max_tokens=1,
                system="",
                messages=[{"role": "user", "content": "x"}],
            )


# ── Cost computation ────────────────────────────────────────────────────────


def test_compute_cost_local_returns_zero():
    """LOCAL provider always returns 0.0 (Ollama is free)."""
    settings = LLMSettings(provider="LOCAL")
    cost = compute_cost("gemma4:e4b", input_tokens=10_000, output_tokens=5_000, settings=settings)
    assert cost == 0.0


def test_compute_cost_cloud_uses_litellm_completion_cost():
    """CLOUD provider delegates cost math to litellm.completion_cost."""
    settings = LLMSettings(provider="CLOUD", api_key="sk-test")

    with patch("src.llm_client.litellm.completion_cost") as mock_cost:
        mock_cost.return_value = 0.42
        cost = compute_cost("claude-haiku-4-5", input_tokens=1000, output_tokens=500, settings=settings)

    assert cost == 0.42
    mock_cost.assert_called_once()
    kwargs = mock_cost.call_args.kwargs
    assert kwargs["model"] == "anthropic/claude-haiku-4-5"
    assert kwargs["prompt_tokens"] == 1000
    assert kwargs["completion_tokens"] == 500


def test_compute_cost_cloud_falls_back_to_zero_on_unknown_model():
    """If LiteLLM's pricing table doesn't know the model, return 0.0 instead of crashing."""
    settings = LLMSettings(provider="CLOUD", api_key="sk-test")

    with patch("src.llm_client.litellm.completion_cost", side_effect=Exception("unknown model")):
        cost = compute_cost("claude-future-2030", input_tokens=10, output_tokens=5, settings=settings)

    assert cost == 0.0


# ── LLMSettings defaults ────────────────────────────────────────────────────


def test_llm_settings_defaults_to_local():
    """LLMSettings() with no args defaults to LOCAL with empty api_key/base_url."""
    s = LLMSettings()
    assert s.provider == "LOCAL"
    assert s.api_key == ""
    assert s.base_url == ""


def test_max_retries_constant():
    """MAX_RETRIES is the documented default — guards against accidental regression."""
    assert MAX_RETRIES == 3
