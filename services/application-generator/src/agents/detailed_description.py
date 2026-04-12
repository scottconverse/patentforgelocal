"""Detailed Description agent — generates Detailed Description of Preferred Embodiments."""

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
    prompt_path = PROMPTS_DIR / "detailed-description.md"
    if prompt_path.exists():
        return common + prompt_path.read_text(encoding="utf-8")
    return common + "Generate the Detailed Description section."


async def run_detailed_description(state: GraphState) -> GraphState:
    prompt = _load_prompt()
    model = state.default_model

    user_message = f"""## Invention Narrative

{state.invention_narrative}

## Claims

{state.claims_text}

## IP Strategy & Recommendations (Feasibility Stage 5)

{state.feasibility_stage_5}

## Consolidated Report (Feasibility Stage 6)

{state.feasibility_stage_6}

## Specification Language (from Claim Drafter)

{state.spec_language}

## Previously Written Sections (do not repeat this content)

### Background of the Invention
{state.background}

### Summary of the Invention
{state.summary}

---

Generate the Detailed Description of Preferred Embodiments section."""

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
        text = response.choices[0].message.content or ""
        input_tokens = response.usage.prompt_tokens if response.usage else 0
        output_tokens = response.usage.completion_tokens if response.usage else 0
        state.total_input_tokens += input_tokens
        state.total_output_tokens += output_tokens
    except Exception as e:
        state.error = f"Detailed description agent failed: {e}"
        return state

    state.detailed_description = text
    state.step = "detailed_description"
    return state
