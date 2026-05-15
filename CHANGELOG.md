# Changelog

All notable changes to PatentForge will be documented in this file. (Previously named PatentForgeLocal; the merged product is one repo named PatentForge as of v0.5.0.)

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added (merge plan Run 7 — Docs rewrite for the merged product)

- **`README.md`** rewritten from "fully local, no API needed" to **"Your choice: cloud or local."** Mode-neutral feature list; new "Local mode vs Cloud mode" comparison; Lean/Full installer split documented; provider-aware architecture diagram showing the `LLMClient` boundary; PatentForgeLocal upgrade path documented.
- **`USER-MANUAL.md`** rewritten to cover both modes end-to-end. New sections: dual-mode system requirements, Lean/Full installer selection, FirstRunWizard flows per edition (with Cloud-mode cost-confirm modal walkthrough), Settings → Provider section reference, cost-display behavior ("Free" / `$N.NNN`), migration notes for upgraders, where data lives on disk, troubleshooting for both modes.
- **`ARCHITECTURE.md`** rewritten to document the provider-as-plugin-layer pattern: LLMClient boundary (Run 2), `AppSettings.provider` + `installEdition` (Runs 4 + 6), three-layer safety pattern (TS union + DTO `@IsIn` + SQLite CHECK), cross-process marker files (`edition.txt`, `provider.txt`), the `ShouldStartOllama(edition, provider)` predicate, the 6-service topology with conditional Ollama, frontend provider awareness, Python service structure, tray boot sequence, data flow for a feasibility run, security at-rest + in-transit, open follow-ups.
- **`docs/index.html`** landing-page rewrite: new hero copy ("Patent analysis your way — run locally or in the cloud"), Local-vs-Cloud comparison table, Lean/Full editions in the quick-start, LLMClient boundary highlighted in the architecture section, provider-aware architecture cards listing both Ollama and Anthropic as external dependencies.
- **`DISCUSSIONS-SEED.md`** rewrite: pinned announcement reframed for the merged product, v0.5.0 release post draft, Q&A entries covering mode switching, cost-modal behavior, and Lean-vs-Full installer choice.
- **Frontend in-app branding rename** — last residual `PatentForgeLocal` strings replaced with `PatentForge` across `Layout.tsx`, `DisclaimerModal.tsx`, `ModelDownload.tsx`, `SystemCheck.tsx`, `disclaimer.ts`, `markdown.ts`, plus the `Layout.test.tsx` fixture. DisclaimerModal copy now describes both modes rather than asserting all processing is local. SystemCheck's hard-fail panel points users at Cloud mode in Settings instead of the now-merged upstream PatentForge repo.
- **Regenerated `PatentForge-Architecture.docx`** from the new `ARCHITECTURE.md` via pandoc.
- **Regenerated `README-FULL.pdf`** from the new `README.md` via `pandoc --pdf-engine=xelatex`.

### Changed (Run 7)

- All user-facing copy uses the merged product name **PatentForge** without the "Local" suffix. The wizard already shipped this rename in Run 6; this run finishes the surrounding surfaces.
- Architecture diagrams now show the `LLMClient` boundary between services and the LLM provider, with both Ollama and Anthropic as terminal nodes.
- Disclaimer text is mode-aware: Local mode states inference stays on the machine; Cloud mode states prompts go to Anthropic per their API terms, with the local-side API-key encryption noted.

### Migration notes (Run 7)

Docs-only run. No schema changes. No behavior changes. Existing installs see no functional difference — the changes here are user-readable documentation and in-app copy.

Versions stay at `0.1.4` (backend / frontend / feasibility) and `0.1.0` (Python services). Run 8 bumps everything to `0.5.0` and ships as a release.

### Verification (Run 7)

