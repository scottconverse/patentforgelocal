#!/bin/bash
set -e

PYTHON_VERSION="3.12.8"
PLATFORM=${1:-windows}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

echo "=== Bundling Portable Python ${PYTHON_VERSION} (${PLATFORM}) ==="

mkdir -p runtime/python

case $PLATFORM in
    windows)
        # Download Python embeddable package
        URL="https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip"
        echo "  Downloading Python embeddable package..."
        curl -L -o python-embed.zip "$URL"
        unzip -o python-embed.zip -d runtime/python/
        rm python-embed.zip

        # Enable pip: uncomment "import site" in python312._pth
        PTH_FILE=$(ls runtime/python/python*._pth 2>/dev/null | head -1)
        if [ -n "$PTH_FILE" ]; then
            sed -i 's/#import site/import site/' "$PTH_FILE"
            echo "  Enabled site-packages in $PTH_FILE"
        fi

        # Install pip
        echo "  Installing pip..."
        curl -L -o runtime/python/get-pip.py https://bootstrap.pypa.io/get-pip.py
        runtime/python/python.exe runtime/python/get-pip.py --no-warn-script-location 2>&1 | tail -3
        rm runtime/python/get-pip.py

        # Install service dependencies
        echo "  Installing service dependencies..."
        runtime/python/python.exe -m pip install \
            -r scripts/requirements-portable.txt \
            --no-warn-script-location --quiet 2>&1 | tail -5

        # Verify core imports
        echo "  Verifying imports..."
        runtime/python/python.exe -c "
import fastapi
import openai
import langgraph
import uvicorn
import pydantic
import sse_starlette
import docx
print('All imports OK')
"
        ;;

    mac)
        # Download python-build-standalone for macOS
        ARCH=$(uname -m)
        if [ "$ARCH" = "arm64" ]; then
            PBS_ARCH="aarch64-apple-darwin"
        else
            PBS_ARCH="x86_64-apple-darwin"
        fi
        PBS_TAG="20241219"
        URL="https://github.com/indygreg/python-build-standalone/releases/download/${PBS_TAG}/cpython-${PYTHON_VERSION}+${PBS_TAG}-${PBS_ARCH}-install_only.tar.gz"
        echo "  Downloading Python ${PYTHON_VERSION} for macOS (${ARCH})..."
        curl -L -o python-standalone.tar.gz "$URL"
        tar xzf python-standalone.tar.gz -C runtime/python/ --strip-components=1
        rm python-standalone.tar.gz

        # Install service dependencies
        echo "  Installing service dependencies..."
        runtime/python/bin/python3 -m pip install \
            -r scripts/requirements-portable.txt \
            --no-warn-script-location --quiet 2>&1 | tail -5

        # Verify core imports
        echo "  Verifying imports..."
        runtime/python/bin/python3 -c "
import fastapi
import openai
import langgraph
import uvicorn
import pydantic
import sse_starlette
import docx
print('All imports OK')
"
        ;;

    linux)
        # Download python-build-standalone for Linux
        ARCH=$(uname -m)
        PBS_ARCH="${ARCH}-unknown-linux-gnu"
        PBS_TAG="20241219"
        URL="https://github.com/indygreg/python-build-standalone/releases/download/${PBS_TAG}/cpython-${PYTHON_VERSION}+${PBS_TAG}-${PBS_ARCH}-install_only.tar.gz"
        echo "  Downloading Python ${PYTHON_VERSION} for Linux (${ARCH})..."
        curl -L -o python-standalone.tar.gz "$URL"
        tar xzf python-standalone.tar.gz -C runtime/python/ --strip-components=1
        rm python-standalone.tar.gz

        # Install service dependencies
        echo "  Installing service dependencies..."
        runtime/python/bin/python3 -m pip install \
            -r scripts/requirements-portable.txt \
            --no-warn-script-location --quiet 2>&1 | tail -5

        # Verify core imports
        echo "  Verifying imports..."
        runtime/python/bin/python3 -c "
import fastapi
import openai
import langgraph
import uvicorn
import pydantic
import sse_starlette
import docx
print('All imports OK')
"
        ;;

    *)
        echo "  ERROR: Unknown platform '$PLATFORM'. Use: windows, mac, linux"
        exit 1
        ;;
esac

echo ""
echo "=== Python bundling complete ==="
echo "  Location: runtime/python/"
du -sh runtime/python/ 2>/dev/null || echo "  (size check not available)"
