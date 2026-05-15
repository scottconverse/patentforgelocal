#!/bin/bash
# Build the PatentForge Linux AppImage.
#
# Run 6: emits one AppImage per edition. `EDITION=Full` (default) keeps the
# Ollama auto-install AppRun; `EDITION=Lean` bakes a trivial AppRun that
# does no Ollama bootstrap (cloud-only). Pass `EDITION=Lean` env or
# `$1=Lean` to override.
set -e

EDITION="${EDITION:-${1:-Full}}"
case "$EDITION" in
  Full|Lean) ;;
  *) echo "ERROR: EDITION must be Full or Lean (got '$EDITION')"; exit 1 ;;
esac

echo "=== Building Linux AppImage (edition=$EDITION) ==="

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

VERSION=$(node -e "console.log(require('./backend/package.json').version)")
APP_NAME="PatentForge"
APP_DIR="build/${APP_NAME}-${EDITION}.AppDir"

# Create AppDir structure
mkdir -p "${APP_DIR}/usr/bin"
mkdir -p "${APP_DIR}/usr/bin/config"
mkdir -p "${APP_DIR}/usr/share/applications"
mkdir -p "${APP_DIR}/usr/share/icons/hicolor/256x256/apps"

# Edition marker — read by tray + backend at startup (see installer/marker/README.md)
cp "$SCRIPT_DIR/../marker/edition-${EDITION}.txt" "${APP_DIR}/usr/bin/config/edition.txt"

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
Name=PatentForge
Exec=patentforgelocal-tray
Icon=patentforgelocal
Type=Application
Categories=Office;
Comment=Patent analysis and preparation tool
EOF
cp "${APP_DIR}/patentforgelocal.desktop" "${APP_DIR}/usr/share/applications/"

# AppRun — Ollama pre-flight (Full) or pass-through (Lean).
if [ "$EDITION" = "Lean" ]; then
  cat > "${APP_DIR}/AppRun" << 'LEAN_APPRUN_EOF'
#!/bin/bash
# PatentForge AppRun — Lean edition (cloud-only). No Ollama bootstrap.
SELF=$(readlink -f "$0")
HERE=${SELF%/*}
export PATH="${HERE}/usr/bin:${PATH}"
exec "${HERE}/usr/bin/patentforgelocal-tray" "$@"
LEAN_APPRUN_EOF
else
  cat > "${APP_DIR}/AppRun" << 'FULL_APPRUN_EOF'
#!/bin/bash
# PatentForge AppRun — Full edition. Ensures Ollama is available
# before launching the tray app.
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
FULL_APPRUN_EOF
fi
chmod +x "${APP_DIR}/AppRun"

# Download appimagetool if not present
if [ ! -f appimagetool ]; then
    curl -L -o appimagetool https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage
    chmod +x appimagetool
fi

# Build AppImage
mkdir -p build
ARCH=x86_64 ./appimagetool "${APP_DIR}" "build/${APP_NAME}-${EDITION}-${VERSION}.AppImage"

echo "=== AppImage built: build/${APP_NAME}-${EDITION}-${VERSION}.AppImage ==="
