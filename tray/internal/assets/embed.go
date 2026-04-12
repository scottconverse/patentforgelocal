package assets

import _ "embed"

// IconICO is the Windows .ico file (multi-size: 16, 32, 48, 256).
// fyne.io/systray on Windows requires .ico format — PNG is silently ignored.
//
//go:embed icon.ico
var IconICO []byte

// IconPNG kept for backward compatibility (macOS/Linux systray uses PNG).
//
//go:embed icon.png
var IconPNG []byte
