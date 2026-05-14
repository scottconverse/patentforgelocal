# Changelog

All notable changes to PatentForgeLocal will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). 

## [0.4.0] - 2026-05-14

This release finalizes the v0.4 claim-drafting feature spec (`v0.4-SCOPE.md`) by closing every UPL-guardrail gap, paying off three Phase-1 tech-debt items deferred from the original Phase-1 scaffold, and validating all three test suites + cleanroom Docker build from a clean state. The Phase 5 backend adapter and Phase 6 frontend Claims tab were already implemented at production quality in earlier sprints; this release is gap-fill + hardening + release docs.

### Added

- **`/healthz` alias** on the claim-drafter FastAPI service — Kubernetes-style health endpoint that returns the same payload as `/health`. Both paths are now documented in the module docstring (`services/claim-drafter/src/server.py`).
- **Per-project UPL acknowledgment persistence** — the Claims-tab acknowledgment modal now stores acceptance under `patentforge_ack_<projectId>` in `localStorage`, so the user is prompted once per project rather than once per visit. Helpers (`hasAcknowledgedClaims`, `acknowledgeClaims`, `clearAcknowledgedClaims`) live in `frontend/src/utils/disclaimer.ts`; they degrade silently when `localStorage` is unavailable (private mode, disabled).
- **Per-claim DRAFT watermark in the Claims tab** — every independent claim header and every dependent claim row carries an amber `Draft` badge with tooltip "DRAFT — NOT FOR FILING. AI-generated research concept that has not been reviewed by a patent attorney."
- **Inline per-claim examiner notes** — each independent and dependent claim now renders its `examinerNotes` content (markdown) below the claim body, followed by the mandatory disclaimer "This draft claim has not been reviewed by a patent attorney." This satisfies v0.4-SCOPE.md L171 + L185.
- **CC BY-SA 4.0 license headers** on all four claim-drafter prompt files (`common-rules.md`, `planner.md`, `writer.md`, `examiner.md`) so UPL guardrails survive forks per v0.4-SCOPE.md L189.
- **Prescriptive invention-class → statutory-type mapping** in the Planner prompt: software/AI → method+system+CRM; hardware/IoT → method+system+apparatus; process/chemical → method+apparatus+composition. Replaces the prior generic "choose what makes sense" instruction.
- **Planner "Framing" section** that explicitly labels Planner output as "claim research directions" (v0.4-SCOPE.md L186), not "patent claims," reinforcing the research-tool framing throughout the pipeline.
- **Unit tests for the per-project UPL ack helpers** — 9 Vitest tests in `frontend/src/utils/disclaimer.test.ts` covering persistence, isolation, clear, empty-projectId no-op, and private-mode graceful degradation.
- **Health-route tests** — 4 pytest tests in `services/claim-drafter/tests/test_health.py` covering `/health`, `/healthz`, identical payloads, and FastAPI boot without env vars.

### Changed

- **DOCX export watermarks now match v0.4-SCOPE.md L188 exactly.** The in-body banner and the repeating page-header both read `DRAFT CLAIM CONCEPTS — NOT REVIEWED BY AN ATTORNEY — NOT FOR FILING` (was previously `DRAFT — NOT FOR FILING. These are AI-generated research concepts…` and `DRAFT — NOT LEGAL ADVICE — AI-GENERATED RESEARCH ONLY`).
- **Claim-drafter `tests/test_auth.py` mocks the pipeline at the module boundary.** The four `/draft/sync` tests now `@patch("src.server.run_claim_pipeline")` to return a stub `ClaimDraftResult(status="ERROR", …)`, so the full pytest suite runs in ~1.5s with zero hangs even when Ollama is not running. Auth path is still exercised normally.

### Fixed

