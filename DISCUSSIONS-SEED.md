# GitHub Discussions — Seed Posts

These are the initial posts to create when GitHub Discussions is enabled on the PatentForge repo.

---

## Category: Announcements (pin this post)

### Title: Welcome to PatentForge — What It Is and What's Coming

**Body:**

Hey everyone! PatentForge is now open source.

**What it does:** PatentForge is a self-hosted web app that helps inventors explore the patent landscape for their ideas using AI. You describe your invention, and it runs a 6-stage analysis — restating your idea in technical language, searching for related patents, mapping it against patent law requirements, and assembling everything into a structured report you can take to a patent attorney.

**What it doesn't do:** This is a research tool, not a legal service. The author isn't a lawyer, the AI isn't a lawyer, and none of the output is legal advice. It's designed to help you prepare for a meeting with a real patent attorney — not replace one.

**Current status (v1.0.0):**
- **Feasibility analysis** — 6-stage AI pipeline: technical intake, prior art research, patentability review, deep-dive analysis, strategy notes, consolidated report
- **Prior art search** — USPTO Open Data Portal integration with relevance scoring (stop-word filtering, title weighting), plus AI web search
- **Claim drafting** — 3-agent pipeline (Planner, Writer, Examiner) generates independent and dependent patent claims
- **Compliance checking** — 4-check automated validation (35 USC 112(a), 35 USC 112(b), MPEP 608, 35 USC 101) with traffic-light results and MPEP citations
- **Application generator** — 5-agent LangGraph pipeline assembles a complete USPTO-formatted application (background, summary, description, abstract, IDS); exports to Word (.docx, USPTO-compliant) or Markdown
- **Sidebar status badges** — visual indicators (green/red dots, spinners, counts) show pipeline step completion at a glance
- **Mobile-responsive sidebar** — collapsible accordion on small screens keeps main content visible
- API keys encrypted at rest (AES-256-GCM)
- Cost transparency with configurable cost cap
- Optional Bearer token authentication for network deployments
- 835 automated tests (Jest + Vitest + supertest + Playwright E2E + pytest) with GitHub Actions CI
- ESLint + Prettier + TypeScript strict mode + coverage thresholds enforced in CI
- Resume from interruption, individual stage re-run
- Legal guardrails — clickwrap, embedded disclaimers, watermarked exports, CC BY-SA prompt licensing

**What's new in v1.0.0:**
- **First stable release** — Settings save now shows a toast notification instead of the previous silent inline banner. Mobile and tablet Playwright E2E tests (375px + 768px) added, clearing v0.9.2 QA debt. Documentation v1.0 pass with all version numbers and download links current.
- 835 automated tests

**What's new in v0.9.3:**
- **0 npm vulnerabilities** — NestJS v11 + Vite v8 upgrade eliminates all npm vulnerabilities across all packages (previously 21 total, including 7 HIGH in backend)
- **Retry/backoff standardized** — All three Python pipeline services (claim-drafter, compliance-checker, application-generator) now retry on rate limits (60s/90s/120s) and server errors (30s/45s/60s). Previously these services had no retry logic and would fail permanently on transient API errors.
- 829 automated tests

**What's new in v0.9.2:**
- **Real-time SSE progress** — Claims, Compliance, and Application tabs now show step-by-step progress during generation instead of a silent spinner
- **Cross-references populated** — Patent applications now include a proper "CROSS-REFERENCE TO RELATED APPLICATIONS" section
- **Claims lazy-load** — Initial page load reduced from 152KB to ~15KB; full claim text loaded on expand
- 802 automated tests

**What's new in v0.9.1:**
- **Assessment labels aligned to v1.2.0 legal posture** — all three repos now use the same softened labels: "LANDSCAPE FAVORS FILING", "MORE DOCUMENTATION WOULD STRENGTHEN POSITION", "KEEP AS TRADE SECRET", "SIGNIFICANT OBSTACLES IDENTIFIED", "DESIGN PATENT AVENUE WORTH EXPLORING"
- **Enhanced AI disclaimers** — all 4 services now include v1.2.0 disclaimer text with explicit warnings about fabricated patent numbers and inaccurate legal citations
- **50-word minimum validation** — feasibility pipeline requires at least 50 words in the invention description before running, with inline error guidance on what detail to add

