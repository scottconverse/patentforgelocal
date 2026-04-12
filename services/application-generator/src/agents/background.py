"""Background agent — generates Background of the Invention section."""

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
    prompt_path = PROMPTS_DIR / "background.md"
    if prompt_path.exists():
        return common + prompt_path.read_text(encoding="utf-8")
    return common + "Generate the Background of the Invention section."


async def run_background(state: GraphState) -> GraphState:
    prompt = _load_prompt()
    model = state.default_model

    user_message = f"""## Invention Narrative

{state.invention_narrative}

## Technical Restatement (Feasibility Stage 1)

{state.feasibility_stage_1}

## Prior Art Context

{state.prior_art_context}

---

Generate the Background of the Invention section."""

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
        text = response.content[0].text
        input_tokens = response.usage.input_tokens
        output_tokens = response.usage.output_tokens
        state.total_input_tokens += input_tokens
        state.total_output_tokens += output_tokens
        state.total_estimated_cost_usd += estimate_cost(model, input_tokens, output_tokens)
    except Exception as e:
        state.error = f"Background agent failed: {format_api_error(e)}"
        return state

    state.background = text
    state.step = "background"
    return state
