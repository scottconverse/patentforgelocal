# Contributing to PatentForge

Thank you for your interest in contributing to PatentForge! This guide will help you get set up and submitting changes.

## Development Setup

### Prerequisites

- **Node.js** 18+ (recommended: 20 LTS)
- **Python** 3.11+ (for the claim-drafter, compliance-checker, and application-generator services)
- **npm** 9+
- **Git**
- **Anthropic API key** (for running the feasibility and claim drafting pipelines)

Optional:
- **Docker** and **Docker Compose** (for containerized deployment)
- **PostgreSQL 16** (if not using SQLite for development)

### Getting Started

1. **Clone the repo**
   ```bash
   git clone https://github.com/scottconverse/patentforge.git
   cd patentforge
   ```

2. **Install git hooks** (required — blocks pushes that fail verification)
   ```bash
   bash scripts/install-hooks.sh
   ```
   This installs a `pre-push` hook that runs `scripts/verify-release.sh` before every push. If any check fails, the push is blocked. To bypass in an emergency: `SKIP_VERIFY=1 git push`.

3. **Install dependencies** (all six services)
   ```bash
   cd backend && npm ci && cd ..
   cd services/feasibility && npm ci && cd ../..
   cd services/claim-drafter && pip install -e ".[dev]" && cd ../..
   cd services/compliance-checker && pip install -e ".[dev]" && cd ../..
   cd services/application-generator && pip install -e ".[dev]" && cd ../..
   cd frontend && npm install && cd ..
   ```

   > **Note:** The frontend uses `npm install` (not `npm ci`) because esbuild includes platform-specific optional binaries. A lockfile generated on one OS won't contain binaries for other platforms, causing `npm ci` to fail with `EBADPLATFORM`. The backend and feasibility services don't have this issue and can use `npm ci`.

4. **Set up the database**
   ```bash
   cd backend
   # Create .env for local SQLite dev (the repo-root .env.example targets PostgreSQL/Docker)
   echo 'DATABASE_URL="file:./prisma/dev.db"' > .env
   npx prisma db push
   npx prisma generate
   cd ..
   ```

5. **Start all services**

   On Windows, run the launcher from the project root:
   ```
   PatentForge.bat
   ```

   Or start each service manually in separate terminals:
   ```bash
   # Terminal 1 — Backend (port 3000)
   cd backend && npm run build && npm run start

   # Terminal 2 — Feasibility service (port 3001)
   cd services/feasibility && npm run build && npm run start

   # Terminal 3 — Claim drafter (port 3002)
   cd services/claim-drafter && py -m uvicorn src.server:app --port 3002

   # Terminal 4 — Application generator (port 3003)
   cd services/application-generator && py -m uvicorn src.server:app --port 3003

   # Terminal 5 — Compliance checker (port 3004)
   cd services/compliance-checker && py -m uvicorn src.server:app --port 3004

   # Terminal 6 — Frontend (port 8080)
   cd frontend && npm run dev
   ```

6. **Open the app** at http://localhost:8080

7. **Configure your API key** in Settings (gear icon) before running any analysis.

### Docker Setup (optional alternative)

Docker is not required for local development. The `PatentForge.bat` launcher handles starting all services locally. Docker is available as an alternative if you prefer containerized deployment.

```bash
docker compose up --build
```

This starts the backend, feasibility service, frontend, and PostgreSQL. Open http://localhost:8080.

## Project Structure

```
patentforge/
├── backend/              # NestJS + Prisma central backend (port 3000)
│   ├── prisma/           # Database schema and migrations
│   └── src/              # Controllers, services, modules
├── services/
│   ├── feasibility/      # Express feasibility pipeline service (port 3001)
│   │   └── src/prompts/  # Stage prompt templates (markdown)
│   ├── claim-drafter/    # Python + LangGraph claim drafting service (port 3002)
│   │   ├── src/agents/   # Planner, Writer, Examiner agents
│   │   ├── src/prompts/  # Agent prompt templates (CC BY-SA 4.0)
│   │   └── tests/        # pytest test suite
│   ├── application-generator/ # Python + LangGraph application assembly service (port 3003)
│   │   ├── src/agents/   # 5-agent pipeline (background, summary, description, abstract, IDS)
│   │   ├── src/prompts/  # Agent prompt templates
│   │   └── tests/        # pytest test suite
│   └── compliance-checker/ # Python + LangGraph compliance checking service (port 3004)
│       ├── src/agents/   # 112a, 112b, 608, 101 checker agents
│       ├── src/prompts/  # Checker prompt templates
│       └── tests/        # pytest test suite
├── frontend/             # React + Vite + Tailwind frontend (port 8080)
│   └── src/
│       ├── pages/        # Route-level page components
│       └── components/   # Shared UI components
└── docs/                 # GitHub Pages landing page
```

## Running Tests

**GitHub Actions CI** runs backend, frontend, claim-drafter, and compliance-checker tests automatically on every push and PR.

