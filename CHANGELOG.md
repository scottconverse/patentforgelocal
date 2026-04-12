# Changelog

All notable changes to PatentForgeLocal will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
