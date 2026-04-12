#!/bin/bash
# Build the PatentForge Windows installer using Inno Setup
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=== Building PatentForge Windows Installer ==="
echo "Repo root: $REPO_ROOT"

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
check_file "patentforge-tray.exe"
check_file "patentforge-backend.exe"
check_file "patentforge-feasibility.exe"
check_dir  "patentforge-backend-prisma"
check_dir  "patentforge-feasibility-prompts"
check_dir  "runtime/python"
check_dir  "services/claim-drafter/src"
check_dir  "services/application-generator/src"
check_dir  "services/compliance-checker/src"
check_dir  "frontend/dist"
check_file "LICENSE"
check_file "installer/assets/icon.ico"

if [ "$MISSING" -eq 1 ]; then
    echo ""
    echo "ERROR: Required build artifacts are missing."
    echo "Run all build scripts before building the installer."
    exit 1
fi
echo "All artifacts present."

# --- Ensure output directory exists ---
mkdir -p "$REPO_ROOT/build"

# --- Compile the installer ---
echo ""
echo "Compiling installer..."
"$ISCC" "$REPO_ROOT/installer/windows/patentforge.iss"

# Read version from the .iss file to find the output filename
ISS_VERSION=$(grep '#define MyAppVersion' "$REPO_ROOT/installer/windows/patentforge.iss" | sed 's/.*"\(.*\)"/\1/')
OUTPUT="$REPO_ROOT/build/PatentForge-${ISS_VERSION}-Setup.exe"
if [ -f "$OUTPUT" ]; then
    SIZE=$(du -h "$OUTPUT" | cut -f1)
    echo ""
    echo "=== Installer built successfully ==="
    echo "Output: $OUTPUT"
    echo "Size:   $SIZE"
else
    echo ""
    echo "ERROR: Expected output not found at $OUTPUT"
    echo "Looked for: $OUTPUT"
    echo "Contents of build/:"
    ls -la "$REPO_ROOT/build/" 2>/dev/null || echo "  (build/ does not exist)"
    exit 1
fi
