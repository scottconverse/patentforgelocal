package config

import (
	"os"
	"path/filepath"
	"testing"
)

func writeEditionMarker(t *testing.T, baseDir, content string) {
	t.Helper()
	writeMarker(t, baseDir, EditionMarkerFile, content)
}

func writeProviderMarker(t *testing.T, baseDir, content string) {
	t.Helper()
	writeMarker(t, baseDir, ProviderMarkerFile, content)
}

func writeMarker(t *testing.T, baseDir, name, content string) {
	t.Helper()
	configDir := filepath.Join(baseDir, "config")
	if err := os.MkdirAll(configDir, 0755); err != nil {
		t.Fatalf("failed to create config dir: %v", err)
	}
	path := filepath.Join(configDir, name)
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("failed to write marker %s: %v", name, err)
	}
}

func TestReadEdition_FileMissing_DefaultsFull(t *testing.T) {
	base := t.TempDir()

	got := ReadEdition(base)
	if got != EditionFull {
		t.Errorf("ReadEdition(no file) = %q, want %q", got, EditionFull)
	}
}

func TestReadEdition_LeanContent(t *testing.T) {
	base := t.TempDir()
	writeEditionMarker(t, base, "Lean")

	got := ReadEdition(base)
	if got != EditionLean {
		t.Errorf("ReadEdition(Lean) = %q, want %q", got, EditionLean)
	}
}

func TestReadEdition_FullContent(t *testing.T) {
	base := t.TempDir()
	writeEditionMarker(t, base, "Full")

	got := ReadEdition(base)
	if got != EditionFull {
		t.Errorf("ReadEdition(Full) = %q, want %q", got, EditionFull)
	}
}

func TestReadEdition_InvalidContent_DefaultsFull(t *testing.T) {
	base := t.TempDir()
	writeEditionMarker(t, base, "Maximal")

	got := ReadEdition(base)
	if got != EditionFull {
		t.Errorf("ReadEdition(invalid) = %q, want %q (default)", got, EditionFull)
	}
}

func TestReadEdition_TrimsWhitespaceAndCase(t *testing.T) {
	base := t.TempDir()
	writeEditionMarker(t, base, "  lean\n")

	got := ReadEdition(base)
	if got != EditionLean {
		t.Errorf("ReadEdition(\"  lean\\n\") = %q, want %q", got, EditionLean)
	}
}

func TestReadEdition_EmptyFile_DefaultsFull(t *testing.T) {
	base := t.TempDir()
	writeEditionMarker(t, base, "")

	got := ReadEdition(base)
	if got != EditionFull {
		t.Errorf("ReadEdition(empty) = %q, want %q (default)", got, EditionFull)
	}
}

func TestReadProviderMarker_FileMissing_DefaultsLocal(t *testing.T) {
	base := t.TempDir()

	got := ReadProviderMarker(base)
	if got != DefaultProvider {
		t.Errorf("ReadProviderMarker(no file) = %q, want %q", got, DefaultProvider)
	}
}

func TestReadProviderMarker_LocalContent(t *testing.T) {
	base := t.TempDir()
	writeProviderMarker(t, base, "LOCAL")

	got := ReadProviderMarker(base)
	if got != "LOCAL" {
		t.Errorf("ReadProviderMarker(LOCAL) = %q, want %q", got, "LOCAL")
	}
}

func TestReadProviderMarker_CloudContent(t *testing.T) {
	base := t.TempDir()
	writeProviderMarker(t, base, "CLOUD")

	got := ReadProviderMarker(base)
	if got != "CLOUD" {
		t.Errorf("ReadProviderMarker(CLOUD) = %q, want %q", got, "CLOUD")
	}
}

func TestReadProviderMarker_TrimsWhitespaceAndCase(t *testing.T) {
	base := t.TempDir()
	writeProviderMarker(t, base, "  cloud\n")

	got := ReadProviderMarker(base)
	if got != "CLOUD" {
		t.Errorf("ReadProviderMarker(\"  cloud\\n\") = %q, want %q", got, "CLOUD")
	}
}

func TestReadProviderMarker_InvalidContent_DefaultsLocal(t *testing.T) {
	base := t.TempDir()
	writeProviderMarker(t, base, "OFFGRID")

	got := ReadProviderMarker(base)
	if got != DefaultProvider {
		t.Errorf("ReadProviderMarker(invalid) = %q, want %q (default)", got, DefaultProvider)
	}
}

func TestReadProviderMarker_EmptyFile_DefaultsLocal(t *testing.T) {
	base := t.TempDir()
	writeProviderMarker(t, base, "")

	got := ReadProviderMarker(base)
	if got != DefaultProvider {
		t.Errorf("ReadProviderMarker(empty) = %q, want %q (default)", got, DefaultProvider)
	}
}

func TestShouldStartOllama(t *testing.T) {
	tests := []struct {
		name     string
		edition  Edition
		provider string
		want     bool
	}{
		{"Full + LOCAL → start", EditionFull, "LOCAL", true},
		{"Full + CLOUD → skip (RAM save)", EditionFull, "CLOUD", false},
		{"Lean + LOCAL → skip (no binary on disk)", EditionLean, "LOCAL", false},
		{"Lean + CLOUD → skip (no binary, no need)", EditionLean, "CLOUD", false},
		{"Full + lowercase local → start (case-insensitive)", EditionFull, "local", true},
		{"Full + whitespace LOCAL → start (trimmed)", EditionFull, "  LOCAL  ", true},
		{"Full + empty provider → skip (missing setting)", EditionFull, "", false},
		{"Full + unknown provider → skip", EditionFull, "MAGIC", false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := ShouldStartOllama(tc.edition, tc.provider)
			if got != tc.want {
				t.Errorf("ShouldStartOllama(%q, %q) = %v, want %v",
					tc.edition, tc.provider, got, tc.want)
			}
		})
	}
}
