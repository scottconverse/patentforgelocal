# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in PatentForge, please report it by opening a [GitHub issue](https://github.com/scottconverse/patentforge/issues) marked with the **security** label. Do not include sensitive details in the title. We will respond within 72 hours.

---

## Known npm Vulnerabilities — Current Stance (v0.9.0)

PatentForge's `npm audit` reports vulnerabilities in both `frontend/` and `backend/`. These are documented here for transparency. None are actionable without breaking changes or waiting on upstream fixes.

### Backend (20 vulnerabilities: 4 low, 9 moderate, 7 high)

All 20 are **transitive dependencies of the NestJS framework** and its bundled tooling. PatentForge does not directly use the vulnerable packages — they are pulled in by `@nestjs/cli`, `@nestjs/platform-express`, and `@nestjs/core`.

| Root cause | Affected packages | Notes |
|---|---|---|
| `path-to-regexp` ReDoS | `@nestjs/serve-static`, `@nestjs/core` | NestJS v10 pulls this in; fixed in NestJS v11+ but v11 is a breaking migration |
| `multer` (file upload) | `@nestjs/platform-express` | PatentForge does not use file uploads; multer is bundled with the express adapter regardless |
| `picomatch` glob | `@angular-devkit/*` (NestJS CLI) | Dev-tooling only; not in the production bundle |
| `webpack` build-time SSRF | `@nestjs/cli` | Dev-tooling only; the `buildHttp` plugin is not used |
| `ajv` JSON schema | `@angular-devkit/core` | Dev-tooling only |
| `file-type` detection | `@nestjs/common` | Read-only detection; no untrusted file upload path exists in PatentForge |
| `tmp` / `external-editor` | `inquirer` (CLI prompt lib) | Dev-tooling only; not shipped |

**Why not fixed:** Resolving these requires either (a) upgrading NestJS to v11, which is a breaking API migration not yet scheduled, or (b) waiting for the NestJS maintainers to release patched v10.x builds. We track this in [GitHub Issue #18](https://github.com/scottconverse/patentforge/issues/18).

**Risk to users:** PatentForge runs as a **local application** with no public internet exposure. The backend binds to `localhost` only. Attack vectors that depend on a publicly reachable server (SSRF, remote ReDoS at scale, build-time injection) do not apply to this deployment model.

### Frontend (2 vulnerabilities: 1 moderate, 1 high)

| Root cause | Affected packages | Notes |
|---|---|---|
| `esbuild` dev server CORS | `vite`, `vitest` | Development server only — allows any website to read responses from the local dev server |

**Why not fixed:** The fix requires upgrading to Vite v8.x, which is a breaking change to the build toolchain. The vulnerability **only affects the development server** (`npm run dev`). Production installs of PatentForge do not run a Vite dev server — they use the pre-built static bundle.

**Risk to users:** End users running PatentForge via the installer are not affected. Developers running `npm run dev` locally should be aware that the Vite dev server is reachable by other tabs/sites in the same browser session.

---

## Planned Remediation

- **NestJS v11 migration** — tracked on the v0.9.x roadmap. Will resolve the majority of backend HIGH/MODERATE findings.
- **Vite v8 upgrade** — will be evaluated alongside the NestJS migration to avoid compounding breaking changes.

This document will be updated when either migration ships.
