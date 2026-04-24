# Supervisor Operating Card — PatentForgeLocal

One-page card for Scott (the human supervisor). Not for an AI agent. PatentForgeLocal is a local-first patent research tool (Ollama + Gemma 4, BYOK for any cloud LLM). It is a **research tool, not legal service**. Project is currently at **v0.1.4** (backend/package.json, frontend/package.json, and `installer/windows/patentforgelocal.iss` all agree).

---

## 1. Before every session (30 seconds)

Skim these five things in order:

1. `README.md` — is the top-of-file pitch still "research tool, not legal service"?
2. `LEGAL_NOTICE.md` — confirm the "Not a law firm / not legal advice / no attorney-client relationship" language is intact.
3. `CHANGELOG.md` — read the top `## [Unreleased]` and most recent released section.
4. `git log --oneline -10` — last ten commits; watch for surprise doc regressions.
5. Version sanity — the same version string should appear in **four** places: `backend/package.json`, `frontend/package.json`, `installer/windows/patentforgelocal.iss` (`#define MyAppVersion`), and `CHANGELOG.md` top entry.

---

## 2. During the session — what you actually do

Five concrete actions:

1. **Run the tests that actually exist here.**
   - Backend (NestJS + Jest): `cd backend && npm test` (unit) and `npm run test:integration`
   - Frontend (Vite + Vitest): `cd frontend && npm test`
   - E2E (Playwright): `cd frontend && npx playwright test` — config is `playwright.config.ts` (dev) or `playwright.installed.config.ts` (testing against the built installer).
2. **Lint and typecheck each side before commit.**
   - Backend: `cd backend && npm run lint && npm run format:check`
   - Frontend: `cd frontend && npm run lint && npx tsc --noEmit`
3. **Run the real verify script before any push.**
   - `bash scripts/verify-release.sh` — exists, enforces version consistency across backend/frontend/iss/CHANGELOG. Paste full output. If it fails, fix the failures; do not bypass.
4. **Guard the BYOK flow.** Any change that touches LLM invocation — prompt routing, API key read path, settings UI, connection config — gets explicit scrutiny. BYOK means the user's key lives **only** in their local runtime and settings. It must never appear in logs, telemetry, error messages, crash reports, bundled fixtures, or the installer payload. Treat every LLM change as a secrets-handling change.
5. **Guard UPL-sensitive copy.** Any change to user-facing strings, prompt templates, system prompts, stage disclaimers, or README/landing-page copy requires a UPL pass. Forbidden language anywhere user-facing or in prompts: "attorney", "counsel", "legal advice", "I advise", "my advice", "your lawyer", "as your attorney". Allowed framing: research, exploration, educational, "consult a registered patent attorney before filing/licensing/enforcement/investment".

---

## 3. Hard rules active on this project

All from `~/.claude/CLAUDE.md`. Rules that fire most on PatentForgeLocal are flagged.

1. **Read before you write** — read the file before editing it; re-read after your own edits.
2. **Run before you declare done** — paste actual terminal output, not "should work".
3. **Tests for logic changes** — every logic change updates or adds a Jest/Vitest/Playwright test.
4a. **Never skip tests** — no `test.skip`, `xit`, `describe.skip`, or equivalents. Fix the test or fix the design.
4. **No secrets in client code — CRITICAL HERE.** BYOK keys, provider tokens, USPTO ODP keys must never land in the frontend bundle, backend logs, error responses, the installer payload, fixtures, or git history. `.gitignore` must cover every `.env*` path. This is the rule most likely to bite this project.
5. **Challenge bad requirements — CRITICAL HERE.** Any request that nudges the product toward legal-service framing (attorney role, binding advice, "file this for me") is UPL risk. Push back and propose research-tool framing before building.
6. **Work incrementally** — small verified steps; run tests between them.
7. **No wasteful operations** — don't regenerate whole files when an Edit suffices.
8. **Stay in scope** — report adjacent issues, don't fix them unless asked.
9. **coder-ui-qa-test Documentation Gate — fires on every push.** All six artifacts must exist before `git push` or `gh release`: `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE`, `.gitignore`, `docs/index.html`. `docs/index.html` exists today — don't let it regress.
10. **Subagent Obligation** — 2+ non-overlapping scopes => dispatch parallel subagents, not serial inline edits. Gate blocks the 3rd inline edit. Override phrase (user-only): `override rule 10`.
11. **Commit-Size Acknowledgment Gate** — NOT currently wired in this project (validation phase in civiccore only). If later activated, commits over 800 lines need a literal bracketed token: `[MVP]` / `[LARGE-CHANGE]` / `[REFACTOR]` / `[INITIAL]` / `[MERGE]` / `[REVERT]` / `[SCOPE-EXPANSION: reason]`.

---

## 4. Four-pass gate

See coder-ui-qa-test skill.

---

## 5. Good session ending — project-specific checklist

A session is done on PatentForgeLocal only when all of these are true:

- [ ] **UPL disclaimers intact.** `LEGAL_NOTICE.md` unchanged or strengthened. No "attorney / counsel / legal advice / I advise" language in UI copy, prompt templates, system prompts, or README.
- [ ] **No attorney role language in prompts.** Grep the stage prompt files and system prompts for the forbidden terms listed in section 2.5 above. Zero hits.
- [ ] **BYOK flow tested end-to-end with a real test key.** Launch the app, paste a real test LLM key into settings, run one full stage, confirm output renders. Then confirm the key does not appear in any log file, backend response body, frontend bundle, or crash report.
- [ ] **Backend tests pass:** `cd backend && npm test` green.
- [ ] **Frontend tests pass:** `cd frontend && npm test` green.
- [ ] **Playwright E2E pass** (`cd frontend && npx playwright test`) on the flow(s) you touched, at minimum.
- [ ] **Lint + typecheck clean** both sides: `npm run lint` and `npx tsc --noEmit`.
- [ ] **Version is consistent** across `backend/package.json`, `frontend/package.json`, `installer/windows/patentforgelocal.iss` (`#define MyAppVersion`), and `CHANGELOG.md` top entry.
- [ ] **CHANGELOG.md updated** with a user-readable entry in Keep-a-Changelog format.
- [ ] **`bash scripts/verify-release.sh` green.** Full output pasted.
- [ ] **Installer build green** if you touched `installer/`, `scripts/bundle-*.sh`, `scripts/build-backend-sea.sh`, or anything the Inno Setup `.iss` references — rerun the Windows build path (or confirm CI `release.yml` went green).
- [ ] **Six doc artifacts present** (Rule 9): README, CHANGELOG, CONTRIBUTING, LICENSE, .gitignore, docs/index.html.
- [ ] **Explicit push approval from Scott in the current conversation turn.** No push without it.
