# PatentForgeLocal

**Private patent analysis, running entirely on your machine.**

PatentForgeLocal is a fully local version of [PatentForge](https://github.com/scottconverse/patentforge) that replaces cloud AI with on-device inference. Your inventions never leave your computer.

## How It Works

PatentForgeLocal runs the same 6-stage patent feasibility analysis as PatentForge, but uses [Ollama](https://ollama.com) + [Google Gemma 4](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/) instead of Anthropic's Claude API. The AI model runs locally on your hardware.

## Status

**v0.1.0 — In Development**

## Minimum Requirements

| | Minimum | Recommended |
|---|---|---|
| **RAM** | 16 GB | 32 GB+ |
| **Disk** | 25 GB free | 50 GB free |
| **CPU** | 4 cores, 2018+ | 8+ cores |
| **GPU** | Not required | Any with 8GB+ VRAM |
| **OS** | Win 10+, macOS 12+, Ubuntu 22+ | Same |

## License

MIT