**What's new in v0.9.0:**
- **Fix: Application sections empty** — Application tab's 9-section structured navigation now works end-to-end. The `astream` loop was replacing accumulated state instead of merging it, causing all generated section content to be lost.
- **Fix: Application generation progress** — Added elapsed timer and guidance copy ("Application generation typically takes 2-4 minutes") to the Application tab spinner.
- **Fix: Streaming horizontal scrollbar** — Long patent URLs during Stage 2 streaming no longer cause horizontal overflow.
- **New E2E tests** — 7 new Playwright scenarios: multiple projects, cancel mid-pipeline, resume from error, edit after feasibility, draft persistence, download buttons, and streaming scrollbar.

**What's new in v0.8.5:**
- **Critical fix: installer auth** — Python services (claim-drafter, compliance-checker, application-generator) rejected all backend requests due to a trailing space in the INTERNAL_SERVICE_SECRET env var. Claims, Compliance, and Application were completely non-functional from a fresh install.
- **Fix: stage data persistence** — stage completion indicators (green checks, times, costs, "view" links) no longer disappear when navigating away from the running view
- **Fix: Claims tab performance** — 37+ claims no longer freeze the browser; claims render as expandable accordion
- **Fix: Compliance tab performance** — 154+ results no longer freeze the browser; rule sections start collapsed
- **UX: elapsed timer** — Claims and Compliance generation now show elapsed time instead of a static spinner

**What's new in v0.8.4:**
- **Bug fix: Windows installer — cross-platform build script** — `services/feasibility` build script now uses a Node.js inline copy instead of Unix `cp`; fresh installs on Windows no longer fail at the prompt-copying step
- **Bug fix: Windows installer — PATHEXT enforcement** — `PatentForge.ps1` now explicitly sets `PATHEXT` before invoking npm, preventing `.cmd` extension resolution failures in stripped Windows shell environments

**What's new in v0.8.3:**
- **CI fix** — package-lock.json version mismatch (0.8.1 vs 0.8.2) that caused `npm ci` to fail in CI
- **Bug fix: decrypt() silent failure** — `decrypt()` now throws `DecryptionError` instead of silently returning ciphertext when decryption fails; settings service shows a clear warning banner in the UI
- **Bug fix: report auth** — ReportViewer iframe and HTML download now use fetch+srcdoc/blob instead of direct URLs, working with PATENTFORGE_TOKEN auth; AuthGuard also accepts `?token=` query param fallback
- **Bug fix: orphaned nginx block** — removed `/feasibility/` proxy block from nginx.conf; SSE settings moved to `/api/` proxy
- **Bug fix: stale projectLoadedRef** — view init ref resets when project ID changes; stale RUNNING runs show overview for direct re-run access
- **Bug fix: concurrent run guard** — `isRunningRef` prevents overlapping SSE streams from rapid Resume/Cancel/Resume
- **Security: API key rate limiting** — @nestjs/throttler added; validate-api-key endpoint limited to 5 requests per 60 seconds
- **Code quality: lint cleanup** — all `any` types replaced with proper interfaces; unused variables fixed; application.service.ts cost cap now includes claimDraft costs
- **Code quality: shared utilities** — extracted slugify() and disclaimer text to shared modules
- **Docker: healthchecks** — all 7 services now have healthchecks; frontend depends on backend being healthy
- **Docker: log rotation** — json-file driver with 10 MB max-size, 3-file rotation on all services
- **Settings: auto-export opt-in** — new autoExport boolean (defaults to true); toggle in Settings UI
- **CI: Node 24 migration** — FORCE_JAVASCRIPT_ACTIONS_TO_NODE24 env var set preemptively
- **Coverage thresholds bumped** — backend 44/38/32/43, frontend 38/38/32/38

