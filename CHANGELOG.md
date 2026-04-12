# Changelog

All notable changes to PatentForgeLocal will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-12

### Added

- Forked from [PatentForge v0.9.3](https://github.com/scottconverse/patentforge) as a local-first variant.
- Renamed all references from PatentForge to PatentForgeLocal across Go tray app, installer scripts, build scripts, launcher scripts, documentation, and configuration.
- Updated Go module path to `github.com/scottconverse/patentforgelocal/tray`.
- Removed ANTHROPIC_API_KEY passthrough from service manager (local LLM will be used instead).
- Set initial version to 0.1.0-dev.

### Changed

- `.env.example` now targets Ollama + Gemma 4 configuration instead of Anthropic API.
- Database filename changed from `patentforge.db` to `patentforgelocal.db`.
- Lock file changed from `patentforge.lock` to `patentforgelocal.lock`.
