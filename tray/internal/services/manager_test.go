package services

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/scottconverse/patentforge/tray/internal/config"
)

func writeMarker(t *testing.T, baseDir, name, content string) {
	t.Helper()
	configDir := filepath.Join(baseDir, "config")
	if err := os.MkdirAll(configDir, 0755); err != nil {
		t.Fatalf("failed to create config dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(configDir, name), []byte(content), 0644); err != nil {
		t.Fatalf("failed to write marker %s: %v", name, err)
	}
}

func newManagerForTest(t *testing.T, baseDir string) *Manager {
	t.Helper()
	cfg, err := config.Load(baseDir)
	if err != nil {
		t.Fatalf("config.Load(%s) error: %v", baseDir, err)
	}
	return NewManager(cfg)
}

func hasService(mgr *Manager, name string) bool {
	for _, s := range mgr.Services() {
		if s.Name == name {
			return true
		}
	}
	return false
}

func TestManager_OllamaInclusion(t *testing.T) {
	tests := []struct {
		name            string
		editionMarker   string // empty = don't write marker
		providerMarker  string // empty = don't write marker
		wantOllama      bool
		wantServiceLen  int
		wantOllamaFirst bool // when included, Ollama is service-0
	}{
		{
			name:            "no markers (legacy v0.4 install) → Full+LOCAL → Ollama present",
			editionMarker:   "",
			providerMarker:  "",
			wantOllama:      true,
			wantServiceLen:  6,
			wantOllamaFirst: true,
		},
		{
			name:           "Full + LOCAL → Ollama present",
			editionMarker:  "Full",
			providerMarker: "LOCAL",
			wantOllama:     true,
			wantServiceLen: 6,
			wantOllamaFirst: true,
		},
		{
			name:           "Full + CLOUD → Ollama dropped (RAM save)",
			editionMarker:  "Full",
			providerMarker: "CLOUD",
			wantOllama:     false,
			wantServiceLen: 5,
		},
		{
			name:           "Lean + LOCAL → Ollama dropped (no binary on disk)",
			editionMarker:  "Lean",
			providerMarker: "LOCAL",
			wantOllama:     false,
			wantServiceLen: 5,
		},
		{
			name:           "Lean + CLOUD → Ollama dropped",
			editionMarker:  "Lean",
			providerMarker: "CLOUD",
			wantOllama:     false,
			wantServiceLen: 5,
		},
		{
			name:           "Full + missing provider → defaults LOCAL → Ollama present",
			editionMarker:  "Full",
			providerMarker: "",
			wantOllama:     true,
			wantServiceLen: 6,
			wantOllamaFirst: true,
		},
		{
			name:           "Lean + missing provider → still drops (edition gate wins)",
			editionMarker:  "Lean",
			providerMarker: "",
			wantOllama:     false,
			wantServiceLen: 5,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			base := t.TempDir()
			if tc.editionMarker != "" {
				writeMarker(t, base, config.EditionMarkerFile, tc.editionMarker)
			}
			if tc.providerMarker != "" {
				writeMarker(t, base, config.ProviderMarkerFile, tc.providerMarker)
			}

			mgr := newManagerForTest(t, base)

			got := hasService(mgr, "ollama")
			if got != tc.wantOllama {
				t.Errorf("Ollama in services list = %v, want %v (edition=%s provider=%s; OllamaEnabled=%v)",
					got, tc.wantOllama, mgr.Edition(), mgr.Provider(), mgr.OllamaEnabled())
			}

			if len(mgr.Services()) != tc.wantServiceLen {
				t.Errorf("len(services) = %d, want %d (services=%v)",
					len(mgr.Services()), tc.wantServiceLen, serviceNames(mgr.Services()))
			}

			if tc.wantOllamaFirst && tc.wantOllama {
				if first := mgr.Services()[0].Name; first != "ollama" {
					t.Errorf("services[0] = %q, want %q (Ollama must start first when present)", first, "ollama")
				}
			}
		})
	}
}

func TestManager_OllamaEnabledMatchesConfigPredicate(t *testing.T) {
	base := t.TempDir()
	writeMarker(t, base, config.EditionMarkerFile, "Full")
	writeMarker(t, base, config.ProviderMarkerFile, "LOCAL")

	mgr := newManagerForTest(t, base)

	if !mgr.OllamaEnabled() {
		t.Error("OllamaEnabled() = false on Full+LOCAL, want true")
	}
	if mgr.Edition() != config.EditionFull {
		t.Errorf("Edition() = %q, want %q", mgr.Edition(), config.EditionFull)
	}
	if mgr.Provider() != "LOCAL" {
		t.Errorf("Provider() = %q, want %q", mgr.Provider(), "LOCAL")
	}
}

func serviceNames(services []*Service) []string {
	out := make([]string, len(services))
	for i, s := range services {
		out[i] = s.Name
	}
	return out
}
