# PatentForge — Architecture & Design Document

**Version**: 0.5.0 (PatentForge merge plan complete)
**Last Updated**: 2026-05-15
**Status**: Released

---

## 1. Vision

PatentForge is an open-source, full-lifecycle patent platform that takes an inventor from "I have an idea" to "here's a draft patent application with prior art citations, compliance checks, and a filing strategy." It runs in two modes — **Local** (Ollama + Gemma 4 on the user's hardware) or **Cloud** (Anthropic Claude via the user's own API key) — selected at first launch and switchable any time in Settings. Same prompts, same pipelines, same outputs across both modes.

The local-first variant historically shipped as `PatentForgeLocal`; the cloud-first variant historically shipped as `PatentForge`. The merged product replaces both. Existing local installs upgrade silently with provider defaulted to Local.

---

## 2. Two-mode product

The product is one application that delegates LLM calls through a provider abstraction. Provider is a per-install setting persisted in `AppSettings.provider`. Installation edition is a per-install marker persisted on disk and mirrored to `AppSettings.installEdition`.

| | Local mode | Cloud mode |
|---|---|---|
| **LLM** | Ollama (local HTTP server on port 11434) | Anthropic Claude via LiteLLM |
| **Models** | Gemma 4 family (e4b dense / 26B MoE / etc.) | Claude Haiku 4.5 / Sonnet 4.6 / Opus 4.7 |
| **Cost** | Free (electricity) | Anthropic per-token billing |
| **Network** | Optional (USPTO + web search only) | Required |
| **API key** | None | `cloudApiKey` (encrypted at rest) |
| **Cost UX** | "Free" everywhere; no confirm modal | Estimated `$N.NNN` shown; cost-confirm modal before each run |
| **Default** | Yes (fresh installs; existing PatentForgeLocal upgrades) | Opt-in |

Two **installer editions** ship per platform:

| Edition | Bundles | Use case |
|---|---|---|
| **Lean** | Frontend + backend + Python services. No Ollama runtime. | Cloud-only users; smaller download. |
| **Full** | Lean + Ollama runtime + first-launch Gemma 4 model pull. | Local-mode users; or anyone who wants the option to switch. |

Both editions can run Cloud mode. Only Full can run Local mode.

---

## 3. Component overview

```
                          ┌──────────────────────────┐
                          │      React Frontend       │
                          │    (Vite + TypeScript)    │
                          │  Port: 3000               │
                          │  Served by NestJS backend │
                          └──────────────┬───────────┘
                                         │ HTTP (same-origin)
                                         ▼
                          ┌──────────────────────────┐
                          │      NestJS Backend       │
                          │  - REST API               │
                          │  - SSE proxy to services  │
                          │  - Settings + auth        │
                          │  - SQLite + Prisma        │
                          │  Port: 3001               │
                          └──────────────┬───────────┘
                                         │ HTTP (internal)
                  ┌───────┬──────────────┼──────────────┬───────────┐
                  ▼       ▼              ▼              ▼           ▼
              ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
              │Feasib  │ │Claim-  │ │App-Gen │ │Compl-  │ │ ... ┌──┐│
              │Express │ │Drafter │ │FastAPI │ │Checker │ │     │  ││
              │Node    │ │FastAPI │ │Python  │ │FastAPI │ │     │  ││
              │:3002   │ │:3003   │ │:3004   │ │:3005   │ │     │  ││
              └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └─────┘  ││
                  │          │          │          │              ││
                  └──────────┴──────────┴──────────┘              ││
                                  │                                ││
                                  ▼                                ││
                  ┌──────────────────────────────────┐             ││
                  │    LLMClient boundary             │             ││
                  │    (per-service module)           │             ││
                  │                                   │             ││
                  │    if provider === LOCAL:         │             ││
                  │        → ollama-client / litellm  │             ││
                  │    if provider === CLOUD:         │             ││
                  │        → litellm (anthropic/...)  │             ││
                  └─────────────┬─────────────────────┘             ││
                                │                                    ││
                ┌───────────────┴───────────────┐                    ││
                ▼                               ▼                    ││
       ┌──────────────────┐           ┌────────────────┐             ││
       │  Ollama (Local)  │           │  Anthropic API │             ││
       │  127.0.0.1:11434 │           │  Cloud         │             ││
       │  Gemma 4 e4b/26b │           │  Claude 4.x    │             ││
       └──────────────────┘           └────────────────┘             ││
                                                                     ││
                                  ┌──────────────────────────────────┘│
                                  │                                    │
                                  ▼                                    ▼
                          ┌──────────────────────────────────────────┐
                          │   Go System Tray (process manager)        │
                          │                                            │
                          │  Reads <baseDir>/config/edition.txt        │
                          │   + provider.txt                           │
                          │  ShouldStartOllama(edition, provider)      │
                          │   → conditional Ollama child process       │
                          │  Manages all other services unconditionally│
                          └────────────────────────────────────────────┘
```

