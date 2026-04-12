#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

echo "=== PatentForge SEA Build Validation ==="
echo ""

# Build both
echo "── Building backend SEA ──"
bash scripts/build-backend-sea.sh
echo ""

echo "── Building feasibility SEA ──"
bash scripts/build-feasibility-sea.sh
echo ""

echo "── Starting services ──"

# Start backend
export DATABASE_URL="file:$ROOT_DIR/backend/prisma/dev.db"
export NODE_ENV=production
export PORT=3000
# Find the Prisma query engine
PRISMA_ENGINE=$(ls patentforge-backend-prisma/query_engine-* patentforge-backend-prisma/libquery_engine-* 2>/dev/null | head -1)
export PRISMA_QUERY_ENGINE_LIBRARY="$ROOT_DIR/$PRISMA_ENGINE"
export FRONTEND_DIST_PATH="$ROOT_DIR/frontend/dist"

echo "  Starting backend on port 3000..."
./patentforge-backend.exe &
BACKEND_PID=$!

# Start feasibility
echo "  Starting feasibility on port 3001..."
PORT=3001 PROMPTS_DIR="$ROOT_DIR/patentforge-feasibility-prompts" ./patentforge-feasibility.exe &
FEASIBILITY_PID=$!

# Wait for readiness
echo "  Waiting for services to become ready..."
READY=false
for i in $(seq 1 30); do
    BACKEND_OK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null || echo "000")
    FEASIBILITY_OK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health 2>/dev/null || echo "000")

    if [ "$BACKEND_OK" = "200" ] && [ "$FEASIBILITY_OK" = "200" ]; then
        READY=true
        break
    fi
    sleep 1
done

echo ""
echo "── Results ──"

if [ "$READY" = true ]; then
    BACKEND_RESP=$(curl -s http://localhost:3000/api/health)
    FEASIBILITY_RESP=$(curl -s http://localhost:3001/health)
    echo "  Backend:     ✓ $BACKEND_RESP"
    echo "  Feasibility: ✓ $FEASIBILITY_RESP"
else
    echo "  Backend:     HTTP $BACKEND_OK"
    echo "  Feasibility: HTTP $FEASIBILITY_OK"
fi

# Cleanup
echo ""
echo "── Cleanup ──"
kill $BACKEND_PID $FEASIBILITY_PID 2>/dev/null || true
wait $BACKEND_PID $FEASIBILITY_PID 2>/dev/null || true

rm -f patentforge-backend.exe patentforge-feasibility.exe
rm -rf patentforge-backend-prisma patentforge-feasibility-prompts

if [ "$READY" = true ]; then
    echo ""
    echo "=== SEA builds PASS ==="
    exit 0
else
    echo ""
    echo "=== SEA builds FAIL ==="
    exit 1
fi
