#!/bin/bash
set -e

PLATFORM=${1:-windows}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

echo "=== Bundling Portable Ollama (${PLATFORM}) ==="

mkdir -p runtime/ollama

# Use gh CLI to download from latest release — handles auth, redirects,
# and version-specific filename changes (e.g. .tgz vs .tar.zst).
case $PLATFORM in
    windows)
        echo "  Downloading latest Ollama for Windows..."
        gh release download --repo ollama/ollama --pattern "ollama-windows-amd64.zip" --dir . --clobber
        unzip -o ollama-windows-amd64.zip -d runtime/ollama/
        rm ollama-windows-amd64.zip
        if [ ! -f runtime/ollama/ollama.exe ]; then
            echo "  ERROR: ollama.exe not found after extraction"
            exit 1
        fi
        echo "  Verifying Ollama binary..."
        runtime/ollama/ollama.exe --version
        ;;
    mac)
        echo "  Downloading latest Ollama for macOS..."
        gh release download --repo ollama/ollama --pattern "ollama-darwin.tgz" --dir . --clobber
        tar xzf ollama-darwin.tgz -C runtime/ollama/
        rm ollama-darwin.tgz
        OLLAMA_BIN=$(find runtime/ollama -name ollama -type f | head -1)
        if [ -n "$OLLAMA_BIN" ] && [ "$OLLAMA_BIN" != "runtime/ollama/ollama" ]; then
            mv "$OLLAMA_BIN" runtime/ollama/ollama
        fi
        chmod +x runtime/ollama/ollama
        echo "  Verifying Ollama binary..."
        runtime/ollama/ollama --version
        ;;
    linux)
        echo "  Downloading latest Ollama for Linux..."
        # Try .tgz first (older releases), fall back to .tar.zst (newer releases)
        if gh release download --repo ollama/ollama --pattern "ollama-linux-amd64.tgz" --dir . --clobber 2>/dev/null; then
            tar xzf ollama-linux-amd64.tgz -C runtime/ollama/
            rm ollama-linux-amd64.tgz
        elif gh release download --repo ollama/ollama --pattern "ollama-linux-amd64.tar.zst" --dir . --clobber 2>/dev/null; then
            if command -v zstd &>/dev/null; then
                zstd -d ollama-linux-amd64.tar.zst -o ollama-linux-amd64.tar
                tar xf ollama-linux-amd64.tar -C runtime/ollama/
                rm ollama-linux-amd64.tar
            elif tar --zstd -xf ollama-linux-amd64.tar.zst -C runtime/ollama/ 2>/dev/null; then
                true
            else
                echo "  ERROR: zstd not available. Install with: sudo apt install zstd"
                exit 1
            fi
            rm -f ollama-linux-amd64.tar.zst
        else
            echo "  ERROR: Could not download Ollama for Linux"
            exit 1
        fi
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
