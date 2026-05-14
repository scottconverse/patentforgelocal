# PatentForge Parity Audit — Cloud vs Local

**Run:** `2026-05-14-2330-audit-parity-cloud-vs-local` (Run 1 of 8-step merge plan)
**Date:** 2026-05-14
**Decision direction:** PatentForgeLocal is the base; cloud-mode (Anthropic) is layered in via the run 2 LLM-provider abstraction.

## Executive summary

The two repos are **structurally near-identical** (same 4 services, same 16 Prisma models, same backend/frontend module layout, same 19/24/31 test counts). They diverge in three load-bearing axes:

1. **LLM provider.** Cloud uses Anthropic SDK (`anthropic>=0.42.0` in each Python service) targeting Claude Haiku/Sonnet/Opus. Local uses OpenAI SDK (`openai>=1.0`) with `base_url` pointed at Ollama for Gemma 4 / Llama 4.
2. **Cost surface.** Cloud has `CostConfirmModal`, hardcoded Anthropic pricing in `modelPricing.ts`, `costCapUsd` field in AppSettings, "approve cost" UX before each run. Local has none of that (free local inference).
3. **System surface.** Local has `ModelDownload` UI, `SystemCheck` (RAM/disk/CPU/GPU/Ollama detection), `backend/src/system/` module (controller + service for `/api/system/*`), `backend/src/shared/status.ts`, Ollama-bundling in installer, Ollama in tray service-manager. Cloud has none — cloud-mode users don't need any of it.

**Merge product strategy:** keep the entire **local** feature set as-is. Re-introduce the **cloud-only** features (`CostConfirmModal`, Anthropic pricing, `costCapUsd`) gated by provider selection. Add a Provider abstraction (LiteLLM, Run 2) so both SDK choices route through one client interface. Settings page gets a Provider section; UI hides local-only widgets in cloud mode and vice versa.

---

## Top-line divergence map

| Concern | Cloud | Local | Merge decision | Where addressed |
|---|---|---|---|---|
| LLM SDK | `anthropic>=0.42.0` in each Python svc | `openai>=1.0` (Ollama base_url) | **Both via LiteLLM** | Run 2 |
| Cost UX | `CostConfirmModal.tsx` | None | **Keep, conditional on provider=cloud** | Run 5 (frontend) |
| Model pricing table | `modelPricing.ts` Anthropic $$ | `modelPricing.ts` `LOCAL_MODELS` table (free) | **Merge: cloud table + local table; pick per provider** | Run 5 |
| Provider settings | `anthropicApiKey`, `costCapUsd` | `ollamaApiKey`, `ollamaModel`, `ollamaUrl`, `modelReady` | **Union both in AppSettings; add `provider` enum** | Run 4 (backend Prisma + adapter) |
| System check | None | `SystemCheck.tsx` + `backend/src/system/` | **Keep all, hide in cloud mode** | Run 5 |
| Model download | None | `ModelDownload.tsx` (Ollama pull progress) | **Keep, only triggers in local mode** | Run 5 |
| Installer | `PatentForge.{bat,ps1,vbs}` entry-points | `PatentForgeLocal.{bat,ps1,vbs,stop.ps1}` | **Two editions: Cloud (no Ollama), Local (Ollama bundled), Pro (both)** | Run 6 |
| Tray (Go) | Cloud-only service-manager | Local + Ollama service-manager | **Keep local's; in cloud mode skip Ollama service** | Run 6 |
| Tone of docs | "no API key required" wrong-mode | "fully local" wrong-mode | **Rewrite as "your choice: cloud or local"** | Run 7 |

---

## Section A — Services (`services/*/`)

All four service directories exist in both repos, with the same `Dockerfile + pyproject.toml + src/ + tests/` shape. The two service-classes:

### A1. Python services — `application-generator`, `claim-drafter`, `compliance-checker`

**Identical structure:** `src/{server.py, graph.py, models.py, parser.py, prompts/*.md, agents/*.py, retry.py, cost.py}`. Identical prompt filenames per service.

**Only divergence: the LLM client.**

