"""
Planner Agent — Analyzes prior art and feasibility findings to create a claim strategy.

Uses the research model (cheaper, analytical work).
Output: claim strategy document with scope boundaries, claim types, key limitations.
"""

from __future__ import annotations
from pathlib import Path

from ..models import GraphState
from ..llm_client import LLMSettings, call_llm_with_retry

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


def _settings_from_state(state: GraphState) -> LLMSettings:
    """Build LLMSettings from GraphState, honoring backward-compat for ollama_url."""
    return LLMSettings(
        provider=state.provider,
        api_key=state.api_key,
        base_url=state.base_url or state.ollama_url,
    )


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

    try:
        response = await call_llm_with_retry(
            _settings_from_state(state),
            model=model,
            max_tokens=state.max_tokens,
            system=prompt,
            messages=[{"role": "user", "content": user_message}],
            timeout=300.0,  # 5 min — large context with feasibility stages takes 2-4 min
        )
        strategy = response.choices[0].message.content or ""
        input_tokens = response.usage.prompt_tokens if response.usage else 0
        output_tokens = response.usage.completion_tokens if response.usage else 0
        state.total_input_tokens += input_tokens
        state.total_output_tokens += output_tokens
    except Exception as e:
        state.error = f"Planner failed: {e}"
        return state

    state.planner_strategy = strategy
    state.step = "plan_complete"
    return state
