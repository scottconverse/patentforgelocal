# PatentForge v0.9.2 — QA Recheck & Sprint 3 Session Context

**Date:** 2026-04-07
**Purpose:** Starting context for a fresh Sonnet session to complete QA recheck and continue to Sprint 3
**Prepared by:** Previous Opus session

---

## Where We Are

PatentForge v0.9.2 is pushed to GitHub but has **outstanding QA debt** that must be resolved before continuing to Sprint 3. The previous session committed frontend changes before completing browser QA — this was a process violation of the CLAUDE.md rules.

- **Working copy:** `C:\Users\scott\OneDrive\Desktop\Claude\patentforge-cleanroom`
- **Latest commit:** f50b45c (feat: add mock SSE E2E tests + no-push-without-approval hard gate)
- **Branch:** master, pushed to origin
- **Tests:** 799 (304 Jest + 202 Vitest + 238 pytest + 55 Playwright E2E) — all pass
- **verify-release.sh:** 36/36 PASS on previous run (but test count will change after new E2E tests)

---

## TASK 0: Fix Known Bugs From External Review (MUST DO BEFORE QA)

An external review identified these real issues. Fix ALL of them before running QA:

### Bug 1: README download links point to v0.9.0
- **File:** `README.md` lines 44-46
- **Problem:** Download table links to `PatentForge-0.9.0-Setup.exe`, `.dmg`, `.AppImage`
- **Fix:** Update to `PatentForge-0.9.2-*`

### Bug 2: ARCHITECTURE.md is stale
- **File:** `ARCHITECTURE.md`
- **Problem:** Version header says 0.9.0, figure caption says v0.6.0, and the document explicitly admits "The actual v0.6.0 implementation differs in several ways" with specific discrepancies (Prior Art handled by backend not separate service, no standalone USPTO Data service, MPEP RAG uses LangGraph not FAISS/BM25, Application Generator not shown in diagram)
- **Fix:** Update version to 0.9.2, update or remove the "differs" disclaimer by correcting the architecture description, update the figure caption, add Application Generator (port 3003) to the architecture description

### Bug 3: Prisma sqlite provider vs Docker PostgreSQL mismatch
- **File:** `backend/prisma/schema.prisma` has `provider = "sqlite"`, `docker-compose.yml` injects `DATABASE_URL: postgresql://...`
- **Problem:** Prisma will fail to connect to PostgreSQL with an sqlite provider. Docker deployment is broken.
- **Fix:** Either (a) add a separate `schema.docker.prisma` with `provider = "postgresql"` and a Docker build step that swaps it, or (b) use an environment variable to switch providers, or (c) document that Docker requires a schema edit. Option (a) is cleanest — add a docker-specific schema and a Dockerfile step that copies it over the sqlite schema before `prisma generate`.

