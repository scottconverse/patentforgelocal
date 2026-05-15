package config

import (
	"os"
	"path/filepath"
	"strings"
)

// Edition identifies the installer artifact a copy of PatentForge was installed
// from. Lean ships without an Ollama runtime bundle and is cloud-only; Full
// ships Ollama + Gemma 4 bundled so the user can run locally or in the cloud.
//
// The marker file is written by the installer into <BaseDir>/config/edition.txt.
// When the marker is missing (existing v0.4 installs predate this split), the
// default is Full — those installs already have Ollama bundled, which matches
// the Full edition's behavior.
type Edition string

const (
	EditionFull Edition = "Full"
	EditionLean Edition = "Lean"

	// EditionMarkerFile is the relative path within ConfigDir that holds the
	// edition string written by the installer.
	EditionMarkerFile = "edition.txt"
)

// ReadEdition reads <baseDir>/config/edition.txt and returns the parsed edition.
// Missing file, unreadable file, and invalid contents all return EditionFull —
// the safe default for in-place upgrades from a single-edition predecessor.
func ReadEdition(baseDir string) Edition {
	path := filepath.Join(baseDir, "config", EditionMarkerFile)
	data, err := os.ReadFile(path)
	if err != nil {
		return EditionFull
	}

	switch strings.ToLower(strings.TrimSpace(string(data))) {
	case "lean":
		return EditionLean
	case "full":
		return EditionFull
	default:
		return EditionFull
	}
}

// ShouldStartOllama returns true iff the tray should manage Ollama as a
// service-0 child process. Ollama only runs when:
//   - the install carries the runtime (Full edition), AND
//   - the user's settings select the LOCAL provider.
//
// Lean installs have no Ollama binary on disk; CLOUD-mode users on Full
// installs have it on disk but don't need the process running (saves RAM).
func ShouldStartOllama(edition Edition, provider string) bool {
	return edition == EditionFull && strings.ToUpper(strings.TrimSpace(provider)) == "LOCAL"
}
