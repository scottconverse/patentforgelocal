"""
Definiteness Agent — 35 USC 112(b) check.

Evaluates whether each claim is sufficiently definite to inform those
skilled in the art about the scope of the invention.
"""

from __future__ import annotations
import json
import re
from pathlib import Path

import openai

from ..models import GraphState
from ..retry import call_ollama_with_retry

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


def _load_prompt() -> str:
    common = ""
    common_path = PROMPTS_DIR / "common-rules.md"
    if common_path.exists():
        common = common_path.read_text(encoding="utf-8") + "\n\n"
    prompt_path = PROMPTS_DIR / "definiteness.md"
    if prompt_path.exists():
        return common + prompt_path.read_text(encoding="utf-8")
    return common + "You are a patent compliance checker for 35 USC 112(b)."


def _extract_json(text: str) -> list[dict]:
    """Extract JSON array from LLM response (handles code block or raw JSON)."""
    match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    if match:
        return json.loads(match.group(1))
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        return json.loads(match.group(0))
    raise ValueError("No JSON array found in response")


async def run_definiteness(state: GraphState) -> GraphState:
    """Check claims against 35 USC 112(b) definiteness requirement."""
    prompt = _load_prompt()
    model = state.default_model

    user_message = f"""## Claims to Check

{state.claims_text}

## Specification / Invention Description

{state.specification_text}

{state.invention_narrative}

---

Check each claim against 35 USC 112(b) definiteness requirements."""

    client = openai.AsyncOpenAI(base_url=f"{state.ollama_url}/v1", api_key="ollama")

    try:
        response = await call_ollama_with_retry(
            client,
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
        state.error = f"Definiteness check failed: {e}"
        return state

    try:
        results = _extract_json(output)
        state.definiteness_results = json.dumps(results)
    except (json.JSONDecodeError, ValueError) as e:
        state.error = f"Definiteness check returned invalid JSON: {e}"

    state.step = "definiteness_complete"
    return state
