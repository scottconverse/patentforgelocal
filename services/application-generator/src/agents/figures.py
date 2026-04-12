"""Figures agent — generates Brief Description of the Drawings."""

from __future__ import annotations
from pathlib import Path

import anthropic

from ..models import GraphState
from ..cost import estimate_cost, format_api_error
from ..retry import call_anthropic_with_retry

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


def _load_prompt() -> str:
    common = ""
    common_path = PROMPTS_DIR / "common-rules.md"
    if common_path.exists():
        common = common_path.read_text(encoding="utf-8") + "\n\n"
    prompt_path = PROMPTS_DIR / "figures.md"
    if prompt_path.exists():
        return common + prompt_path.read_text(encoding="utf-8")
    return common + "Generate the Brief Description of the Drawings."


async def run_figures(state: GraphState) -> GraphState:
    prompt = _load_prompt()
    model = state.default_model

    user_message = f"""## Claims

{state.claims_text}

## Detailed Description

{state.detailed_description}

---

Generate the Brief Description of the Drawings. Create 3-8 placeholder figure descriptions."""

    client = anthropic.AsyncAnthropic(api_key=state.api_key)
    try:
        response = await call_anthropic_with_retry(
            client,
            model=model,
            max_tokens=4000,
            system=prompt,
            messages=[{"role": "user", "content": user_message}],
            timeout=300.0,
        )
        text = response.content[0].text
        input_tokens = response.usage.input_tokens
        output_tokens = response.usage.output_tokens
        state.total_input_tokens += input_tokens
        state.total_output_tokens += output_tokens
        state.total_estimated_cost_usd += estimate_cost(model, input_tokens, output_tokens)
    except Exception as e:
        state.error = f"Figures agent failed: {format_api_error(e)}"
        return state

    state.figure_descriptions = text
    state.step = "figures"
    return state