- **`docker-compose.yml` invalid YAML** — every service section's `INTERNAL_SERVICE_SECRET: ${INTERNAL_SERVICE_SECRET:?Set INTERNAL_SERVICE_SECRET — run: export …}` was unquoted, and the unquoted colon inside the default-message tripped the YAML parser ("mapping values are not allowed in this context"). Each line is now double-quoted so the entire `${VAR:?msg}` is treated as a scalar. `docker compose config` now exits 0; `docker compose build` succeeds for all 5 services.
- **`services/claim-drafter/src/server.py` module docstring** stale — listed only `/health` and `/draft` even though `/draft/sync` had existed since v0.1.0. Docstring now lists all four endpoints (`/health`, `/healthz`, `/draft`, `/draft/sync`).

### Security / UPL hardening

- Every claim now carries a DRAFT badge in the UI plus an inline attorney-review disclaimer, removing the prior single-banner pattern where a scrolled-away user might forget the claim wasn't filing-ready.
- The DOCX export now uses the exact spec wording for both the in-body warning and the repeating page header, so every printed page shows the same UPL message regardless of where the user is in the document.

### Verification

- `cd services/claim-drafter && python -m pytest -q` → **91 passed in 1.45s** (full suite, no `--ignore`).
- `cd backend && npm test` → **286 passed across 24 suites in 26.1s**.
- `cd frontend && npm run test -- --run` → **210 passed across 20 files in 5.86s**.
- `docker compose config --quiet` → exit 0.
- `docker compose build` → all 5 service images built successfully.

## [0.1.4] - 2026-04-15

### Fixed

- **Feasibility analysis crash on startup** — `No such built-in module: better_sqlite3.node` error on every analysis run. The ncc bundler baked the CI build machine's absolute path to `better_sqlite3.node` into the SEA binary. Added a post-bundle patch step to both `build-feasibility-sea.sh` and `build-backend-sea.sh` that replaces the hardcoded CI path with a `process.execPath`-relative path at build time, and copies `better_sqlite3.node` to `patentforgelocal-feasibility-native/` and `patentforgelocal-backend-prisma/` respectively. Both directories are now bundled by the Inno Setup installer. The tray app also sets `BETTER_SQLITE3_BINDING` for both services as a belt-and-suspenders fallback.
- **Header showed "PatentForge" instead of "PatentForgeLocal"** — `Layout.tsx`, `frontend/index.html` (browser tab title), and all user-facing disclaimer text across backend services, Python services, and export documents updated to `PatentForgeLocal`. E2E navigation tests and the Layout unit test updated to match.
- **Existing database kept `gemma4:26b`** — users who installed v0.1.0–v0.1.2 before the default model change would still have the old model in their local database. Added `migrateSettings()` to `PrismaService.onModuleInit()` to update `ollamaModel` and `defaultModel` from `gemma4:26b` to `gemma4:e4b` on startup.

## [0.1.3] - 2026-04-14

### Changed

- **Default model switched from `gemma4:26b` to `gemma4:e4b`** — the 26b MoE model requires 18 GB of weights in RAM regardless of its 4B active-parameter count, leaving insufficient headroom on 32 GB systems (particularly AMD iGPU machines where GPU and system RAM are shared). `gemma4:e4b` (Dense 4B, 9.6 GB) provides ~20 GB of headroom during active inference and is the correct default for 32 GB hardware.

## [0.1.2] - 2026-04-13

### Changed

- **Feasibility analysis starts immediately** — removed the cost confirmation modal that preceded every run. Local Ollama inference costs nothing; the confirmation friction was inherited from the upstream cloud API and no longer serves a purpose. The first-run legal disclaimer (UPL notice) is still shown via DisclaimerModal on first launch.

### Fixed