- frontend Vitest: **231/231** (regression — Layout test fixture updated for `PatentForge`)
- frontend `tsc --noEmit`: 5 pre-existing baseline errors (handoff Discovered finding #2), zero new
- pandoc DOCX regeneration: produced `PatentForge-Architecture.docx`
- pandoc PDF regeneration (xelatex via MiKTeX): produced `README-FULL.pdf`
- Cross-suite regression captured in iter 8 of the run log (backend / frontend / tray / Python services / feasibility / docker compose / installer scripts).

---

### Added (merge plan Run 6 — Installer split + first-run wizard branching + Run 5.5 fold-ins)

- **Two installer editions, single source tree** — `EDITION=Lean|Full` parameter on each platform builder. Lean is the cloud-only artifact (no Ollama runtime bundle); Full is the bundled-everything artifact (pre-merge default behavior preserved). Outputs:
  - **Windows** (`installer/windows/build-installer.sh`, `installer/windows/patentforgelocal.iss`): emits `PatentForgeLocal-Full-<ver>-Setup.exe` and `PatentForgeLocal-Lean-<ver>-Setup.exe`. ISCC parameterized via `#define Edition` with `#if Edition == "Full" ... #endif` wrapping the `runtime\ollama\*` source line.
  - **macOS** (`installer/mac/build-dmg.sh`): emits `PatentForgeLocal-Full-<ver>.dmg` and `PatentForgeLocal-Lean-<ver>.dmg`. Lean bakes a trivial CFBundleExecutable wrapper that hands off straight to the tray binary; Full keeps the existing Ollama auto-install pre-flight.
  - **Linux** (`installer/linux/build-appimage.sh`): emits `PatentForgeLocal-Full-<ver>.AppImage` and `PatentForgeLocal-Lean-<ver>.AppImage`. Same wrapper split via two AppRun variants.

- **Edition marker files** (`installer/marker/edition-{Full,Lean}.txt`) — each installer copies the appropriate marker into `<baseDir>/config/edition.txt`. The tray + backend read this same file to decide which UX surfaces apply.

- **Tray edition-aware service management** (`tray/internal/config/edition.go`, `tray/internal/services/manager.go`):
  - `ReadEdition(baseDir)` parses `edition.txt`; defaults to `Full` when missing (back-compat for v0.4 upgrades).
  - `ReadProviderMarker(baseDir)` parses `provider.txt` (written by the backend on every Settings save); defaults to `LOCAL`.
  - `ShouldStartOllama(edition, provider)` returns true iff `edition == Full && provider == LOCAL`. Manager omits Ollama from the services slice otherwise — Lean installs and Full+CLOUD installs both run with a 5-service list rather than 6, so `StartAll`, `StopAll`, `OverallStatus`, and `HealthMonitor` all transparently ignore Ollama.
  - `cmd/tray/main.go`'s model-pull goroutine is gated on the same predicate.

- **Cross-process provider mirror** (`backend/src/settings/config-marker.ts`): the backend writes `<configDir>/provider.txt` on every Settings save so the tray sees the current provider on its next launch. `resolveConfigDir()` prefers `PATENTFORGE_CONFIG_DIR` env (set by the tray) and falls back to deriving from `DATABASE_URL`. Fail-soft — the DB write is authoritative; the marker is informational.

- **`AppSettings.installEdition` column** (`backend/prisma/schema.prisma`, `backend/src/prisma/prisma.service.ts`): mirrors `edition.txt` into the DB so the frontend can read the install edition through the existing settings endpoint. Idempotent ALTER chain in `migrateSettings()` (CHECK constraint enforces `('Lean','Full')`). `SettingsService.onModuleInit()` calls `syncInstallEdition()` to reconcile the column with the marker on every startup.

- **FirstRunWizard provider-aware branching** (`frontend/src/components/FirstRunWizard.tsx`):
  - Lean installs skip the chooser, go straight to a new `cloud-api-key` step (Anthropic + USPTO inputs), then disclaimer + ready. Finish saves `provider='CLOUD'` + `cloudApiKey` + `modelReady=true`.
  - Full installs open with a Local/Cloud chooser, then branch:
    - **Cloud** picked → same `cloud-api-key` step → disclaimer → ready. Saves `provider='CLOUD'`.
    - **Local** picked → existing system-check → model-download → ollama-account → disclaimer → ready. Saves `provider='LOCAL'`.
  - Step-indicator dots reflect the dynamic flow.
  - Welcome / ready copy adapts per edition + chosen provider.

- **`CostConfirmModal` wired into `ProjectDetail.tsx`** (Run 5.5 #1 fold-in): all 4 `handleRunFeasibility` / `handleResume` call sites now go through `runFeasibilityWithCheck` / `resumeWithCheck`. CLOUD mode opens the modal with an estimated cost (from `api.feasibility.costEstimate(projectId)`, with a $0.50 fallback baseline); LOCAL bypasses the modal entirely.

- **Provider-aware cost rendering** (Run 5.5 #2 fold-in): `frontend/src/utils/format.ts` `formatCost(usd, provider?)` returns `'Free'` for LOCAL (Decision #12). Migrated `StageProgress`, `StageOutputViewer`, `RunHistoryView`, `ApplicationTab`, `ComplianceTab`, and `ProjectSidebar` to forward the new prop; provider plumbed from `ProjectDetail`'s `api.settings.get()` call on mount. Inline `${value.toFixed(2)}` replaced with `formatCost(value, provider)` in the two tabs.

- **`FirstRunWizard.test.tsx`** (new, 9 tests) — covers Lean flow, Full+CLOUD flow, Full+LOCAL flow, no chooser in Lean, ready-copy variants by chosen provider, graceful save-failure.

- **`config-marker.spec.ts`** (new, 14 tests) — covers `resolveConfigDir` env-vs-DATABASE_URL fallback, `readEditionMarker` file-missing / Lean / Full / invalid cases, `writeProviderMarker` round-trip.

- **`settings.service.spec.ts`** gains 11 new tests covering `installEdition` exposure, provider marker write on save, and `syncInstallEdition` reconciliation.

- **`config/edition_test.go`** + **`services/manager_test.go`** (new tray tests) — 13 cases proving the edition × provider matrix maps correctly to Manager's services list (Ollama present iff Full+LOCAL).

### Changed (Run 6)

- `FirstRunWizard`'s welcome copy moved from "Welcome to PatentForgeLocal" to "Welcome to PatentForge" — the wizard's content is necessarily edition-neutral now that it ships from both Lean and Full installers. Broader branding rewrite is in Run 7's scope.

- `installer/windows/build-installer.sh` output filename fixed: was `PatentForgeLocalLocal-<ver>-Setup.exe` (pre-existing typo); now correctly `PatentForgeLocal-${EDITION}-${ISS_VERSION}-Setup.exe`.

- Tray `Manager` constructor (`NewManager(cfg)`) signature unchanged; reads edition + provider markers internally via `cfg.BaseDir`. Public surface preserved.

- Tray service env extends `backend` with `PATENTFORGE_CONFIG_DIR=cfg.ConfigDir` so the backend doesn't need to parse `DATABASE_URL` to find the marker dir.

### Migration notes (Run 6)

Fully backward-compatible. Existing v0.4 installs upgrade silently:

- No `edition.txt` on disk → tray defaults to `Full` (their Ollama bundle is already present).
- No `provider.txt` on disk → tray defaults to `LOCAL` (matches their existing single-provider behavior).
- `AppSettings.installEdition` added via idempotent ALTER TABLE with default `'Full'`; the `migrateSettings()` step is a no-op on subsequent boots (duplicate-column errors are caught and ignored).
- The Settings page does NOT render `installEdition` — it's read-only metadata.

The `Welcome to PatentForge` rebrand in the wizard is the only user-visible copy change in Run 6; the rest of the codebase still says "PatentForgeLocal" until Run 7's docs rewrite lands.

### Verification (Run 6)

- backend Jest: **329/329** in 24.9s (+26 from Run 5's 303)
- frontend Vitest: **231/231** in 7.9s (+6 net from Run 5's 225: +9 wizard + +2 LOCAL/Free − 5 superseded)
- backend `tsc --noEmit`: clean
- frontend `tsc --noEmit`: 5 pre-existing baseline errors (handoff Discovered finding #2), zero new
- tray `go test ./...`: green (`ok config`, `ok services`); +13 new tests in `config/edition_test.go` and `services/manager_test.go`
- tray `go vet ./...`: clean
- tray `go build ./...`: clean
- claim-drafter pytest: **89/89** in 6.9s (regression)
- application-generator pytest: **92/92** in 5.4s (regression)
- compliance-checker pytest: **71/71** in 4.9s (regression)
- feasibility npm test: **29/29** in 23.4s (regression)
- `INTERNAL_SERVICE_SECRET=test docker compose config --quiet`: exit 0
- `bash -n` clean on all 3 installer build scripts (Windows / Mac / Linux)

Total: **841 automated tests green** across 6 services + 2 web tiers (up from 809 at Run 5 close).

Actual installer compilation (ISCC, hdiutil, appimagetool) remains out of the autonomous-run environment and ships via the Run 8 release pipeline.

---

### Added (merge plan Run 5 — Frontend provider UI)

- **Settings page provider chooser** (`frontend/src/pages/Settings.tsx`) — new "Provider" section as the first section, with a Local/Cloud radio fieldset and conditional reveal panels:
  - **Local mode** panel: Ollama URL input, local model dropdown (`gemma4:e4b`, `gemma4:26b`, `gemma3:27b`, `llama4:scout`).
  - **Cloud mode** panel: Anthropic API key input with show/hide masked toggle (same UX pattern as the existing `usptoApiKey` field), cloud model dropdown (`claude-haiku-4-5-20251001`, `claude-sonnet-4-6`, `claude-opus-4-7`, `claude-opus-4-7-1m`).
  - Radio inputs carry `aria-label`s for screen readers; panels carry `data-testid` attributes for component tests; both `localDefaultModel` and `cloudDefaultModel` are persisted so switching providers preserves each side's choice (Decision #3).

- **`frontend/src/utils/modelPricing.ts`** — merged module exposing both `CLOUD_MODELS` (with `inputPer1M` / `outputPer1M` USD-per-million-token pricing) and `LOCAL_MODELS` tables. New helpers:
  - `getModelPricing(provider, model)` → returns `{ inputPer1M, outputPer1M } | null`; null for LOCAL or unknown CLOUD models (defensive fall-back).
  - `getModelsForProvider(provider)` → dropdown-friendly `[{ id, label }]`.
  - `estimateCostUsd(provider, model, inputTokens, outputTokens)` → total USD cost; 0 for LOCAL.
  - `formatCostDisplay(provider, costUsd)` → `"Free"` for LOCAL, `"< $0.01"` for sub-cent CLOUD, `"$N.NN"` otherwise. Implements Decision #12.

- **`frontend/src/components/CostConfirmModal.tsx`** *(new component)* — accessible cloud-mode cost-approval modal. `role="dialog"` + `aria-modal="true"` + `aria-labelledby` / `aria-describedby`. Escape, backdrop click, and Cancel button all fire `onCancel`. Auto-focuses Approve button on open. Renders cost via `formatCostDisplay()`. **Component is built and tested (10 tests) but not yet wired into `ProjectDetail.tsx`** — the call-site integration is a focused follow-up because it touches ProjectDetail's settings-state shape across 3 call sites.

- **`Provider` type union** in `frontend/src/types.ts` — `'LOCAL' | 'CLOUD'` plus `PROVIDERS` const and `isProvider()` guard. `AppSettings` interface extended with `provider`, `cloudApiKey`, `cloudDefaultModel`, `localDefaultModel`. The `ollamaApiKey` field is kept on the type — see Migration notes below.

- **24 new frontend Vitest tests** (`frontend/src/utils/modelPricing.test.ts` +14, `frontend/src/components/CostConfirmModal.test.tsx` +10). Total frontend test count: **225** (was 201). All accessibility + interaction paths covered.

### Changed

- `Settings.tsx` initial state seeds `provider: 'LOCAL'`, `cloudDefaultModel: 'claude-haiku-4-5-20251001'`, `localDefaultModel: 'gemma4:e4b'`, `ollamaUrl: 'http://localhost:11434'` so first-paint never shows undefined-controlled inputs.

### Discovered finding (Run 4 follow-up)

The `ollamaApiKey` field was dropped from the backend schema in Run 4 on the assumption that "Ollama doesn't authenticate." That's accurate for the local Ollama server, but the field was actually being used as the Ollama-Cloud Web Search token — a distinct paid product that does authenticate. The frontend type field is kept in place so existing read paths (the Ollama API Key input in the API Keys section) don't crash. A focused follow-up issue restores the backend column with a clearer name (`ollamaWebSearchApiKey` or similar) — not blocking Run 5's provider-chooser scope.

### Migration notes (Run 5)

Fully backward-compatible. New `AppSettings` fields default to safe values; existing rows from Run 4 already have `provider='LOCAL'` populated. The Settings UI degrades gracefully when fields are missing (defaults kick in).

### Verification (Run 5)

- frontend Vitest: **225/225** in 8.2s (+24 from Run 4's 201)
- backend Jest: **303/303** in 23.3s (regression)
- claim-drafter pytest: **89/89** in 7.7s (regression)
- application-generator pytest: **92/92** in 6.8s (regression)
- compliance-checker pytest: **71/71** in 6.2s (regression)
- feasibility npm test: **29/29** in 23.8s (regression)
- `docker compose config --quiet`: exit 0
- `docker compose build`: all 5 service images built

Total: **809 automated tests green** across 4 services + 2 web tiers.

---

### Added (merge plan Run 4 — Prisma provider routing)

- **`AppSettings` schema extended with provider routing fields** in `backend/prisma/schema.prisma`:
  - `provider` (String, default `"LOCAL"`) — the LLM provider choice. SQLite has no native enum support (Prisma P1012), so the safety lives across three layers: a TypeScript union type (`Provider = "LOCAL" | "CLOUD"` in `backend/src/settings/provider.types.ts`) catches typos at compile time, the DTO's `@IsIn(PROVIDERS)` validator rejects bad values at the HTTP boundary, and the SQLite `CHECK ("provider" IN ('LOCAL', 'CLOUD'))` constraint rejects writes at the runtime DB layer.
  - `cloudApiKey` (String, default `""`) — Anthropic API key, encrypted at rest using the existing `encryption.ts` pattern (AES-256-GCM with machine-derived key + stored salt).
  - `cloudDefaultModel` (String, default `"claude-haiku-4-5-20251001"`) — preserves the user's cloud model choice independently of `localDefaultModel`, so switching providers doesn't clobber the unused side.
  - `localDefaultModel` (String, default `"gemma4:e4b"`) — same idea for Ollama.

- **Idempotent additive migration for existing installs** (`backend/src/prisma/prisma.service.ts:migrateSettings()`):
  - `ALTER TABLE "AppSettings" ADD COLUMN` for each of the four new columns, each wrapped in try/catch — duplicate-column errors are expected on every boot after the first and are NOT actual failures.
  - Defensive `UPDATE` backfill: sets `provider='LOCAL'` on any row where the column ended up empty (defensive against exotic SQLite versions where `ADD COLUMN` defaults don't backfill).
  - `ALTER TABLE "AppSettings" DROP COLUMN "ollamaApiKey"` — wrapped in try/catch so subsequent boots are no-ops. Decision #15: Ollama doesn't authenticate, this field was a local-fork artifact.

- **`backend/src/settings/provider.types.ts`** — new file. Exports `Provider` union, `PROVIDERS` const array, `isProvider()` runtime type guard, `DEFAULT_PROVIDER` constant. Used by both the DTO validator (`@IsIn(PROVIDERS)`) and the service layer (`isProvider()` defends against non-HTTP call paths).

- **`SettingsService` provider routing** (`backend/src/settings/settings.service.ts`):
  - `getSettings()` returns the new fields with `cloudApiKey` decrypted (consistent with the existing pattern for `usptoApiKey`). The frontend handles display masking. A defensive `isProvider()` guard normalizes any garbage DB value back to `DEFAULT_PROVIDER`.
  - `updateSettings()` accepts `provider`, `cloudApiKey`, `cloudDefaultModel`, `localDefaultModel`. `provider` is validated both by the DTO `@IsIn` decorator (HTTP boundary) AND by the runtime `isProvider()` guard (defense in depth for direct service-to-service calls). `cloudApiKey` is encrypted before persistence.
  - Deprecated `ollamaApiKey` field on the DTO is logged-and-ignored for one-cycle back-compat with older clients. The persistence layer no longer sees it (the column was dropped in the migration).

- **17 new backend Jest tests** across `backend/src/settings/settings.service.spec.ts` (11) and `backend/src/prisma/prisma.service.spec.ts` (6, plus 1 regression). Coverage: provider dispatch in get/update, cloudApiKey encryption round-trip, defensive isProvider guard, deprecated ollamaApiKey silent-ignore + warning, usptoApiKey regression, ALTER TABLE issuance and ordering, CHECK constraint enforcement, idempotent re-run handling for duplicate-column and no-such-column errors, gemma4:26b → gemma4:e4b migration regression. Total backend test count: **303** (was 286).

### Changed

- **`UpdateSettingsDto`** (`backend/src/settings/dto/update-settings.dto.ts`) — new optional fields `provider` / `cloudApiKey` / `cloudDefaultModel` / `localDefaultModel`. `ollamaApiKey` retained with `@deprecated` tag for one-cycle back-compat; service logs a warning when received and silently ignores it.

### Removed

- **`AppSettings.ollamaApiKey` column** — Ollama doesn't authenticate; the field was a vestigial PatentForgeLocal-fork artifact. Existing installs have it dropped via the idempotent migration step.

### Migration notes (Run 4)

- Fully backward-compatible for existing PatentForgeLocal installs. The migration is additive: existing rows get `provider='LOCAL'` automatically, preserving the user's prior choice (they installed PatentForgeLocal precisely because they wanted local). The `ollamaApiKey` drop is safe — the field was never actually used (Ollama is unauthenticated by default).
- Fresh installs land directly in the new schema via the inline `SCHEMA_SQL` constant in `prisma.service.ts`.
- No version bump in this run — entries accumulate under `[Unreleased]` until Run 8 (cutover + v0.5.0).

### Verification (Run 4)

- backend Jest: **303/303** in 22.9s (+17 from Run 2's 286)
- frontend Vitest: **201/201** in 11.1s (no frontend changes — pure regression check)
- claim-drafter pytest: **89/89** in 7.4s (regression)
- application-generator pytest: **92/92** in 6.1s (regression)
- compliance-checker pytest: **71/71** in 5.5s (regression)
- feasibility npm test: **29/29** in 24.1s (regression)
- `docker compose config --quiet`: exit 0
- `docker compose build`: all 5 service images built successfully

Total: **785 automated tests green** across 4 services + 2 web tiers.

---

### Added (merge plan Run 2 — LiteLLM provider abstraction)

- **LLM provider abstraction** — all four services (three Python + Node `feasibility`) now route LLM calls through an `LLMClient` boundary that dispatches on a new `provider` setting:
  - **LOCAL** → Ollama via OpenAI-compatible API (existing behavior; backward-compatible default for every existing install).
  - **CLOUD** → Anthropic via LiteLLM's `anthropic/<model>` integration in all three Python services. The Node `feasibility` service has the CLOUD dispatch branch wired but throws an explicit `LLMClientCloudNotImplementedError` until merge plan Run 4 lands the full Anthropic streaming + tool-call normalization.

- **Python `LLMClient`** — new shared module per Python service (`services/{application-generator,claim-drafter,compliance-checker}/src/llm_client.py`) exposing `async call_llm_with_retry(settings, *, model, max_tokens, system, messages, timeout)` and `compute_cost(model, input_tokens, output_tokens, settings)`. Built on `litellm.acompletion(num_retries=3, ...)` — LiteLLM owns retry behavior; the previous bespoke retry loop is gone.

- **Node `LLMClient`** — new module at `services/feasibility/src/llmClient.ts` exposing `streamLLM(settings, params)` with the same provider-dispatch shape. LOCAL routes through the existing `ollama-client.streamMessage`; CLOUD throws a typed error rather than silently falling back.

- **`AnalysisSettings` / `DraftSettings` / `GenerateSettings` / `ComplianceSettings`** — new fields across all service request schemas: `provider` (default `"LOCAL"`), `api_key` (CLOUD only), `base_url` (LOCAL — falls back to `ollama_url` for backward compat).

- **`docs/parity-audit.md`** — committed on a sibling audit-parity branch as the source-of-truth for the 8-step PatentForge merge plan. Run 2 (this run) implements the LLM abstraction layer the rest of the plan builds on.

- **Per-service `tests/test_llm_client.py`** (Python) and **`tests/llmClient.test.ts`** (Node) — dispatch tests verifying LOCAL → `ollama/<model>` with `api_base`, CLOUD → `anthropic/<model>` with `api_key`, retry-config passthrough, error propagation, and (Node) typed-error for CLOUD-not-yet-impl.

### Changed

- **Agent code no longer imports `openai` directly.** All `src/agents/*.py` modules in the three Python services now import from `..llm_client` instead of `openai`. The `import openai` line, the `openai.AsyncOpenAI(...)` client construction, and the `call_ollama_with_retry(client, ...)` call are replaced by a single `await call_llm_with_retry(_settings_from_state(state), ...)`. Behavior on LOCAL is byte-identical to v0.1.4; LiteLLM returns the same OpenAI-shape response object.

- **`src/cost.py`** in all three Python services is now provider-aware. `compute_cost(model, input_tokens, output_tokens, settings)` returns `0.0` for LOCAL and uses `litellm.completion_cost(...)` for CLOUD (with a defensive fall back to `0.0` if LiteLLM's pricing table doesn't know the model).

- **`src/server.py`** in all three Python services threads the new `provider` / `api_key` / `base_url` fields through to the pipeline graph. The legacy `ollama_url` field is still honored as a backward-compat fallback for LOCAL `base_url`.

- **`src/graph.py`** scrubs `ollama_url`, `base_url`, and `api_key` from final state in the `finalize` node so they don't persist in checkpoints, tracebacks, or LangGraph traces.

- **`docker-compose.yml`** — quoted every `${INTERNAL_SERVICE_SECRET:?msg}` default so the colon-space inside the message doesn't trip the YAML parser. `docker compose config --quiet` exits 0 again.

### Removed

- **`src/retry.py`** in all three Python services — subsumed by `LLMClient`. Retry semantics now owned by LiteLLM's `num_retries=` parameter, not a bespoke loop. Corresponding `tests/test_retry.py` files removed (the retry MECHANICS are LiteLLM's; the wrapper is tested via the new `tests/test_llm_client.py` dispatch tests).

### Verification

- claim-drafter pytest: **89/89** in 5.6s
- application-generator pytest: **92/92** (full suite, all pipeline-mock paths cleared)
- compliance-checker pytest: **71/71** in 6.2s
- feasibility npm test: **29/29** in 23.9s (includes 6 new LLMClient dispatch tests)
- backend npm test (NestJS): **286/286** in 26.3s (incl `doc-version-audit.spec.ts`)
- frontend Vitest: **201/201** in 9.7s
- `docker compose config --quiet`: exit 0 (with `INTERNAL_SERVICE_SECRET` env set)
- `docker compose build`: all 5 service images built successfully

Total: **768 automated tests green** across 4 services + 2 web tiers.

### Migration notes

This change is fully backward-compatible. Existing installs continue to work without any configuration change because:
- `provider` defaults to `"LOCAL"` if absent from request bodies.
- `base_url` defaults to the legacy `ollama_url` value if not explicitly set.
- The Pydantic / TypeScript settings models accept all the previous fields plus the new ones.

CLOUD users will not be able to use the merged product until merge plan Runs 4–5 land the Prisma `provider` enum, the AppSettings backend reshape, and the Settings page provider section.

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
