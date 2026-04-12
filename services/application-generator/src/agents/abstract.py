"""Abstract agent — generates Abstract of the Disclosure (150 words max)."""

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
    prompt_path = PROMPTS_DIR / "abstract.md"
    if prompt_path.exists():
        return common + prompt_path.read_text(encoding="utf-8")
    return common + "Generate the Abstract of the Disclosure."


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

    client = openai.AsyncOpenAI(base_url=f"{state.ollama_url}/v1", api_key="ollama")
    try:
        response = await call_ollama_with_retry(
            client,
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
