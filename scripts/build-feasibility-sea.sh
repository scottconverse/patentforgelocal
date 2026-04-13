#!/bin/bash
set -e

echo "=== Building PatentForgeLocal Feasibility SEA ==="

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR/services/feasibility"

# Step 1: TypeScript -> JavaScript (also copies prompt .md files to dist/prompts/)
echo "  Compiling TypeScript..."
npm run build

# Step 2: Bundle with ncc
echo "  Bundling with ncc..."
npx ncc build dist/server.js -o sea-build --minify

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
OUTPUT_BIN="$ROOT_DIR/patentforgelocal-feasibility${EXT}"
cp "$NODE_BIN" "$OUTPUT_BIN"

# Inject the blob
npx postject "$OUTPUT_BIN" NODE_SEA_BLOB sea-prep.blob \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

# Step 6: Copy prompt files alongside the binary
echo "  Copying prompt files..."
mkdir -p "$ROOT_DIR/patentforgelocal-feasibility-prompts"
cp src/prompts/*.md "$ROOT_DIR/patentforgelocal-feasibility-prompts/"

echo ""
echo "  Done! Binary: patentforgelocal-feasibility${EXT} ($(du -h "$OUTPUT_BIN" | cut -f1))"
echo "  Prompts: patentforgelocal-feasibility-prompts/"
ls -1 "$ROOT_DIR/patentforgelocal-feasibility-prompts/"
echo ""
echo "  To run:"
echo "    export PROMPTS_DIR=\"\$(pwd)/patentforgelocal-feasibility-prompts\""
echo "    ./patentforgelocal-feasibility${EXT}"

# Cleanup build artifacts
rm -rf sea-build sea-config.json sea-prep.blob

cd "$ROOT_DIR"
