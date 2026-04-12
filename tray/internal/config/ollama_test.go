package config

import (
	"strings"
	"testing"
)

func TestOllamaEnv(t *testing.T) {
	base := t.TempDir()

	cfg, err := Load(base)
	if err != nil {
		t.Fatalf("Load() error: %v", err)
	}

	env := cfg.OllamaEnv()
	if len(env) != 4 {
		t.Fatalf("OllamaEnv() returned %d vars, want 4", len(env))
	}

	expected := map[string]bool{
		"OLLAMA_HOST":    false,
		"OLLAMA_MODELS":  false,
		"OLLAMA_TMPDIR":  false,
		"OLLAMA_NOPRUNE": false,
	}

	for _, v := range env {
		key := strings.SplitN(v, "=", 2)[0]
		if _, ok := expected[key]; !ok {
			t.Errorf("unexpected env var: %s", key)
		} else {
			expected[key] = true
		}
	}

	for key, found := range expected {
		if !found {
			t.Errorf("missing env var: %s", key)
		}
	}
}

func TestOllamaURL(t *testing.T) {
	base := t.TempDir()

	cfg, err := Load(base)
	if err != nil {
		t.Fatalf("Load() error: %v", err)
	}

	url := cfg.OllamaURL()
	want := "http://127.0.0.1:11434"
	if url != want {
		t.Errorf("OllamaURL() = %q, want %q", url, want)
	}
}

func TestOllamaEnv_ModelsDir(t *testing.T) {
	base := t.TempDir()

	cfg, err := Load(base)
	if err != nil {
		t.Fatalf("Load() error: %v", err)
	}

	env := cfg.OllamaEnv()
	found := false
	for _, v := range env {
		if strings.HasPrefix(v, "OLLAMA_MODELS=") {
			found = true
			val := strings.TrimPrefix(v, "OLLAMA_MODELS=")
			if val != cfg.ModelsDir {
				t.Errorf("OLLAMA_MODELS = %q, want %q", val, cfg.ModelsDir)
			}
			if !strings.Contains(val, "models") {
				t.Errorf("OLLAMA_MODELS should contain 'models' directory: %q", val)
			}
		}
	}
	if !found {
		t.Error("OLLAMA_MODELS not found in OllamaEnv() output")
	}
}
