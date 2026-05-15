"""Background agent — generates Background of the Invention section."""

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
    prompt_path = PROMPTS_DIR / "background.md"
    if prompt_path.exists():
        return common + prompt_path.read_text(encoding="utf-8")
    return common + "Generate the Background of the Invention section."


def _settings_from_state(state: GraphState) -> LLMSettings:
    return LLMSettings(
        provider=state.provider,
        api_key=state.api_key,
        base_url=state.base_url or state.ollama_url,
    )


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

    try:
        response = await call_llm_with_retry(
            _settings_from_state(state),
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
        state.error = f"Background agent failed: {e}"
        return state

    state.background = text
    state.step = "background"
    return state