### Bug 4: Default internal secret is a known public value
- **File:** `README.md` documents this. Backend code at `backend/src/main.ts` or `.env.example`
- **Problem:** `INTERNAL_SERVICE_SECRET` defaults to `patentforge-internal` which is committed to the repo. Any attacker who reads the source code knows the secret.
- **Fix:** Generate a random secret at install/first-run time instead of using a hardcoded default. The installer (`PatentForge.ps1`) should generate one with `openssl rand -hex 32` or equivalent. For Docker, the `docker-compose.yml` should require the secret be set (fail if missing, don't default).

After fixing all 4 bugs: run all test suites, verify they pass, then proceed to Task 1.

---

## TASK 1: Full QA Recheck (MUST DO FIRST)

### What needs to happen:

1. **Run the new mock SSE E2E tests** — `frontend/e2e/sse-progress.spec.ts` contains 3 Playwright tests that mock SSE stream endpoints for Claims, Compliance, and Application tabs. These tests were written but NOT RUN yet. They must pass before anything else.

   ```bash
   # Start backend first
   cd backend && npm run build && node --env-file=.env dist/main.js &
   # Start frontend dev server
   cd frontend && npx vite --port 8080 --strictPort &
   # Wait for both to be ready, then:
   cd frontend && npx playwright test e2e/sse-progress.spec.ts
   ```

2. **Browser QA — StepProgress component**: Navigate to the Claims, Compliance, and Application tabs and verify the StepProgress component renders correctly. Since there's no live API key, the SSE endpoints will return errors and the frontend should fall back to the existing polling pattern. Verify:
   - Claims tab: shows "Draft Claims" button or prerequisite message
   - Compliance tab: shows "Run Compliance Check" button or prerequisite message
   - Application tab: shows "Generate Application" button or prerequisite message
   - No console errors on any tab
   - The error states are actionable (not blank screens)

3. **Browser QA — Claims lazy-load**: Create test data via API:
   ```bash
   # Create a claim draft with claims via direct DB/API manipulation
   # Then navigate to Claims tab and verify:
   # - Claims show preview text in collapsed state
   # - Expanding a claim triggers /claims/text/:id fetch
   # - Full text loads and displays
   # - Re-collapsing and re-expanding doesn't re-fetch (cached)
   ```

4. **Viewport checks**:
   - Desktop (1280px) — all tabs render correctly
   - Mobile (375px) — sidebar collapsed, content visible, no overflow
   - Tablet (768px) — intermediate layout works

5. **Console clean** — zero errors through all navigation and interactions

6. **Fix any bugs found** — if QA finds bugs, fix them, re-run all tests, re-verify in browser. Do NOT push a fix without completing the full QA cycle again.

### If all QA passes:

Update verify-release.sh test count if needed (new E2E tests change the total). Run `bash scripts/verify-release.sh` and confirm 36/36 PASS. Then report to user: "QA recheck complete. Ready to push — awaiting your approval."

**DO NOT PUSH without user approval.** This is a HARD GATE in CLAUDE.md.

---

## TASK 2: Sprint 3 (v0.9.3) — Security & Dependency Hardening

Only start this after Task 1 is fully complete and user has approved any needed push.

### S3-1: NestJS v11 Migration
- **GitHub Issue #18** tracks this
- Resolves 7 of 8 HIGH npm vulns in backend
- Breaking API migration: decorators, module loading, platform-express changes
- **All 304 Jest tests must pass after migration**
- Read `SECURITY.md` for the current vuln stance
- Key file: `backend/src/main.ts` (entry point)
- This is the highest-risk task — isolate it, don't mix with features

### S3-2: Vite v8 Upgrade
- Resolves esbuild dev-server CORS vuln in frontend
- Typically config-level changes (vite.config.ts)
- **All 202 Vitest tests must pass after upgrade**
- May need to update vitest version too

### S3-3: API Key Encryption at Rest
- Currently: API key stored in SQLite settings table, encrypted with AES-256-GCM
- Already implemented in v0.3 — verify it's still working correctly
- The patent-analyzer-app uses Windows DPAPI — not applicable to our cross-platform approach
- **May already be done** — check `backend/src/settings/settings.service.ts` for encrypt/decrypt

### S3-4: Standardize Retry/Backoff
- Backend's `callApplicationGenerator()` has raw 15-min timeout with no retry
- All service-to-service calls should use exponential backoff: 60s/90s/120s on 429/502/503
- Pattern from patent-analyzer-app's AnthropicClient.cs
- Files: `backend/src/feasibility/feasibility.service.ts`, `backend/src/claim-draft/claim-draft.service.ts`, `backend/src/compliance/compliance.service.ts`, `backend/src/application/application.service.ts`

### Sprint 3 Process Requirements:
- Implementation plan with numbered QA tasks BEFORE coding
- Tests for every logic change
- Browser QA BEFORE any frontend commit (even if "just config changes")
- verify-release.sh 36/36 PASS
- cleanroom-e2e.sh full run
- Report "Ready to push" and WAIT for user approval

---

## TASK 3: Sprint 4 (v1.0.0) — Polish & Release

Only after Sprint 3 is complete and pushed.

### S4-1: Settings save floating toast (replace inline banner)
### S4-2: Prior art result count configuration (currently hardcoded 25×3)
### S4-3: Mobile/responsive Playwright tests (375px + 768px critical paths)
### S4-4: astream loop state integrity assertion (prevent APP-SECTIONS regression)
### S4-5: Three-repo documentation sync
### S4-6: Final cleanroom E2E + verify-release + patentforge-release-checklist

---

## Key Architecture Reference

| Service | Port | Language | SSE Endpoint |
|---------|------|----------|-------------|
| Backend | 3000 | NestJS/TypeScript | /feasibility/stream, /claims/stream, /compliance/stream, /application/stream |
| Feasibility | 3001 | Express/TypeScript | POST /analyze |
| Claim Drafter | 3002 | FastAPI/Python | POST /draft (SSE) + /draft/sync |
| Compliance | 3004 | FastAPI/Python | POST /check/stream (SSE) + /check (sync) |
| App Generator | 3003 | FastAPI/Python | POST /generate (SSE) + /generate/sync |
| Frontend | 8080 | React/Vite | — |

## Key Files Changed in v0.9.2

### Python SSE (realtime step events):
- `services/claim-drafter/src/server.py` — /draft endpoint, realtime steps
- `services/claim-drafter/src/graph.py` — stream_claim_pipeline() generator
- `services/compliance-checker/src/server.py` — new /check/stream endpoint
- `services/application-generator/src/server.py` — /generate endpoint, realtime steps
- `services/application-generator/src/cross_references.py` — NEW: regex extraction

### Backend SSE proxy:
- `backend/src/claim-draft/claim-draft.controller.ts` — POST /claims/stream
- `backend/src/claim-draft/claim-draft.service.ts` — prepareDraft(), saveStreamComplete()
- `backend/src/compliance/compliance.controller.ts` — POST /compliance/stream
- `backend/src/compliance/compliance.service.ts` — prepareCheck(), saveStreamComplete()
- `backend/src/application/application.controller.ts` — POST /application/stream
- `backend/src/application/application.service.ts` — prepareGeneration(), saveStreamComplete()

### Frontend SSE:
- `frontend/src/utils/sseStream.ts` — shared SSE parser
- `frontend/src/components/StepProgress.tsx` — shared progress UI
- `frontend/src/components/ClaimsTab.tsx` — SSE-first + polling fallback
- `frontend/src/components/ComplianceTab.tsx` — SSE-first + polling fallback
- `frontend/src/components/ApplicationTab.tsx` — SSE-first + polling fallback
- `frontend/src/api.ts` — getClaimText() for lazy-load

### Claims lazy-load:
- `backend/src/claim-draft/claim-draft.service.ts` — getLatest(full=false), getClaimText()
- `backend/src/claim-draft/claim-draft.controller.ts` — GET /claims?full=true, GET /claims/text/:id
- `frontend/src/components/ClaimsTab.tsx` — loadClaimText(), cache, loading indicator

### Mock SSE E2E tests:
- `frontend/e2e/sse-progress.spec.ts` — 3 tests (claims 3-step, compliance 4-step, application 5-step)

---

## HARD GATES (from CLAUDE.md — read before ANY action)

1. **UX first.** Every decision starts from user experience. Browser-verify before declaring done.
2. **No frontend commit without browser evidence.** QA happens BEFORE the commit, not after.
3. **QA tasks are numbered plan steps.** Not afterthoughts at the end of the plan.
4. **No push without user approval.** Report "Ready to push" and STOP. Wait for explicit "push" from user.
5. **50-word minimum validation** is enforced in both frontend and backend.
6. **Assessment labels** are v1.2.0: LANDSCAPE FAVORS FILING, MORE DOCUMENTATION WOULD STRENGTHEN POSITION, KEEP AS TRADE SECRET, SIGNIFICANT OBSTACLES IDENTIFIED, DESIGN PATENT AVENUE WORTH EXPLORING.

---

## How to Start

1. Read CLAUDE.md in full
2. Read this file
3. Run the mock SSE E2E tests (Task 1, step 1)
4. Do the full browser QA (Task 1, steps 2-5)
5. Fix any bugs found
6. Report results to user
7. Wait for approval before any push
8. Then proceed to Sprint 3
