# PatentForge v0.1.4

**Your choice: cloud or local. Private patent analysis on your terms.**

PatentForge is an AI-powered patent research and drafting platform that runs in two modes — **Local** (Ollama + Google Gemma 4 on your hardware; free, fully offline) or **Cloud** (Anthropic Claude via your own API key; faster, no hardware requirements). Switch modes any time in Settings. Same prompts, same outputs, your call where the model runs.

## Key features

- **Two modes, one product** — Local (Ollama + Gemma 4) for privacy + zero recurring cost, or Cloud (Anthropic Claude) for speed + lower hardware requirements. Pick one at first launch; switch any time in Settings.
- **6-stage feasibility analysis** — technical intake, prior art research, patentability assessment, deep dive, IP landscape, consolidated report. Real-time streaming over SSE.
- **AI claim drafting** — 3-agent pipeline (Planner / Writer / Examiner) generates independent and dependent patent claims.
- **Patent application generation** — 5-agent pipeline produces complete USPTO-formatted applications with Word export.
- **Compliance checking** — automated validation against 35 USC 112(a), 112(b), MPEP 608, and 101.
- **Prior art search** — USPTO PatentSearch API integration with stop-word filtering and title-weighted scoring.
- **Web search** (optional) — Ollama Cloud Web Search API for broader research (free account, opt-in).
- **System check** — pre-flight validation of hardware, Ollama (Local mode only), model availability, and disk space.
- **Context window management** — stage output compression via [context-mode](https://github.com/scottconverse/context-mode) (SQLite FTS5 indexing).
- **Privacy-first** — no telemetry. In Local mode, inference never leaves your hardware; in Cloud mode, only the calls you authorize via the cost-confirm modal reach Anthropic.
- **Attorney-ready exports** — HTML, Word (.docx), Markdown, and CSV.

## Local mode vs Cloud mode

| | Local mode | Cloud mode |
|---|---|---|
| **Provider** | Ollama + Gemma 4 (on-device) | Anthropic Claude (cloud API) |
| **API key** | None | Your own Anthropic key (encrypted at rest) |
| **Cost** | Free (your electricity) | Per-run charge to your Anthropic account (~$0.10–$2 per analysis depending on model) |
| **Privacy** | Inference stays on this machine | Calls go to Anthropic per their API terms |
| **Hardware** | 16 GB+ RAM recommended; GPU optional but helpful | Any machine that can run a browser |
| **Network** | Optional (USPTO + web search only) | Required for AI calls |
| **Model quality** | Gemma 4 (strong open model) | Claude Haiku 4.5 / Sonnet 4.6 / Opus 4.7 (frontier) |
| **Cost-confirm** | No modal (it's free) | Modal before each run with estimated $ |
| **Default** | Yes (first-time installs and existing PatentForgeLocal upgrades) | Opt-in via Settings or first-run wizard |

You don't have to commit to one mode at install time. Choose at first launch (Full installer) or switch later in Settings.

## Quick start

Two installer editions:

| Edition | What's bundled | Use when |
|---|---|---|
| **Lean** | Frontend + backend + 3 Python services. No Ollama runtime. | You only want Cloud mode (smaller download, no GPU needed). |
| **Full** | Everything in Lean + Ollama runtime + Gemma 4 model. | You want Local mode, or you want the option to switch between Cloud and Local. |

1. **Download** the installer for your platform + edition from [GitHub Releases](https://github.com/scottconverse/patentforge/releases/latest).
2. **Run** the installer and launch the app.
3. On first launch, the wizard asks "Local or Cloud?" (Full edition) or jumps straight to Cloud setup (Lean edition).
4. **Local mode** does a system check, downloads the model if needed, then opens the browser. **Cloud mode** asks for your Anthropic API key, then opens the browser.

| Platform | Lean size | Full size |
|----------|-----------|-----------|
| **Windows** | ~200 MB | ~880 MB (+ ~10 GB Gemma 4 download on first launch) |
| **Linux** | ~150 MB | ~200 MB (+ Ollama + Gemma 4 fetched on first launch) |
| **macOS** | ~150 MB | ~200 MB (+ Ollama + Gemma 4 fetched on first launch) |

> **macOS note:** The DMG is unsigned. On first launch, right-click the app and select "Open", then confirm. Or run: `xattr -cr /Applications/PatentForge.app`

## System requirements

|  | Cloud mode | Local mode |
|---|---|---|
| **RAM** | 4 GB | 16 GB min · 32 GB+ recommended |
| **Disk** | 1 GB free | 25 GB min · 50 GB+ recommended |
| **CPU** | 2 cores, 2018+ | 4 cores, 2018+ · 8+ recommended |
| **GPU** | Not required | Not required, but accelerates inference (NVIDIA CUDA / AMD ROCm / Apple Silicon Metal) |
| **OS** | Windows 10+, macOS 12+, Ubuntu 22+ | Same |

Cloud mode is lightweight because the model runs on Anthropic. Local mode pulls Gemma 4 (~10 GB compressed weights) on first launch and keeps it on disk.

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
|:3000   | |:3001   | |:3002   | |:3003   | |:3004   | |:3005   |
+--------+ +---+----+ +---+----+ +---+----+ +---+----+ +---+----+
                          \         \         |         /
                           \         \        |        /
                            \         \       |       /
                          +--+---------+------+------+--+
                          |   LLMClient (provider gate)   |
                          |  - LOCAL: Ollama on 11434     |
                          |  - CLOUD: Anthropic via LiteLLM|
                          +-+----------------------------++
                            |                            |
                  +---------+--------+           +-------+-------+
                  |  Ollama (Local)  |           | Anthropic API |
                  |  Gemma 4 e4b/26b |           | Claude 4.x    |
                  +------------------+           +---------------+
```

Every service routes LLM calls through an `LLMClient` boundary that consults `AppSettings.provider` and dispatches to Ollama (LOCAL) or Anthropic via LiteLLM (CLOUD). The Go tray manages 6 services as child processes — Ollama as `service-0` only when the install edition AND user settings both say LOCAL. The NestJS backend orchestrates the pipeline, persists settings (with API keys encrypted at rest), and serves the React frontend.

## How is this different from previous PatentForgeLocal?

If you're upgrading from PatentForgeLocal (the local-only fork), you don't lose anything:

- Your install becomes a **Full edition** automatically. Your Settings default to **Local mode**. Your Gemma 4 model is preserved.
- A new **Cloud mode** is now available as an opt-in via Settings — bring your own Anthropic API key, get faster inference at a per-run cost.
- The original PatentForge cloud-only product is also subsumed here; that repo is archived.

Migration is silent: open the app after upgrading and everything looks the same. The Provider chooser is the first section on the Settings page if you want to try Cloud mode.

## Documentation

- [User Manual](USER-MANUAL.md) — step-by-step guide for both modes
- [Architecture](ARCHITECTURE.md) — detailed system design
- [Contributing](CONTRIBUTING.md) — development setup, testing, and how to submit changes
- [Changelog](CHANGELOG.md) — version history and release notes
- [Legal Notice](LEGAL_NOTICE.md) — disclaimers and legal posture

## Credits

PatentForge builds on excellent open-source projects:

- **[Ollama](https://ollama.com)** — local LLM runtime
- **[Google Gemma 4](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/)** — open-weight language model (e4b dense or 26B MoE, 256K context)
- **[Anthropic Claude](https://www.anthropic.com)** — frontier cloud LLM (Haiku 4.5 / Sonnet 4.6 / Opus 4.7)
- **[LiteLLM](https://github.com/BerriAI/litellm)** — unified provider abstraction (Ollama + Anthropic in one client)
- **[context-mode](https://github.com/scottconverse/context-mode)** — context window compression via SQLite FTS5 indexing

## License

MIT — see [LICENSE](LICENSE) for details.

Prompt content is licensed under [CC BY-SA 4.0](LICENSE-PROMPTS).
