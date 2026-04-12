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
        URL="https://github.com/ollama/ollama/releases/latest/download/ollama-darwin"
        echo "  Downloading Ollama for macOS..."
        curl -L -o runtime/ollama/ollama "$URL"
        chmod +x runtime/ollama/ollama
        echo "  Verifying Ollama binary..."
        runtime/ollama/ollama --version
        ;;
    linux)
        URL="https://github.com/ollama/ollama/releases/latest/download/ollama-linux-amd64.tgz"
        echo "  Downloading Ollama for Linux..."
        curl -L -o ollama-linux.tgz "$URL"
        tar xzf ollama-linux.tgz -C runtime/ollama/
        rm ollama-linux.tgz
        if [ -f runtime/ollama/bin/ollama ]; then
            mv runtime/ollama/bin/ollama runtime/ollama/ollama
            rm -rf runtime/ollama/bin
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