The tray manages 5 services unconditionally and Ollama conditionally. The decision is read from two marker files written by the installer and the backend.

---

## 4. Provider routing — the LLMClient boundary

### 4.1 Per-service LLMClient

Each service that makes LLM calls owns a thin `LLMClient` module that dispatches on the `provider` setting:

- **Python services** (`services/{claim-drafter,application-generator,compliance-checker}/src/llm_client.py`): exposes `async call_llm_with_retry(settings, *, model, max_tokens, system, messages, timeout)` and `compute_cost(model, input_tokens, output_tokens, settings)`. Built on `litellm.acompletion(num_retries=3, ...)`. LiteLLM handles retry; the legacy per-service retry loop was deleted in Run 2.

- **Node `feasibility` service** (`services/feasibility/src/llmClient.ts`): exposes `streamLLM(settings, params)` with the same dispatch shape. LOCAL routes through `ollama-client.streamMessage`; CLOUD throws a typed error pending the Anthropic streaming + tool-call adapter (queued separately as a focused follow-up).

### 4.2 Provider dispatch

```
streamLLM(settings, params):
    match settings.provider:
        case 'LOCAL':
            return ollamaClient.streamMessage(
                base_url = settings.ollamaUrl,
                model    = settings.localDefaultModel,
                ...
            )
        case 'CLOUD':
            return litellm.streamCompletion(
                model    = f"anthropic/{settings.cloudDefaultModel}",
                api_key  = settings.cloudApiKey,  // decrypted server-side
                ...
            )
```

### 4.3 The three-layer safety pattern

SQLite has no native enum (Prisma P1012). The Provider value safety lives across three layers:

| Layer | Mechanism | File |
|---|---|---|
| Compile-time | `Provider = 'LOCAL' \| 'CLOUD'` union | `backend/src/settings/provider.types.ts`, `frontend/src/types.ts` |
| HTTP boundary | `@IsIn(PROVIDERS)` DTO validator | `backend/src/settings/dto/update-settings.dto.ts` |
| Runtime DB | `CHECK ("provider" IN ('LOCAL','CLOUD'))` | `backend/src/prisma/prisma.service.ts` SCHEMA_SQL |

`isProvider()` runtime guards in `provider.types.ts` defend against direct service-to-service calls that bypass the DTO.

The same pattern applies to `installEdition` ('Lean' | 'Full') in Run 6.

---

## 5. The `AppSettings` schema

