#!/bin/bash
set -e
echo "=== Building Linux AppImage ==="

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

VERSION=$(node -e "console.log(require('./backend/package.json').version)")
APP_NAME="PatentForge"
APP_DIR="build/${APP_NAME}.AppDir"

# Create AppDir structure
mkdir -p "${APP_DIR}/usr/bin"
mkdir -p "${APP_DIR}/usr/share/applications"
mkdir -p "${APP_DIR}/usr/share/icons/hicolor/256x256/apps"

# Copy binaries and resources
cp patentforge-tray "${APP_DIR}/usr/bin/"
cp patentforge-backend "${APP_DIR}/usr/bin/"
cp patentforge-feasibility "${APP_DIR}/usr/bin/"
cp -r patentforge-backend-prisma "${APP_DIR}/usr/bin/"
cp -r patentforge-feasibility-prompts "${APP_DIR}/usr/bin/"
cp -r runtime "${APP_DIR}/usr/bin/"
cp -r services "${APP_DIR}/usr/bin/"

# Copy icon
cp tray/internal/assets/icon.png "${APP_DIR}/usr/share/icons/hicolor/256x256/apps/patentforge.png"
cp tray/internal/assets/icon.png "${APP_DIR}/patentforge.png"

# Create desktop entry
cat > "${APP_DIR}/patentforge.desktop" << EOF
[Desktop Entry]
Name=PatentForge
Exec=patentforge-tray
Icon=patentforge
Type=Application
Categories=Office;
Comment=Patent analysis and preparation tool
EOF
cp "${APP_DIR}/patentforge.desktop" "${APP_DIR}/usr/share/applications/"

# Create AppRun
cat > "${APP_DIR}/AppRun" << 'EOF'
#!/bin/bash
SELF=$(readlink -f "$0")
HERE=${SELF%/*}
export PATH="${HERE}/usr/bin:${PATH}"
exec "${HERE}/usr/bin/patentforge-tray" "$@"
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