- **Stage 4 label corrected** — the Stage 4 context section header in pipeline prompts read "AI & 3D Print Deep Dive" (upstream PatentForge artifact). Now correctly reads "Deep Dive Analysis" matching the stage name displayed in the UI and in Stage 6's comprehensive report.
- **Stage 2 prior art context label updated** — the stage 2 user message header referenced "PatentsView Prior Art Results" / "USPTO PatentsView database" after PatentsView shut down March 2026. Now reads "USPTO-ODP Prior Art Results" / "USPTO Open Data Portal" to match the actual data source.
- **Windows disk/GPU detection in SEA binary** — system check used `wmic` which is absent from PATH-stripped Single Executable Application binaries and deprecated on Windows 11. Replaced both `wmic logicaldisk` and `wmic path win32_videocontroller` with `Get-CimInstance` called via absolute path (`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`). System check now correctly reports disk free space and GPU name on Windows.
- **PriorArtResult source label** — Prisma schema `@default("PatentsView")` on `PriorArtResult.source` changed to `@default("USPTO-ODP")`. New prior art search records now get the correct data source label.

### Added

- **Mac DMG structural smoke test in CI** — after each release build, CI now mounts the DMG, verifies the Ollama wrapper script exists and is executable, the real binary exists, and runs `bash -n` syntax validation on the wrapper. Runtime Ollama download flow still requires manual Mac testing before release.


## [0.1.1] - 2026-04-13

### Added

- GPU/NPU hardware detection scripts for Windows (PowerShell) and Linux (bash) -- auto-detects AMD Ryzen platform, iGPU capabilities, NVIDIA GPUs, NPU presence, RAM, and disk
- Tray app injects ROCm HSA_OVERRIDE_GFX_VERSION + HSA_ENABLE_SDMA=0 into Ollama env on Linux for AMD iGPU acceleration
- Ollama pre-check and model auto-download in PS1 launcher -- starts Ollama if not running, pulls default model on first run
- Graceful shutdown via PID tracking (logs/pids.txt) + PatentForgeLocal-stop.ps1 script
- Log management -- all services log to logs/ directory with separate stdout/stderr files
- One-time download token endpoint (POST /api/health/download-token) for secure file exports
- Prior art context now passed to compliance checker (top 5 results by relevance) for better 112(b) analysis
- TypeScript status constants (RunStatus, ProjectStatus, CheckResultStatus) for compile-time safety
- Prior art panel shows actionable warning when no results found (missing USPTO API key)
- GitHub Pages landing page at https://scottconverse.github.io/patentforgelocal/
- GitHub Discussions seeded with 8 posts across Announcements, Q&A, Ideas, Show and Tell, General

### Fixed

- **CRASH:** Double contextMgr.close() in pipeline-runner.ts crashed on every successful feasibility run
- **DATA CORRUPTION:** Claim regeneration silently substituted wrong claim via fallback -- now fails explicitly with actionable error
- **SECURITY:** Replaced 'patentforge-internal' known-public secret fallback with empty string in all 7 service files
- **SECURITY:** INTERNAL_SERVICE_SECRET no longer exposed in process command line (environment inheritance instead of cmd.exe args)
- **SECURITY:** Path traversal guard uses path.relative instead of startsWith to prevent prefix-matching attacks
- **PRIVACY:** Export path defaults to ~/PatentForgeLocal/exports/ instead of OneDrive Desktop (cloud-synced)
- Docker Compose switched from PostgreSQL (incompatible with SQLite schema) to SQLite with volume mount
- ThrottlerModule rate limit increased from 5/min to 100/min (was causing 429s during normal UI use)
- PS1 launcher generates NODE_ENV=production (was development, disabling security guards)
- Frontend served via NestJS ServeStaticModule instead of Vite dev server (no more HMR socket on 0.0.0.0:8080)
- Hardcoded gemma4:26b in prior-art query extraction now reads from user settings
- OLLAMA_HOST URL construction handles values with or without http:// prefix
- N+1 sequential findUnique queries in getFeasibilityContext replaced with single findMany + Map
- ContextManager now uses per-run DB files instead of shared pipeline.db (concurrent runs no longer cross-contaminate)
- interStageDelaySeconds server-side fallback changed from 2 to 5 to match Prisma schema default
- repairJSON replaced hand-rolled state machine (broken on \\\\ sequences) with jsonrepair package
- Hardware detection cache refreshes after 7 days instead of never
- AMD VRAM detection reads registry QWORD for UMA > 4 GB (uint32 overflow fix)
- detect_hardware.sh strips whitespace from CU count to prevent bash crash on multi-GPU systems
- Tray app creates OLLAMA_TMPDIR (tmp/) during config init
- Missing USPTO API key now warns gracefully instead of throwing (expected state for local-only users)
- CI release workflow: Node 20 -> 22, tray exe name fixed, artifact paths corrected for all 3 platforms

