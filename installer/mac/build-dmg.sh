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

# Copy tray binary (renamed so the wrapper script can call it)
cp patentforgelocal-tray "${APP_DIR}/Contents/MacOS/patentforgelocal-tray-bin"

# Create Ollama pre-flight wrapper script as CFBundleExecutable
cat > "${APP_DIR}/Contents/MacOS/patentforgelocal-tray" << 'WRAPPER_EOF'
#!/bin/bash
# PatentForgeLocal Mac launcher — ensures Ollama is available before starting.
DIR="$(cd "$(dirname "$0")" && pwd)"
RESOURCES="${DIR}/../Resources"

OLLAMA_OK=false

# Step 1: Check if Ollama is already running
if curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  OLLAMA_OK=true
fi

# Step 2: Try bundled Ollama (if present from manual placement)
if [ "$OLLAMA_OK" = false ] && [ -x "${RESOURCES}/runtime/ollama/ollama" ]; then
  echo "Starting bundled Ollama..."
  "${RESOURCES}/runtime/ollama/ollama" serve &
  for i in $(seq 1 15); do
    sleep 1
    if curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
      OLLAMA_OK=true
      break
    fi
  done
fi

# Step 3: Try system Ollama (brew install ollama or manual install)
if [ "$OLLAMA_OK" = false ]; then
  # Check common Ollama install locations on Mac
  for OLLAMA_BIN in /usr/local/bin/ollama /opt/homebrew/bin/ollama "$HOME/.ollama/bin/ollama"; do
    if [ -x "$OLLAMA_BIN" ]; then
      echo "Starting system Ollama at ${OLLAMA_BIN}..."
      "$OLLAMA_BIN" serve &
      for i in $(seq 1 15); do
        sleep 1
        if curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
          OLLAMA_OK=true
          break
        fi
      done
      break
    fi
  done
fi

# Step 4: Download and install Ollama via official installer
if [ "$OLLAMA_OK" = false ]; then
  echo ""
  echo "Ollama is not installed. Installing now (one-time setup)..."
  echo ""
  if curl -fsSL https://ollama.com/install.sh | sh; then
    echo "Starting Ollama..."
    # After install, ollama should be in PATH or /usr/local/bin
    OLLAMA_CMD=$(command -v ollama || echo "/usr/local/bin/ollama")
    "$OLLAMA_CMD" serve &
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
  # Show a macOS dialog since we're a GUI app — no terminal visible
  osascript -e 'display dialog "Ollama is required but could not be installed automatically.\n\nPlease install it from https://ollama.com and relaunch PatentForgeLocal." buttons {"Open Download Page", "Quit"} default button "Open Download Page" with icon caution with title "PatentForgeLocal"' \
    -e 'if button returned of result is "Open Download Page" then' \
    -e '  open location "https://ollama.com/download/mac"' \
    -e 'end if'
  exit 1
fi

exec "${DIR}/patentforgelocal-tray-bin" "$@"
WRAPPER_EOF
chmod +x "${APP_DIR}/Contents/MacOS/patentforgelocal-tray"

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

# Ollama is auto-downloaded on first run by the wrapper script in Contents/MacOS/.
# The wrapper checks: running → bundled → system install → download from ollama.com.
# Since the app is unsigned, users must xattr -cr the .app anyway, so Gatekeeper
# won't block the wrapper script after quarantine is cleared.

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

# Disable Spotlight indexing on the .app directory — prevents "Resource busy"
# errors from mds (Spotlight) locking files during hdiutil create.
# See: https://github.com/actions/runner-images/issues/7522
sudo mdutil -i off "${APP_DIR}" 2>/dev/null || true
sudo mdutil -i off "$(dirname "${APP_DIR}")" 2>/dev/null || true

# Create .dmg
mkdir -p build
hdiutil create -volname "${APP_NAME}" -srcfolder "${APP_DIR}" -ov -format UDZO "build/${APP_NAME}-${VERSION}.dmg"

echo "=== Mac .dmg built: build/${APP_NAME}-${VERSION}.dmg ==="