The singleton settings row owns:

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | TEXT PK | `'singleton'` | Always one row. |
| `provider` | TEXT | `'LOCAL'` | CHECK ('LOCAL', 'CLOUD'). Decides LLM dispatch. |
| `cloudApiKey` | TEXT | `''` | Anthropic key, AES-256-GCM encrypted at rest. |
| `cloudDefaultModel` | TEXT | `'claude-haiku-4-5-20251001'` | Active Anthropic model. |
| `localDefaultModel` | TEXT | `'gemma4:e4b'` | Active Ollama model. |
| `installEdition` | TEXT | `'Full'` | CHECK ('Lean', 'Full'). Mirrors `<configDir>/edition.txt`. |
| `ollamaModel` | TEXT | `'gemma4:e4b'` | Legacy/compat — duplicated by `localDefaultModel`. |
| `ollamaUrl` | TEXT | `'http://localhost:11434'` | Ollama HTTP endpoint. |
| `modelReady` | BOOL | `false` | First-run wizard completion indicator. |
| `defaultModel` | TEXT | `'gemma4:e4b'` | Legacy/compat field. |
| `researchModel` | TEXT | `''` | Optional override for research-heavy stages. |
| `maxTokens` | INT | `32000` | Per-call output cap. |
| `interStageDelaySeconds` | INT | `5` | Pause between feasibility stages. |
| `exportPath` | TEXT | `''` | Export folder. |
| `autoExport` | BOOL | `true` | Auto-export completed runs to disk. |
| `usptoApiKey` | TEXT | `''` | USPTO PatentSearch token, encrypted at rest. |
| `encryptionSalt` | TEXT | `''` | Per-install salt for the machine-derived key. |

Existing PatentForgeLocal installs migrate via idempotent `ALTER TABLE ADD COLUMN` calls in `migrateSettings()` on every backend startup. Duplicate-column errors are caught and ignored.

### 5.1 Cross-process marker files

The tray (Go) doesn't have a SQLite driver, so it can't query `AppSettings` directly. Two marker files bridge the gap:

| Marker file | Path | Writer | Reader |
|---|---|---|---|
| `edition.txt` | `<baseDir>/config/edition.txt` | Installer (Windows / Mac / Linux build scripts copy `installer/marker/edition-{Lean,Full}.txt`) | Tray (`tray/internal/config/edition.go::ReadEdition`) AND backend (`backend/src/settings/config-marker.ts::readEditionMarker`) |
| `provider.txt` | `<baseDir>/config/provider.txt` | Backend (`SettingsService.updateSettings()` calls `writeProviderMarker()` after every successful save) | Tray (`tray/internal/config/edition.go::ReadProviderMarker`) |

The backend reconciles `AppSettings.installEdition` with `edition.txt` on every startup (`SettingsService.onModuleInit()` calls `syncInstallEdition()`). The marker file is source-of-truth; the DB column is the cache for the frontend.

When the tray spawns the backend, it sets `PATENTFORGE_CONFIG_DIR=<cfg.ConfigDir>` in the backend env so backend doesn't need to derive the path from `DATABASE_URL`.

### 5.2 The `ShouldStartOllama` predicate

The tray decides whether to manage Ollama as `service-0`:

```go
func ShouldStartOllama(edition Edition, provider string) bool {
    return edition == EditionFull && strings.ToUpper(provider) == "LOCAL"
}
```

Result by case:

| Edition | Provider | Start Ollama? | Why |
|---|---|---|---|
| Full | LOCAL | Yes | Ollama is bundled AND the user wants local inference. |
| Full | CLOUD | No | Ollama is bundled but unused — save RAM. |
| Lean | LOCAL | No | Ollama isn't bundled; starting it would error. |
| Lean | CLOUD | No | Cloud-only edition. |

The decision is made at tray start (or restart-services), not per-request. After flipping providers in Settings, the user uses Tray → Restart Services for the change to apply.

---

## 6. Service topology

### 6.1 The 6 services

| Service | Language | Port | Owns |
|---|---|---|---|
| **Backend** | Node/NestJS | 3001 | REST API, frontend serving, SSE proxy, Settings, SQLite |
| **Feasibility** | Node/Express | 3002 | 6-stage feasibility pipeline (SSE-streaming) |
| **Claim Drafter** | Python/FastAPI | 3003 | 3-agent claim drafting (Planner / Writer / Examiner) |
| **Application Generator** | Python/FastAPI | 3004 | 5-agent application drafting |
| **Compliance Checker** | Python/FastAPI | 3005 | 4-agent 112(a) / 112(b) / 101 / MPEP 608 checks |
| **Ollama** | Go (vendor) | 11434 | Local LLM runtime (conditional) |

The tray launches services in dependency order: Ollama (if applicable) → Backend → Feasibility → Python services. Each waits for the prior's readiness endpoint before starting.

### 6.2 Inter-service authentication

