# Changelog

All notable changes to PatentForgeLocal will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
