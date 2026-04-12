# Phase 7: Documentation + Release — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write the complete USER-MANUAL.md for PatentForgeLocal (new product, non-technical audience), update all documentation artifacts to reflect the current state, set version to 0.1.0, and prepare for first release.

**Architecture:** This is a documentation-only phase. No code changes except version bumps. The user manual is the primary deliverable — written for people who don't know what a terminal is, have never installed an AI model, and need to understand what a "patent feasibility analysis" does before they can use the tool. All 6 documentation artifacts per CLAUDE.md standards are updated.

**Tech Stack:** Markdown, HTML (landing page)

---

## File Map

### New/Rewritten files

| File | What |
|------|------|
| `USER-MANUAL.md` | Complete rewrite — PatentForgeLocal user manual for non-technical users |

### Updated files

| File | Changes |
|------|---------|
| `README.md` | Expand with current features, architecture overview, contributing |
| `CHANGELOG.md` | Full v0.1.0 entry with all features |
| `CONTRIBUTING.md` | Update dev setup for Ollama, Go, WSL |
| `docs/index.html` | Update landing page for PatentForgeLocal |

### Version bumps

| File | Change |
|------|--------|
| `tray/cmd/tray/main.go` | `version = "0.1.0"` (remove `-dev`) |

---

## Task 1: Write USER-MANUAL.md

**Files:**
- Rewrite: `USER-MANUAL.md`

This is the biggest task. The manual must be written for a **layperson** — a solo inventor or small-firm patent attorney who has never used a command line, never installed an AI model, and may not know what "Ollama" or "Gemma" means.

- [ ] **Step 1: Read the current (outdated) manual**

Read `USER-MANUAL.md` to understand the structure and what content to preserve vs replace.

- [ ] **Step 2: Write the complete new manual**

Replace the entire contents of `USER-MANUAL.md` with the following structure. Every section must be complete — no placeholders, no "see other docs."

The manual covers:

**Front matter:**
- Title: "PatentForgeLocal User Manual — v0.1.0"
- One-line description: "A step-by-step guide for using PatentForgeLocal to research and prepare for a patent consultation."

**Section 1: What Is PatentForgeLocal?**
- Plain language explanation: it's a program that runs on your computer. You describe your invention, and it uses AI to analyze whether it might be patentable.
- What it does: searches for similar patents, analyzes your invention's novelty, identifies potential legal issues, generates a detailed report
- What it is NOT: not a lawyer, not legal advice, not a filing service. AI can make mistakes. Always consult a patent attorney.
- What it costs: nothing. The AI runs on your computer. No subscription, no per-use fees, no cloud services required.
- Privacy: your invention description never leaves your computer. No data is sent to any server (except optional web search and USPTO patent database lookups).

**Section 2: System Requirements**
- Minimum: 16 GB RAM, 25 GB free disk, 4-core CPU (2018+), Windows 10+/macOS 12+/Ubuntu 22+
- Recommended: 32 GB+ RAM, 50 GB+ free, 8+ cores, GPU with 8GB+ VRAM
- What each requirement means in plain language (e.g., "RAM is your computer's working memory — check it in Task Manager on Windows or About This Mac on macOS")
- How to check your specs on each OS (step by step)

**Section 3: Installation**
- Step-by-step with screenshots described:
  1. Go to the PatentForgeLocal releases page on GitHub
  2. Download the installer for your operating system
  3. Run the installer (Windows: double-click the .exe; Mac: open the .dmg; Linux: make the AppImage executable)
  4. Follow the installer prompts — accept defaults
  5. PatentForgeLocal appears in your system tray (explain what the system tray is)
- What gets installed: the program itself, a bundled Python runtime, a bundled AI engine (Ollama). Total size: ~4 GB before model download.

**Section 4: First Launch — Setup Wizard**
Walk through each wizard screen:
1. **Welcome screen** — click "Get Started"
2. **System Check** — the program checks your hardware. Green checkmarks = good. Yellow warnings = will work but slower. Red = won't run (need more RAM or disk space). If red: explains what to do.
3. **Model Download** — the AI model (~18 GB) downloads. This is a one-time download. Takes 10-30 minutes depending on internet speed. Future launches take about 30 seconds. Progress bar shows status.
4. **Web Search (Optional)** — you can create a free Ollama account for web search during analysis. This lets the AI search the internet for recent patents and technical papers. Without it, analysis uses the built-in patent databases and the AI's training knowledge. Both work — web search just finds more recent results.
5. **USPTO API Key (Optional)** — a free API key from the US Patent Office for better patent search results. Optional but recommended.
6. **Legal Notice** — PatentForgeLocal is a research tool, not legal advice. Click "I Understand."
7. **Ready** — click "Start Using PatentForgeLocal." Your browser opens to the main screen.

