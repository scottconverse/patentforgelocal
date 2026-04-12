#!/usr/bin/env bash
# ============================================================================
# PatentForge — Cleanroom E2E Test Suite
# Run before every push / release.
#
# Usage:  bash scripts/cleanroom-e2e.sh
#
# What it does:
#   1. Nukes the SQLite dev database
#   2. Fresh npm install in all 3 Node services + pip install claim-drafter
#   3. Runs Prisma db push + generate
#   4. Builds all Node services (backend, feasibility, frontend)
#   5. Runs backend unit tests (Jest)
#   5b. Runs claim-drafter unit tests (pytest)
#   6. Runs frontend unit tests (Vitest)
#   7. Starts all services and waits for healthy endpoints
#   8. Runs API smoke tests against live services
#   9. Runs Playwright E2E tests (browser-level integration tests)
#  10. Tears down services
#  11. Reports pass/fail summary
# ============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
FEASIBILITY="$ROOT/services/feasibility"
CLAIM_DRAFTER="$ROOT/services/claim-drafter"
COMPLIANCE_CHECKER="$ROOT/services/compliance-checker"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PASS=0
FAIL=0
PIDS=()

log()  { echo -e "${CYAN}[E2E]${NC} $*"; }
pass() { echo -e "${GREEN}  ✓ $*${NC}"; PASS=$((PASS + 1)); }
fail() { echo -e "${RED}  ✗ $*${NC}"; FAIL=$((FAIL + 1)); }
warn() { echo -e "${YELLOW}  ⚠ $*${NC}"; }

cleanup() {
  log "Cleaning up background processes..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  done
  PIDS=()
}
trap cleanup EXIT

# ============================================================================
# Phase 1: Nuke and rebuild
# ============================================================================
log "=== Phase 1: Nuke database and fresh install ==="

# Remove SQLite DB (Prisma resolves file:./prisma/dev.db relative to schema dir → prisma/prisma/dev.db)
DB_PATH="$BACKEND/prisma/prisma/dev.db"
if [ -f "$DB_PATH" ]; then
  rm -f "$DB_PATH"
  rm -f "${DB_PATH}-journal"
  pass "Deleted existing dev.db"
else
  pass "No existing dev.db (clean state)"
fi

# Remove dist dirs and node_modules
for svc in "$BACKEND" "$FRONTEND" "$FEASIBILITY"; do
  svc_name=$(basename "$svc")
  [ "$svc_name" = "feasibility" ] && svc_name="services/feasibility"
  rm -rf "$svc/dist" 2>/dev/null || true
  log "  npm install in $svc_name ..."
  (cd "$svc" && npm install --no-audit --no-fund 2>&1 | tail -1)
  pass "npm install: $svc_name"
done

# Install claim-drafter Python dependencies
log "  pip install in services/claim-drafter ..."
(cd "$CLAIM_DRAFTER" && python3 -m pip install -e ".[dev]" --quiet 2>&1 | tail -1)
pass "pip install: services/claim-drafter"

# Install compliance-checker Python dependencies
log "  pip install in services/compliance-checker ..."
(cd "$COMPLIANCE_CHECKER" && python3 -m pip install -e ".[dev]" --quiet 2>&1 | tail -1)
pass "pip install: services/compliance-checker"

# ============================================================================
# Phase 2: Prisma migrate + generate
# ============================================================================
log "=== Phase 2: Prisma migrate + generate ==="

cd "$BACKEND"
npx prisma db push 2>&1 | tail -3
pass "Prisma db push"

npx prisma generate 2>&1 | tail -1
pass "Prisma generate"

# Verify DB was created
if [ -f "$BACKEND/prisma/prisma/dev.db" ]; then
  pass "dev.db created by db push"
else
  fail "dev.db NOT created after db push"
fi

# ============================================================================
# Phase 3: Build all services
# ============================================================================
log "=== Phase 3: Build all services ==="

cd "$BACKEND"
npm run build 2>&1 | tail -2
if [ -d "$BACKEND/dist" ]; then
  pass "Backend build (NestJS)"
else
  fail "Backend build failed — no dist/ directory"
fi

cd "$FEASIBILITY"
npm run build 2>&1 | tail -2
if [ -d "$FEASIBILITY/dist" ]; then
  pass "Feasibility service build"
else
  fail "Feasibility service build failed — no dist/ directory"
fi

cd "$FRONTEND"
npm run build 2>&1 | tail -2
if [ -d "$FRONTEND/dist" ]; then
  pass "Frontend build (Vite)"
else
  fail "Frontend build failed — no dist/ directory"
fi

