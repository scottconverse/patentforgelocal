#!/bin/bash
set -e

OLLAMA_VERSION="latest"
PLATFORM=${1:-windows}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

echo "=== Bundling Portable Ollama (${PLATFORM}) ==="

mkdir -p runtime/ollama

case $PLATFORM in
    windows)
        URL="https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip"
        echo "  Downloading Ollama for Windows..."
        curl -L -o ollama-windows.zip "$URL"
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
        URL="https://github.com/ollama/ollama/releases/latest/download/ollama-darwin.tgz"
        echo "  Downloading Ollama for macOS..."
        curl -L -o ollama-darwin.tgz "$URL"
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
        URL="https://github.com/ollama/ollama/releases/latest/download/ollama-linux-amd64.tar.zst"
        echo "  Downloading Ollama for Linux..."
        curl -L -o ollama-linux.tar.zst "$URL"
        # zstd may not be installed — try tar with --zstd flag, fall back to zstd pipe
        if tar --zstd -xf ollama-linux.tar.zst -C runtime/ollama/ 2>/dev/null; then
            echo "  Extracted with tar --zstd"
        elif command -v zstd &>/dev/null; then
            zstd -d ollama-linux.tar.zst -o ollama-linux.tar
            tar xf ollama-linux.tar -C runtime/ollama/
            rm ollama-linux.tar
        else
            echo "  ERROR: zstd not available. Install with: sudo apt install zstd"
            exit 1
        fi
        rm -f ollama-linux.tar.zst
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
