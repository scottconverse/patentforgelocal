# Phase 3: Python Services LLM Client Swap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Anthropic SDK with the OpenAI SDK (pointing at local Ollama) in all 3 Python services: claim-drafter, application-generator, and compliance-checker.

**Architecture:** All 3 services use the identical pattern: `anthropic.AsyncAnthropic(api_key=...)` → `client.messages.create()` via a shared `retry.py`. We replace this with `openai.AsyncOpenAI(base_url="http://127.0.0.1:11434/v1", api_key="ollama")` → `client.chat.completions.create()`. The retry module is rewritten to catch `openai` exceptions instead of `anthropic` ones. Rate-limit retry is removed (no rate limits locally). Cost tracking is replaced with token-count-only tracking. Each service's `models.py` replaces `api_key` with `ollama_url`. Each service's `server.py` removes the `ANTHROPIC_API_KEY` env var lookup.

**Tech Stack:** Python 3.12, OpenAI SDK (`openai>=1.0`), FastAPI, LangGraph, Pydantic

---

## File Map

### Per-service changes (identical pattern x3)

Each service gets these changes:

| File | Change |
|------|--------|
| `src/retry.py` | Rewrite: `anthropic` → `openai` exceptions, remove rate-limit delays |
| `src/cost.py` | Replace pricing with token-count-only tracking |
| `src/models.py` | `api_key` → `ollama_url` in settings and state |
| `src/server.py` | Remove `ANTHROPIC_API_KEY`, add `OLLAMA_HOST` default |
| `src/agents/*.py` | Replace `anthropic.AsyncAnthropic` with `openai.AsyncOpenAI`, update response parsing |
| `pyproject.toml` | Replace `anthropic>=0.42.0` with `openai>=1.0` |

### Files affected (15 agent files + 9 support files = 24 total)

**claim-drafter (6 files):**
- `src/agents/writer.py`, `src/agents/planner.py`, `src/agents/examiner.py`
- `src/retry.py`, `src/cost.py`, `src/models.py`, `src/server.py`, `pyproject.toml`

**application-generator (8 files):**
- `src/agents/abstract.py`, `src/agents/background.py`, `src/agents/detailed_description.py`, `src/agents/figures.py`, `src/agents/summary.py`
- `src/retry.py`, `src/cost.py`, `src/models.py`, `src/server.py`, `pyproject.toml`

**compliance-checker (7 files):**
- `src/agents/definiteness.py`, `src/agents/eligibility.py`, `src/agents/formalities.py`, `src/agents/written_description.py`
- `src/retry.py`, `src/cost.py`, `src/models.py`, `src/server.py`, `pyproject.toml`

---

## Task 1: Swap claim-drafter retry.py and cost.py

**Files:**
- Modify: `services/claim-drafter/src/retry.py`
- Modify: `services/claim-drafter/src/cost.py`

- [ ] **Step 1: Read current files**

Read `services/claim-drafter/src/retry.py` and `services/claim-drafter/src/cost.py`.

- [ ] **Step 2: Rewrite retry.py**

Replace the entire contents of `services/claim-drafter/src/retry.py`:

```python
"""
Retry logic for Ollama API calls via the OpenAI SDK.

Retries on connection errors and server errors (5xx).
No rate-limit retry needed (local Ollama has no rate limits).

Usage:
    response = await call_ollama_with_retry(
        client, model=model, max_tokens=n, system=prompt, messages=[...]
    )
"""

from __future__ import annotations
import asyncio
import openai

MAX_RETRIES = 3
RETRY_DELAYS = [5, 10, 15]  # seconds — shorter than cloud (local recovery is fast)


async def call_ollama_with_retry(
    client: openai.AsyncOpenAI,
    *,
    model: str,
    max_tokens: int,
    system: str,
    messages: list,
    timeout: float = 300.0,
) -> openai.types.chat.ChatCompletion:
    """
    Call client.chat.completions.create() with retry/backoff on errors.

    Retries up to MAX_RETRIES times on connection and server errors.
    Returns an OpenAI ChatCompletion object.
    """
    last_exc: BaseException | None = None

    full_messages = [{"role": "system", "content": system}] + messages

    for attempt in range(MAX_RETRIES + 1):
        try:
            return await client.chat.completions.create(
                model=model,
                max_tokens=max_tokens,
                messages=full_messages,
                timeout=timeout,
            )
        except openai.APIStatusError as e:
            last_exc = e
            if e.status_code >= 500 and attempt < MAX_RETRIES:
                delay = RETRY_DELAYS[attempt]
                await asyncio.sleep(delay)
                continue
            raise
        except openai.APIConnectionError:
            last_exc = openai.APIConnectionError.__new__(openai.APIConnectionError)
            if attempt < MAX_RETRIES:
                delay = RETRY_DELAYS[attempt]
                await asyncio.sleep(delay)
                continue
            raise

    if last_exc:
        raise last_exc
    raise RuntimeError("call_ollama_with_retry: unexpected exit from retry loop")
```