**Section 5: Creating a Project**
- What a "project" is: one invention = one project
- Click "New Project"
- Fill in the invention form — explain each field:
  - **Invention Title**: a short name for your invention
  - **Description**: describe what your invention does in plain language. More detail = better analysis. 2-3 paragraphs is ideal.
  - **Problem Solved**: what problem does this invention address?
  - **How It Works**: explain the mechanism — how does it actually work?
  - **AI/ML Components** (if applicable): does your invention use artificial intelligence or machine learning?
  - **3D Printing / Physical Design** (if applicable): does it involve physical manufacturing?
  - **What I Believe Is Novel**: what makes this different from existing solutions?
  - **Current Alternatives**: what do people use today instead?
  - **What Has Been Built**: have you built a prototype? What stage is it at?
  - **What I Want Protected**: what specific aspects do you want patent protection for?
  - **Additional Notes**: anything else the analysis should consider
- Tips for good descriptions (be specific, use technical terms when you know them, describe the "how" not just the "what")
- Click "Save" to save the project

**Section 6: Running an Analysis**
- From the project page, click "Run Analysis"
- Confirmation screen shows estimated time (~5-10 minutes)
- Click "Start Analysis"
- The 6-stage pipeline runs:
  1. **Technical Intake**: the AI restates your invention in technical language to confirm understanding
  2. **Prior Art Research**: searches for similar patents and published ideas
  3. **Patentability Analysis**: evaluates novelty, non-obviousness, and utility
  4. **Deep Dive**: detailed analysis of AI/ML, 3D printing, or other specialized components
  5. **IP Strategy**: recommends filing strategies, claim scope, and protection approaches
  6. **Comprehensive Report**: compiles everything into a final report
- Each stage shows progress. You can watch the AI work in real time.
- When complete, the report appears on screen.
- You can cancel at any time (click the X). The analysis can be resumed from the last completed stage.

**Section 7: Understanding Your Report**
- What each section of the report means
- How to read the prior art table (patent numbers, titles, relevance scores)
- What "novelty," "non-obviousness," and "utility" mean in patent law (plain language)
- What the confidence levels mean
- Red flags to watch for
- How to export the report (Word document download)

**Section 8: Claim Drafting**
- After analysis, click "Draft Claims"
- What patent claims are (in plain language: the specific boundaries of what your patent protects)
- The AI drafts independent claims (broad protection) and dependent claims (specific features)
- You can review and edit claims before exporting
- Export as Word document

**Section 9: Application Generation**
- After claims, click "Generate Application"
- What a patent application is (the full document you file with the patent office)
- Sections generated: abstract, background, detailed description, figures description, summary
- Review, edit, export as Word document

**Section 10: Compliance Check**
- Click "Run Compliance Check"
- Checks the application against patent law requirements:
  - 35 U.S.C. § 101 (patent eligibility)
  - 35 U.S.C. § 112 (written description, definiteness)
  - Formalities (formatting, claim structure)
- Results show pass/fail with specific issues and suggestions

**Section 11: Settings**
- How to access settings (gear icon or /settings)
- What each setting does:
  - **AI Model**: shows which model is running (read-only)
  - **Ollama API Key**: enables web search (optional)
  - **USPTO API Key**: improves patent search (optional)
  - **Max Tokens**: controls how much text the AI generates per stage (default is fine)
  - **Inter-Stage Delay**: pause between stages (default 2 seconds)
  - **Export Path**: where exported documents are saved
  - **Auto-Export**: automatically export reports when analysis completes

**Section 12: Troubleshooting**
Common problems and solutions:
- "PatentForgeLocal won't start" → check system tray, restart from Start Menu
- "Model not loaded" → go to Settings, check model status
- "Analysis is very slow" → close other programs to free RAM; analysis is faster with a GPU
- "Web search not working" → check Ollama API key in Settings; web search is optional
- "Prior art search returned no results" → add USPTO API key in Settings; try more specific invention descriptions
- "Report seems incomplete" → try running analysis again; AI results vary between runs
- "Application won't export" → check export path in Settings; ensure the folder exists
- How to get help: link to GitHub Issues

**Section 13: Glossary**
Define every technical term used in the manual:
- Patent, Prior Art, Claims, Abstract, Specification, Novelty, Non-Obviousness, Utility, Patent Eligibility, Written Description, Definiteness, Independent Claim, Dependent Claim, Claim Scope, Filing Strategy, Provisional Application, Non-Provisional Application, PCT Application, AI Model, Ollama, Gemma 4, Token, API Key, System Tray