All inter-service HTTP calls require `Authorization: Bearer <INTERNAL_SERVICE_SECRET>`. The tray generates the secret once per install (cryptographically random hex) and injects it into every child process's env. The backend's `AuthGuard` enforces it on internal endpoints.

The frontend uses session-based auth (cookies) for user-facing endpoints; the internal endpoints (between services) are bearer-only.

### 6.3 SSE streaming

Feasibility analysis streams stage-by-stage tokens to the frontend over Server-Sent Events. The flow:

```
Frontend → POST /api/projects/:id/feasibility/stream
        → Backend (NestJS)
            → proxies request to Feasibility service (Node/Express)
            → Feasibility service streams events over SSE
            → Backend forwards events back to frontend
```

The backend is the only network surface exposed to the user's browser. Internal services bind to `127.0.0.1` only.

---

## 7. The frontend

### 7.1 React stack

- Vite + TypeScript
- React Router for routing
- Tailwind CSS for styling
- Vitest + jsdom + React Testing Library for tests
- No state management library — `useState` + `useContext` + small custom hooks

### 7.2 Provider awareness in the UI

Every UI surface that displays cost or makes LLM calls is provider-aware:

- **Settings page** (`frontend/src/pages/Settings.tsx`) — the Provider section is the first section. Radio chooser (Local / Cloud) with conditional reveal panels.
- **FirstRunWizard** (`frontend/src/components/FirstRunWizard.tsx`) — reads `installEdition` from settings, branches the flow. Lean → cloud-api-key directly; Full → chooser → either local pre-flight (system-check + model-download) or cloud-api-key.
- **CostConfirmModal** (`frontend/src/components/CostConfirmModal.tsx`) — wired into `ProjectDetail`'s 4 `handleRunFeasibility` / `handleResume` call sites. Opens before CLOUD-mode runs; LOCAL bypasses.
- **Cost displays** — `frontend/src/utils/format.ts::formatCost(usd, provider?)` returns `'Free'` for LOCAL, `$N.NNN` otherwise. Used by `StageProgress`, `StageOutputViewer`, `RunHistoryView`, `ApplicationTab`, `ComplianceTab`, `ProjectSidebar`.

### 7.3 The model pricing table

`frontend/src/utils/modelPricing.ts` exports:

- `CLOUD_MODELS` — Anthropic models with `inputPer1M` / `outputPer1M` USD prices.
- `LOCAL_MODELS` — Gemma 4 variants; pricing is null (free).
- `getModelPricing(provider, model)` — returns the pricing record or null.
- `getModelsForProvider(provider)` — dropdown-friendly list.
- `estimateCostUsd(provider, model, inputTokens, outputTokens)` — total cost for a call.
- `formatCostDisplay(provider, costUsd)` — `'Free'` for LOCAL, `'< $0.01'` for sub-cent CLOUD, `'$N.NN'` otherwise.

When Anthropic adds a new model, update `CLOUD_MODELS` and Vitest tests cover the dispatch.

---

## 8. The Python services

Each Python service is a FastAPI app structured the same way:

```
services/<service>/
├── src/
│   ├── server.py        # FastAPI app + routes
│   ├── llm_client.py    # LiteLLM wrapper (provider-aware)
│   ├── graph.py         # LangGraph multi-agent state machine
│   ├── cost.py          # Per-call cost computation
│   ├── models.py        # Pydantic schemas
│   └── agents/          # Per-agent prompts + logic
├── tests/               # pytest
├── prompts/             # Externalized prompt files
└── pyproject.toml
```

### 8.1 Multi-agent orchestration via LangGraph

Each pipeline (claim-drafter, application-generator, compliance-checker) is a LangGraph `StateGraph` with typed state, deterministic node ordering, and explicit error edges. Each agent node is a thin wrapper around `call_llm_with_retry`.

### 8.2 Prompt content

Prompts live in `services/<service>/prompts/` and are loaded once at startup. There are no provider-specific prompt variants — Decision #4 of the merge plan. The single canonical prompt set works against both Ollama and Anthropic; quality differences come from model capability, not prompt branching.

