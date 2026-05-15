# GitHub Discussions — Seed Posts

These are the initial posts to create when GitHub Discussions is enabled on the PatentForgeLocal repo.

---

## Category: Announcements (pin this post)

### Title: Welcome to PatentForgeLocal v0.1.0 — Fully Local Patent Analysis

**Body:**

Hey everyone! PatentForgeLocal is now open source.

**What it does:** PatentForgeLocal is a fully local fork of [PatentForge](https://github.com/scottconverse/patentforge) that replaces cloud AI with on-device inference using Ollama + Gemma 4. You describe your invention, and it runs a complete patent analysis pipeline — feasibility research, prior art search, claim drafting, compliance checking, and application generation — entirely on your machine. Your inventions never leave your computer.

**What it doesn't do:** This is a research tool, not a legal service. The author isn't a lawyer, the AI isn't a lawyer, and none of the output is legal advice. It's designed to help you prepare for a meeting with a real patent attorney — not replace one.

**Current status (v0.1.0):**
- **Fully local AI** — Ollama + Gemma 4 26B runs on your hardware. No cloud API calls, no API keys required, no usage fees
- **6-stage feasibility analysis** — technical intake, prior art research, patentability review, deep-dive analysis, strategy notes, consolidated report
- **Prior art search** — USPTO Open Data Portal integration with relevance scoring, plus optional AI web search
- **Claim drafting** — 3-agent pipeline (Planner, Writer, Examiner) generates independent and dependent patent claims
- **Compliance checking** — 4-check automated validation (35 USC 112(a), 112(b), MPEP 608, 35 USC 101) with traffic-light results and MPEP citations
- **Application generator** — 5-agent LangGraph pipeline assembles a complete USPTO-formatted application; exports to Word (.docx) or Markdown
- **System tray app** — Go-based tray app manages all 6 services with health monitoring and auto-restart
- 1,229 automated tests (Jest + Vitest + pytest) across backend, frontend, and Python services
- Resume from interruption, individual stage re-run
- Legal guardrails — clickwrap, embedded disclaimers, watermarked exports

**How is this different from PatentForge?**

| | PatentForge | PatentForgeLocal |
|---|---|---|
| AI Provider | Anthropic Claude (cloud) | Ollama + Gemma 4 (local) |
| Privacy | Data sent to Anthropic | Everything stays on your machine |
| Cost | Pay per API call | Free after hardware |
| Internet | Required | Optional (for USPTO search) |

**Requirements:** Windows, macOS, or Linux. 32 GB RAM minimum (64 GB recommended). Ollama installed locally.

If you're trying it out, I'd love to hear how it goes. File bugs as GitHub issues, but use Discussions for questions, ideas, and general chat.

---

### Title: v0.1.0 Release — Local AI Fork of PatentForge

**Body:**

v0.1.0 is the first release of PatentForgeLocal — a complete fork of PatentForge that replaces the Anthropic Claude API with local inference via Ollama + Gemma 4 26B.

**What changed from upstream PatentForge:**
- All AI inference routes through local Ollama instance (OpenAI-compatible API)
- Default model: Gemma 4 26B (MoE, 18 GB, 256K context window)
- Removed cost cap feature (no per-token cost for local inference)
- Removed API key requirement (Ollama runs locally with no authentication needed)
- First-run wizard checks system requirements and downloads model
- Docker Compose configured for local Ollama connectivity

**Test results:** 1,229 tests passing across Windows and Linux — 289 backend (Jest), 202 frontend (Vitest), 247 Python service tests (pytest) per platform.

Full changelog: [CHANGELOG.md](CHANGELOG.md)

---

### Title: v0.1.1 Release — Installers, Auto-Setup, and 30+ Bug Fixes

**Body:**

v0.1.1 adds native installers for all three platforms, automatic Ollama/model setup, and fixes over 30 bugs found during end-to-end testing on clean machines.

**Highlights:**
- **One-click installers** — Windows (.exe via Inno Setup), macOS (.dmg), Linux (.AppImage) with bundled runtimes
- **Automatic Ollama setup** — the launcher detects, downloads, and starts Ollama automatically on first run; pulls gemma4:e4b if not already present
- **GPU/NPU detection** — scripts auto-detect AMD iGPU, NVIDIA GPU, and NPU hardware; injects ROCm environment variables for AMD acceleration
- **System tray app** — Go-based tray manages all 6 services as child processes with graceful shutdown
- **Security fixes** — removed known-public internal service secret fallback, added download token endpoint for secure exports

**Bug fixes include:** double context-manager close crash, claim regeneration data corruption, stale Prisma schema in SEA binary, environment variable stripping in tray, and Ollama version compatibility.

Full changelog: [CHANGELOG.md](CHANGELOG.md)

---

### Title: v0.1.2 Release — Pipeline Fixes, Cost Modal Removed, Windows System Check

**Body:**

v0.1.2 fixes critical issues that prevented feasibility analysis from running on installed binaries and removes unnecessary friction from the analysis workflow.

**What changed:**
- **Analysis starts immediately** — the cost confirmation modal is gone. Local inference is free; there's nothing to confirm. Click "Run Feasibility Analysis" and it starts.
- **Stage labels corrected** — "AI & 3D Print Deep Dive" (upstream artifact) replaced with the correct "Deep Dive Analysis" label throughout all pipeline prompts.
- **Windows system check works** — disk space and GPU detection now use PowerShell instead of deprecated `wmic`, fixing detection failures on Windows 11 and SEA binaries.
- **PatentsView references updated** — all user-facing references to the dead PatentsView API replaced with "USPTO-ODP" (the actual data source since March 2026).
- **Mac CI smoke test** — CI now structurally verifies the DMG wrapper script after every build.

Full changelog: [CHANGELOG.md](CHANGELOG.md)

---

### Title: v0.1.3 Release — Default Model Switched to gemma4:e4b (Fixes System Crashes)

**Body:**

v0.1.3 switches the default model from `gemma4:26b` to `gemma4:e4b` to fix hard system crashes on 32 GB machines.

**The problem:** `gemma4:26b` loads 18 GB of weights into RAM regardless of its MoE architecture. On 32 GB systems — especially AMD iGPU machines where GPU and system RAM are shared — peak usage during inference exceeded available memory, causing a hard crash requiring reboot.

**The fix:** `gemma4:e4b` (Dense 4B, 9.6 GB) leaves ~20 GB of headroom during active inference. Quality impact is minimal: gemma4:26b only activates ~4B parameters per forward pass anyway, so real-world output quality is comparable.

If you were experiencing hard crashes or black screens during patent analysis, update to v0.1.3.

Full changelog: [CHANGELOG.md](CHANGELOG.md)

---

### Title: v0.1.4 Release — Feasibility Crash Fix, Branding Corrections, Model DB Migration

**Body:**

v0.1.4 fixes a critical crash that occurred on every feasibility analysis run in installed binaries, corrects product branding throughout the app, and ensures the model setting is properly migrated for users upgrading from v0.1.2.

**Critical fix — feasibility crash:**
The feasibility service binary bundled context-mode's SQLite native addon (`better_sqlite3.node`) with an absolute path baked in at CI build time. On any user machine, that path didn't exist, causing an immediate crash when starting a feasibility analysis ("Stage 7 error: No such built-in module"). The binary now resolves the addon path relative to its own executable location at runtime.

**Branding fix:**
Several UI elements, page titles, and documents still showed "PatentForge" instead of "PatentForgeLocal" — a copy-paste artifact from the upstream fork. The app header, browser tab title, and all documentation now consistently say PatentForgeLocal.

**Model migration:**
Users who installed v0.1.2 before the default model was changed in v0.1.3 may have had their Settings database record stuck on `gemma4:26b`. On startup, the backend now automatically migrates that record to `gemma4:e4b` so the tray and Settings page show the correct model.

If you were seeing feasibility analyses crash immediately, update to v0.1.4.

Full changelog: [CHANGELOG.md](CHANGELOG.md)

---

### Title: v0.4.0 Release — Claim Drafting Hardened (UPL Guardrails + Test/Docker/Doc Pass)

**Body:**

v0.4.0 finalizes the AI claim-drafting feature by closing every UPL-guardrail gap from `v0.4-SCOPE.md`, paying off Phase-1 tech-debt deferred from the original scaffold, and validating all three test suites + cleanroom Docker build from a clean state. The Phase 5 backend adapter and Phase 6 frontend Claims tab were already in place at production quality; this release is the gap-fill + hardening + release docs.

**Highlights:**

- **Per-project UPL acknowledgment** — the Claims-tab modal now persists acceptance per project in `localStorage`, so users are prompted once per project rather than per visit. Helpers degrade silently in private mode.
- **Per-claim DRAFT badges** — every independent and dependent claim header carries an amber `Draft` badge with a full warning tooltip.
- **Inline per-claim examiner notes** — examiner critique now renders below each claim with the mandatory "This draft claim has not been reviewed by a patent attorney" disclaimer.
- **DOCX export watermarks match the spec exactly** — both the in-body banner and the repeating page header now read `DRAFT CLAIM CONCEPTS — NOT REVIEWED BY AN ATTORNEY — NOT FOR FILING`.
- **CC BY-SA 4.0 license headers** on all four claim-drafter prompt files so UPL guardrails survive forks.
- **Prescriptive invention-class → statutory-type mapping** in the Planner prompt (software/AI → method+system+CRM, hardware/IoT → method+system+apparatus, process/chemical → method+apparatus+composition).
- **`/healthz` alias** on the claim-drafter FastAPI service (Kubernetes-style probe target).
- **`docker-compose.yml` is valid YAML again** — every `${INTERNAL_SERVICE_SECRET:?…}` default is now quoted; `docker compose config` exits 0 and `docker compose build` succeeds for all 5 services.
- **`test_auth.py` no longer hangs without Ollama** — pipeline mocked at the module boundary, full pytest runs in ~1.5s.

**Verification:**

- claim-drafter pytest: 91/91 in 1.45s
- backend Jest: 286/286 in 26.1s
- frontend Vitest: 210/210 in 5.86s
- `docker compose config --quiet`: exit 0
- `docker compose build`: all 5 service images built

Total: 587 automated tests green across backend, frontend, and Python services.

Full changelog: [CHANGELOG.md](CHANGELOG.md)

---

## Category: Q&A

### Post 1

**Title:** What hardware do I need to run PatentForgeLocal?

**Body:**

**Minimum:**
- 32 GB RAM
- Any modern 4+ core CPU
- 50 GB free disk space (for Ollama + model weights)

**Recommended:**
- 64 GB RAM
- AMD Ryzen with Radeon iGPU (780M or better) or NVIDIA GPU
- SSD storage

The default model (Gemma 4 26B) needs about 18 GB for weights. With 32 GB RAM it fits but it's tight — you'll get better performance with 48-64 GB.

GPU acceleration makes a huge difference. With a properly configured AMD Radeon 780M iGPU, expect ~8-15 tokens/second. Without GPU, CPU-only inference runs at ~3-8 tokens/second — still usable but noticeably slower.

NVIDIA GPUs work automatically with Ollama. AMD iGPUs may need ROCm configuration on Linux (Ollama handles this automatically on Windows via DirectML).

### Post 2

**Title:** Is my data truly private? What network calls does PatentForgeLocal make?

**Body:**

**Yes, truly private.** PatentForgeLocal runs entirely on your machine with zero required network calls.

- All AI inference happens locally through Ollama — your invention descriptions are never sent to any external server
- The SQLite database lives on your local disk
- No telemetry, no analytics, no phone-home behavior
- The source code is open — you can verify this yourself

**Optional network calls (only if you configure them):**
- USPTO Open Data Portal — structured patent search (requires free API key from data.uspto.gov)
- Ollama cloud web search — AI-powered web search during analysis (requires free Ollama account)

Both are optional. PatentForgeLocal works fully offline without them. For pre-filing confidentiality, this is as good as it gets — your invention data never leaves your hardware.

### Post 3

**Title:** Can I use PatentForgeLocal output as-is for a patent filing?

**Body:**

**No.** PatentForgeLocal output is research to help you prepare for a consultation with a patent attorney. It is not a patent application, not a legal opinion, and not a substitute for professional legal counsel.

The AI can and does make mistakes — including fabricating patent numbers, misinterpreting case law, and presenting incorrect analysis with high confidence. Every finding should be independently verified by a qualified patent attorney.

Think of PatentForgeLocal like doing homework before a meeting. You'll walk in with your invention clearly described, related prior art identified, and smart questions ready. Your attorney still does the legal work.

---

## Category: Ideas / Feature Requests

### Post 1

**Title:** What features would make PatentForgeLocal more useful?

**Body:**

I'm planning the post-v0.1.0 roadmap and would love input from people who've actually been through the patent process or are using local AI tools.

Some features I'm considering:
- **GPU/NPU auto-detection** — automatically configure AMD ROCm for optimal iGPU inference, detect XDNA NPU for future offloading
- **Model selection UI** — let you choose between different Ollama models based on your hardware (gemma4:12b for 32 GB systems, gemma4:27b for 48 GB+)
- **Batch analysis** — run multiple inventions through the pipeline overnight
- **Patent family tree visualization** — graphical view of related patents and citation chains
- **Export to patent attorney template** — customizable report format that matches what attorneys expect to see

What would actually be useful for your workflow? Drop your ideas here.

### Post 2

**Title:** Local model recommendations — what works best on your hardware?

**Body:**

The default model is Gemma 4 26B, which balances quality and resource usage well. But Ollama supports many models, and different hardware might work better with different choices.

If you've experimented with other models for patent analysis, share your findings:
- What model did you try?
- What hardware are you running on?
- How was the output quality compared to gemma4:e4b?
- What was the inference speed like?

I'm especially interested in hearing from people running on:
- 32 GB systems (where gemma4:12b might be a better fit)
- NVIDIA GPU setups
- AMD Ryzen AI hardware with RDNA 3.5 iGPUs

---

## Category: Show and Tell

### Post 1

**Title:** First local patent analysis — from invention to USPTO application in ~30 minutes

**Body:**

Here's what a complete PatentForgeLocal workflow looks like end-to-end, running entirely on a Ryzen 7 laptop with 32 GB RAM and a Radeon 780M iGPU.

**Setup:** Ollama running with gemma4:e4b, PatentForgeLocal system tray started.

**Step 1 — Describe the invention** (~2 minutes)
Enter the invention title and description in the web UI. The more specific you are, the better the analysis.

**Step 2 — Feasibility analysis** (~15 minutes)
The 6-stage pipeline runs automatically. Each stage streams results in real-time via SSE. You can watch the AI work through technical restatement, prior art identification, patentability assessment, deep-dive, and strategy.

**Step 3 — Claim drafting** (~5 minutes)
The 3-agent pipeline (Planner, Writer, Examiner) generates independent and dependent claims. The examiner agent reviews for 35 USC compliance issues.

**Step 4 — Compliance check** (~3 minutes)
Automated checks against 35 USC 112(a), 112(b), MPEP 608, and 101. Traffic-light results with specific MPEP citations.

**Step 5 — Application generation** (~5 minutes)
Assembles the full USPTO-formatted application. Export to Word (.docx) for your attorney.

**Total time:** ~30 minutes. Zero cost. Zero data left your machine.

The output quality is genuinely useful as preparation material — it won't replace your attorney, but it gives you a solid foundation for that first conversation.

---

## Category: General

### Post 1

**Title:** Welcome to the PatentForgeLocal community

**Body:**

Hi! Welcome to the PatentForgeLocal community. A few pointers:

- **Found a bug?** File a [GitHub issue](https://github.com/scottconverse/patentforgelocal/issues). Include your OS, RAM, GPU, and the error message.
- **Have a question?** Post it here in Q&A. No question is too basic.
- **Want to contribute code?** Read [CONTRIBUTING.md](https://github.com/scottconverse/patentforgelocal/blob/main/CONTRIBUTING.md) for setup instructions. PRs welcome.
- **Have an idea?** Post in Ideas / Feature Requests. Upvote ideas you'd use.
- **Want to show off what you built?** Post in Show and Tell.

This project exists because patent analysis should be accessible to individual inventors without requiring cloud AI subscriptions or sharing invention details with third parties. If that resonates with you, you're in the right place.
