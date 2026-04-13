#!/bin/bash
set -e

OLLAMA_VERSION="v0.9.0"
PLATFORM=${1:-windows}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

echo "=== Bundling Portable Ollama (${PLATFORM}) ==="

mkdir -p runtime/ollama

case $PLATFORM in
    windows)
        URL="https://github.com/ollama/ollama/releases/download/${OLLAMA_VERSION}/ollama-windows-amd64.zip"
        echo "  Downloading Ollama ${OLLAMA_VERSION} for Windows..."
        curl -L --retry 3 --retry-delay 5 -o ollama-windows.zip "$URL"
        # Validate download (must be > 1MB to be a real zip, not a redirect page)
        FILE_SIZE=$(stat -c%s ollama-windows.zip 2>/dev/null || stat -f%z ollama-windows.zip 2>/dev/null || echo "0")
        if [ "$FILE_SIZE" -lt 1000000 ]; then
            echo "  ERROR: Download too small (${FILE_SIZE} bytes). Likely a redirect or rate limit."
            echo "  URL: $URL"
            cat ollama-windows.zip
            exit 1
        fi
        unzip -o ollama-windows.zip -d runtime/ollama/
        rm ollama-windows.zip
        if [ ! -f runtime/ollama/ollama.exe ]; then
            echo "  ERROR: ollama.exe not found after extraction"
            exit 1
        fi
        echo "  Verifying Ollama binary..."
        runtime/ollama/ollama.exe --version
        ;;
    mac)
        URL="https://github.com/ollama/ollama/releases/download/${OLLAMA_VERSION}/ollama-darwin.tgz"
        echo "  Downloading Ollama ${OLLAMA_VERSION} for macOS..."
        curl -L --retry 3 --retry-delay 5 -o ollama-darwin.tgz "$URL"
        tar xzf ollama-darwin.tgz -C runtime/ollama/
        rm ollama-darwin.tgz
        # Find the ollama binary wherever tar extracted it
        OLLAMA_BIN=$(find runtime/ollama -name ollama -type f | head -1)
        if [ -n "$OLLAMA_BIN" ] && [ "$OLLAMA_BIN" != "runtime/ollama/ollama" ]; then
            mv "$OLLAMA_BIN" runtime/ollama/ollama
        fi
        chmod +x runtime/ollama/ollama
        echo "  Verifying Ollama binary..."
        runtime/ollama/ollama --version
        ;;
    linux)
        URL="https://github.com/ollama/ollama/releases/download/${OLLAMA_VERSION}/ollama-linux-amd64.tgz"
        echo "  Downloading Ollama ${OLLAMA_VERSION} for Linux..."
        curl -L --retry 3 --retry-delay 5 -o ollama-linux.tgz "$URL"
        tar xzf ollama-linux.tgz -C runtime/ollama/
        rm ollama-linux.tgz
        # Find the ollama binary wherever tar extracted it
        OLLAMA_BIN=$(find runtime/ollama -name ollama -type f | head -1)
        if [ -n "$OLLAMA_BIN" ] && [ "$OLLAMA_BIN" != "runtime/ollama/ollama" ]; then
            mv "$OLLAMA_BIN" runtime/ollama/ollama
        fi
        chmod +x runtime/ollama/ollama
        echo "  Verifying Ollama binary..."
        runtime/ollama/ollama --version
        ;;
    *)
        echo "  ERROR: Unknown platform '$PLATFORM'. Use: windows, mac, linux"
        exit 1
        ;;
esac

echo ""
echo "=== Ollama bundling complete ==="
echo "  Location: runtime/ollama/"
du -sh runtime/ollama/ 2>/dev/null || echo "  (size check not available)"
