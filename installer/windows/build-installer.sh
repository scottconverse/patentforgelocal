#!/bin/bash
# Build the PatentForgeLocal Windows installer using Inno Setup
#
# Run 6: emits two artifacts per build — PatentForgeLocal-Full-<ver>-Setup.exe
# (Ollama + Gemma 4 bundled) and PatentForgeLocal-Lean-<ver>-Setup.exe
# (cloud-only, no Ollama runtime). Pass EDITIONS="Full" or "Lean" to limit;
# default builds both.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
EDITIONS="${EDITIONS:-Full Lean}"

echo "=== Building PatentForgeLocal Windows Installer ==="
echo "Repo root: $REPO_ROOT"
echo "Editions:  $EDITIONS"

# --- Locate Inno Setup compiler ---
ISCC=""
if command -v iscc &>/dev/null; then
    ISCC="$(command -v iscc)"
elif [ -f "C:/Program Files (x86)/Inno Setup 6/ISCC.exe" ]; then
    ISCC="C:/Program Files (x86)/Inno Setup 6/ISCC.exe"
elif [ -f "C:/Program Files/Inno Setup 6/ISCC.exe" ]; then
    ISCC="C:/Program Files/Inno Setup 6/ISCC.exe"
fi

if [ -z "$ISCC" ] || [ ! -f "$ISCC" ]; then
    echo "ERROR: Inno Setup 6 not found."
    echo "Install via:  choco install innosetup -y"
    echo "Or download:  https://jrsoftware.org/isdl.php"
    exit 1
fi
echo "Using ISCC: $ISCC"

# --- Verify required build artifacts ---
MISSING=0

check_file() {
    if [ ! -f "$REPO_ROOT/$1" ]; then
        echo "MISSING: $1"
        MISSING=1
    fi
}

check_dir() {
    if [ ! -d "$REPO_ROOT/$1" ]; then
        echo "MISSING: $1/"
        MISSING=1
    fi
}

echo ""
echo "Checking build artifacts..."
check_file "patentforgelocal-tray.exe"
check_file "patentforgelocal-backend.exe"
check_file "patentforgelocal-feasibility.exe"
check_dir  "patentforgelocal-backend-prisma"
check_dir  "patentforgelocal-feasibility-prompts"
check_dir  "runtime/python"
check_dir  "services/claim-drafter/src"
check_dir  "services/application-generator/src"
check_dir  "services/compliance-checker/src"
check_dir  "frontend/dist"
check_file "LICENSE"
check_file "installer/assets/icon.ico"
check_file "installer/marker/edition-Full.txt"
check_file "installer/marker/edition-Lean.txt"
# Ollama runtime is required only when building the Full edition. The Lean
# build skips it (no bundle = cloud-only).
case "$EDITIONS" in
  *Full*) check_dir "runtime/ollama" ;;
esac

if [ "$MISSING" -eq 1 ]; then
    echo ""
    echo "ERROR: Required build artifacts are missing."
    echo "Run all build scripts before building the installer."
    exit 1
fi
echo "All artifacts present."

# --- Ensure output directory exists ---
mkdir -p "$REPO_ROOT/build"

# --- Read version once ---
ISS_VERSION=$(grep '#define MyAppVersion' "$REPO_ROOT/installer/windows/patentforgelocal.iss" | sed 's/.*"\(.*\)"/\1/')

# --- Compile each requested edition ---
for EDITION in $EDITIONS; do
    case "$EDITION" in
      Full|Lean) ;;
      *) echo "ERROR: unknown edition '$EDITION' (must be Full or Lean)"; exit 1 ;;
    esac

    echo ""
    echo "Compiling $EDITION installer..."
    "$ISCC" "/dEdition=$EDITION" "$REPO_ROOT/installer/windows/patentforgelocal.iss"

    OUTPUT="$REPO_ROOT/build/PatentForgeLocal-${EDITION}-${ISS_VERSION}-Setup.exe"
    if [ -f "$OUTPUT" ]; then
        SIZE=$(du -h "$OUTPUT" | cut -f1)
        echo "=== $EDITION installer built ==="
        echo "  Output: $OUTPUT"
        echo "  Size:   $SIZE"
    else
        echo "ERROR: $EDITION output not found at $OUTPUT"
        echo "Contents of build/:"
        ls -la "$REPO_ROOT/build/" 2>/dev/null || echo "  (build/ does not exist)"
        exit 1
    fi
done

echo ""
echo "=== All requested editions built ==="