- [ ] **Step 3: Rewrite cost.py**

Replace the entire contents of `services/claim-drafter/src/cost.py`:

```python
"""
Token usage tracking for local Ollama inference.
No per-token billing — tracks usage for monitoring only.
"""


def format_token_usage(input_tokens: int, output_tokens: int) -> str:
    """Format token counts for display."""
    return f"{input_tokens:,} in / {output_tokens:,} out"
```

- [ ] **Step 4: Commit**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
git add services/claim-drafter/src/retry.py services/claim-drafter/src/cost.py
git commit -m "feat(claim-drafter): rewrite retry and cost for Ollama

retry.py: openai SDK exceptions, no rate-limit retry, 5/10/15s delays.
cost.py: token-count tracking only, no dollar pricing."
```

---

## Task 2: Swap claim-drafter models.py and server.py

**Files:**
- Modify: `services/claim-drafter/src/models.py`
- Modify: `services/claim-drafter/src/server.py`
- Modify: `services/claim-drafter/pyproject.toml`

- [ ] **Step 1: Read current files**

Read `services/claim-drafter/src/models.py`, `services/claim-drafter/src/server.py`, and `services/claim-drafter/pyproject.toml`.

- [ ] **Step 2: Update models.py**

In `DraftSettings` class, replace `api_key` with `ollama_url`:
```python
class DraftSettings(BaseModel):
    """User settings forwarded from the backend."""
    ollama_url: str = "http://127.0.0.1:11434"
    default_model: str  # Required
    research_model: str = ""
    max_tokens: int = 16000
```

In `GraphState` (find the class), replace `api_key: str = ""` with `ollama_url: str = "http://127.0.0.1:11434"`.

Remove any references to `estimated_cost_usd` dollar amounts — keep token count fields (`total_input_tokens`, `total_output_tokens`) but remove `total_estimated_cost_usd` if present.

- [ ] **Step 3: Update server.py**

Replace the `ANTHROPIC_API_KEY_ENV` and `resolve_api_key` pattern:

```python
# Old:
# ANTHROPIC_API_KEY_ENV = os.environ.get("ANTHROPIC_API_KEY", "")
# def resolve_api_key(request_key: str) -> str:
#     return ANTHROPIC_API_KEY_ENV or request_key

# New:
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "127.0.0.1:11434")

def resolve_ollama_url(request_url: str) -> str:
    """Resolve Ollama URL: request body takes precedence, env var is fallback."""
    if request_url:
        return request_url
    return f"http://{OLLAMA_HOST}"
```

In the route handler where `api_key=resolve_api_key(...)` is used, replace with `ollama_url=resolve_ollama_url(request.settings.ollama_url)`.

- [ ] **Step 4: Update pyproject.toml**

Replace the `anthropic` dependency:
```toml
# Old:
# "anthropic>=0.42.0",
# New:
"openai>=1.0",
```

- [ ] **Step 5: Commit**

```bash
git add services/claim-drafter/src/models.py services/claim-drafter/src/server.py services/claim-drafter/pyproject.toml
git commit -m "feat(claim-drafter): update models, server, deps for Ollama

