#!/bin/bash
set -e
echo "=== Building Linux AppImage ==="

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

VERSION=$(node -e "console.log(require('./backend/package.json').version)")
APP_NAME="PatentForgeLocal"
APP_DIR="build/${APP_NAME}.AppDir"

# Create AppDir structure
mkdir -p "${APP_DIR}/usr/bin"
mkdir -p "${APP_DIR}/usr/share/applications"
mkdir -p "${APP_DIR}/usr/share/icons/hicolor/256x256/apps"

# Copy binaries and resources
cp patentforgelocal-tray "${APP_DIR}/usr/bin/"
cp patentforgelocal-backend "${APP_DIR}/usr/bin/"
cp patentforgelocal-feasibility "${APP_DIR}/usr/bin/"
cp -r patentforgelocal-backend-prisma "${APP_DIR}/usr/bin/"
cp -r patentforgelocal-feasibility-prompts "${APP_DIR}/usr/bin/"

# Copy Python services (source only, no node_modules/tests/__pycache__)
for svc in claim-drafter application-generator compliance-checker; do
  mkdir -p "${APP_DIR}/usr/bin/services/${svc}"
  cp -r "services/${svc}/src" "${APP_DIR}/usr/bin/services/${svc}/"
done

# Copy portable Python runtime
if [ -d "runtime/python" ]; then
  mkdir -p "${APP_DIR}/usr/bin/runtime/python"
  cp -r runtime/python/* "${APP_DIR}/usr/bin/runtime/python/"
fi

# Ollama is downloaded on first run by AppRun, not bundled (keeps AppImage small)

# Copy icon
cp tray/internal/assets/icon.png "${APP_DIR}/usr/share/icons/hicolor/256x256/apps/patentforgelocal.png"
cp tray/internal/assets/icon.png "${APP_DIR}/patentforgelocal.png"

# Create desktop entry
cat > "${APP_DIR}/patentforgelocal.desktop" << EOF
[Desktop Entry]
Name=PatentForgeLocal
Exec=patentforgelocal-tray
Icon=patentforgelocal
Type=Application
Categories=Office;
Comment=Patent analysis and preparation tool
EOF
cp "${APP_DIR}/patentforgelocal.desktop" "${APP_DIR}/usr/share/applications/"

# Create AppRun with Ollama pre-flight check
cat > "${APP_DIR}/AppRun" << 'APPRUN_EOF'
#!/bin/bash
# PatentForgeLocal AppRun — ensures Ollama is available before launching the tray app.
SELF=$(readlink -f "$0")
HERE=${SELF%/*}
export PATH="${HERE}/usr/bin:${PATH}"

OLLAMA_OK=false

# Step 1: Check if Ollama is already running
if curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  OLLAMA_OK=true
fi

# Step 2: Try bundled Ollama (if present from a previous download or manual placement)
if [ "$OLLAMA_OK" = false ] && [ -x "${HERE}/usr/bin/runtime/ollama/ollama" ]; then
  echo "Starting bundled Ollama..."
  "${HERE}/usr/bin/runtime/ollama/ollama" serve &
  for i in $(seq 1 15); do
    sleep 1
    if curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
      OLLAMA_OK=true
      break
    fi
  done
fi

# Step 3: Try system Ollama
if [ "$OLLAMA_OK" = false ] && command -v ollama >/dev/null 2>&1; then
  echo "Starting system Ollama..."
  ollama serve &
  for i in $(seq 1 15); do
    sleep 1
    if curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
      OLLAMA_OK=true
      break
    fi
  done
fi

# Step 4: Download and install Ollama
if [ "$OLLAMA_OK" = false ]; then
  echo ""
  echo "Ollama is not installed. Installing now (one-time setup)..."
  echo ""
  if curl -fsSL https://ollama.com/install.sh | sh; then
    echo "Starting Ollama..."
    ollama serve &
    for i in $(seq 1 15); do
      sleep 1
      if curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
        OLLAMA_OK=true
        break
      fi
    done
  fi
fi

if [ "$OLLAMA_OK" = false ]; then
  echo ""
  echo "ERROR: Could not start Ollama."
  echo "Install it manually from https://ollama.com and try again."
  echo ""
  exit 1
fi

exec "${HERE}/usr/bin/patentforgelocal-tray" "$@"
APPRUN_EOF
chmod +x "${APP_DIR}/AppRun"

# Download appimagetool if not present
if [ ! -f appimagetool ]; then
    curl -L -o appimagetool https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage
    chmod +x appimagetool
fi

# Build AppImage
mkdir -p build
ARCH=x86_64 ./appimagetool "${APP_DIR}" "build/${APP_NAME}-${VERSION}.AppImage"

echo "=== AppImage built: build/${APP_NAME}-${VERSION}.AppImage ==="