**What's new in v0.8.2:**
- **Security hardening** — Helmet HTTP security headers on all backend responses, DOMPurify sanitization on all server-side markdown-to-HTML rendering
- **Prisma schema unification** — eliminated dual-schema drift by deleting the separate Postgres schema file; Docker now derives from the canonical schema via `sed`, making drift structurally impossible
- **Cost tracking across all services** — claim-drafter `estimatedCostUsd` now included in cumulative project cost calculations and cost cap enforcement
- **ProjectDetail refactor** — extracted 6 focused components (ContentPanel, RunningView, ReportView, StageOutputViewer, useViewInit, useReportContent), reducing the main file from 616 to 385 lines
- **CI expanded** — application-generator pytest suite added to GitHub Actions pipeline
- **Jest ESM fix** — resolved `isomorphic-dompurify` ESM transformation chain failure that was hiding 49 backend tests

**What's new in v0.8.1:**
- **Back button fix during streaming** — clicking "← Back" from Prior Art, Claims, Compliance, or Application tabs while the feasibility pipeline is actively streaming now returns to the streaming view instead of jumping to the project overview. The `isPipelineStreaming` flag tracks active pipeline execution and guides sidebar navigation.
- **Documentation consistency audit** — updated all version numbers across README.md, USER-MANUAL.md, ARCHITECTURE.md, and docs/index.html to reflect v0.8.1; added v0.8.1 to project roadmap; verified all diagrams are referenced in documentation

**What's new in v0.8.0:**
- **Code quality enforcement** — ESLint + Prettier across all TypeScript services, TypeScript strict mode (backend `noImplicitAny` + frontend `strictNullChecks`), coverage thresholds enforced in CI
- **Backend integration tests** — 19 HTTP-level tests with supertest covering projects CRUD, settings, and auth guard
- **Sidebar status badges** — Prior Art, Claims, Compliance, Application buttons now show green/red dots and counts so you can see what's done at a glance
- **Mobile-responsive sidebar** — Pipeline and Actions sections collapse into an accordion on small screens so you can see your content immediately
- **Pre-push git hook** — automated release verification runs before every push; can't accidentally ship broken docs or wrong test counts
- **ProjectDetail decomposition** — the largest frontend component (1,486 lines) split into focused hooks and components for maintainability

**What's new in v0.7.1:**
- **18 bug fixes** from external code review — run targeting race conditions, API key security (backend validation), cost cap scope (all pipelines), SSE error handling, request timeouts, component polling cleanup, claim regeneration context, settings defaults, resume sort order, DOCX filenames, delete confirmation text, Docker password parameterization, shared utility extraction, USPTO URL standardization, blockquote Word support, marked() consistency, finalReport type corruption fix

**What's new in v0.7.0:**
- **One-click installer** — Windows (.exe), Mac (.dmg, beta), Linux (.AppImage, beta). Download, install, launch. No Node.js, Python, or git required.
- **System tray app** — Go binary manages all 6 services with health monitoring, auto-restart, and log rotation
- **First-run wizard** — guides new users through API key setup on first launch

**What's next:**
- v1.0.0 is here — settings save toast, mobile/tablet E2E viewport tests, documentation v1.0 pass, 835 automated tests

If you're an inventor who's been through the patent process before, I'd love your feedback on whether this output would have been useful at the start of your journey.

— Scott

---

## Category: Q&A

### Post 1

**Title:** How much does it cost to run an analysis?

**Body:**

Each analysis run costs approximately **$0.75 to $3.00** in Anthropic API fees, depending on the complexity of your invention description and the model you choose.

- **Sonnet** (default) — best balance of quality and cost, typically $1-2 per run
- **Opus** — highest quality, ~$2-3 per run
- **Haiku** — cheapest, ~$0.50-1.00 per run, but lower quality output

PatentForge shows you a cost estimate before you confirm the run, so there are no surprises. You can also use a cheaper "research model" for Stage 2 (prior art search) to reduce costs while keeping the higher-quality model for the analysis stages.

