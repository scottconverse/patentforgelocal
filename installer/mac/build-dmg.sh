#!/bin/bash
set -e
echo "=== Building Mac .dmg ==="

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

VERSION=$(node -e "console.log(require('./backend/package.json').version)")
APP_NAME="PatentForgeLocal"
APP_DIR="build/${APP_NAME}.app"

# Create .app bundle structure
mkdir -p "${APP_DIR}/Contents/MacOS"
mkdir -p "${APP_DIR}/Contents/Resources"

# Copy tray binary
cp patentforgelocal-tray "${APP_DIR}/Contents/MacOS/"

# Copy resources
cp patentforgelocal-backend "${APP_DIR}/Contents/Resources/"
cp patentforgelocal-feasibility "${APP_DIR}/Contents/Resources/"
cp -r patentforgelocal-backend-prisma "${APP_DIR}/Contents/Resources/"
cp -r patentforgelocal-feasibility-prompts "${APP_DIR}/Contents/Resources/"

# Copy Python services (source only, no node_modules/tests/__pycache__)
for svc in claim-drafter application-generator compliance-checker; do
  mkdir -p "${APP_DIR}/Contents/Resources/services/${svc}"
  cp -r "services/${svc}/src" "${APP_DIR}/Contents/Resources/services/${svc}/"
done

# Copy portable Python runtime
if [ -d "runtime/python" ]; then
  mkdir -p "${APP_DIR}/Contents/Resources/runtime/python"
  cp -r runtime/python/* "${APP_DIR}/Contents/Resources/runtime/python/"
fi

# Ollama is NOT bundled on Mac — Gatekeeper quarantines unsigned scripts
# inside unsigned .app bundles. Users install Ollama from ollama.com.
# Auto-download wrapper deferred to v0.1.2 (requires signing cert).

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
    <string>com.scottconverse.patentforgelocal</string>
    <key>CFBundleVersion</key>
    <string>${VERSION}</string>
    <key>CFBundleShortVersionString</key>
    <string>${VERSION}</string>
    <key>CFBundleExecutable</key>
    <string>patentforgelocal-tray</string>
    <key>LSMinimumSystemVersion</key>
    <string>11.0</string>
    <key>LSUIElement</key>
    <true/>
</dict>
</plist>
EOF

# Code signing (requires Apple Developer account + certificate)
# To sign: codesign --deep --force --sign "Developer ID Application: Your Name" "${APP_DIR}"
# To notarize: xcrun notarytool submit "build/${APP_NAME}-${VERSION}.dmg" --apple-id ... --team-id ...
# Without signing, users must right-click → Open or run: xattr -cr /Applications/PatentForgeLocal.app
echo "  NOTE: DMG is unsigned. Users will see Gatekeeper warning on first launch."

# Flush writes before creating DMG (prevents "Resource busy" on CI)
sync

# Create .dmg
mkdir -p build
hdiutil create -volname "${APP_NAME}" -srcfolder "${APP_DIR}" -ov -format UDZO "build/${APP_NAME}-${VERSION}.dmg"

echo "=== Mac .dmg built: build/${APP_NAME}-${VERSION}.dmg ==="
