#!/usr/bin/env bash
#
# PatentForge Release Verification Script
# Run before every push. Exits non-zero if any check fails.
# Usage: bash scripts/verify-release.sh
#

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

pass() { echo -e "  ${GREEN}PASS${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}FAIL${NC} $1"; FAIL=$((FAIL + 1)); }
warn() { echo -e "  ${YELLOW}WARN${NC} $1"; WARN=$((WARN + 1)); }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "========================================"
echo "PatentForge Release Verification"
echo "========================================"
echo ""

# ── 1. VERSION CONSISTENCY ─────────────────────────────────────────────
echo "── 1. Version Consistency ──"

# Extract version from backend/package.json as the source of truth
SOURCE_VERSION=$(grep '"version"' backend/package.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
echo "  Source of truth (backend/package.json): $SOURCE_VERSION"

check_version() {
    local file="$1"
    local pattern="$2"
    if [ -f "$file" ]; then
        if grep -q "$SOURCE_VERSION" "$file"; then
            pass "$file contains $SOURCE_VERSION"
        else
            local found=$(grep "$pattern" "$file" | head -1 | tr -d ' ')
            fail "$file — expected $SOURCE_VERSION, found: $found"
        fi
    else
        fail "$file — file not found"
    fi
}

check_version "frontend/package.json" '"version"'
check_version "services/feasibility/package.json" '"version"'
check_version "services/claim-drafter/pyproject.toml" 'version'
check_version "services/compliance-checker/pyproject.toml" 'version'
check_version "services/application-generator/pyproject.toml" 'version'

echo ""

# ── 2. REQUIRED FILES EXIST ────────────────────────────────────────────
echo "── 2. Required Files ──"

for f in LICENSE README.md CHANGELOG.md CONTRIBUTING.md .gitignore USER-MANUAL.md README-FULL.pdf docs/index.html ARCHITECTURE.md LEGAL_NOTICE.md; do
    if [ -f "$f" ]; then
        pass "$f exists"
    else
        fail "$f MISSING"
    fi
done

echo ""

# ── 3. DIAGRAM REFERENCES ─────────────────────────────────────────────
echo "── 3. Diagram References ──"
echo "  Checking that every PNG in diagrams/ is referenced by at least one doc..."

for png in diagrams/*.png; do
    basename=$(basename "$png")
    # Search markdown and HTML files for references
    found=$(grep -rl "$basename" README.md ARCHITECTURE.md USER-MANUAL.md docs/index.html CONTRIBUTING.md 2>/dev/null | wc -l)
    if [ "$found" -gt 0 ]; then
        pass "$basename referenced in $found file(s)"
    else
        fail "$basename NOT referenced in any documentation file"
    fi
done

echo ""

# ── 4. SERVICE CONSISTENCY ─────────────────────────────────────────────
echo "── 4. Service Consistency ──"

# Count services in docker-compose.yml (exclude postgres and volumes)
DOCKER_SERVICES=$(grep -c "^\s\+build:" docker-compose.yml 2>/dev/null || echo 0)
echo "  Services in docker-compose.yml (with build:): $DOCKER_SERVICES"

# Check each service is mentioned in key docs
for svc in feasibility claim-drafter compliance-checker application-generator; do
    # Check README
    if grep -qi "$svc" README.md 2>/dev/null; then
        pass "$svc mentioned in README.md"
    else
        fail "$svc NOT mentioned in README.md"
    fi
    # Check CONTRIBUTING
    if grep -qi "$svc" CONTRIBUTING.md 2>/dev/null; then
        pass "$svc mentioned in CONTRIBUTING.md"
    else
        fail "$svc NOT mentioned in CONTRIBUTING.md"
    fi
done

echo ""

# ── 5. CHANGELOG HAS CURRENT VERSION ──────────────────────────────────
echo "── 5. Changelog ──"

if grep -q "\[$SOURCE_VERSION\]" CHANGELOG.md; then
    pass "CHANGELOG.md has entry for [$SOURCE_VERSION]"
else
    fail "CHANGELOG.md missing entry for [$SOURCE_VERSION]"
fi

echo ""

# ── 6. SECRETS SCAN ────────────────────────────────────────────────────
echo "── 6. Secrets Scan ──"

# Real API key pattern (not test fixtures)
REAL_KEYS=$(grep -rn "sk-ant-api03-[A-Za-z0-9_-]\{20,\}" --include="*.ts" --include="*.tsx" --include="*.py" --include="*.json" --include="*.yml" --include="*.env" --include="*.toml" --include="*.md" . 2>/dev/null | grep -v node_modules | grep -v ".git/" | grep -v dist/ | grep -v "memory/" | grep -v "fake" | grep -v "test" | grep -v "e2e" | grep -v "example" | grep -v "placeholder" | grep -v 'sk-ant-\.\.\.' | grep -v "encryption.spec" || true)

if [ -z "$REAL_KEYS" ]; then
    pass "No real API keys found in codebase"
else
    fail "Potential API keys found:"
    echo "$REAL_KEYS" | head -5
fi

# Check .env files aren't committed
if git ls-files --error-unmatch backend/.env 2>/dev/null; then
    fail "backend/.env is tracked by git — should be in .gitignore"
else
    pass "backend/.env is not tracked (correct)"
fi

echo ""

# ── 6b. LOCKFILE INTEGRITY ───────────────────────────────────────────
echo "── 6b. Lockfile Integrity ──"

for pkg_dir in frontend backend services/feasibility; do
    pkg_name=$(basename "$pkg_dir")
    if [ -f "$pkg_dir/package-lock.json" ]; then
        # Check lockfile version matches package.json version
        PKG_VER=$(node -p "require('./$pkg_dir/package.json').version")
        LOCK_VER=$(node -p "require('./$pkg_dir/package-lock.json').version")
        if [ "$PKG_VER" = "$LOCK_VER" ]; then
            pass "$pkg_name lockfile version ($LOCK_VER) matches package.json"
        else
            fail "$pkg_name lockfile version ($LOCK_VER) != package.json ($PKG_VER) — run: cd $pkg_dir && rm package-lock.json && npm install"
        fi
    else
        fail "$pkg_name missing package-lock.json"
    fi
done

echo ""

# ── 7. TEST SUITES ────────────────────────────────────────────────────
echo "── 7. Test Count Verification ──"

# Run all test suites and count
echo "  Running all test suites..."

extract_passed() {
    # Extract the number before " passed" from test output
    echo "$1" | grep -o '[0-9]* passed' | head -1 | grep -o '[0-9]*' || echo 0
}

PY_APPGEN_OUT=$(cd services/application-generator && python -m pytest tests/ -q 2>&1 | tail -1)
PY_APPGEN=$(extract_passed "$PY_APPGEN_OUT")
PY_CLAIM_OUT=$(cd services/claim-drafter && python -m pytest tests/ -q 2>&1 | tail -1)
PY_CLAIM=$(extract_passed "$PY_CLAIM_OUT")
PY_COMP_OUT=$(cd services/compliance-checker && python -m pytest tests/ -q 2>&1 | tail -1)
PY_COMP=$(extract_passed "$PY_COMP_OUT")
JEST_OUT=$(cd backend && npx jest --silent 2>&1 | grep "Tests:")
JEST=$(extract_passed "$JEST_OUT")
VITEST_OUT=$(cd frontend && npx vitest run 2>&1 | grep "Tests")
VITEST=$(extract_passed "$VITEST_OUT")

# Count Playwright E2E tests (can't run without server, count from source)
E2E=$(grep -rc 'test(' frontend/e2e/*.spec.ts 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
TOTAL=$((PY_APPGEN + PY_CLAIM + PY_COMP + JEST + VITEST + E2E))
echo "  app-gen: $PY_APPGEN | claim-drafter: $PY_CLAIM | compliance: $PY_COMP | backend: $JEST | frontend: $VITEST | e2e: $E2E"
echo "  Total: $TOTAL"

if [ "$TOTAL" -gt 0 ]; then
    pass "All test suites ran ($TOTAL total tests)"
else
    fail "Test suites did not run or returned 0"
fi

# Check docs mention correct test count
DOC_COUNT=$(grep -o '[0-9]* Automated Tests' docs/index.html 2>/dev/null | head -1 | grep -o '[0-9]*' || echo "NOT FOUND")
[ -z "$DOC_COUNT" ] && DOC_COUNT="NOT FOUND"
if [ "$DOC_COUNT" = "$TOTAL" ]; then
    pass "docs/index.html test count ($DOC_COUNT) matches actual ($TOTAL)"
elif [ "$DOC_COUNT" = "NOT FOUND" ]; then
    warn "docs/index.html does not mention test count"
else
    fail "docs/index.html says $DOC_COUNT tests but actual is $TOTAL"
fi

echo ""

# ── 8. GIT STATUS ──────────────────────────────────────────────────────
echo "── 8. Git Status ──"

if [ -z "$(git status --porcelain)" ]; then
    pass "Working tree clean"
else
    warn "Uncommitted changes:"
    git status --short
fi

echo ""

# ── SUMMARY ────────────────────────────────────────────────────────────
echo "========================================"
echo -e "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, ${YELLOW}$WARN warnings${NC}"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}RELEASE BLOCKED — fix all failures before pushing${NC}"
    exit 1
else
    echo -e "${GREEN}RELEASE OK — all checks passed${NC}"
    exit 0
fi
