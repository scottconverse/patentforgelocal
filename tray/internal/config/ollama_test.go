package config

import (
	"os"
	"path/filepath"
	"runtime"
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

	// Base env always has these 4 vars; Linux may add HSA vars from .env.hardware
	if len(env) < 4 {
		t.Fatalf("OllamaEnv() returned %d vars, want at least 4", len(env))
	}

	expected := map[string]bool{
		"OLLAMA_HOST":    false,
		"OLLAMA_MODELS":  false,
		"OLLAMA_TMPDIR":  false,
		"OLLAMA_NOPRUNE": false,
	}

	for _, v := range env {
		key := strings.SplitN(v, "=", 2)[0]
		if _, ok := expected[key]; ok {
			expected[key] = true
		}
	}

	for key, found := range expected {
		if !found {
			t.Errorf("missing env var: %s", key)
		}
	}
}

func TestReadGPUEnv_NoFile(t *testing.T) {
	base := t.TempDir()

	cfg, err := Load(base)
	if err != nil {
		t.Fatalf("Load() error: %v", err)
	}

	// No .env.hardware file — should return nil
	extra := cfg.readGPUEnv()
	if extra != nil {
		t.Errorf("readGPUEnv() with no file = %v, want nil", extra)
	}
}

func TestReadGPUEnv_WithHSAOverride(t *testing.T) {
	base := t.TempDir()

	cfg, err := Load(base)
	if err != nil {
		t.Fatalf("Load() error: %v", err)
	}

	// Write a .env.hardware with HSA override
	hwFile := filepath.Join(base, ".env.hardware")
	content := "PATENTFORGELOCAL_HSA_OVERRIDE=\"11.0.0\"\nPATENTFORGELOCAL_GPU_ENABLED=true\n"
	if err := os.WriteFile(hwFile, []byte(content), 0644); err != nil {
		t.Fatalf("failed to write .env.hardware: %v", err)
	}

	extra := cfg.readGPUEnv()
	if len(extra) != 2 {
		t.Fatalf("readGPUEnv() returned %d vars, want 2", len(extra))
	}

	if extra[0] != "HSA_OVERRIDE_GFX_VERSION=11.0.0" {
		t.Errorf("extra[0] = %q, want %q", extra[0], "HSA_OVERRIDE_GFX_VERSION=11.0.0")
	}
	if extra[1] != "HSA_ENABLE_SDMA=0" {
		t.Errorf("extra[1] = %q, want %q", extra[1], "HSA_ENABLE_SDMA=0")
	}
}

func TestReadGPUEnv_EmptyOverride(t *testing.T) {
	base := t.TempDir()

	cfg, err := Load(base)
	if err != nil {
		t.Fatalf("Load() error: %v", err)
	}

	// Write a .env.hardware with empty HSA override (e.g. Windows or no AMD GPU)
	hwFile := filepath.Join(base, ".env.hardware")
	content := "PATENTFORGELOCAL_HSA_OVERRIDE=\"\"\nPATENTFORGELOCAL_GPU_ENABLED=true\n"
	if err := os.WriteFile(hwFile, []byte(content), 0644); err != nil {
		t.Fatalf("failed to write .env.hardware: %v", err)
	}

	extra := cfg.readGPUEnv()
	if len(extra) != 0 {
		t.Errorf("readGPUEnv() with empty override = %v, want empty", extra)
	}
}

func TestOllamaEnv_GPUVarsOnlyOnLinux(t *testing.T) {
	base := t.TempDir()

	cfg, err := Load(base)
	if err != nil {
		t.Fatalf("Load() error: %v", err)
	}

	hwFile := filepath.Join(base, ".env.hardware")
	content := "PATENTFORGELOCAL_HSA_OVERRIDE=\"11.0.0\"\n"
	if err := os.WriteFile(hwFile, []byte(content), 0644); err != nil {
		t.Fatalf("failed to write .env.hardware: %v", err)
	}

	env := cfg.OllamaEnv()

	hasHSA := false
	for _, v := range env {
		if strings.HasPrefix(v, "HSA_OVERRIDE_GFX_VERSION=") {
			hasHSA = true
		}
	}

	if runtime.GOOS == "linux" {
		// On Linux, OllamaEnv should inject HSA vars from .env.hardware
		if !hasHSA {
			t.Error("OllamaEnv() on Linux should include HSA_OVERRIDE_GFX_VERSION")
		}
		if len(env) != 6 {
			t.Errorf("OllamaEnv() on Linux with GPU = %d vars, want 6", len(env))
		}
	} else {
		// On Windows/macOS, OllamaEnv should NOT inject HSA vars
		if hasHSA {
			t.Error("OllamaEnv() on non-Linux should not include HSA_OVERRIDE_GFX_VERSION")
		}
		if len(env) != 4 {
			t.Errorf("OllamaEnv() on non-Linux = %d vars, want 4", len(env))
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