### Removed

- Dead PatentsView code (searchPatentsViewMulti, queryPatentsView, PatentsViewMigrationError) -- API shut down March 2026
- mkdirSync side effect from resolveExportDir (pure path resolver should not create directories)

## [0.1.0] - 2026-04-12

First release of PatentForgeLocal -- a fully local fork of [PatentForge v0.9.3](https://github.com/scottconverse/patentforge) that replaces cloud AI with on-device inference.

### Added

- Forked from PatentForge v0.9.3 and renamed all references across 6 services, Go tray app, installer, launcher, build scripts, and documentation
- Ollama integration as the local LLM runtime, replacing Anthropic Claude API across all services
- Gemma 4 26B as the default model (MoE architecture, 18 GB disk, 256K context window)
- Portable Ollama bundled in `runtime/ollama/` -- no separate Ollama installation required
- `scripts/bundle-ollama.sh` to download and package platform-specific Ollama binaries for Windows, macOS, and Linux
- `OllamaManager` in the Go tray app -- manages Ollama as a child process with health monitoring, auto-start, and graceful shutdown
- `OllamaClient` shared TypeScript module for Ollama HTTP API communication with streaming support
- Context window management via [context-mode](https://github.com/scottconverse/context-mode) SQLite FTS5 indexing -- compresses prior stage outputs to fit within model context limits
- System check service -- pre-flight validation of hardware (RAM, disk, CPU), Ollama availability, model download status, and GPU detection
- System check UI panel in frontend Settings with real-time status indicators and one-click model download
- Web search integration via Ollama cloud API (optional, free account) -- replaces Anthropic's built-in web search
- Feasibility service rewritten to use `OllamaClient` with streaming SSE, replacing `@anthropic-ai/sdk`
- Claim drafter service converted from `anthropic` Python SDK to `httpx`-based Ollama HTTP client
- Application generator service converted from `anthropic` Python SDK to `httpx`-based Ollama HTTP client
- Compliance checker service converted from `anthropic` Python SDK to `httpx`-based Ollama HTTP client
- Prompt templates updated for Gemma 4 instruction format across all 6 stages and all agent prompts
- LangGraph state machines updated with Ollama-compatible message formatting in all 3 Python services
- Unit and integration tests for `OllamaManager`, `OllamaClient`, system check, and all converted services
- `.env.example` configured for Ollama + Gemma 4 (model name, Ollama host, context size, web search toggle)

### Changed

- Go module path changed to `github.com/scottconverse/patentforgelocal/tray`
- Database filename changed from `patentforge.db` to `patentforgelocal.db`
- Lock file changed from `patentforge.lock` to `patentforgelocal.lock`
- Settings page no longer requires an API key -- Ollama runs locally with no authentication
- Cost tracking removed from UI -- local inference has no per-token cost
- Cost estimate pre-run dialog removed -- replaced by system check
- First-run wizard simplified -- no API key setup step, replaced with Ollama/model readiness check
- Token counting switched from Anthropic tokenizer to Ollama's reported token usage
- All service health checks updated to verify Ollama connectivity instead of Anthropic API reachability

### Removed

- `@anthropic-ai/sdk` npm package dependency (feasibility service)
- `anthropic` Python SDK dependency (claim-drafter, application-generator, compliance-checker)
- Anthropic API key encrypted storage and settings UI
- Cloud API key validation and passthrough from tray app to services
- Per-run and per-stage cost tracking and cost cap enforcement
- LiteLLM pricing integration for dynamic cost estimation
- Cost estimate dialog and historical cost data display
