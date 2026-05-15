# Installer edition markers

Single-line marker files copied into `<app>/config/edition.txt` by each
platform installer. The tray reads this file at startup to decide whether
to manage the local Ollama process; the backend reads it on boot to mirror
the value into `AppSettings.installEdition` for the frontend.

Default for in-place upgrades that predate this marker is `Full` (matches
historical single-edition behavior). Trim whitespace and lowercase the
match; the parser accepts case-insensitive `Lean` / `Full`.

See:
- `tray/internal/config/edition.go` — `ReadEdition()`
- `backend/src/settings/config-marker.ts` — `readEditionMarker()`
- `installer/windows/patentforgelocal.iss` — Windows install-time copy
- `installer/mac/build-dmg.sh` — macOS install-time copy
- `installer/linux/build-appimage.sh` — Linux install-time copy

Introduced in PatentForge merge plan Run 6.