**Section 14: Privacy & Security**
- What stays on your computer: everything. AI model, analysis results, invention descriptions, exported documents.
- What goes over the internet (only if you opt in): web search queries (via Ollama cloud), USPTO patent database queries. Your invention description is NOT sent — only search terms derived from it.
- No accounts required. No telemetry. No analytics.
- How to verify: the program runs entirely offline except for the optional searches above.

- [ ] **Step 3: Commit**

```bash
git add USER-MANUAL.md
git commit -m "docs: write complete PatentForgeLocal user manual

Full manual for non-technical users covering installation, setup wizard,
creating projects, running analysis, understanding reports, claim
drafting, application generation, compliance checks, settings,
troubleshooting, glossary, and privacy."
```

---

## Task 2: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read current README**

Read `README.md`.

- [ ] **Step 2: Expand with current features and architecture**

The README should cover:
- What this is (1-2 sentences)
- Key features (bullet list): fully local AI, 6-stage analysis, claim drafting, application generation, compliance checking, prior art search, privacy-first
- Quick start (3 steps): download installer, run, follow wizard
- Minimum requirements table
- Architecture overview (2-3 paragraphs): Go tray app manages services, Ollama runs Gemma 4, NestJS backend, React frontend, Python services for claims/application/compliance
- Links to: user manual, contributing guide, changelog, license
- "How is this different from PatentForge?" section
- Credits: Ollama, Gemma 4, context-mode

Keep it under 200 lines. The README is the front door — point to USER-MANUAL.md for details.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: expand README with features, architecture, quick start"
```

---

## Task 3: Update CHANGELOG.md

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Read current changelog**

Read `CHANGELOG.md`.

- [ ] **Step 2: Write full v0.1.0 entry**

Replace the `[Unreleased]` section with a proper `[0.1.0]` release entry:

```markdown
## [0.1.0] — 2026-04-12

### Added
- Forked from PatentForge v0.9.3 as fully local AI variant
- Ollama integration — bundled portable Ollama binary for Windows, macOS, Linux
- Gemma 4 26B as default AI model (MoE architecture, runs on 32GB RAM)
- Go tray app manages Ollama as Service 0 (starts before all other services)
- Model pull with streaming progress tracking in tray app
- Context-mode integration — SQLite FTS5 indexing of stage outputs for intelligent context compression
- Ollama-compatible LLM client for feasibility service (OpenAI-compatible API)
- Web search tool support via Ollama cloud API (optional, free account)
- System check screen — validates RAM, disk, CPU, GPU before first use
- Model download screen with progress bar (one-time 18GB download)
- First-run wizard: welcome → system check → model download → optional accounts → disclaimer → ready
- Backend endpoints: /api/system-check, /api/model-pull, /api/model-pull-progress, /settings/validate-ollama
- Complete user manual for non-technical users

### Changed
- All 4 services (feasibility, claim-drafter, application-generator, compliance-checker) use local Ollama instead of Anthropic Claude API
- Settings page: removed API key and model tier selection, added model status and optional Ollama API key
- Cost confirm modal: shows estimated time instead of dollar amounts
- PatentsView client updated to PatentSearch API format (post-March 2026 shutdown)
- Inter-stage delay reduced to 2s (no rate limits locally)
- Max tokens default reduced to 16384 (optimized for Gemma 4)

### Removed
- Anthropic SDK dependency (replaced by OpenAI SDK targeting Ollama)
- Cloud API key requirement — no account needed to use PatentForgeLocal
- Per-token cost tracking and dollar estimates
- Model tier selection (Sonnet/Opus/Haiku) — replaced by local model
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: write full v0.1.0 changelog entry"
```

---

## Task 4: Update CONTRIBUTING.md

**Files:**
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Read current file**

Read `CONTRIBUTING.md`.

- [ ] **Step 2: Update dev setup for PatentForgeLocal**

Update the development setup section to include:
- Prerequisites: Node.js 20+, Go 1.22+, Python 3.12+, Git
- Clone the repo
- Install Ollama: `bash scripts/bundle-ollama.sh windows` (or mac/linux)
- Pull the model: `runtime/ollama/ollama pull gemma4:26b`
- Install backend deps: `cd backend && npm install`
- Install frontend deps: `cd frontend && npm install`
- Install feasibility deps: `cd services/feasibility && npm install`
- Install Python service deps: `pip install -e services/claim-drafter services/application-generator services/compliance-checker`
- Run tests: Go (`cd tray && go test ./...`), Backend (`cd backend && npx jest`), Feasibility (`cd services/feasibility && npx jest`), Frontend (`cd frontend && npx vitest run`)
- Start dev: the tray app manages all services; or start individually for development

Replace any Anthropic-specific setup instructions.

- [ ] **Step 3: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: update CONTRIBUTING.md for PatentForgeLocal dev setup"
```