api_key replaced with ollama_url throughout. ANTHROPIC_API_KEY env var
replaced with OLLAMA_HOST. anthropic SDK replaced with openai in deps."
```

---

## Task 3: Swap claim-drafter agent files

**Files:**
- Modify: `services/claim-drafter/src/agents/writer.py`
- Modify: `services/claim-drafter/src/agents/planner.py`
- Modify: `services/claim-drafter/src/agents/examiner.py`

The swap in each agent file follows this exact pattern:

**Old pattern:**
```python
import anthropic
from ..cost import estimate_cost
from ..retry import call_anthropic_with_retry

client = anthropic.AsyncAnthropic(api_key=state.api_key)
response = await call_anthropic_with_retry(
    client,
    model=state.default_model,
    max_tokens=state.max_tokens,
    system=prompt,
    messages=[{"role": "user", "content": user_message}],
    timeout=300.0,
)
text = response.content[0].text
input_tokens = response.usage.input_tokens
output_tokens = response.usage.output_tokens
state.total_estimated_cost_usd += estimate_cost(state.default_model, input_tokens, output_tokens)
```

**New pattern:**
```python
import openai
from ..retry import call_ollama_with_retry

client = openai.AsyncOpenAI(base_url=f"{state.ollama_url}/v1", api_key="ollama")
response = await call_ollama_with_retry(
    client,
    model=state.default_model,
    max_tokens=state.max_tokens,
    system=prompt,
    messages=[{"role": "user", "content": user_message}],
    timeout=300.0,
)
text = response.choices[0].message.content or ""
input_tokens = response.usage.prompt_tokens if response.usage else 0
output_tokens = response.usage.completion_tokens if response.usage else 0
```

- [ ] **Step 1: Read all 3 agent files**

Read `services/claim-drafter/src/agents/writer.py`, `planner.py`, and `examiner.py`.

- [ ] **Step 2: Apply the swap to writer.py**

In `writer.py`:
1. Replace `import anthropic` with `import openai`
2. Remove `from ..cost import estimate_cost`
3. Replace `from ..retry import call_anthropic_with_retry` with `from ..retry import call_ollama_with_retry`
4. Replace `client = anthropic.AsyncAnthropic(api_key=state.api_key)` with `client = openai.AsyncOpenAI(base_url=f"{state.ollama_url}/v1", api_key="ollama")`
5. Replace `call_anthropic_with_retry` with `call_ollama_with_retry`
6. Replace `response.content[0].text` with `response.choices[0].message.content or ""`
7. Replace `response.usage.input_tokens` with `response.usage.prompt_tokens if response.usage else 0`
8. Replace `response.usage.output_tokens` with `response.usage.completion_tokens if response.usage else 0`
9. Remove `state.total_estimated_cost_usd += estimate_cost(...)` line

- [ ] **Step 3: Apply the same swap to planner.py**

Same 9 changes as Step 2.

- [ ] **Step 4: Apply the same swap to examiner.py**

Same 9 changes as Step 2.

- [ ] **Step 5: Verify no anthropic references remain**

```bash
grep -r "anthropic\|Anthropic\|ANTHROPIC" services/claim-drafter/src/ --include="*.py"
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add services/claim-drafter/src/agents/
git commit -m "feat(claim-drafter): swap all agents from Anthropic to Ollama

writer.py, planner.py, examiner.py: openai.AsyncOpenAI targeting
localhost:11434. Response parsing updated for OpenAI format.
Cost estimation removed (local inference)."
```

---

## Task 4: Swap application-generator (all files)

**Files:**
- Modify: `services/application-generator/src/retry.py`
- Modify: `services/application-generator/src/cost.py`
- Modify: `services/application-generator/src/models.py`
- Modify: `services/application-generator/src/server.py`
- Modify: `services/application-generator/pyproject.toml`
- Modify: `services/application-generator/src/agents/abstract.py`
- Modify: `services/application-generator/src/agents/background.py`
- Modify: `services/application-generator/src/agents/detailed_description.py`
- Modify: `services/application-generator/src/agents/figures.py`
- Modify: `services/application-generator/src/agents/summary.py`

Apply the **exact same changes** as Tasks 1-3 but to application-generator. The patterns are identical.

- [ ] **Step 1: Read all files that need changes**

Read `retry.py`, `cost.py`, `models.py`, `server.py`, `pyproject.toml`, and all 5 agent files.

- [ ] **Step 2: Rewrite retry.py**

Replace with the same Ollama retry module as Task 1 Step 2 (identical code — `call_ollama_with_retry` using `openai` SDK).

- [ ] **Step 3: Rewrite cost.py**

Replace with token-count-only tracking. **Note:** application-generator's `cost.py` has an extra `format_api_error()` function. Remove it entirely — it's Anthropic-specific error formatting.

```python
"""
Token usage tracking for local Ollama inference.
No per-token billing — tracks usage for monitoring only.
"""


