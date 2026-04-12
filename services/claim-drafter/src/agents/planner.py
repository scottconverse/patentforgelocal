"""
Planner Agent — Analyzes prior art and feasibility findings to create a claim strategy.

Uses the research model (cheaper, analytical work).
Output: claim strategy document with scope boundaries, claim types, key limitations.
"""

from __future__ import annotations
import os
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

    prompt_path = PROMPTS_DIR / "planner.md"
    if prompt_path.exists():
        return common + prompt_path.read_text(encoding="utf-8")
    return common + "You are a patent claim strategy planner. Analyze the inputs and produce a claim strategy."


async def run_planner(state: GraphState) -> GraphState:
    """
    Analyze invention + prior art + feasibility to produce a claim strategy.
    """
    prompt = _load_prompt()
    model = state.research_model or state.default_model

    user_message = f"""## Invention Narrative

{state.invention_narrative}

## IP Strategy & Recommendations (Stage 5)

{state.feasibility_stage_5}

## Consolidated Report (Stage 6)

{state.feasibility_stage_6}

## Prior Art Context

{state.prior_art_context}

---

Based on the above, produce a claim strategy."""

    client = anthropic.AsyncAnthropic(api_key=state.api_key)

    try:
        response = await call_anthropic_with_retry(
            client,
            model=model,
            max_tokens=state.max_tokens,
            system=prompt,
            messages=[{"role": "user", "content": user_message}],
            timeout=300.0,  # 5 min — large context with feasibility stages takes 2-4 min
        )
        strategy = response.content[0].text
        input_tokens = response.usage.input_tokens
        output_tokens = response.usage.output_tokens
        state.total_input_tokens += input_tokens
        state.total_output_tokens += output_tokens
        state.total_estimated_cost_usd += estimate_cost(model, input_tokens, output_tokens)
    except Exception as e:
        state.error = f"Planner failed: {e}"
        return state

    state.planner_strategy = strategy
    state.step = "plan_complete"
    return state