```bash
# Backend unit tests (Jest)
cd backend && npm test

# Frontend unit tests (Vitest)
cd frontend && npm test

# Claim drafter tests (pytest — use py on Windows)
cd services/claim-drafter && py -m pytest tests/ -v

# Compliance checker tests (pytest)
cd services/compliance-checker && py -m pytest tests/ -v

# Browser E2E tests (Playwright — requires services running)
cd frontend && npx playwright test

# Cleanroom E2E (full nuke-and-rebuild + API smoke tests)
bash scripts/cleanroom-e2e.sh
```

### Playwright E2E Setup

The E2E tests launch all six services (backend, feasibility, claim-drafter, application-generator, compliance-checker, frontend) automatically via Playwright's `webServer` config. Tests run with `workers: 1` because they share a SQLite database that can't handle concurrent writes.

First run requires Chromium and Python dependencies:

```bash
cd services/claim-drafter && pip install . && cd ../..
cd services/compliance-checker && pip install . && cd ../..
cd frontend && npx playwright install chromium
```

E2E tests capture screenshots to `frontend/e2e-screenshots/` (gitignored), check browser console for errors, and test at both desktop and mobile viewports.

## Building the Installer

PatentForge v0.7.0+ includes platform-specific installers. To build them locally:

### Prerequisites

- **Go 1.21+** — for compiling the system tray app (`tray/`)
- **Node.js 20+** — for building Node SEA (Single Executable Application) binaries
- **Inno Setup 6** (Windows only) — for building the Windows `.exe` installer
- **Python 3.12** — a portable distribution is bundled in the installer

### Build Steps

```bash
# 1. Build the system tray app (Go)
cd tray && go build -o ../build/patentforge-tray.exe . && cd ..

# 2. Build Node SEA binaries (backend + feasibility)
cd backend && node --experimental-sea-config sea-config.json && cd ..
cd services/feasibility && node --experimental-sea-config sea-config.json && cd ../..

# 3. Build the frontend (static assets served by backend in production)
cd frontend && npm run build && cd ..

# 4. Build the Windows installer (requires Inno Setup)
iscc installer/patentforge.iss
```

The CI release workflow (`.github/workflows/release.yml`) automates this for all 3 platforms on tag push.

### Installer Structure

```
build/
├── patentforge-tray.exe    # Go tray app (service manager)
├── backend.exe             # Node SEA binary (NestJS backend)
├── feasibility.exe         # Node SEA binary (feasibility service)
├── python/                 # Portable Python 3.12
├── frontend/               # Built React static files
└── services/               # Python service source (claim-drafter, etc.)
```

## Making Changes

1. **Create a branch** from `master`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes.** Follow existing code patterns and conventions.

3. **Test your changes** — run the app locally and verify the feature works end-to-end.

4. **Commit** with a meaningful message:
   ```bash
   git commit -m "feat: add description of your change"
   ```

5. **Push and open a PR** against `master`.

## Commit Message Format

We use conventional commit prefixes:

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation only
- `refactor:` — code change that neither fixes a bug nor adds a feature
- `chore:` — build process, dependency updates, etc.

## Code Style

- **TypeScript** for backend, feasibility service, and frontend
- **Python** for the claim-drafter service (FastAPI, LangGraph, pytest)
- **Tailwind CSS** for styling (no custom CSS files unless necessary)
- **NestJS conventions** for backend (controllers, services, modules, DTOs)
- **React functional components** with hooks
- **No TODO/FIXME comments** — either fix the issue or open a GitHub issue

### Linting and Formatting

Both backend and frontend enforce code style with ESLint and Prettier. Run these before committing:

```bash
# Backend
cd backend && npm run lint && npm run format:check

# Frontend
cd frontend && npm run lint && npm run format:check
```

To auto-fix issues:

```bash
cd backend && npm run lint:fix && npm run format
cd frontend && npm run lint:fix && npm run format
```

CI will fail if lint errors are present.

### Test Coverage

Coverage thresholds prevent silent regression. CI fails if coverage drops below the baseline.

```bash
# Run with coverage
cd backend && npm run test:cov
cd frontend && npm run test:cov
```

Current baselines (updated 2026-04-07, v0.9.0):
- Backend: lines 44%, branches 38%, functions 32%, statements 43%
- Frontend: lines 38%, branches 38%, functions 32%, statements 38%

When adding new code, add tests. When the baseline increases, update the thresholds in `backend/jest.config.js` and `frontend/vite.config.ts`.

## Architecture Notes

PatentForge uses a federated service architecture. Each capability (feasibility analysis, prior art search, claim drafting, etc.) is an independent service that communicates with the central backend over HTTP/SSE. See [ARCHITECTURE.md](ARCHITECTURE.md) for full details.

When adding a new service:
1. Create a new directory under `services/`
2. Create an adapter in `backend/src/` to connect it
3. Add it to `docker-compose.yml`
4. Update the architecture documentation

## Reporting Issues

Use [GitHub Issues](https://github.com/scottconverse/patentforge/issues) for bug reports and feature requests. Include:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Browser/OS/Node version if relevant

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
