# PatentForgeLocal v0.1.1

**Private patent analysis, running entirely on your machine.**

PatentForgeLocal is a fully local version of [PatentForge](https://github.com/scottconverse/patentforge) that replaces cloud AI with on-device inference using [Ollama](https://ollama.com) + [Google Gemma 4](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/). Your inventions never leave your computer.

## Key Features

- **Fully local AI** -- Ollama + Gemma 4 26B runs on your hardware. No cloud API calls, no API keys, no usage fees
- **6-stage feasibility analysis** -- technical intake, prior art research, patentability assessment, deep dive, IP landscape, consolidated report
- **AI claim drafting** -- 3-agent pipeline (Planner, Writer, Examiner) generates independent and dependent patent claims
- **Patent application generation** -- 5-agent pipeline produces complete USPTO-formatted applications with Word export
- **Compliance checking** -- automated validation against 35 USC 112(a), 112(b), MPEP 608, and 101
- **Prior art search** -- USPTO PatentSearch API integration with stop-word filtering and title-weighted scoring
- **Web search** (optional) -- Ollama cloud web search API for broader research (free account, opt-in)
- **System check** -- pre-flight validation of hardware, Ollama, model availability, and disk space
- **Context window management** -- stage output compression via [context-mode](https://github.com/scottconverse/context-mode) (SQLite FTS5 indexing)
- **Privacy-first** -- no telemetry, no cloud dependency, all data stays on your machine
- **Real-time streaming** -- watch the AI write its analysis in real time via SSE
- **Attorney-ready exports** -- HTML, Word (.docx), Markdown, and CSV export formats

## Quick Start

1. **Download** the installer from [GitHub Releases](https://github.com/scottconverse/patentforgelocal/releases/latest)
2. **Run** the installer -- it bundles Ollama, the Gemma 4 model, and all services
3. **Follow the wizard** -- the system check verifies your hardware, downloads the model if needed, and launches the app

No API keys required. No cloud accounts. No recurring costs.

> **Download sizes:** Windows installer ~1.2 GB, Mac DMG ~800 MB, Linux AppImage ~700 MB. The installers bundle Ollama and a portable Python runtime so everything works offline.
>
> **macOS note:** The DMG is unsigned. On first launch, right-click the app and select "Open", then confirm. Or run: `xattr -cr /Applications/PatentForgeLocal.app`

## System Requirements

| | Minimum | Recommended |
|---|---|---|
| **RAM** | 16 GB | 32 GB+ |
| **Disk** | 25 GB free | 50 GB free |
| **CPU** | 4 cores, 2018+ | 8+ cores |
| **GPU** | Not required | Any with 8 GB+ VRAM |
| **OS** | Windows 10+, macOS 12+, Ubuntu 22+ | Same |

GPU acceleration is optional but significantly improves generation speed. Ollama automatically detects and uses NVIDIA (CUDA), AMD (ROCm), and Apple Silicon (Metal) GPUs.

## Architecture

```
                    +---------------------+
                    |   Go System Tray    |
                    |  (service manager)  |
                    +----------+----------+
                               |
     +-------------------------+-------------------------+
     |          |         |          |          |         |
+----+---+ +---+----+ +--+-----+ +--+-----+ +-+------+ ++-------+
|Frontend| |Backend | |Feasib. | |Claim   | |App     | |Compl.  |
|React   | |NestJS  | |Express | |Drafter | |Gen     | |Checker |
|:8080   | |:3000   | |:3001   | |:3002   | |:3003   | |:3004   |
+--------+ +---+----+ +---+----+ +---+----+ +---+----+ +---+----+
               |           |          |          |          |
               +-----------+----------+----------+----------+
                                      |
                           +----------+----------+
                           |    Ollama (local)    |
                           |    Gemma 4 26B      |
                           +---------------------+
```

The Go tray app manages all 6 services as child processes with health monitoring and auto-restart. The NestJS backend orchestrates the pipeline and serves the React frontend. The three Python services — claim-drafter, application-generator, and compliance-checker — each run as independent FastAPI servers. All AI inference routes through a local Ollama instance running Gemma 4 26B.

## How Is This Different from PatentForge?

| | PatentForge | PatentForgeLocal |
|---|---|---|
| **AI Provider** | Anthropic Claude API (cloud) | Ollama + Gemma 4 (local) |
| **Cost** | ~$2-5 per full analysis | Free (your electricity) |
| **Privacy** | Data sent to Anthropic servers | Everything stays on your machine |
| **API Key** | Required (Anthropic account) | None required |
| **Internet** | Required for AI + USPTO | Optional (USPTO search only) |
| **Hardware** | Any computer | 16 GB+ RAM recommended |
| **Quality** | Claude 3.5+ (frontier model) | Gemma 4 26B (strong open model) |

PatentForgeLocal trades frontier model quality for complete privacy and zero cost. For many patent research tasks, Gemma 4 26B produces comparable results.

## Documentation

- [User Manual](USER-MANUAL.md) -- step-by-step guide for non-technical users
- [Contributing](CONTRIBUTING.md) -- development setup, testing, and how to submit changes
- [Changelog](CHANGELOG.md) -- version history and release notes
- [Architecture](ARCHITECTURE.md) -- detailed system design
- [Legal Notice](LEGAL_NOTICE.md) -- disclaimers and legal posture

## Credits

PatentForgeLocal builds on excellent open-source projects:

- **[Ollama](https://ollama.com)** -- local LLM runtime
- **[Google Gemma 4](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/)** -- open-weight language model (26B MoE, 256K context)
- **[context-mode](https://github.com/scottconverse/context-mode)** -- context window compression via SQLite FTS5 indexing
- **[PatentForge](https://github.com/scottconverse/patentforge)** -- upstream patent analysis platform

## License

MIT -- see [LICENSE](LICENSE) for details.

Prompt content is licensed under [CC BY-SA 4.0](LICENSE-PROMPTS).