---

## 9. The tray

`tray/cmd/tray/main.go` is the entry point. It uses `fyne.io/systray` for the cross-platform tray icon.

### 9.1 Boot sequence

1. `os.Executable()` → `baseDir` (the install directory).
2. `instance.Lock(baseDir)` → single-instance check via lock file. Exits if another tray is already running.
3. `logging.Setup(...)` → rotating log files in `<baseDir>/logs/tray.log`.
4. `config.Load(baseDir)` → generates `<baseDir>/config/.env` on first run with a fresh `INTERNAL_SERVICE_SECRET`.
5. `services.NewManager(cfg)` → reads `edition.txt` + `provider.txt` markers, computes services list (Ollama conditional), wires environment for each service.
6. `systray.Run(onReady, onExit)` → starts the tray UI.
7. Background goroutine: `mgr.StartAll()` → starts each service sequentially, waiting for readiness.
8. Model availability check (LOCAL + Full only): `ollamaMgr.IsModelAvailable()` → if false, `ollamaMgr.PullModel()` runs the Gemma 4 download.
9. Health monitoring loop: polls each service's `/health` every 30s; auto-restarts on failure.

### 9.2 Service lifecycle

Each `Service` struct holds `Command`, `Args`, `WorkDir`, `Port`, `HealthURL`, `Env`, `LogFile`. `service.Start(ctx)` spawns the child process with stdout/stderr piped to the log file. `service.WaitReady(timeout)` polls `HealthURL` until 200 or timeout. `service.Stop()` sends SIGTERM, waits, then SIGKILL.

The `Manager` owns the lifecycle of every service. When the user clicks Tray → Restart Services, the manager stops all, re-reads markers (so a Settings change can take effect), rebuilds the services list, and starts again.

---

## 10. Data flow — running a feasibility analysis

```
1. User clicks "Run Feasibility" in ProjectDetail
2. ProjectDetail.runFeasibilityWithCheck() loads settings via api.settings.get()
3. If provider === CLOUD:
       Open CostConfirmModal with estimated cost
       Await Approve or Cancel
4. handleRunFeasibility() is called from useFeasibilityRun hook
5. Hook validates description word-count
6. POST /api/projects/:id/feasibility/run → backend creates a FeasibilityRun row
7. POST /api/projects/:id/feasibility/stream → backend proxies SSE to Feasibility service
8. Feasibility service:
   for stage in [1..6]:
       a. Build prompt from invention narrative + prior-art context + prior stage outputs
       b. Call streamLLM(settings, ...):
            LOCAL → ollama-client streams tokens from Ollama on :11434
            CLOUD → litellm streams tokens from Anthropic API
       c. Emit SSE events: stage_start, token (× many), stage_complete with cost
9. Frontend updates state per event:
       - Stage cards transition PENDING → RUNNING → COMPLETE
       - Live stream text renders into the Running view (throttled to 4fps)
       - On stage_complete, persist outputText + cost via PATCH
10. After stage 6: emit pipeline_complete, persist finalReport, auto-export to disk
11. Frontend transitions to overview view, sidebar shows totals
```

Cost tracking is per-stage. The backend persists each stage's `inputTokens`, `outputTokens`, `model`, `estimatedCostUsd`. The frontend rolls these up for the sidebar total.

---

## 11. Cleanroom build + testing

Each subproject has its own test runner. The polyglot monorepo verification pattern:

```
cd backend && npm test                      # NestJS Jest
cd frontend && npm run test -- --run        # Vitest jsdom
cd tray && go test ./... && go vet ./...    # Go
cd services/claim-drafter && python -m pytest -q
cd services/application-generator && python -m pytest -q
cd services/compliance-checker && python -m pytest -q
cd services/feasibility && npm test         # Jest
INTERNAL_SERVICE_SECRET=test docker compose config --quiet
bash -n installer/{windows,mac,linux}/<script>.sh
```

Run 7 baseline: **841 automated tests** across all subprojects.

