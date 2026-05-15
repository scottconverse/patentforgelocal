# PatentForgeLocal

Local-first fork of PatentForge. Replaces Anthropic API with Ollama + Gemma 4.

## Design Spec

Full design and implementation plan: `docs/superpowers/specs/2026-04-12-patentforgelocal-design.md`

## Key Architecture Decisions

- Default model: `gemma4:e4b` (Dense 4B, 9.6GB, 128K context)
- Ollama bundled as portable binary in `runtime/ollama/`
- Context window management via context-mode (SQLite FTS5 indexing of stage outputs)
- Web search: Ollama cloud web search API (optional, free account)
- USPTO: PatentSearch API (PatentsView is dead as of March 2026)
- Versioning: independent from PatentForge, starts at v0.1.0
- **LLM provider abstraction** (added in PatentForge merge plan Run 2): all four services (3 Python + Node `feasibility`) route LLM calls through an `LLMClient` boundary. Python services use LiteLLM (`litellm` package) for both Ollama (LOCAL) and Anthropic (CLOUD) dispatch. The Node `feasibility` service has the same dispatch shape — LOCAL delegates to `ollama-client.streamMessage`; CLOUD throws `LLMClientCloudNotImplementedError` until Run 4 wires it (Anthropic streaming + tool-call normalization is its own scope). Settings field: `provider: "LOCAL" | "CLOUD"`, `api_key`, `base_url` (LOCAL) — all default to LOCAL for backward compatibility with existing installs.

- **Provider routing in the backend `AppSettings` schema** (Run 4): four new columns persist the LLM provider choice — `provider` (String + SQLite CHECK constraint enforcing LOCAL/CLOUD; SQLite has no native enum, so the safety lives across TS union + DTO `@IsIn` validator + DB CHECK), `cloudApiKey` (encrypted at rest via `encryption.ts`, same pattern as `usptoApiKey`), `cloudDefaultModel` (default `claude-haiku-4-5-20251001`), `localDefaultModel` (default `gemma4:e4b`). The vestigial `ollamaApiKey` column is dropped — Ollama doesn't authenticate. Existing installs migrate idempotently in `prisma.service.ts:migrateSettings()` via `ALTER TABLE ADD COLUMN` with `provider='LOCAL'` backfill. `Provider` type union + `isProvider()` guard + `DEFAULT_PROVIDER` constant live in `backend/src/settings/provider.types.ts`.

- **Provider chooser in the frontend Settings UI** (Run 5): the Settings page (`frontend/src/pages/Settings.tsx`) has a new "Provider" section at the top with a Local/Cloud radio fieldset and conditional reveal panels. Cloud panel exposes `cloudApiKey` (show/hide masked input) and `cloudDefaultModel` dropdown; Local panel exposes `ollamaUrl` and `localDefaultModel` dropdown. Model dropdowns are populated from `frontend/src/utils/modelPricing.ts`, which now exports both `CLOUD_MODELS` (Anthropic Haiku 4.5 / Sonnet 4.6 / Opus 4.7 with $/1M-token pricing) and `LOCAL_MODELS` (Ollama free) plus helpers `getModelPricing(provider, model)`, `getModelsForProvider(provider)`, `estimateCostUsd(...)`, `formatCostDisplay(provider, cost)` (returns "Free" for LOCAL, "$N.NN" for CLOUD). `Provider` TS union + `isProvider()` guard live in `frontend/src/types.ts`. A `CostConfirmModal` component (`frontend/src/components/CostConfirmModal.tsx`) is available for cloud-mode cost approval; ProjectDetail integration is a focused follow-up.

## Upstream

Forked from https://github.com/scottconverse/patentforge
