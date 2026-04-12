#!/bin/bash
set -e

echo "=== Building PatentForge Backend SEA ==="

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
cp "$NODE_BIN" "$ROOT_DIR/patentforge-backend.exe"

# Inject the blob
npx postject "$ROOT_DIR/patentforge-backend.exe" NODE_SEA_BLOB sea-prep.blob \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

# Step 6: Copy Prisma engine alongside
echo "  Copying Prisma runtime files..."
mkdir -p "$ROOT_DIR/patentforge-backend-prisma"
# ncc puts the query engine in sea-build/client/ — copy it to the prisma dir
if [ -d "sea-build/client" ]; then
  find sea-build/client -name "query_engine-*" -o -name "libquery_engine-*" | while read f; do
    cp "$f" "$ROOT_DIR/patentforge-backend-prisma/"
  done
fi
# Also check node_modules as fallback (exclude .tmp files)
find node_modules/.prisma/client \( -name "query_engine-*" -o -name "libquery_engine-*" \) ! -name "*.tmp*" 2>/dev/null | while read f; do
  cp "$f" "$ROOT_DIR/patentforge-backend-prisma/" 2>/dev/null || true
done
cp prisma/schema.prisma "$ROOT_DIR/patentforge-backend-prisma/"

echo ""
echo "  Done! Binary: patentforge-backend.exe ($(du -h "$ROOT_DIR/patentforge-backend.exe" | cut -f1))"
echo "  Prisma files: patentforge-backend-prisma/"
ls -1 "$ROOT_DIR/patentforge-backend-prisma/"
echo ""
echo "  To run:"
echo "    export DATABASE_URL=\"file:./data/patentforge.db\""
echo "    export PRISMA_QUERY_ENGINE_LIBRARY=\"\$(pwd)/patentforge-backend-prisma/query_engine-windows.dll.node\""
echo "    ./patentforge-backend.exe"

# Cleanup build artifacts
rm -rf sea-build sea-config.json sea-prep.blob

cd "$ROOT_DIR"
