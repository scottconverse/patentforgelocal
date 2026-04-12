# PatentForgeLocal — Full Design & Implementation Plan

## Context

**What:** Fork PatentForge into PatentForgeLocal — a fully local, privacy-first patent analysis tool that runs entirely on the user's machine with no cloud AI dependencies.

**Why:** Pre-filing inventions are trade secrets. Sending invention details to cloud AI services creates legal and competitive risk. A local-only version lets solo inventors and small patent firms analyze inventions with complete privacy. This also removes the recurring $20/month API cost barrier.

**Who it's for:** Non-technical users — solo inventors, small-firm patent attorneys. They've never installed Docker, never used a terminal, don't know what Ollama or Gemma means. Double-click install, launches in minutes, works offline.

**Relationship to PatentForge:** Same features, same UX, same installer architecture. The only difference is the AI engine (local Ollama + Gemma 4 instead of cloud Anthropic API). Versioned independently starting at v0.1.0.

---

## Research Findings (Verified)

### Gemma 4 on Ollama — CONFIRMED AVAILABLE

Source: [ollama.com/library/gemma4](https://ollama.com/library/gemma4) — 2.5M downloads, updated 6 days ago (as of 2026-04-12).

| Tag | Size | Context | Input | Architecture |
|-----|------|---------|-------|-------------|
| `gemma4:e2b` | 7.2GB | 128K | Text, Image | Dense 2B |
| `gemma4:e4b` (latest) | 9.6GB | 128K | Text, Image | Dense 4B |
| `gemma4:26b` | 18GB | 256K | Text, Image | MoE 26B (4B active) |
| `gemma4:26b-a4b-it-q4_K_M` | 18GB | 256K | Text, Image | MoE Q4 quantized |
| `gemma4:26b-a4b-it-q8_0` | 28GB | 256K | Text, Image | MoE Q8 quantized |
| `gemma4:31b` | 20GB | 256K | Text, Image | Dense 31B |

Tags include: vision, tools, thinking, audio, cloud.

**Recommended default: `gemma4:26b` (Q4_K_M, 18GB).** MoE architecture activates only 4B of 26B parameters during inference — dramatically lower memory pressure than a dense 26B model. Fits comfortably in 32GB RAM with headroom for KV cache.

### Gemma 4 26B on 32GB RAM — VERIFIED FEASIBLE

Sources: [Unsloth docs](https://unsloth.ai/docs/models/gemma-4), [Kaitchup architecture analysis](https://kaitchup.substack.com/p/gemma-4-31b-and-26b-a4b-architecture), [avenchat hardware guide](https://avenchat.com/blog/gemma-4-hardware-requirements)

- Model weights at Q4: ~18GB
- MoE sliding-window KV cache at 256K: ~15.7GB in bf16 (74% less than full attention thanks to sliding window pattern)
- On 24GB GPU: full 256K context with room to spare
- On 32GB system RAM (CPU-only): comfortable at 32K-64K context; higher with GPU offloading
- Performance: 64-119 tok/sec on RTX 3090 (MoE) vs 30-34 tok/sec for dense 31B
- **Recommended Ollama setting:** `num_ctx: 8192` for speed; push to 32K+ with 64GB+ RAM

**Context window impact on PatentForge pipeline:**
- Stages 1-4: accumulate ~120-150K tokens. On 32GB RAM without dedicated GPU, effective context may be 32K-64K.
- Design decision: use **context-mode** (https://github.com/scottconverse/context-mode) — a production-ready context window optimization system already built by Scott. It provides:
  - SQLite FTS5 knowledge base with BM25 + trigram search + RRF fusion
  - 3-stage compression pipeline (ANSI stripping → pattern matching → relevance filtering)
  - Self-learning feedback loop (raises retention for frequently-retrieved content)
  - Pure Node.js + SQLite — embeddable in desktop apps as a subprocess
- **How it applies:** After each stage completes, index the output into context-mode's knowledge base. For later stages (4, 5, 6), instead of sending ALL prior stage outputs as raw text, use `ctx_search` to retrieve only the relevant chunks needed for the current stage's prompt. Expected savings: 40-70% token reduction.
- This degrades gracefully — users with more RAM/GPU get fuller context; users with less get intelligently compressed context. Both produce valid analysis.

### Ollama Web Search — CONFIRMED AVAILABLE

Sources: [Ollama web search docs](https://docs.ollama.com/capabilities/web-search), [Ollama blog](https://ollama.com/blog/web-search)

Ollama provides a **cloud-hosted web search API** with deep Python/JS library integration:

- **Endpoint:** `POST https://ollama.com/api/web_search`
- **Auth:** Free Ollama account + API key (set via `OLLAMA_API_KEY` env var)
- **Free tier:** Generous (exact limits not published), higher limits via paid cloud
- **Integration:** `web_search` and `web_fetch` tools importable from `ollama` Python/JS libraries
- **Tool calling:** Models decide when to search via standard tool-calling pattern
- **MCP Server:** Official Python MCP server available at [ollama-python examples](https://github.com/ollama/ollama-python/blob/main/examples/web-search-mcp.py)

**How this maps to PatentForge:** The current Anthropic `web_search_20250305` tool pattern maps almost 1:1 to Ollama's `web_search` tool. The model calls a search tool → gets results → continues reasoning. The main difference is authentication (Ollama API key vs Anthropic API key).

**User experience:** During first-run setup, an optional step: "Create a free Ollama account for web search (recommended for better prior art discovery). Without it, analysis uses patent databases and AI knowledge only."

### Gemma 4 Tool Calling — WORKS WITH CAVEATS

Sources: [Gemma4Home troubleshooting](https://gemma4home.pro/blog/gemma-4-tool-calling-troubleshooting-ollama-vllm-opencode), [Ollama GitHub issue #15315](https://github.com/ollama/ollama/issues/15315)

- Gemma 4 scores 85.5% on tool-use benchmarks (vs 6.6% for Gemma 3)
- Native function-calling with dedicated special tokens
- **Known issue (April 2026):** Streaming mode can break tool call JSON parsing in Ollama
- **Workaround:** Disable streaming for tool-calling turns; use streaming for content generation
- **Best practices:** Keep tool schemas simple/shallow, lower temperature for tool turns, validate server-side, add repair-or-retry layer

**Design decision:** For stages that use web search (2, 3, 4), disable streaming during tool-call turns and re-enable for content generation. Add JSON repair logic and one retry on parse failure.

### Ollama Portable Bundling — CONFIRMED

Sources: [Ollama Windows docs](https://docs.ollama.com/windows), [Ollama GitHub](https://github.com/ollama/ollama)

- **Windows:** `ollama-windows-amd64.zip` — standalone binary + GPU libraries. No installation needed.
- **Mac/Linux:** Single `ollama` binary, no dependencies
- **Custom model directory:** `OLLAMA_MODELS` env var
- **Custom port:** `OLLAMA_HOST` env var (default `127.0.0.1:11434`)
- **Custom temp dir:** `OLLAMA_TMPDIR` env var
- **Model pull API:** `/api/pull` returns streaming JSON with `completed/total` bytes for progress tracking
- **Process management:** `ollama serve` starts server; responds to SIGTERM for clean shutdown
- **Health/status:** `/api/tags` (available models), `/api/ps` (loaded models), `/api/show` (model details)

**This matches PatentForge's existing pattern exactly.** Python is bundled as `runtime/python/`; Ollama will be bundled as `runtime/ollama/` with env vars pointing model storage to `<app>/models/`.

### USPTO API Landscape — PatentsView DEAD, Replacement Available

Sources: [USPTO announcement](https://www.uspto.gov/subscription-center/2026/patentsview-migrating-uspto-open-data-portal-march-20), [PatentSearch API docs](https://search.patentsview.org/docs/docs/Search%20API/SearchAPIReference/)

- **PatentsView legacy API:** Shut down March 20, 2026
- **Replacement:** PatentSearch API at `https://search.patentsview.org/api/v1/`
- **Auth:** `X-Api-Key` header required
- **Query format:** JSON-based query language: `{"_and":[{"_gte":{"patent_date":"2024-01-01"}},{"_text_any":{"patent_abstract":"machine learning"}}]}`
- **Data currency:** Through September 30, 2025 (will be updated)
- **Note:** This also needs to be fixed in main PatentForge — the PatentsView client is broken

**USPTO ODP** at `data.uspto.gov` provides additional endpoints: patent file wrappers, office actions, PTAB proceedings. PatentForge already has an ODP client.

---

## What PatentForge Already Provides (Reuse As-Is)

These components transfer directly with zero or minimal changes:

| Component | Files | Changes Needed |
|-----------|-------|---------------|
| Go tray app (service manager) | `/tray/**` (11 Go files, 1,347 lines) | Add Ollama as 6th managed service |
| Inno Setup installer | `/installer/windows/patentforge.iss` | Rename to PatentForgeLocal, add Ollama binary |
| macOS .dmg builder | `/installer/mac/build-dmg.sh` | Rename, add Ollama binary |
| Linux AppImage builder | `/installer/linux/build-appimage.sh` | Rename, add Ollama binary |
| Node SEA build scripts | `/scripts/build-backend-sea.sh`, `build-feasibility-sea.sh` | No changes |
| Python bundling | `/scripts/bundle-python.sh` | No changes |
| NestJS backend | `/backend/**` | Update prior-art client (PatentsView → PatentSearch), remove Anthropic key from settings |
| React frontend | `/frontend/**` | Update settings page (remove API key, add model download UI), add system check screen |
| SQLite + Prisma schema | `/backend/prisma/schema.prisma` | Update AppSettings model |
| Claim drafter (LangGraph) | `/services/claim-drafter/**` | Swap Anthropic SDK → OpenAI SDK pointing at Ollama |
| Application generator | `/services/application-generator/**` | Same swap |
| Compliance checker | `/services/compliance-checker/**` | Same swap |
| Feasibility prompts | `/services/feasibility/src/prompts/*.md` | No changes — prompts are model-agnostic |
| CI/CD pipeline | `/.github/workflows/**` | Add Ollama bundling step, update artifact names |
| Release verification | `/scripts/verify-release.sh` | Update for PatentForgeLocal |
| context-mode | [github.com/scottconverse/context-mode](https://github.com/scottconverse/context-mode) | Bundle as context compression layer for pipeline stages |

---

## What Needs to Be Built or Changed

### 1. Ollama Runtime Bundling

**New script: `scripts/bundle-ollama.sh`**
- Downloads official Ollama portable binary per platform:
  - Windows: `ollama-windows-amd64.zip` (~150MB)
  - Mac: `ollama` universal binary
  - Linux: `ollama` binary
- Extracts to `runtime/ollama/`
- Follows same pattern as `scripts/bundle-python.sh`

**Tray app changes (`tray/internal/services/manager.go`):**
- Add Ollama as service #0 (starts before all others)
- Command: `runtime/ollama/ollama serve`
- Environment: `OLLAMA_MODELS=<baseDir>/models`, `OLLAMA_HOST=127.0.0.1:11434`, `OLLAMA_TMPDIR=<baseDir>/tmp`
- Health check: `GET http://127.0.0.1:11434/api/tags`
- Must be healthy AND model loaded before other services start

**Model management:**
- First run: tray manager calls Ollama pull API (`POST /api/pull`) to download `gemma4:26b`
- Progress exposed via `/api/pull` streaming JSON → polled by frontend setup wizard
- Models stored in `<baseDir>/models/` (not `~/.ollama`) for clean uninstall
- Config stores model name (not hardcoded) for future model-switching feature (v1.1)

### 2. LLM Client Swap

**TypeScript feasibility service (2 files, hardest change):**

`services/feasibility/src/anthropic-client.ts` → rewrite to `ollama-client.ts`:
- Endpoint: `http://127.0.0.1:11434/v1/chat/completions` (OpenAI-compatible)
- Streaming: SSE for content generation, non-streaming for tool-call turns (workaround for Gemma 4 tool parsing bug)
- Remove: Anthropic-specific headers, extended thinking beta, `web_search_20250305` tool type
- Add: Ollama `web_search` tool integration, JSON repair layer, retry logic for tool-call parse failures
- Remove: Rate limit retry logic (no rate limits with local Ollama)
- Keep: Error retry logic for genuine failures

`services/feasibility/src/models.ts` → simplify:
- Remove Anthropic model tiers and pricing table
- Replace with detected Ollama models (query `/api/tags`)
- Default: `gemma4:26b`
- Track token usage (Ollama returns `prompt_eval_count`/`eval_count`) but remove dollar amounts

`services/feasibility/src/pipeline-runner.ts`:
- Replace Anthropic web search tool format with Ollama web search tool format
- Add context compression layer: when accumulated stage context exceeds model's effective window, summarize prior stages before sending
- Keep stage sequencing, SSE event emission, and progress tracking unchanged

**Python services (3 services, ~12 agent files):**

All files using `anthropic.AsyncAnthropic()` → `openai.AsyncOpenAI(base_url="http://127.0.0.1:11434/v1", api_key="ollama")`:
- `services/claim-drafter/src/agents/writer.py`
- `services/claim-drafter/src/agents/planner.py`
- `services/application-generator/src/agents/abstract.py`
- `services/application-generator/src/agents/background.py`
- `services/application-generator/src/agents/detailed_description.py`
- `services/application-generator/src/agents/figures.py`
- `services/application-generator/src/agents/summary.py`
- `services/compliance-checker/src/agents/eligibility.py`
- `services/compliance-checker/src/agents/definiteness.py`
- `services/compliance-checker/src/agents/formalities.py`
- `services/compliance-checker/src/agents/written_description.py`

Changes per file:
- Swap SDK import and client initialization
- Update model name references to `gemma4:26b` (read from config)
- Keep all prompt logic, LangGraph orchestration, and streaming patterns
- Add JSON validation layer for compliance checker (extracts structured JSON from responses)

### 3. Web Search Integration

**Architecture:** Ollama's web search is a cloud API at `https://ollama.com/api/web_search`. It requires an Ollama account + API key. This is the most seamless option because:
- Tool-calling pattern mirrors Anthropic's exactly
- Python/JS libraries provide `web_search` and `web_fetch` as importable tools
- Model decides when to search (same as current behavior)

**Implementation:**
- New: `services/feasibility/src/search-client.ts` — wraps Ollama web search API
- Settings page: optional Ollama API key field (labeled "Ollama Account — enables web search for better prior art discovery")
- Without key: analysis runs using USPTO data + model training knowledge; references marked "UNVERIFIED — FROM TRAINING DATA ONLY" (existing prompt behavior)
- With key: full web search capability in Stages 2, 3, 4

**Fallback for fully air-gapped use:** If user wants ZERO cloud contact:
- Skip Ollama web search entirely
- Rely on USPTO PatentSearch API + ODP for patent-specific prior art
- Model's training data for general technology landscape
- This is explicitly supported — the prompts already handle the no-search case

### 4. USPTO Prior Art Client Update

**This fix applies to BOTH PatentForge and PatentForgeLocal.**

`backend/src/prior-art/patentsview-client.ts` → update to `patent-search-client.ts`:
- Old endpoint: `https://patentsview.org/api/patents/query` (DEAD)
- New endpoint: `https://search.patentsview.org/api/v1/patent/`
- Auth: `X-Api-Key` header (existing ODP key works, or free PatentSearch key)
- Query format update: adapt existing query builder to new JSON syntax
- Response format: map new fields to existing `PriorArtSearch` / `PatentDetail` models

### 5. Frontend Changes

**Settings page (`frontend/src/pages/Settings.tsx`):**
- Remove: Anthropic API key field, model tier selection (Sonnet/Opus/Haiku), cost cap
- Add: Ollama API key field (optional, labeled for web search)
- Keep: USPTO ODP API key field (optional), export path
- Add: Model status indicator ("Gemma 4 26B — Running" / "Model not loaded")
- Future (v1.1): Model selection dropdown populated from Ollama `/api/tags`

**New: System check screen (`frontend/src/components/SystemCheck.tsx`):**
- Runs on first launch before model download
- Checks: CPU cores, RAM, disk space, GPU (via backend endpoint that queries Ollama)
- Displays results with pass/fail indicators
- Hard stops: <16GB RAM, <25GB disk
- Soft warnings: No GPU ("Analysis will be slower"), 16-24GB RAM ("Reduced context window")
- Cloud fallback: "For a cloud-powered version, try [PatentForge](link)"
- Minimum specs displayed on landing page too

**New: Model download screen (`frontend/src/components/ModelDownload.tsx`):**
- Shows after system check passes
- Polls backend endpoint that proxies Ollama `/api/pull` progress
- Displays: progress bar, download speed, time remaining, total size
- "This is a one-time setup. Future launches take about 30 seconds."
- Privacy messaging: "Everything runs on this computer. Your inventions never leave your machine."

**Updated: First-run wizard (`frontend/src/components/FirstRunWizard.tsx`):**
1. Welcome screen (same)
2. System check (NEW)
3. Model download (NEW, one-time)
4. Optional: Ollama account for web search (NEW)
5. Optional: USPTO ODP key (same)
6. Disclaimer/clickwrap (same)
7. Ready screen (same)

**Updated: Cost confirm modal (`frontend/src/components/CostConfirmModal.tsx`):**
- Remove dollar estimates
- Replace with: estimated time ("~5-10 minutes on your hardware") and token estimate
- Keep the confirmation gate (user still approves before long-running analysis)

### 6. Context-Mode Integration (Context Window Management)

**Source:** https://github.com/scottconverse/context-mode — already built and production-tested.

**What it does for PatentForgeLocal:** Solves the "6 stages accumulate 150K+ tokens but the LLM only has 32-64K effective context" problem without requiring massive hardware.

**How it integrates:**

The context-mode MCP server runs as a 7th managed service (or embedded subprocess within the feasibility service). It provides:
- **Indexing:** After each pipeline stage completes, the stage output is indexed into context-mode's SQLite FTS5 knowledge base via `ctx_index(stageOutput, source="stage_N")`
- **Smart retrieval:** When building the prompt for stage N, instead of concatenating all raw outputs from stages 1..N-1 (which can exceed 150K tokens), the pipeline:
  1. Includes the full output from stage N-1 (most recent, most relevant)
  2. Uses `ctx_search(queries)` to retrieve only the relevant chunks from earlier stages
  3. Passes these targeted excerpts as context, not the full text
- **Compression:** context-mode's 3-stage compression pipeline strips noise, collapses repetitive sections, and preserves failures/key findings
- **Self-learning:** If the pipeline repeatedly searches for "claim mapping" from stage 2, context-mode raises retention for that content pattern

**Implementation in `pipeline-runner.ts`:**
```
// After stage completes:
await contextMode.index(stageOutput, { source: `stage_${stageNumber}` });

// Before building next stage prompt:
const priorContext = await contextMode.search([
  "key findings from prior art analysis",
  "novelty assessment",
  "claim scope recommendations"
], { limit: 5 });
```

**Bundling:** context-mode is pure Node.js + SQLite (better-sqlite3). It can be:
- Bundled alongside the feasibility service's Node SEA binary
- Or run as a separate subprocess managed by the tray app
- Data stored in `<baseDir>/context-db/` (alongside `models/` and `database.db`)

**Why this is better than raw truncation or naive summarization:**
- Semantic search retrieves what's actually relevant to the current stage, not just the most recent N tokens
- Compression is domain-aware (preserves errors, key findings; collapses boilerplate)
- Self-learning adapts to patent analysis patterns over time
- Works on ANY hardware — the savings scale with the constraint

### 7. Installer Updates

**All platforms add two new bundled components:** Ollama binary (`runtime/ollama/`) and context-mode (`runtime/context-mode/`).

**Windows (`installer/windows/patentforge.iss`):**
- Rename: PatentForge → PatentForgeLocal throughout
- Add: `runtime\ollama\ollama.exe` → `{app}\runtime\ollama\`
- Add: `models\` directory (persists on uninstall, like database)
- Update: AppId, version (0.1.0), publisher info
- Add: Desktop shortcut icon (new branding)

**Mac (`installer/mac/build-dmg.sh`):**
- Same pattern — add Ollama binary to app bundle

**Linux (`installer/linux/build-appimage.sh`):**
- Same pattern — add Ollama binary to AppImage

**New: `scripts/bundle-ollama.sh`:**
- Downloads platform-specific Ollama portable binary
- Extracts to `runtime/ollama/`
- Called by CI/CD workflow during build

### 8. CI/CD Updates

**`.github/workflows/release.yml`:**
- Add `bundle-ollama` step before installer build (per platform)
- Update artifact names: `PatentForgeLocal-{version}-Setup.exe`, `.dmg`, `.AppImage`
- Mac CI: test on standalone Mac (user has one available)
- Windows/Linux: test on user's 32GB Ryzen (via WSL2 for Linux)

---

## Versioning Strategy

- Start at **v0.1.0** — each sprint increments
- Independent from PatentForge versioning
- Follows same semver rules as PatentForge

**v0.1.0 scope:** Everything above — full working local patent analysis with Gemma 4 26B, system check, model download, Ollama web search (optional), USPTO PatentSearch API, cross-platform installers.

**v1.1 roadmap items (noted but NOT built in v0.1.0):**
- Model selection UI — detect available models from Ollama, let user pick based on hardware
- Support for future models (Gemma 5, Llama 4, Mistral, etc.) — the LLM client is model-agnostic by design from day one
- Auto-update mechanism
- Offline-first caching for USPTO data

---

## Architecture Diagram

```
User double-clicks installer
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  PatentForgeLocal (installed application)                │
│                                                         │
│  ┌──────────────────────────────────────────────┐      │
│  │  Go Tray App (patentforgelocal-tray.exe)     │      │
│  │  - System tray icon                           │      │
│  │  - Service lifecycle management               │      │
│  │  - Health monitoring + auto-restart            │      │
│  │  - Single-instance lock                        │      │
│  └──────────┬───────────────────────────────────┘      │
│             │ manages                                    │
│             ▼                                            │
│  ┌────────────────────────────────────────────┐         │
│  │  Service 0: Ollama (port 11434)            │         │
│  │  runtime/ollama/ollama serve               │         │
│  │  - Gemma 4 26B model (18GB, in models/)    │         │
│  │  - OpenAI-compatible API                    │         │
│  │  - Tool calling (web_search)               │         │
│  │  - GPU auto-detection + CPU fallback       │         │
│  └────────────────────────────────────────────┘         │
│                                                         │
│  ┌────────────────────────────────────────────┐         │
│  │  Service 1: Backend (port 3000)            │         │
│  │  NestJS + Prisma + SQLite                  │         │
│  │  - Serves React frontend                    │         │
│  │  - Project CRUD, settings, SSE proxy        │         │
│  │  - Prior art: USPTO PatentSearch + ODP     │         │
│  └────────────────────────────────────────────┘         │
│                                                         │
│  ┌────────────────────────────────────────────┐         │
│  │  Service 2: Feasibility (port 3001)        │         │
│  │  Express + TypeScript (Node SEA)           │         │
│  │  - 6-stage analysis pipeline                │         │
│  │  - Calls Ollama OpenAI-compat API          │         │
│  │  - Web search via Ollama cloud API         │         │
│  │  - Context compression for small RAM       │         │
│  └────────────────────────────────────────────┘         │
│                                                         │
│  ┌────────────────────────────────────────────┐         │
│  │  Services 3-5: Python services             │         │
│  │  Claim Drafter (3002), App Gen (3003),     │         │
│  │  Compliance Checker (3004)                 │         │
│  │  FastAPI + LangGraph + Bundled Python      │         │
│  │  - Call Ollama via OpenAI SDK              │         │
│  └────────────────────────────────────────────┘         │
│                                                         │
│  ┌────────────────────────────────────────────┐         │
│  │  Context-Mode (embedded in feasibility)    │         │
│  │  github.com/scottconverse/context-mode     │         │
│  │  - SQLite FTS5 knowledge base              │         │
│  │  - Indexes stage outputs after completion  │         │
│  │  - Smart retrieval for later stages        │         │
│  │  - 3-stage compression pipeline            │         │
│  │  - Makes 256K pipeline work in 32-64K RAM  │         │
│  └────────────────────────────────────────────┘         │
│                                                         │
│  ┌────────────────────────────────────────────┐         │
│  │  Data                                       │         │
│  │  database.db (SQLite — app data)           │         │
│  │  context-db/ (SQLite — stage index)        │         │
│  │  models/ (Gemma 4 weights, persists)       │         │
│  │  logs/ (rotating)                           │         │
│  │  config/.env (service secret)               │         │
│  └────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
  ┌──────────────┐           ┌──────────────────┐
  │ USPTO APIs   │           │ Ollama Cloud     │
  │ (patent data)│           │ (web search API) │
  │ Free, keyed  │           │ Free account     │
  └──────────────┘           └──────────────────┘
```

---

## Minimum Hardware Requirements

Published on landing page and checked by installer:

| | Minimum | Recommended |
|---|---|---|
| **RAM** | 16 GB | 32 GB+ |
| **Disk** | 25 GB free | 50 GB free |
| **CPU** | 4 cores, 2018+ | 8+ cores |
| **GPU** | Not required | Any with 8GB+ VRAM |
| **OS** | Win 10+, macOS 12+, Ubuntu 22+ | Same |

System check enforces hard stops at <16GB RAM and <25GB disk.

---

## Known Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Gemma 4 tool calling bugs in streaming mode | Web search fails silently | Disable streaming for tool-call turns; JSON repair + retry layer |
| 32GB RAM insufficient for full 256K context | Later stages get truncated input | context-mode (already built) indexes stage outputs + retrieves relevant chunks via FTS5 search; 40-70% token savings |
| Ollama web search requires account | Friction in "zero-config" promise | Make it optional; USPTO data + training knowledge is solid without it |
| Gemma 4 legal reasoning inferior to Claude | Lower quality analysis | Gemma 4 26B scores competitively with 70B models; quality will improve with newer models (v1.1 model switching) |
| Ollama binary size adds ~150MB to installer | Larger download | Acceptable — model download is 18GB anyway; 150MB is noise |
| PatentsView shutdown breaks main PatentForge too | Existing users affected | Fix in both repos simultaneously |

---

## Verification Plan

### During Development (per sprint)
1. Unit tests for each changed module (Jest for TS, pytest for Python)
2. Integration tests: each service talks to local Ollama correctly
3. Frontend tests: Vitest + React Testing Library for new components
4. Full pipeline E2E: run a complete 6-stage analysis with Gemma 4

### Before First Push
1. Cross-platform installer builds (Windows on this machine, Linux via WSL2, Mac on standalone)
2. Clean-install test on each platform (no prior PatentForge installed)
3. First-run wizard flow on fresh install
4. System check screen with various hardware profiles
5. Model download + progress tracking
6. Full pipeline run with web search enabled
7. Full pipeline run with web search disabled (air-gapped mode)
8. Verify uninstall preserves database and models
9. Verify reinstall picks up existing database and models
10. Browser QA: every screen state at desktop and mobile viewports
11. Console check: zero errors/warnings
12. Pre-push checklist per CLAUDE.md standards
13. Full documentation artifacts (README, CHANGELOG, USER-MANUAL, landing page)

### Testing Infrastructure
- This 32GB Ryzen machine: Windows + Linux (WSL2) testing
- Standalone Mac: macOS testing via GitHub Actions CI
- Mock Ollama server for unit tests (don't require 18GB model download in CI)

---

## Implementation Order

1. **Fork & scaffold** — clone PatentForge, rename, set up PatentForgeLocal repo, initial commit
2. **Ollama bundling** — `bundle-ollama.sh`, tray app service management, model pull/progress
3. **Context-mode integration** — bundle context-mode, integrate into feasibility pipeline as stage output indexer + smart retriever
4. **LLM client swap (feasibility service)** — the hardest piece, validate with real Gemma 4, uses context-mode for stage context management
5. **LLM client swap (Python services)** — simpler, same pattern x12 files
6. **Web search integration** — Ollama web search tool in feasibility pipeline
7. **USPTO PatentSearch migration** — fix broken prior art client (also backport to main PatentForge)
8. **Frontend updates** — system check, model download, settings, first-run wizard
9. **Installer updates** — all 3 platforms, bundle Ollama + context-mode
10. **E2E testing** — full pipeline runs on all platforms
11. **Documentation** — all 6 artifacts
12. **Release** — v0.1.0