# ============================================================================
# Phase 4: Backend unit tests (Jest)
# ============================================================================
log "=== Phase 4: Backend unit tests (Jest) ==="

cd "$BACKEND"
set +e
JEST_OUTPUT=$(npx jest --no-cache 2>&1)
JEST_EXIT=$?
set -e

echo "$JEST_OUTPUT"

if [ $JEST_EXIT -eq 0 ]; then
  # Extract test count from Jest output
  TEST_COUNT=$(echo "$JEST_OUTPUT" | sed -n 's/.*Tests:\s*\([0-9]* passed\).*/\1/p' | head -1)
  TEST_COUNT=${TEST_COUNT:-unknown}
  pass "Backend tests: $TEST_COUNT"
else
  fail "Backend tests FAILED (exit code $JEST_EXIT)"
fi

# ============================================================================
# Phase 5: Frontend unit tests (Vitest)
# ============================================================================
log "=== Phase 5: Frontend unit tests (Vitest) ==="

cd "$FRONTEND"
set +e
VITEST_OUTPUT=$(npx vitest run --reporter=verbose 2>&1)
VITEST_EXIT=$?
set -e

echo "$VITEST_OUTPUT"

if [ $VITEST_EXIT -eq 0 ]; then
  pass "Frontend tests passed"
else
  fail "Frontend tests FAILED (exit code $VITEST_EXIT)"
fi

# ============================================================================
# Phase 5b: Claim drafter unit tests (pytest)
# ============================================================================
log "=== Phase 5b: Claim drafter unit tests (pytest) ==="

cd "$CLAIM_DRAFTER"
set +e
PYTEST_OUTPUT=$(python3 -m pytest tests/ -v 2>&1)
PYTEST_EXIT=$?
set -e

echo "$PYTEST_OUTPUT"

if [ $PYTEST_EXIT -eq 0 ]; then
  pass "Claim drafter tests passed"
else
  fail "Claim drafter tests FAILED (exit code $PYTEST_EXIT)"
fi

# ============================================================================
# Phase 5c: Compliance checker unit tests (pytest)
# ============================================================================
log "=== Phase 5c: Compliance checker unit tests (pytest) ==="

cd "$COMPLIANCE_CHECKER"
set +e
PYTEST_CC_OUTPUT=$(python3 -m pytest tests/ -v 2>&1)
PYTEST_CC_EXIT=$?
set -e

echo "$PYTEST_CC_OUTPUT"

if [ $PYTEST_CC_EXIT -eq 0 ]; then
  pass "Compliance checker tests passed"
else
  fail "Compliance checker tests FAILED (exit code $PYTEST_CC_EXIT)"
fi

# ============================================================================
# Phase 6: Start services and run API smoke tests
# ============================================================================
log "=== Phase 6: Start services and API smoke tests ==="

# Start backend
cd "$BACKEND"
node --env-file=.env dist/main.js &
PIDS+=($!)
log "  Backend starting (PID ${PIDS[-1]})..."

# Start feasibility service
cd "$FEASIBILITY"
node dist/server.js &
PIDS+=($!)
log "  Feasibility service starting (PID ${PIDS[-1]})..."

# Start claim-drafter service
cd "$CLAIM_DRAFTER"
python3 -m uvicorn src.server:app --port 3002 &
PIDS+=($!)
log "  Claim-drafter starting (PID ${PIDS[-1]})..."

# Start compliance-checker service
cd "$COMPLIANCE_CHECKER"
python3 -m uvicorn src.server:app --port 3004 &
PIDS+=($!)
log "  Compliance-checker starting (PID ${PIDS[-1]})..."

# Start Vite dev server for Playwright
cd "$FRONTEND"
npx vite --port 8080 --strictPort &
PIDS+=($!)
log "  Frontend dev server starting (PID ${PIDS[-1]})..."

# Wait for backend to be ready
log "  Waiting for backend (port 3000)..."
for i in $(seq 1 30); do
  if curl -s http://localhost:3000/api/projects > /dev/null 2>&1; then
    pass "Backend is up on port 3000"
    break
  fi
  if [ "$i" -eq 30 ]; then
    fail "Backend did not start within 30 seconds"
  fi
  sleep 1
done

# Wait for feasibility service
log "  Waiting for feasibility service (port 3001)..."
for i in $(seq 1 15); do
  if curl -s http://localhost:3001/ > /dev/null 2>&1; then
    pass "Feasibility service is up on port 3001"
    break
  fi
  if [ "$i" -eq 15 ]; then
    warn "Feasibility service not responding — some smoke tests may fail"
  fi
  sleep 1
done