You bring your own Anthropic API key — PatentForge doesn't charge anything on top of the API costs.

### Post 2

**Title:** Is my invention data private? What gets sent where?

**Body:**

PatentForge runs entirely on your computer. Your invention data stays local except for one thing: the Anthropic API call.

When you run an analysis, your invention description is sent to Anthropic's servers for AI processing. This is the same Claude API you'd be using if you chatted with Claude directly. You should review [Anthropic's data privacy policy](https://www.anthropic.com/policies/privacy) to understand how they handle API data.

Key points:
- PatentForge itself stores everything in a local SQLite database on your machine
- No data goes to PatentForge's servers (there aren't any)
- You use your own Anthropic API key, so you have a direct relationship with Anthropic
- No telemetry, analytics, or phone-home behavior

For pre-filing confidentiality, this is about as good as it gets for an AI-powered tool. But as always, discuss your confidentiality approach with your patent attorney.

### Post 3

**Title:** Can I use PatentForge output as-is for a patent filing?

**Body:**

**No.** PatentForge output is research to help you prepare for a consultation with a patent attorney. It is not a patent application, not a legal opinion, and not a substitute for professional legal counsel.

The AI can and does make mistakes — including fabricating patent numbers, misinterpreting case law, and presenting incorrect analysis with high confidence. Every finding should be independently verified by a qualified patent attorney.

Think of PatentForge like doing homework before a meeting. You'll walk in with your invention clearly described, related prior art identified, and smart questions ready. Your attorney still does the legal work.

---

## Category: Ideas / Feature Requests

### Post 1

**Title:** What features would make this more useful for your attorney meeting?

**Body:**

I'm planning the post-v1.0 roadmap and would love input from people who've actually been through the patent process.

Some features I'm considering:
- **USPTO data integration** — pull in more structured patent data (classifications, citation trees, examiner statistics)
- **AI-assisted claim drafting research** — not actual claims, but structured analysis of what claim directions look like given the landscape
- **Comparison runs** — save multiple versions of your invention description and compare how the analysis changes
- **Attorney export customization** — let you configure what sections to include/exclude in the exported report

What would have been most valuable during your own patent journey? What questions did you not know to ask?

### Post 2

**Title:** International patent landscape support?

**Body:**

Right now PatentForge focuses on U.S. patent law (35 USC). I'm curious whether there's interest in:
- EPO (European Patent Office) landscape analysis
- PCT (Patent Cooperation Treaty) filing indicator analysis
- Jurisdiction comparison (US vs. EU vs. Japan vs. China)

This would be a significant expansion of the prompt system and prior art search. If you've dealt with international filings, what would be most helpful?

---

## Category: General

### Title: Welcome — How to Get Started and Where to Get Help

**Body:**

Welcome to the PatentForge community! Here are some quick pointers:

