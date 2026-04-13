#!/bin/bash
set -e

echo "=== Building PatentForgeLocal Backend SEA ==="

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR/backend"

# Step 1: TypeScript -> JavaScript
echo "  Compiling TypeScript..."
npx nest build

# Step 2: Bundle with ncc
echo "  Bundling with ncc..."
npx ncc build dist/main.js -o sea-build --minify

# Step 3: Create SEA config
cat > sea-config.json << 'SEAEOF'
{
  "main": "sea-build/index.js",
  "output": "sea-prep.blob",
  "disableExperimentalSEAWarning": true
}
SEAEOF

# Step 4: Generate SEA blob
echo "  Generating SEA blob..."
node --experimental-sea-config sea-config.json

# Step 5: Copy node binary and inject
echo "  Creating standalone executable..."
NODE_BIN=$(node -e "console.log(process.execPath)")
EXT=""
if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$(uname -s)" == MINGW* ]]; then
  EXT=".exe"
fi
OUTPUT_BIN="$ROOT_DIR/patentforgelocal-backend${EXT}"
cp "$NODE_BIN" "$OUTPUT_BIN"

# Inject the blob
npx postject "$OUTPUT_BIN" NODE_SEA_BLOB sea-prep.blob \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

# Step 6: Copy Prisma engine alongside
echo "  Copying Prisma runtime files..."
mkdir -p "$ROOT_DIR/patentforgelocal-backend-prisma"
# ncc puts the query engine in sea-build/client/ — copy it to the prisma dir
if [ -d "sea-build/client" ]; then
  find sea-build/client -name "query_engine-*" -o -name "libquery_engine-*" | while read f; do
    cp "$f" "$ROOT_DIR/patentforgelocal-backend-prisma/"
  done
fi
# Also check node_modules as fallback (exclude .tmp files)
find node_modules/.prisma/client \( -name "query_engine-*" -o -name "libquery_engine-*" \) ! -name "*.tmp*" 2>/dev/null | while read f; do
  cp "$f" "$ROOT_DIR/patentforgelocal-backend-prisma/" 2>/dev/null || true
done
cp prisma/schema.prisma "$ROOT_DIR/patentforgelocal-backend-prisma/"

echo ""
echo "  Done! Binary: patentforgelocal-backend${EXT} ($(du -h "$OUTPUT_BIN" | cut -f1))"
echo "  Prisma files: patentforgelocal-backend-prisma/"
ls -1 "$ROOT_DIR/patentforgelocal-backend-prisma/"
echo ""
echo "  To run:"
echo "    export DATABASE_URL=\"file:./data/patentforge.db\""
echo "    export PRISMA_QUERY_ENGINE_LIBRARY=\"\$(pwd)/patentforgelocal-backend-prisma/query_engine-windows.dll.node\""
echo "    ./patentforgelocal-backend.exe"

# Cleanup build artifacts
rm -rf sea-build sea-config.json sea-prep.blob

cd "$ROOT_DIR"