---

## Task 5: Update landing page

**Files:**
- Modify: `docs/index.html`

- [ ] **Step 1: Read current file**

Read `docs/index.html` (first 100 lines to understand the structure).

- [ ] **Step 2: Update for PatentForgeLocal**

The landing page needs:
- Title: "PatentForgeLocal — Private Patent Analysis"
- Tagline: "Professional patent feasibility analysis, running entirely on your machine."
- Value prop: privacy (inventions never leave your computer), cost (no subscription), offline capability
- Quick start: download → install → analyze
- Features list: 6-stage analysis, claim drafting, application generation, compliance checking, prior art search, web search (optional)
- Architecture thumbnail: simple diagram showing user → browser → local services → local AI
- System requirements table
- Links to: GitHub releases (download), user manual, README, changelog
- "How is this different from PatentForge?" comparison
- Footer: credits (Ollama, Gemma 4, context-mode), license, GitHub link

Replace all PatentForge references with PatentForgeLocal. Remove any Anthropic/Claude references. Update the visual branding if needed.

- [ ] **Step 3: Commit**

```bash
git add docs/index.html
git commit -m "docs: update landing page for PatentForgeLocal"
```

---

## Task 6: Version bump to 0.1.0

**Files:**
- Modify: `tray/cmd/tray/main.go`

- [ ] **Step 1: Read the version line**

```bash
grep "version" tray/cmd/tray/main.go | head -3
```

- [ ] **Step 2: Remove -dev suffix**

Change `version = "0.1.0-dev"` to `version = "0.1.0"`.

- [ ] **Step 3: Verify Go build**

```bash
wsl -d Ubuntu -u root -e bash -c "cd /mnt/c/Users/8745HX/Desktop/Claude/PatentForgeLocal/tray && go build ./cmd/tray/ 2>&1 && echo 'BUILD OK'"
```

- [ ] **Step 4: Commit**

```bash
git add tray/cmd/tray/main.go
git commit -m "chore: bump version to 0.1.0 for first release"
```

---

## Task 7: Final verification

- [ ] **Step 1: Verify all doc files exist and are non-empty**

```bash
wc -l README.md USER-MANUAL.md CHANGELOG.md CONTRIBUTING.md LICENSE docs/index.html
```

All should have substantial content (README 100+, USER-MANUAL 500+, CHANGELOG 30+, CONTRIBUTING 50+).

- [ ] **Step 2: Run all test suites**

```bash
# Go
wsl -d Ubuntu -u root -e bash -c "cd /mnt/c/Users/8745HX/Desktop/Claude/PatentForgeLocal/tray && go test ./... -count=1 2>&1"

# Feasibility
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/services/feasibility && npx jest --verbose 2>&1 | tail -10
```

- [ ] **Step 3: Verify version consistency**

```bash
grep "0.1.0" tray/cmd/tray/main.go
grep "0.1.0" CHANGELOG.md | head -1
```

Both should show 0.1.0.

- [ ] **Step 4: Verify no Anthropic references in core code**

```bash
grep -r "anthropic\|Anthropic\|ANTHROPIC" services/*/src/ backend/src/ tray/ --include="*.ts" --include="*.py" --include="*.go" | grep -v node_modules | grep -v ".spec." | grep -v ".test." | head -10
```

Expected: no output (or only in migration comments).

- [ ] **Step 5: Git log summary**

```bash
git log --oneline | wc -l
git log --oneline
```

- [ ] **Step 6: Commit plan file**

```bash
git add docs/superpowers/plans/
git commit -m "docs: add all phase implementation plans"
```

---

## Summary

| Task | What | Commits |
|------|------|---------|
| 1 | USER-MANUAL.md (complete rewrite, ~800 lines) | 1 |
| 2 | README.md (expand) | 1 |
| 3 | CHANGELOG.md (v0.1.0 entry) | 1 |
| 4 | CONTRIBUTING.md (update dev setup) | 1 |
| 5 | Landing page (update for PatentForgeLocal) | 1 |
| 6 | Version bump to 0.1.0 | 1 |
| 7 | Final verification + plan commit | 1 |

**Total: 7 tasks, 7 commits**

**After Phase 7, PatentForgeLocal v0.1.0 is complete:**
- Full user manual for non-technical users
- All 6 documentation artifacts current
- Version 0.1.0 set everywhere
- 49+ atomic commits with clean history
- Ready for GitHub push and first release
