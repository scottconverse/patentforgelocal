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
import anthropic
import langgraph
import uvicorn
import pydantic
import sse_starlette
import docx
print('All imports OK')
"
        ;;

    mac)
        echo "  Mac Python bundling will be handled by CI"
        echo "  Using python-build-standalone releases from indygreg/python-build-standalone"
        # Placeholder — CI will download the appropriate release
        ;;

    linux)
        echo "  Linux Python bundling will be handled by CI"
        echo "  Using python-build-standalone releases from indygreg/python-build-standalone"
        # Placeholder — CI will download the appropriate release
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
