# PatentForgeLocal

Local-first fork of PatentForge. Replaces Anthropic API with Ollama + Gemma 4.

## Design Spec

Full design and implementation plan: `docs/superpowers/specs/2026-04-12-patentforgelocal-design.md`

## Key Architecture Decisions

- Default model: `gemma4:26b` (MoE, 18GB, 256K context)
- Ollama bundled as portable binary in `runtime/ollama/`
- Context window management via context-mode (SQLite FTS5 indexing of stage outputs)
- Web search: Ollama cloud web search API (optional, free account)
- USPTO: PatentSearch API (PatentsView is dead as of March 2026)
- Versioning: independent from PatentForge, starts at v0.1.0

## Upstream

Forked from https://github.com/scottconverse/patentforge
