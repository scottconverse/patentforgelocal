"""
Writer Agent — Drafts patent claims following the Planner's strategy.

Uses the default model (main creative work).
Output: 3 independent claims (broad/medium/narrow) + dependent claims, capped at 20 total.
"""

from __future__ import annotations
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

    prompt_path = PROMPTS_DIR / "writer.md"
    if prompt_path.exists():
        return common + prompt_path.read_text(encoding="utf-8")
    return common + "You are a patent claim writer. Draft claims following the strategy provided."


async def run_writer(state: GraphState) -> GraphState:
    """
    Draft claims based on the planner's strategy.
    On revision pass, incorporates examiner feedback.
    """
    prompt = _load_prompt()
    is_revision = state.needs_revision and state.examiner_feedback

    if is_revision:
        user_message = f"""## Planner Strategy

{state.planner_strategy}

## Previous Draft

{state.draft_claims_raw}

## Examiner Feedback (REVISE BASED ON THIS)

{state.examiner_feedback}

---

Revise the claims based on the examiner's feedback. Keep the same structure and numbering where possible."""
    else:
        user_message = f"""## Invention Narrative

{state.invention_narrative}

## Planner Strategy

{state.planner_strategy}

## Prior Art Context

{state.prior_art_context}

---

Draft the claims following the planner's strategy. Maximum 20 total claims."""

    client = openai.AsyncOpenAI(base_url=f"{state.ollama_url}/v1", api_key="ollama")

    try:
        response = await call_ollama_with_retry(
            client,
            model=state.default_model,
            max_tokens=state.max_tokens,
            system=prompt,
            messages=[{"role": "user", "content": user_message}],
            timeout=300.0,  # 5 min — claim writing with full context can take 2-4 min
        )
        claims_text = response.choices[0].message.content or ""
        input_tokens = response.usage.prompt_tokens if response.usage else 0
        output_tokens = response.usage.completion_tokens if response.usage else 0
        state.total_input_tokens += input_tokens
        state.total_output_tokens += output_tokens
    except Exception as e:
        state.error = f"Writer failed: {e}"
        return state

    if is_revision:
        state.revised_claims_raw = claims_text
        state.revision_notes = "Claims revised based on examiner feedback."
        state.step = "revise_complete"
    else:
        state.draft_claims_raw = claims_text
        state.step = "draft_complete"

    return state