Docker compose builds 5 service images. Production installers (Windows .exe, Mac .dmg, Linux AppImage) are built by the per-platform `installer/<platform>/build-*.sh` scripts. Each accepts `EDITION=Lean|Full` and emits the corresponding edition artifact.

---

## 12. Migration & backward compatibility

### 12.1 Upgrading from PatentForgeLocal

Existing installs upgrade silently:

- Provider defaults to `LOCAL` (matches their existing single-mode behavior).
- `installEdition` defaults to `Full` (their Ollama bundle is already on disk).
- No marker files initially → tray defaults to `Full` + `LOCAL` → Ollama starts.
- DB rename `patentforgelocal.db → patentforge.db` happens via a backend startup hook in Run 8.

### 12.2 Idempotent migrations

`migrateSettings()` runs on every backend boot:

- `ALTER TABLE ADD COLUMN` for each new column. Duplicate-column errors are caught and ignored.
- Defensive backfill: any row with empty `provider` gets `'LOCAL'`.
- `DROP COLUMN ollamaApiKey` for vestigial fields. No-op on subsequent boots.

No standalone Prisma migration files — the project uses inline schema-driven `ensureSchema()` for fresh DBs and idempotent ALTERs for upgrades. Decision documented in CLAUDE.md.

---

## 13. Security

### 13.1 At rest

- **API keys** (Anthropic, Ollama Cloud, USPTO) are AES-256-GCM encrypted in SQLite using a machine-derived key.
- The encryption salt lives in `AppSettings.encryptionSalt`, generated once per install.
- An encryption self-test runs at every backend startup; failure flips `encryptionHealthy=false` and surfaces in the UI ("Re-enter your API keys").
- A copy-paste of the SQLite DB to another machine fails the self-test (machine-derived key changes). User must re-enter keys.

### 13.2 In transit

- Frontend ↔ Backend: same-origin HTTP (localhost), no auth needed beyond browser session.
- Backend ↔ Internal services: HTTP bearer token (`INTERNAL_SERVICE_SECRET`), bound to 127.0.0.1.
- Backend ↔ Ollama: HTTP bound to 127.0.0.1:11434, no auth (Ollama doesn't authenticate).
- Backend ↔ Anthropic: HTTPS with `cloudApiKey` in Authorization header. Decrypted server-side, never sent to the frontend.

### 13.3 No telemetry

PatentForge does not collect usage data, send analytics, or phone home. No outbound network calls except those the user explicitly initiates (USPTO search, web search, Anthropic API calls).

---

## 14. Open follow-ups

These are tracked in `memory/project_patentforge_merge_decisions.md` and the pipeline-cw run logs:

1. **Node `feasibility` service CLOUD branch** — currently throws `LLMClientCloudNotImplementedError`. Needs Anthropic streaming + tool-call normalization. Queued as a focused sub-run after Run 8.
2. **`ollamaWebSearchApiKey` column restore** — Run 4 dropped `ollamaApiKey` on a misreading of the field's purpose. The frontend retains the input field; the backend column needs to be restored under a clearer name.
3. **5 pre-existing tsc errors** — `ClaimsTab.tsx:428` ClaimData/ClaimNode mismatch + 4 useViewInit.test.ts InventionInput fixture rows missing projectId. Baseline carried since pre-merge; clean up when touching those files.
4. **FirstRunWizard chooser as `<button>` rather than `<input type="radio">`** — slight a11y anti-pattern; surfaced in Run 6 audit Lens 2. Polish pass.
5. **DB rename + repo rename** — DONE in v0.5.0. The silent backend startup hook renames `patentforgelocal.db → patentforge.db` on first boot post-upgrade. The GitHub repo was renamed `scottconverse/patentforgelocal → scottconverse/patentforge` and the original cloud-only `scottconverse/patentforge` was renamed to `scottconverse/patentforge-cloud-legacy` and archived. Old repo URLs continue to work via GitHub's automatic redirect.

Items 1–4 ship as focused follow-up issues. Item 5 ships as part of Run 8 cutover.

---

## 15. Diagrams

A visual diagram referencing this version of the document lives at `diagrams/architecture.png`. The Run 8 release pipeline regenerates the diagram from the merged-product topology.
