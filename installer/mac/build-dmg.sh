#!/bin/bash
set -e
echo "=== Building Mac .dmg ==="

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

VERSION=$(node -e "console.log(require('./backend/package.json').version)")
APP_NAME="PatentForge"
APP_DIR="build/${APP_NAME}.app"

# Create .app bundle structure
mkdir -p "${APP_DIR}/Contents/MacOS"
mkdir -p "${APP_DIR}/Contents/Resources"

# Copy tray binary
cp patentforge-tray "${APP_DIR}/Contents/MacOS/"

# Copy resources
cp patentforge-backend "${APP_DIR}/Contents/Resources/"
cp patentforge-feasibility "${APP_DIR}/Contents/Resources/"
cp -r patentforge-backend-prisma "${APP_DIR}/Contents/Resources/"
cp -r patentforge-feasibility-prompts "${APP_DIR}/Contents/Resources/"
cp -r runtime "${APP_DIR}/Contents/Resources/"
cp -r services "${APP_DIR}/Contents/Resources/"

# Create Info.plist
cat > "${APP_DIR}/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleDisplayName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleIdentifier</key>
    <string>com.scottconverse.patentforge</string>
    <key>CFBundleVersion</key>
    <string>${VERSION}</string>
    <key>CFBundleShortVersionString</key>
    <string>${VERSION}</string>
    <key>CFBundleExecutable</key>
    <string>patentforge-tray</string>
    <key>LSMinimumSystemVersion</key>
    <string>11.0</string>
    <key>LSUIElement</key>
    <true/>
</dict>
</plist>
EOF

# Create .dmg
mkdir -p build
hdiutil create -volname "${APP_NAME}" -srcfolder "${APP_DIR}" -ov -format UDZO "build/${APP_NAME}-${VERSION}.dmg"

echo "=== Mac .dmg built: build/${APP_NAME}-${VERSION}.dmg ==="