def format_token_usage(input_tokens: int, output_tokens: int) -> str:
    """Format token counts for display."""
    return f"{input_tokens:,} in / {output_tokens:,} out"
```

- [ ] **Step 4: Update models.py**

Find the settings class (likely `GenerationSettings` or `AppGenSettings`). Replace `api_key` with `ollama_url`. Find the state class. Replace `api_key` with `ollama_url`. Remove `total_estimated_cost_usd` if present.

- [ ] **Step 5: Update server.py**

Same pattern as Task 2 Step 3: replace `ANTHROPIC_API_KEY_ENV`/`resolve_api_key` with `OLLAMA_HOST`/`resolve_ollama_url`. Replace all `api_key=resolve_api_key(...)` with `ollama_url=resolve_ollama_url(...)`.

- [ ] **Step 6: Update pyproject.toml**

Replace `anthropic>=0.42.0` with `openai>=1.0`.

- [ ] **Step 7: Swap all 5 agent files**

Apply the same 9-change pattern from Task 3 to each agent file:
- `abstract.py`, `background.py`, `detailed_description.py`, `figures.py`, `summary.py`

Each file: replace `import anthropic` → `import openai`, swap client creation, swap retry call, swap response parsing, remove cost estimation.

- [ ] **Step 8: Verify no anthropic references**

```bash
grep -r "anthropic\|Anthropic\|ANTHROPIC" services/application-generator/src/ --include="*.py"
```

Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add services/application-generator/
git commit -m "feat(application-generator): swap all files from Anthropic to Ollama

retry.py, cost.py, models.py, server.py, pyproject.toml, and all 5
agent files converted. openai.AsyncOpenAI targeting localhost:11434."
```

---

## Task 5: Swap compliance-checker (all files)

**Files:**
- Modify: `services/compliance-checker/src/retry.py`
- Modify: `services/compliance-checker/src/cost.py`
- Modify: `services/compliance-checker/src/models.py`
- Modify: `services/compliance-checker/src/server.py`
- Modify: `services/compliance-checker/pyproject.toml`
- Modify: `services/compliance-checker/src/agents/eligibility.py`
- Modify: `services/compliance-checker/src/agents/definiteness.py`
- Modify: `services/compliance-checker/src/agents/formalities.py`
- Modify: `services/compliance-checker/src/agents/written_description.py`

Apply the **exact same changes** as Tasks 1-3 but to compliance-checker.

- [ ] **Step 1: Read all files**

Read `retry.py`, `cost.py`, `models.py`, `server.py`, `pyproject.toml`, and all 4 agent files.

- [ ] **Step 2: Rewrite retry.py**

Same Ollama retry module (identical to Task 1 Step 2).

- [ ] **Step 3: Rewrite cost.py**

Same token-count-only module.

- [ ] **Step 4: Update models.py**

Replace `api_key` with `ollama_url` in settings and state classes.

- [ ] **Step 5: Update server.py**

Replace `ANTHROPIC_API_KEY_ENV`/`resolve_api_key` with `OLLAMA_HOST`/`resolve_ollama_url`.

- [ ] **Step 6: Update pyproject.toml**

Replace `anthropic>=0.42.0` with `openai>=1.0`.

- [ ] **Step 7: Swap all 4 agent files**

Apply the 9-change pattern to: `eligibility.py`, `definiteness.py`, `formalities.py`, `written_description.py`.

