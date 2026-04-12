"""
Formalities Agent — MPEP 608 check.

Evaluates whether the claims comply with USPTO formalities requirements
including antecedent basis, claim structure, and formatting.
"""

from __future__ import annotations
import json
import re
from pathlib import Path

import anthropic

from ..models import GraphState
from ..cost import estimate_cost
from ..retry import call_anthropic_with_retry

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

    client = anthropic.AsyncAnthropic(api_key=state.api_key)

    try:
        response = await call_anthropic_with_retry(
            client,
            model=model,
            max_tokens=state.max_tokens,
            system=prompt,
            messages=[{"role": "user", "content": user_message}],
            timeout=300.0,
        )
        output = response.content[0].text
        input_tokens = response.usage.input_tokens
        output_tokens = response.usage.output_tokens
        state.total_input_tokens += input_tokens
        state.total_output_tokens += output_tokens
        state.total_estimated_cost_usd += estimate_cost(model, input_tokens, output_tokens)
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
