"""Abstract agent — generates Abstract of the Disclosure (150 words max)."""

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
    prompt_path = PROMPTS_DIR / "abstract.md"
    if prompt_path.exists():
        return common + prompt_path.read_text(encoding="utf-8")
    return common + "Generate the Abstract of the Disclosure."


def _settings_from_state(state: GraphState) -> LLMSettings:
    return LLMSettings(
        provider=state.provider,
        api_key=state.api_key,
        base_url=state.base_url or state.ollama_url,
    )


async def run_abstract(state: GraphState) -> GraphState:
    prompt = _load_prompt()
    model = state.default_model

    user_message = f"""## Claims

{state.claims_text}

## Previously Written Sections (do not repeat — summarize)

### Background of the Invention
{state.background}

### Summary of the Invention
{state.summary}

### Detailed Description
{state.detailed_description}

---

Generate the Abstract of the Disclosure. Exactly one paragraph, 50-150 words."""

    try:
        response = await call_llm_with_retry(
            _settings_from_state(state),
            model=model,
            max_tokens=2000,
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
        state.error = f"Abstract agent failed: {e}"
        return state

    state.abstract = text
    state.step = "abstract"
    return state
