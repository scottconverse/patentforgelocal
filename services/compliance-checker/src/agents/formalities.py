"""
Formalities Agent — MPEP 608 check.

Evaluates whether the claims comply with USPTO formalities requirements
including antecedent basis, claim structure, and formatting.
"""

from __future__ import annotations
import json
import re
from pathlib import Path

from ..models import GraphState
from ..llm_client import LLMSettings, call_llm_with_retry

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


def _load_prompt() -> str:
    common = ""
    common_path = PROMPTS_DIR / "common-rules.md"
    if common_path.exists():
        common = common_path.read_text(encoding="utf-8") + "\n\n"
    prompt_path = PROMPTS_DIR / "formalities.md"
    if prompt_path.exists():
        return common + prompt_path.read_text(encoding="utf-8")
    return common + "You are a patent compliance checker for MPEP 608 formalities."


def _extract_json(text: str) -> list[dict]:
    """Extract JSON array from LLM response (handles code block or raw JSON)."""
    match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    if match:
        return json.loads(match.group(1))
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        return json.loads(match.group(0))
    raise ValueError("No JSON array found in response")


def _settings_from_state(state: GraphState) -> LLMSettings:
    return LLMSettings(
        provider=state.provider,
        api_key=state.api_key,
        base_url=state.base_url or state.ollama_url,
    )


async def run_formalities(state: GraphState) -> GraphState:
    """Check claims against MPEP 608 formalities requirements."""
    prompt = _load_prompt()
    model = state.default_model

    user_message = f"""## Claims to Check

{state.claims_text}

## Specification / Invention Description

{state.specification_text}

{state.invention_narrative}

---

Check all claims against MPEP 608 formalities requirements."""

    try:
        response = await call_llm_with_retry(
            _settings_from_state(state),
            model=model,
            max_tokens=state.max_tokens,
            system=prompt,
            messages=[{"role": "user", "content": user_message}],
            timeout=300.0,
        )
        output = response.choices[0].message.content or ""
        input_tokens = response.usage.prompt_tokens if response.usage else 0
        output_tokens = response.usage.completion_tokens if response.usage else 0
        state.total_input_tokens += input_tokens
        state.total_output_tokens += output_tokens
    except Exception as e:
        state.error = f"Formalities check failed: {e}"
        return state

    try:
        results = _extract_json(output)
        state.formalities_results = json.dumps(results)
    except (json.JSONDecodeError, ValueError) as e:
        state.error = f"Formalities check returned invalid JSON: {e}"

    state.step = "formalities_complete"
    return state
