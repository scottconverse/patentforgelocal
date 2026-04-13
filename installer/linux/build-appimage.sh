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

# Bundle Ollama
if [ -d "runtime/ollama" ]; then
  echo "  Copying Ollama runtime..."
  mkdir -p "${APP_DIR}/usr/bin/runtime/ollama"
  cp -r runtime/ollama/* "${APP_DIR}/usr/bin/runtime/ollama/"
fi

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

# Create AppRun
cat > "${APP_DIR}/AppRun" << 'EOF'
#!/bin/bash
SELF=$(readlink -f "$0")
HERE=${SELF%/*}
export PATH="${HERE}/usr/bin:${PATH}"
exec "${HERE}/usr/bin/patentforgelocal-tray" "$@"
EOF
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