- [ ] **Step 8: Verify no anthropic references**

```bash
grep -r "anthropic\|Anthropic\|ANTHROPIC" services/compliance-checker/src/ --include="*.py"
```

Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add services/compliance-checker/
git commit -m "feat(compliance-checker): swap all files from Anthropic to Ollama

retry.py, cost.py, models.py, server.py, pyproject.toml, and all 4
agent files converted. openai.AsyncOpenAI targeting localhost:11434."
```

---

## Task 6: Update bundled Python requirements

**Files:**
- Modify: `scripts/requirements-portable.txt`

- [ ] **Step 1: Read current requirements**

Read `scripts/requirements-portable.txt`.

- [ ] **Step 2: Replace anthropic with openai**

Replace the line `anthropic` (or `anthropic>=0.42.0`) with `openai>=1.0`.

- [ ] **Step 3: Commit**

```bash
git add scripts/requirements-portable.txt
git commit -m "chore: replace anthropic with openai in portable requirements"
```

---

## Task 7: Final verification across all services

- [ ] **Step 1: Verify zero Anthropic references across ALL Python services**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
grep -r "anthropic\|Anthropic\|ANTHROPIC" services/*/src/ --include="*.py"
grep -r "anthropic" scripts/requirements-portable.txt
```

Expected: no output from either command.

- [ ] **Step 2: Verify all pyproject.toml files have openai**

```bash
grep "openai" services/*/pyproject.toml
```

Expected: 3 lines, one per service.

- [ ] **Step 3: Verify Python syntax is valid**

```bash
python -c "import py_compile; py_compile.compile('services/claim-drafter/src/retry.py', doraise=True)"
python -c "import py_compile; py_compile.compile('services/application-generator/src/retry.py', doraise=True)"
python -c "import py_compile; py_compile.compile('services/compliance-checker/src/retry.py', doraise=True)"
```

Expected: no errors (files are syntactically valid Python).

- [ ] **Step 4: Run existing Python tests (if they pass without Anthropic SDK)**

```bash
cd services/claim-drafter && python -m pytest tests/ -v --timeout=30 2>&1 | tail -20
cd ../application-generator && python -m pytest tests/ -v --timeout=30 2>&1 | tail -20
cd ../compliance-checker && python -m pytest tests/ -v --timeout=30 2>&1 | tail -20
```

Note: some tests may need the `openai` package installed. If tests fail due to import errors, install deps first:
```bash
pip install openai fastapi uvicorn pydantic langgraph sse-starlette python-docx
```

Tests that mock the Anthropic client will need updating — if they exist and fail, fix them.

- [ ] **Step 5: Verify Go tests still pass**

```bash
wsl -d Ubuntu -u root -e bash -c "cd /mnt/c/Users/8745HX/Desktop/Claude/PatentForgeLocal/tray && go test ./... -count=1 2>&1"
```

- [ ] **Step 6: Verify TypeScript tests still pass**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/services/feasibility
npx jest --verbose
```

- [ ] **Step 7: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during Phase 3 verification"
```

---

## Summary

| Task | Service | Files Changed | Commits |
|------|---------|--------------|---------|
| 1 | claim-drafter | retry.py, cost.py | 1 |
| 2 | claim-drafter | models.py, server.py, pyproject.toml | 1 |
| 3 | claim-drafter | 3 agent files | 1 |
| 4 | application-generator | 10 files (all) | 1 |
| 5 | compliance-checker | 9 files (all) | 1 |
| 6 | requirements | requirements-portable.txt | 1 |
| 7 | all | verification + fixes | 0-1 |

**Total: 7 tasks, 6-7 commits, ~24 files modified**

**After Phase 3, the repo has:**
- Zero Anthropic SDK dependencies across the entire codebase
- All 3 Python services using `openai.AsyncOpenAI` targeting `localhost:11434`
- Simplified retry logic (no rate-limit handling)
- Token tracking without dollar cost estimation
- `OLLAMA_HOST` env var replaces `ANTHROPIC_API_KEY` everywhere

**Next phase (Phase 4):** Frontend updates — settings page, system check, model download, first-run wizard.
