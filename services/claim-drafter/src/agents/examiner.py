"""
Examiner Agent — Critically reviews drafted claims against prior art.

Uses the default model.
Output: per-claim feedback, overall assessment, revision requests.
Determines whether claims need revision (one revision cycle max).
"""

from __future__ import annotations
from pathlib import Path

import anthropic

import json as json_module

from ..models import GraphState
from ..cost import estimate_cost
from ..retry import call_anthropic_with_retry

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


def _load_prompt() -> str:
    common = ""
    common_path = PROMPTS_DIR / "common-rules.md"
    if common_path.exists():
        common = common_path.read_text(encoding="utf-8") + "\n\n"

    prompt_path = PROMPTS_DIR / "examiner.md"
    if prompt_path.exists():
        return common + prompt_path.read_text(encoding="utf-8")
    return common + "You are a critical patent examiner. Review claims for weaknesses."


import re


def _parse_revision_verdict(feedback: str) -> bool:
    """
    Parse the examiner's structured JSON verdict to determine if revision is needed.
    Falls back to False if JSON parsing fails — better to finalize than loop.
    """
    # Look for a JSON block: ```json\n{...}\n``` or raw {..."revision_needed":...}
    json_block_match = re.search(r'```json\s*\n?\s*(\{[^}]+\})\s*\n?\s*```', feedback)
    if json_block_match:
        try:
            verdict = json_module.loads(json_block_match.group(1))
            return bool(verdict.get("revision_needed", False))
        except (json_module.JSONDecodeError, AttributeError):
            pass

    # Fallback: look for raw JSON object with revision_needed
    raw_json_match = re.search(r'\{\s*"revision_needed"\s*:\s*(true|false)', feedback, re.IGNORECASE)
    if raw_json_match:
        return raw_json_match.group(1).lower() == "true"

    # Last resort fallback: old sentinel pattern (backward compatible)
    if "REVISION_NEEDED: YES" in feedback.upper():
        return True

    # Default: don't revise (better to finalize than risk infinite loop)
    return False


async def run_examiner(state: GraphState) -> GraphState:
    """
    Review drafted claims against prior art and flag issues.
    Sets needs_revision=True if claims need work.
    """
    prompt = _load_prompt()
    claims_to_review = state.draft_claims_raw

    user_message = f"""## Drafted Claims

{claims_to_review}

## Prior Art Context

{state.prior_art_context}

## Invention Narrative

{state.invention_narrative}

## Planner Strategy

{state.planner_strategy}

---

Review these claims critically. For each claim:
1. Identify weaknesses (too broad, too narrow, §112 issues, prior art overlap)
2. Suggest specific improvements
3. Flag any claims that need revision

At the very end of your review, output a JSON verdict block on its own line:
```json
{{"revision_needed": true, "quality": "NEEDS WORK"}}
```
or
```json
{{"revision_needed": false, "quality": "ADEQUATE"}}
```
Quality must be one of: STRONG, ADEQUATE, NEEDS WORK."""

    client = anthropic.AsyncAnthropic(api_key=state.api_key)

    try:
        response = await call_anthropic_with_retry(
            client,
            model=state.default_model,
            max_tokens=state.max_tokens,
            system=prompt,
            messages=[{"role": "user", "content": user_message}],
            timeout=300.0,  # 5 min — examiner review with full claim text can take 2-4 min
        )
        feedback = response.content[0].text
        input_tokens = response.usage.input_tokens
        output_tokens = response.usage.output_tokens
        state.total_input_tokens += input_tokens
        state.total_output_tokens += output_tokens
        state.total_estimated_cost_usd += estimate_cost(state.default_model, input_tokens, output_tokens)
    except Exception as e:
        state.error = f"Examiner failed: {e}"
        return state

    state.examiner_feedback = feedback

    # Parse structured JSON verdict from the examiner's output
    state.needs_revision = _parse_revision_verdict(feedback)
    state.step = "examine_complete"
    return state
