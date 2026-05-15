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

	// ProviderMarkerFile is the relative path within ConfigDir that mirrors
	// the active AppSettings.provider value. The backend writes it on every
	// Settings save so the tray (Go, no DB driver) can read the active
	// provider at startup without querying the backend.
	ProviderMarkerFile = "provider.txt"

	// DefaultProvider matches the backend's default for fresh installs +
	// existing v0.4 upgrades. The tray uses it whenever the marker is
	// missing or unreadable.
	DefaultProvider = "LOCAL"
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

// ReadProviderMarker reads <baseDir>/config/provider.txt and returns the
// active provider string (uppercased, "LOCAL" or "CLOUD"). The backend
// writes this file on every Settings save so the tray can decide whether to
// manage Ollama without a DB driver. Missing/unreadable/invalid contents
// return DefaultProvider ("LOCAL") — preserving pre-merge behavior.
func ReadProviderMarker(baseDir string) string {
	path := filepath.Join(baseDir, "config", ProviderMarkerFile)
	data, err := os.ReadFile(path)
	if err != nil {
		return DefaultProvider
	}

	v := strings.ToUpper(strings.TrimSpace(string(data)))
	switch v {
	case "LOCAL", "CLOUD":
		return v
	default:
		return DefaultProvider
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
