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

## Upstream

Forked from https://github.com/scottconverse/patentforge