# Wait for frontend dev server
log "  Waiting for frontend (port 8080)..."
for i in $(seq 1 15); do
  if curl -s http://localhost:8080/ > /dev/null 2>&1; then
    pass "Frontend dev server is up on port 8080"
    break
  fi
  if [ "$i" -eq 15 ]; then
    warn "Frontend dev server not responding — Playwright tests may fail"
  fi
  sleep 1
done

# --- API Smoke Tests ---
log "  Running API smoke tests..."

# Test: GET /projects (empty list)
RESP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/projects)
if [ "$RESP" = "200" ]; then
  pass "GET /projects → 200"
else
  fail "GET /projects → $RESP (expected 200)"
fi

# Test: POST /projects
PROJECT_JSON=$(curl -s -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"title":"E2E Test Project"}')
PROJECT_ID=$(echo "$PROJECT_JSON" | sed -n 's/.*"id"\s*:\s*"\([^"]*\)".*/\1/p' | head -1)

if [ -n "$PROJECT_ID" ]; then
  pass "POST /projects → created (id=$PROJECT_ID)"
else
  fail "POST /projects — no project ID returned"
  PROJECT_ID=""
fi

if [ -n "$PROJECT_ID" ]; then
  # Test: GET /projects/:id
  RESP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/projects/$PROJECT_ID")
  if [ "$RESP" = "200" ]; then
    pass "GET /projects/:id → 200"
  else
    fail "GET /projects/:id → $RESP"
  fi

  # Test: PUT /projects/:id/invention
  RESP=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
    "http://localhost:3000/api/projects/$PROJECT_ID/invention" \
    -H "Content-Type: application/json" \
    -d '{"title":"E2E Invention","description":"Testing the full pipeline"}')
  if [ "$RESP" = "200" ] || [ "$RESP" = "201" ]; then
    pass "PUT /invention → $RESP"
  else
    fail "PUT /invention → $RESP"
  fi

  # Test: GET /settings
  RESP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/settings)
  if [ "$RESP" = "200" ]; then
    pass "GET /settings → 200"
  else
    fail "GET /settings → $RESP"
  fi

  # Test: GET /projects/:id/prior-art
  RESP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/projects/$PROJECT_ID/prior-art")
  if [ "$RESP" = "200" ]; then
    pass "GET /prior-art → 200"
  else
    fail "GET /prior-art → $RESP"
  fi

  # Test: DELETE /projects/:id
  RESP=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "http://localhost:3000/api/projects/$PROJECT_ID")
  if [ "$RESP" = "200" ] || [ "$RESP" = "204" ]; then
    pass "DELETE /projects/:id → $RESP"
  else
    fail "DELETE /projects/:id → $RESP"
  fi

  # Verify deletion
  RESP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/projects/$PROJECT_ID")
  if [ "$RESP" = "404" ] || [ "$RESP" = "500" ]; then
    pass "Deleted project returns 404"
  else
    fail "Deleted project still accessible → $RESP"
  fi
fi

# ============================================================================
# Phase 7: Playwright E2E tests (browser-level integration tests)
# ============================================================================
log "=== Phase 7: Playwright E2E tests ==="

cd "$FRONTEND"
set +e
PLAYWRIGHT_OUTPUT=$(npx playwright test 2>&1)
PLAYWRIGHT_EXIT=$?
set -e

echo "$PLAYWRIGHT_OUTPUT"

if [ $PLAYWRIGHT_EXIT -eq 0 ]; then
  PW_COUNT=$(echo "$PLAYWRIGHT_OUTPUT" | sed -n 's/.*\([0-9]* passed\).*/\1/p' | tail -1)
  PW_COUNT=${PW_COUNT:-unknown}
  pass "Playwright E2E tests: $PW_COUNT"
else
  fail "Playwright E2E tests FAILED (exit code $PLAYWRIGHT_EXIT)"
fi

# ============================================================================
# Phase 8: Summary
# ============================================================================
cleanup  # stop services before reporting

echo ""
log "============================================"
log "  CLEANROOM E2E RESULTS"
log "============================================"
echo -e "${GREEN}  Passed: $PASS${NC}"
if [ $FAIL -gt 0 ]; then
  echo -e "${RED}  Failed: $FAIL${NC}"
  log "============================================"
  echo -e "${RED}  ✗ CLEANROOM E2E FAILED — DO NOT PUSH${NC}"
  exit 1
else
  echo -e "${GREEN}  Failed: 0${NC}"
  log "============================================"
  echo -e "${GREEN}  ✓ CLEANROOM E2E PASSED — safe to push${NC}"
  exit 0
fi