**Getting started:**
1. [README](https://github.com/scottconverse/patentforge/blob/master/README.md) — installation and quick start
2. [User Manual](https://github.com/scottconverse/patentforge/blob/master/USER-MANUAL.md) — step-by-step guide written for non-technical users
3. [Architecture](https://github.com/scottconverse/patentforge/blob/master/ARCHITECTURE.md) — how the system works under the hood

**Where to get help:**
- **Q&A** board — for specific questions about setup, usage, or behavior
- **Ideas** board — for feature suggestions and roadmap input
- **Bug reports** — use [GitHub Issues](https://github.com/scottconverse/patentforge/issues)

**Important reminder:** PatentForge is a research tool, not a legal service. Please read the [Legal Notice](https://github.com/scottconverse/patentforge/blob/master/LEGAL_NOTICE.md) before using the tool. Always consult a patent attorney before making filing decisions.

**Want to contribute?** Check out [CONTRIBUTING.md](https://github.com/scottconverse/patentforge/blob/master/CONTRIBUTING.md) for development setup and guidelines.

Looking forward to hearing from you!

---

## Category: Announcements — Release Notes

*Post each of these as a new Announcements discussion when the version ships.*

### Title: v0.1.0 — Initial Release

**Body:**

PatentForge v0.1.0 is the first public release. A complete 6-stage AI patent research pipeline with real-time streaming, invention intake form, HTML export, web search for prior art, rate limit handling, settings management, and Docker Compose deployment. Three-service architecture: NestJS backend, Express feasibility service, and React frontend.

### Title: v0.2.0 — Prior Art Search, Cost Tracking, Word Export

**Body:**

Big update. PatentsView API integration for automated prior art search with Haiku-powered query extraction and relevance scoring. LiteLLM dynamic pricing with cost confirmation before every run. Resume from interrupted stages. DOCX table rendering and Word download. SSE keepalive heartbeat prevents idle drops. Token streaming throttle prevents browser freeze.

### Title: v0.2.1 — Legal Guardrails

**Body:**

Added first-run disclaimer modal (unskippable clickwrap agreement), API key entry disclaimer on Settings page, and persistent export watermarks on all generated reports (HTML, Word, on-screen).

### Title: v0.2.2 — UPL Risk Mitigation

**Body:**

Comprehensive prompt language overhaul. AI now identifies as "patent landscape research assistant" instead of role-playing as an attorney. Assessment labels softened from "FILE NOW" to "INDICATORS FAVOR FILING" (later further refined to "LANDSCAPE FAVORS FILING" in v0.9.1). Stage disclaimers embedded in every output. Added LEGAL_NOTICE.md and dual licensing (MIT code, CC BY-SA 4.0 prompts so disclaimers survive forks).

### Title: v0.3.0 — USPTO Patent Detail, Stage Re-run, CSV Export

**Body:**

Click any prior art result to see a slide-out drawer with full patent data: dates, assignees, inventors, CPC classifications, abstract, and claims. Individual stage re-run without restarting the full pipeline. CSV export for prior art results. All enriched data cached locally for 30 days.

Note: PatentsView API was shut down during this release. Prior art search temporarily unavailable — AI web search in Stage 2 still works. Full ODP integration in v0.3.1.

### Title: v0.3.1 — USPTO Open Data Portal Integration

**Body:**

Replaces the shut-down PatentsView API with the new USPTO Open Data Portal. Prior art search and patent detail enrichment are back, now using the ODP API at data.uspto.gov. Add your free ODP API key in Settings to enable structured patent search. Without a key, AI web search in Stage 2 still handles prior art research. 86 automated tests.

### Title: v0.3.2 — Patent Claims Viewer

**Body:**

PatentForge can now show you the actual claims text for any prior art patent, right in the detail drawer.

**How it works:** When you click a prior art result and expand the "Claims" section, PatentForge fetches the patent's claims directly from the USPTO Documents API. It downloads the file wrapper, finds the most recent claims document, parses the ST96 XML, and displays the active (non-canceled) claims with a loading spinner while it works.

**Requirements:** You need a free USPTO Open Data Portal API key (get one at data.uspto.gov). Without a key, the existing "View on Google Patents" link still works.

This is one API call per patent, on-demand only. Your key, your quota.

### Title: v0.3.3 — Hardening: E2E Tests, Type Safety, DOCX Parser, Security

**Body:**

This release is all about quality and reliability — no new features, just making the existing ones more solid.

- **Playwright E2E test suite** — 21 browser tests covering navigation, project lifecycle, invention form, settings, and prior art panel. Tests capture screenshots, check browser console for errors, and verify responsive layout at mobile viewport. Runs automatically.
- **Type safety fix** — replaced loose `any` types in the feasibility service with proper Prisma types. Catches field-name typos at compile time instead of silently ignoring them.
- **DOCX parser improvements** — Word exports now handle italic text, inline code, numbered lists, and nested bullets correctly.
- **CORS restriction** — the internal feasibility service now only accepts requests from the backend, not any origin.
- **Interleaved-thinking header** — no longer sent to Haiku models that don't support it.

### Title: v0.4.0 — AI-Assisted Claim Drafting

**Body:**

The biggest feature since launch. PatentForge can now generate patent claim drafts using a 3-agent AI pipeline (Planner, Writer, Examiner) built with Python + LangGraph. Claims tab with editable text, UPL acknowledgment modal, DRAFT watermarks, collapsible strategy and examiner feedback. 3 independent claims (broad/medium/narrow) plus dependents, capped at 20 total. 40 Python tests.

### Title: v0.4.0 Hardening — 20-Issue Security and Reliability Audit

**Body:**

Following an independent technical review, we resolved all 20 identified issues:

**Security:** Server-side cost cap enforcement (pre-flight + mid-pipeline), internal service authentication via shared secret, API key removed from browser request bodies, path traversal prevention on export, HTML injection fix in report titles, timing-safe token comparison, per-installation encryption salt stored in database.

**Reliability:** Concurrent claim draft guard, stuck RUNNING draft cleanup on startup, structured JSON examiner verdict (replaces fragile string matching), per-agent 120s timeout, typed request bodies, input validation DTOs on all endpoints, prior art context size limits.

**CI/Testing:** Claim-drafter pytest added to CI and cleanroom script, Playwright E2E browser tests added to CI, 303 total tests across 4 layers.

**Correctness:** ODP scoring bias correction for title-only results, no silent model defaults (user must choose), inconsistent fallbacks removed.

### Title: v0.3.4 — Scoring, Encryption, CI, Auth

**Body:**

Five improvements focused on security, code quality, and developer experience:

1. **Smarter prior art scoring** — common patent stop-words ("comprising", "wherein", "apparatus", etc.) are now filtered out. Title matches score 2x higher than abstract matches. Less noise, more signal.

2. **API key encryption at rest** — your Anthropic and USPTO API keys are now encrypted with AES-256-GCM using a machine-derived key before being stored in the database. The plaintext key never hits disk.

3. **Prompt integrity checking** — SHA-256 hashes of all prompt files are computed at startup and logged. If a prompt file is modified while the service is running, you'll get a warning. Hashes are also available on the `/health` endpoint.

4. **GitHub Actions CI** — automated test pipeline runs Jest (backend), Vitest (frontend), and a full build check on every push and PR.

5. **Optional authentication** — set the `PATENTFORGE_TOKEN` environment variable to require Bearer token auth on all API requests. Off by default for single-user local installs, available for anyone running PatentForge on a network.

187 total tests across 3 layers. The foundation is solid for v0.4 (claim drafting).

---

### Title: v0.4.1 — Claim Tree Visualization & Patent Family Lookup

**Body:**

Two additions to the claim drafting workflow:

1. **Claim tree visualization** — SVG-based hierarchical view of patent claims showing independent/dependent relationships. Toggle between list and tree views in the Claims tab.

2. **Patent family tree lookup** — continuity data (parents, children, continuations, divisionals) fetched from the USPTO Open Data Portal and displayed in the patent detail drawer. Results cached with 30-day TTL.

Also fixed a flaky E2E test caused by a Vite proxy race condition during teardown.

---

### Title: v0.5.0 — Compliance Checking

**Body:**

New in v0.5.0: automated compliance checking for patent claim drafts.

Four specialized checker agents validate claims against legal requirements:

1. **35 USC 112(a)** — written description adequacy
2. **35 USC 112(b)** — definiteness (antecedent basis, ambiguous terms)
3. **MPEP 608** — formalities (claim format, numbering, dependency chains)
4. **35 USC 101** — patent eligibility (Alice/Mayo framework)

Results show as a traffic-light report (PASS/FAIL/WARN) per claim with MPEP citations and actionable fix suggestions. You can edit claims and re-check to verify fixes.

Also added: individual claim regeneration and prior art overlap warnings on claims whose terms match known prior art references.

New compliance-checker service runs on port 3004 (Python + FastAPI + LangGraph), authenticated via the same internal service secret as claim-drafter.

### Title: v0.5.1 — Public Release Polish

**Body:**

v0.5.1 is a patch release focused on production readiness and polish.

**Fixed:**
- Hardcoded localhost URLs in Prior Art panel (broke any non-localhost deployment)
- CORS now configurable via `ALLOWED_ORIGINS` env var across all services
- Claim parser stops at AI-appended revision notes instead of including them in claim text
- Report iframe shows loading spinner instead of blank flash
- Consistent button labels ("Re-run" everywhere)
- Accessibility: aria-labels on spinners, keyboard nav for claim tree, status roles on toasts

**Improved:**
- PatentForge.ps1 launcher auto-installs missing npm dependencies, verifies all ports after startup
- README quick start covers all 5 services with troubleshooting section
- CONTRIBUTING.md fixed for current 5-service architecture
- Added `.env.example` documenting all configurable environment variables

### Title: v0.5.2 — Quality Patch (13 Items from Tech/UI/QA Review)

**Body:**

v0.5.2 addresses 13 specific items identified in an external tech/UI/QA review. No new features — all polish and hardening.

**Highlights:**
- Shared `<Alert>` component replaces inconsistent error styling across 5 components
- Styled delete confirmation modal replaces browser `confirm()` dialog
- Claim editing now discoverable: pencil icon on hover, text cursor, border highlight
- Tablet-responsive layout at 768px breakpoint
- Encryption self-test on startup warns loudly if database was moved between machines
- Prior-art API calls now timeout at 60 seconds instead of hanging indefinitely
- Docker Compose no longer ships with a default internal secret — must be generated
- CI now tests the compliance-checker service
- 396 automated tests (up from 394)

### Title: v0.6.0 — Full Application Document Assembly

**Body:**

v0.6.0 ships the application generator — PatentForge can now draft a full patent application document from your feasibility analysis and claim drafts.

**What's new:**
- New `application-generator` service (Python/FastAPI, port 3003) with a 5-node LangGraph pipeline
- Generates cover sheet, specification, abstract, description of drawings, and detailed description
- Prior art IDS table (PTO/SB/08 format) included automatically
- Export to Word (.docx) or Markdown
- Wired into Docker Compose and local launchers (PatentForge.ps1 / PatentForge.bat)

### Title: v0.7.0 — One-Click Installer

**Body:**

PatentForge now has a proper installer. Download, double-click, and you're running — no Node.js, Python, or git required.

**What's included:**
- **Windows installer** (.exe via Inno Setup) — full installer with Start Menu shortcuts and uninstaller
- **Mac installer** (.dmg, beta) — drag to Applications
- **Linux installer** (.AppImage, beta) — chmod +x and run
- **System tray app** (Go) — manages all 6 services with health monitoring, auto-restart on crash, and log rotation
- **Node SEA binaries** — backend and feasibility compiled to standalone executables (no Node.js runtime)
- **Portable Python 3.12** — bundled for the 3 Python services
- **First-run wizard** — walks new users through API key setup on first launch
- **CI release workflow** — GitHub Actions builds all 3 platform installers automatically on tag push

Download from the [Releases page](https://github.com/scottconverse/patentforge/releases/latest). Mac and Linux are beta — please report issues.

### Title: v0.6.1 — Hardening Patch

**Body:**

v0.6.1 is a hardening patch based on an external sprint review. No new features — just making the existing stack safer and more accessible.

**What changed:**
- Docker no longer runs `--accept-data-loss` on startup — schema changes that would drop data now fail explicitly
- Backend port is configurable via `PORT` environment variable (default: 3000)
- Backend validates environment on boot and fails fast with actionable error messages
- Runtime source maps enabled — stack traces now point to TypeScript source, not compiled JS
- Form labels properly linked to inputs for screen readers and keyboard navigation
- Disclaimer modal has correct ARIA dialog semantics
- New Playwright E2E test exercises the real first-run disclaimer flow (no localStorage bypass)
- Removed deprecated `version` key from docker-compose.yml