| File pattern | Cloud | Local | Merge decision |
|---|---|---|---|
| `pyproject.toml dependencies` | `anthropic>=0.42.0,<1.0` | `openai>=1.0` | **Add `litellm` dep; remove direct SDK imports** |
| `src/agents/*.py` `import` lines | `import anthropic`; `client = anthropic.AsyncAnthropic(...)` | `import openai`; `client = openai.AsyncOpenAI(base_url=..., api_key="ollama")` | **`from src.llm_client import LLMClient; client = LLMClient.from_settings(state)`** (new shared module) |
| `src/retry.py` | `call_anthropic_with_retry(client, ...)` | `call_ollama_with_retry(client, ...)` | **Single `call_llm_with_retry(client, ...)`** in shared module |
| `src/cost.py` | Anthropic per-token math | `0.0` (free) | **Provider-aware cost calc; returns `0.0` for local** |
| `src/server.py` request body settings field | reads `settings.api_key`, `settings.default_model` | reads `settings.ollama_url`, `settings.default_model` | **New: reads `settings.provider`, `settings.model`, `settings.api_key`, `settings.base_url`** (provider-dispatched) |

**Prompts:** filenames identical across both repos in all three services. Content may have model-specific tuning (Claude prompts assume Claude's instruction-following; Gemma prompts may be more directive). **Run 2 decision needed:** do we keep one canonical prompt and accept some model drift, or do we ship prompt variants per provider? Recommend: single canonical prompt, with `## Model notes` section the Writer/Examiner can reference if needed.

### A2. Node service — `feasibility`

Identical structure: `Dockerfile + package.json + src/ + tests/`. Cloud commits `node_modules/` and `dist/` (size bloat — likely accidental); local doesn't.

| File | Cloud | Local | Merge decision |
|---|---|---|---|
| `package.json` deps | `@anthropic-ai/sdk` | `openai` SDK (Ollama base_url) | **Add `litellm-node` or use `openai` SDK universally via OpenAI-compat proxy (LiteLLM proxy mode)** |
| `src/prompts/loader.ts` | identical | identical | **Keep** |
| `src/prompts/stage-{1..6}.md` | likely tuned for Claude | likely tuned for Gemma | **Keep one canonical; add prompt-variant mechanism if measurable drift** |
| Committed artifacts | `node_modules/` + `dist/` in repo | gitignored | **Local's gitignore is correct; clean cloud's at merge time** |

---

## Section B — Backend (`backend/src/`)

Both backends are NestJS, both have 24 spec files, both implement the same module set:

**Common modules:** `application/`, `claim-draft/`, `compliance/`, `feasibility/`, `patent-detail/`, `prior-art/`, `prisma/`, `projects/`, `settings/`, `utils/`, `__mocks__/`, plus root `app.module.ts`, `main.ts`, `health.controller.{ts,spec.ts}`, `auth.guard.{ts,spec.ts}`, `doc-version-audit.spec.ts`.

### B1. Local-only modules

| Module | Purpose | Merge decision |
|---|---|---|
| `backend/src/shared/status.ts` | Probably shared status enum used by system + frontend | **Keep — useful for both modes** |
| `backend/src/system/` (controller + service + spec) | Exposes `/api/system/*` endpoints (model-download status, system-check results, ollama health). 4 files. | **Keep — only active routes when provider=local** |

### B2. Adapter shape — `backend/src/claim-draft/` (likely representative of all)

Per the recon agent's earlier read (and matching files on both sides):
- `claim-draft.service.ts` calls the Python claim-drafter service via native `http.request()` over `CLAIM_DRAFTER_URL` (default `http://localhost:3002`)
- SSE forwarding from upstream → controller streams
- `X-Internal-Secret` auth header injected

**Divergence:** the LLM-call shapes inside the SERVICE differ (anthropic vs openai SDK), but the BACKEND adapter is provider-agnostic. **Merge: backend adapters unchanged; the provider switch lives in the Python services.**

### B3. Prisma schema (`backend/prisma/schema.prisma`)

Cloud: 235 lines. Local: 237 lines. **16 models exist on both sides, identically named:** `Project`, `InventionInput`, `FeasibilityRun`, `FeasibilityStage`, `PriorArtSearch`, `PriorArtResult`, `ClaimDraft`, `Claim`, `ComplianceCheck`, `ComplianceResult`, `PatentApplication`, `ProsecutionEvent`, `PatentDetail`, `PatentFamily`, `OdpApiUsage`, `AppSettings`.

**Only AppSettings differs:**

| Field | Cloud | Local | Merge decision |
|---|---|---|---|
| `provider` | (implicit `anthropic`) | (implicit `ollama`) | **NEW: `provider Provider @default(LOCAL)` enum {LOCAL, CLOUD}** |
| `anthropicApiKey` | `String @default("")` | — | **Keep as `cloudApiKey` (generic name)** |
| `defaultModel` | `claude-haiku-4-5-...` | `gemma4:e4b` | **Default switches based on provider; user picks within their provider's model list** |
| `researchModel` | `String @default("")` | `String @default("")` | **Same; provider-aware default** |
| `maxTokens` | `32000` | `32000` | **Same** |
| `interStageDelaySeconds` | `5` | `5` | **Same** |
| `exportPath` | `""` | `""` | **Same** |
| `autoExport` | `true` | `true` | **Same** |
| `costCapUsd` | `5.00` | — | **Keep; provider=local hides this field** |
| `usptoApiKey` | `""` | `""` | **Same** |
| `encryptionSalt` | `""` | `""` | **Same** |
| `ollamaUrl` | — | `http://localhost:11434` | **Keep; provider=local exposes** |
| `ollamaModel` | — | `gemma4:e4b` | **Merge into `defaultModel`** (one field for both providers' model selection) |
| `ollamaApiKey` | — | `""` | **Drop — Ollama doesn't need an API key. Local artifact.** |
| `modelReady` | — | `false` | **Keep — informs UI whether to show ModelDownload** |

**Migration plan (Run 4):** additive — add `provider`, `cloudApiKey` columns with defaults; existing local installs migrate cleanly to `provider=LOCAL` with current Ollama settings preserved.

---

## Section C — Frontend (`frontend/src/`)

Both have 33 components. Both have same 4 `pages/` (`InventionForm`, `ProjectDetail`, `ProjectList`, `Settings`), same 11 hook files, same 11 util files.

### C1. Component-set divergence

| Component | Cloud | Local | Merge decision |
|---|---|---|---|
| `CostConfirmModal.tsx` | ✓ | — | **Bring back, conditional render `if settings.provider === 'CLOUD'`** |
| `ModelDownload.tsx` | — | ✓ | **Keep, conditional `if provider === 'LOCAL' && !modelReady`** |
| `SystemCheck.tsx` | — | ✓ | **Keep, conditional `if provider === 'LOCAL'`** |
| All other 30 components | identical names + likely-identical content | identical | **No change beyond minor copy edits** |

### C2. `utils/modelPricing.ts`

Cloud: hardcoded Anthropic table (Haiku $0.80/$4, Sonnet $3/$15, Opus $15/$75 per 1M tokens). Local: `LOCAL_MODELS` table (parameter sizes only — free).

**Merge:** export BOTH tables. Cost-calculation helpers take `provider` param; return `{inputPer1M, outputPer1M}` for cloud, `null` for local. UI displays "Free" string when null.

### C3. `pages/Settings.tsx`

Cloud has `anthropicApiKey`, `defaultModel` (Claude variants), `researchModel`, `costCapUsd`, `usptoApiKey`. Local has `ollamaApiKey`, `ollamaModel`, `modelReady`, `usptoApiKey`. Both use same React/Toast/Link primitives.

**Merge:** new Provider section at top of Settings:
- Radio: `[ ] Cloud (Anthropic API)` / `[ ] Local (Ollama)`
- Cloud-mode reveals: API key input, model dropdown (Anthropic models), researchModel dropdown, costCapUsd slider
- Local-mode reveals: Ollama URL, model dropdown (LOCAL_MODELS), modelReady status with download button
- Always visible: maxTokens, exportPath, autoExport, usptoApiKey

### C4. `api.ts`

Both wrap `fetch` with a `req()` helper. Local has `api.startModelPull()` and `api.systemCheck()` (used by ModelDownload + SystemCheck). Cloud doesn't. **Merge: keep local's additions, gate the call sites by `provider === 'LOCAL'`.**

### C5. `types.ts`

`AppSettings` type definition needs the same field union as the Prisma schema. **Merge: add `provider`, union all fields, mark provider-conditional fields optional.**

---

## Section D — Installer + Tray

### D1. Installer (`installer/{linux,mac,windows}/`)

Both repos have `installer/{linux,mac,windows}/` + `installer/assets/`. Structurally identical layout. **Differences (suspected, deeper read needed in Run 6):**

| Item | Cloud | Local | Merge decision |
|---|---|---|---|
| Inno Setup script (Windows) | Bundles backend + frontend + tray | Same + Ollama portable binary + Gemma 4 model download | **Three editions: Cloud (no Ollama), Local (with), Pro (both)** |
| Mac DMG | Same minus Ollama | Same plus Ollama wrapper | **Same three editions** |
| Linux AppImage | Same | Same plus Ollama download script | **Same three editions** |
| `runtime/ollama/` portable bundle | — | ✓ | **Keep, conditional on edition** |
| Default DB path | `appdata/patentforge.db` | `appdata/patentforgelocal.db` | **Unify to `patentforge.db`** |

### D2. Tray (`tray/{cmd,internal}/`)

Both Go modules with same `cmd/` + `internal/` layout. Local has Ollama-as-service-0 management (per `tray/internal/`); cloud doesn't. **Merge: keep local tray; Ollama service conditional on edition + provider.**

---

## Section E — Top-level entry points

| File | Cloud | Local | Merge decision |
|---|---|---|---|
| `PatentForge.{bat,ps1,vbs}` | ✓ | — | **Rename to canonical `PatentForge.{bat,ps1,vbs}` (drop "Local" suffix)** |
| `PatentForgeLocal.{bat,ps1,vbs,stop.ps1}` | — | ✓ | **Drop "Local" suffix; keep `stop.ps1` (useful, cloud lacks it)** |
| `docker-compose.yml` | identical structure | identical (with v0.4 YAML fix in PR #11) | **Use local's (fixed YAML) post-PR-#11 merge** |
| `docker-compose.yml backend env` | `ANTHROPIC_API_KEY: ${...}` (suspected) | `OLLAMA_HOST: ${...}` | **Both env vars, gated by `PROVIDER=`** |

---

## Section F — Docs

| File | Cloud | Local | Merge decision |
|---|---|---|---|
| `README.md` | "Cloud-based, Anthropic API required" framing | "Fully local, no API needed" framing | **Rewrite: "PatentForge — your choice: cloud or local"** |
| `USER-MANUAL.md` | Stages walked through with Claude responses | Same stages with Ollama responses | **Merge: provider-agnostic walkthrough with both screenshots in a Provider Setup chapter** |
| `ARCHITECTURE.md` | Architecture diagram with Anthropic API as external | Architecture with Ollama as bundled service | **Merge: provider as a plugin layer in the diagram; both arrows drawn** |
| `CLAUDE.md` | Hints for the AI coding agent | Same + Ollama-bundle notes | **Merge: keep both sets of hints; add provider context** |
| `CHANGELOG.md` | Cloud release history through v0.9.x | Local fork history with v0.1.0 → v0.4.0 (PR #11 pending) | **Continuation of local CHANGELOG with `[1.0.0]` merge entry; cloud changelog archived as `CHANGELOG-cloud-history.md`** |
| `LEGAL_NOTICE.md` | Identical (suspected) | Identical | **Keep one** |
| `LICENSE-PROMPTS` | References `services/*/src/prompts/` | Same + may need updating for new claim-drafter prompts | **Carry forward PR #11's plan to enumerate all 4 services explicitly** |
| `SECURITY.md` | Identical (suspected) | Identical | **Keep one** |
| `CONTRIBUTING.md` | Identical (suspected) | Identical | **Keep one** |
| `PRD.md` | Original cloud product spec | Same (forked) | **Update PRD with merge product spec — "PatentForge: cloud + local in one"** |
| `v0.4-SCOPE.md` | Future-work doc | Same | **Merge: `v1.0-SCOPE.md` describing this merge** |
| `V090-PLANNING-CONTEXT.md`, `V092-INSTALLER-CONTEXT.md` | Cloud-only planning notes | — | **Archive into `docs/historical/` after Run 1** |
| `V092-QA-RECHECK-CONTEXT.md` | ✓ | ✓ | **Keep — both repos have it** |
| `DISCUSSIONS-SEED.md` | Cloud framing | Local framing | **Rewrite for merged product** |
| `SUPERVISOR.md` (local-only) | — | ✓ | **Keep — local-only operational doc** |
| `docs/index.html` (landing page) | Cloud-positioning | Local-positioning | **Rewrite for merged product** |
| `docs/superpowers/` | superpowers spec dir | same | **Keep one (likely identical)** |
| `README-FULL.pdf` | Cloud PDF | Local PDF | **Regenerate from merged README** |
| `PatentForge-Architecture.docx` | Cloud diagram | Same file (forked) | **Update with merge architecture** |

---

## Section G — Tests

Identical structural counts: 19 frontend, 24 backend, 31 python — same files exist on both sides. **Tests will exercise both providers post-merge:**

- Python tests currently mock OpenAI client (local) or Anthropic client (cloud) per repo. Merge: mock `LLMClient` at the same level — provider-agnostic test surface.
- Frontend tests currently mock provider-specific UI (`ModelDownload` in local, `CostConfirmModal` in cloud). Merge: tests need to render both UIs in different provider contexts.
- Backend specs are likely unchanged (provider lives in the Python services + frontend Settings).

**New tests added by the merge (estimated in Run 2):**
- `LLMClient` provider dispatch (cloud → Anthropic, local → Ollama via OpenAI-compat)
- Settings page provider switch (cloud → local hides ModelDownload; local → cloud reveals CostConfirmModal)
- `provider` Prisma column migration round-trip

---

## Section H — Cloud-only features at risk of loss-in-merge

If we're not careful, the merge could drop cloud's value. Catalog of cloud-only features to preserve:

1. **Pre-run cost confirmation** (`CostConfirmModal`) — gives cloud users a $$$ estimate before each ~$1-3 run. Without this, accidental Opus runs could surprise.
2. **`costCapUsd` setting** — hard cap that aborts runs exceeding the limit. Safety rail.
3. **Hardcoded Anthropic pricing table** — `modelPricing.ts` source of truth for cost math. (Updated manually per release — confirmed in the file comment.)
4. **Anthropic-tuned prompts** — if cloud's prompts have been calibrated for Claude over many runs, they may produce worse output if pointed at Gemma without re-tuning. **Recommend: A/B prompt evaluation against both providers in Run 2 audit.**
5. **`anthropicApiKey` secret handling** — Settings UI input is masked/show-on-demand. Local repo's `ollamaApiKey` field uses similar pattern; reuse but rename to `cloudApiKey`.
6. **`stageCount` parameter in CostConfirmModal** — Defaults to 6; allows showing per-stage cost breakdown. Useful for transparency.

---

## Section I — Local-only features at risk of loss-in-merge

Less risk here since we're keeping local as the base, but worth flagging:

1. **`SystemCheck.tsx`** — RAM/disk/CPU/GPU/Ollama detection. Pre-flight UX. Cloud users don't need it, but local users absolutely do; show conditionally.
2. **`ModelDownload.tsx`** — Ollama model pull progress with polling. Local users need this first-run.
3. **`backend/src/system/`** module — backs `SystemCheck` and `ModelDownload`. Routes: probably `/api/system/check`, `/api/system/model-pull`, `/api/system/model-pull-status`.
4. **`backend/src/shared/status.ts`** — shared enum. Cheap to keep.
5. **Tray Ollama service-0** management — local installs need Ollama bundled + auto-start + tray-managed lifecycle.
6. **Inno Setup Ollama bundling** — patches `better_sqlite3.node` SEA path, copies Ollama wrapper script, runs Gemma 4 model download on first start.
7. **`PatentForgeLocal-stop.ps1`** — graceful shutdown helper. Cloud lacks an equivalent. Keep + rename to `PatentForge-stop.ps1`.

---

## Top-20 priority decisions (operator sign-off needed before Run 2)

These are the choices that change the whole rest of the plan. Each needs an explicit answer before Run 2 starts:

1. **LLM provider abstraction layer:** **LiteLLM** (recommended, both Python + Node bindings, broad provider coverage), or roll-our-own thin wrapper (200 Python + 200 TS lines)?
2. **`provider` field representation:** Prisma enum (`LOCAL` / `CLOUD`) vs free-string (allows future providers without migration)?
3. **`defaultModel` semantics:** single field with provider-aware default, vs two fields (`cloudDefaultModel` + `localDefaultModel`)?
4. **Prompt strategy:** single canonical prompt per agent (accept some Gemma-vs-Claude drift) vs `{prompt}-cloud.md` / `{prompt}-local.md` variants?
5. **Cost-cap UX in local mode:** hide entirely, OR show as "Token cap" (informational, no $ value)?
6. **First-run wizard flow:** does the wizard ask "Cloud or Local?" first, then branch? Or default to Local and let users discover Cloud in Settings?
7. **Installer editions:** ship 3 installers (Cloud / Local / Pro) or 1 universal installer with a mode chooser at install time?
8. **DB filename:** rename `patentforgelocal.db` → `patentforge.db` (clean) or keep for migration-compat?
9. **Repo strategy:** force-push `patentforgelocal` to become `patentforge` (Scott controls both — viable), or open a fresh `patentforge-merged` repo?
10. **Cloud `patentforge` archival:** archive with pointer ("see new repo"), or delete?
11. **Anthropic SDK direct vs via LiteLLM:** if LiteLLM is chosen, do we also depend on `anthropic` SDK for typed streams, or accept LiteLLM's standardized shape only?
12. **Local-mode cost reporting:** show `$0.00 — local` or `Free — local Ollama` or hide cost column entirely?
13. **System-check gating:** strict (block all features until SystemCheck passes) or permissive (warn + allow run)?
14. **Model download gating:** strict (block claim-draft until model downloaded) or permissive (warn + allow user to try)?
15. **`encryptionSalt` semantics under merged AppSettings:** still used to encrypt API keys at rest? Confirm pattern carries.
16. **Test mocking strategy:** universal LLMClient mock, OR keep provider-specific mocks under conditional `it.each([...providers])`?
17. **Migration of existing PatentForgeLocal installs:** auto-set `provider=LOCAL` on first migration run, vs prompt user on first launch post-update?
18. **Naming for cloud users:** "PatentForge Cloud Edition" vs "PatentForge — Cloud mode" vs no special branding (just Settings choice)?
19. **`CHANGELOG-cloud-history.md` retention:** keep historical cloud changelog accessible? Or fold into merged CHANGELOG as `## Pre-merge cloud history` section?
20. **`v1.0` of the merged product:** ship merge as `v1.0.0` (statement-of-intent — "we're stable now"), or `v0.5.0` (incremental from local's 0.4.0)?

**Recommendation: get explicit answers to items 1, 4, 7, 9, 20 before starting Run 2. The other 15 can be settled inside Run 2's scope.**

---

## Recon caveats

- **PR #11 is open but unmerged** on patentforgelocal. The repo state used for this audit is `master` (pre-PR-#11). After PR #11 merges, patentforgelocal will additionally have: per-project UPL ack persistence, per-claim DRAFT watermarks, spec-exact DOCX watermarks, CC BY-SA prompt headers, /healthz alias, test_auth httpx mocks, compose YAML fix, version bump to 0.4.0. **These all stay; they merge into v1.0 cleanly.**
- **Deep prompt-content comparison was not done** (filename comparison only). Run 2's first sub-task should diff each prompt file's content to surface any divergence in tone / instruction style between Claude-tuned and Gemma-tuned versions.
- **Cloud `node_modules/` and `dist/` committed in `services/feasibility/`** is a likely-accidental size bloat. Local fixed this in `.gitignore`. Merge: local wins.
- **`patentforge-cleanroom/services/feasibility/src/prompts/loader.ts`** exists in both repos identically; not deeply compared.
- **`installer/` and `tray/` structural comparison only;** Run 6 will deep-compare Inno Setup scripts and Go service definitions.

---

## Sign-off

Run 1 of 8 complete. Document is the authoritative reference for runs 2–8. Operator next steps:

1. Read the Top-20 decisions list (Section I above).
2. Answer items 1, 4, 7, 9, 20 explicitly (minimum needed for Run 2).
3. Confirm "PatentForgeLocal absorbs cloud-mode → renamed PatentForge" is the merge direction.
4. Approve start of Run 2 (LLM provider abstraction design).

— `audit-parity-cloud-vs-local` 2026-05-14
