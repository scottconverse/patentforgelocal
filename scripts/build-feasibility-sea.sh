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

# Step 2b: Copy better-sqlite3 native binding and patch hardcoded CI path
echo "  Patching better-sqlite3 native binding path..."
mkdir -p "$ROOT_DIR/patentforgelocal-feasibility-native"
SQLITE3_NODE=$(find node_modules/better-sqlite3/build/Release -name "better_sqlite3.node" 2>/dev/null | head -1)
if [ -n "$SQLITE3_NODE" ]; then
  cp "$SQLITE3_NODE" "$ROOT_DIR/patentforgelocal-feasibility-native/better_sqlite3.node"
  echo "  Copied better_sqlite3.node from $SQLITE3_NODE"
  # Patch the ncc bundle: replace any absolute path to better_sqlite3.node with
  # a process.execPath-relative path so the binary works on any machine.
  node -e "
    const fs = require('fs');
    let content = fs.readFileSync('sea-build/index.js', 'utf8');
    const before = content.length;
    // Match any quoted absolute path ending in better_sqlite3.node (handles any CI workspace)
    content = content.replace(
      /\"([^\"]*[\\\\/]better_sqlite3\\.node)\"/g,
      'require(\"path\").join(require(\"path\").dirname(process.execPath),\"patentforgelocal-feasibility-native\",\"better_sqlite3.node\")'
    );
    content = content.replace(
      /'([^']*[\\\\/]better_sqlite3\\.node)'/g,
      'require(\"path\").join(require(\"path\").dirname(process.execPath),\"patentforgelocal-feasibility-native\",\"better_sqlite3.node\")'
    );
    fs.writeFileSync('sea-build/index.js', content);
    const patched = content.length !== before || content.includes('patentforgelocal-feasibility-native');
    console.log(patched ? '  better_sqlite3 path patched successfully' : '  WARNING: better_sqlite3 path not found in bundle — patch may be needed');
  "
else
  echo "  WARNING: better_sqlite3.node not found in node_modules — native binding will not be bundled"
fi

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
