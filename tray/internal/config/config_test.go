package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoad_CreatesDirectories(t *testing.T) {
	base := t.TempDir()

	cfg, err := Load(base)
	if err != nil {
		t.Fatalf("Load() error: %v", err)
	}

	for _, dir := range []string{cfg.DataDir, cfg.LogsDir, cfg.ConfigDir, cfg.ModelsDir} {
		info, err := os.Stat(dir)
		if err != nil {
			t.Errorf("expected directory %s to exist, got error: %v", dir, err)
			continue
		}
		if !info.IsDir() {
			t.Errorf("expected %s to be a directory", dir)
		}
	}
}

func TestLoad_DefaultPorts(t *testing.T) {
	base := t.TempDir()

	cfg, err := Load(base)
	if err != nil {
		t.Fatalf("Load() error: %v", err)
	}

	if cfg.PortUI != 3000 {
		t.Errorf("PortUI = %d, want 3000", cfg.PortUI)
	}
	if cfg.PortOllama != 11434 {
		t.Errorf("PortOllama = %d, want 11434", cfg.PortOllama)
	}
	if cfg.OllamaModel != "gemma4:26b" {
		t.Errorf("OllamaModel = %q, want %q", cfg.OllamaModel, "gemma4:26b")
	}
}

func TestLoad_GeneratesEnvFile(t *testing.T) {
	base := t.TempDir()

	cfg, err := Load(base)
	if err != nil {
		t.Fatalf("Load() error: %v", err)
	}

	data, err := os.ReadFile(cfg.EnvFile)
	if err != nil {
		t.Fatalf("failed to read .env file: %v", err)
	}

	content := string(data)
	if !strings.Contains(content, "DATABASE_URL=") {
		t.Error(".env missing DATABASE_URL")
	}
	if !strings.Contains(content, "INTERNAL_SERVICE_SECRET=") {
		t.Error(".env missing INTERNAL_SERVICE_SECRET")
	}
	if cfg.DatabaseURL == "" {
		t.Error("DatabaseURL should not be empty")
	}
	if cfg.ServiceSecret == "" {
		t.Error("ServiceSecret should not be empty")
	}
}

func TestLoad_ReadsExistingEnvFile(t *testing.T) {
	base := t.TempDir()

	// First load creates the config
	cfg1, err := Load(base)
	if err != nil {
		t.Fatalf("first Load() error: %v", err)
	}

	secret1 := cfg1.ServiceSecret
	dbURL1 := cfg1.DatabaseURL

	// Second load reads existing config
	cfg2, err := Load(base)
	if err != nil {
		t.Fatalf("second Load() error: %v", err)
	}

	if cfg2.ServiceSecret != secret1 {
		t.Errorf("ServiceSecret changed: %q -> %q", secret1, cfg2.ServiceSecret)
	}
	if cfg2.DatabaseURL != dbURL1 {
		t.Errorf("DatabaseURL changed: %q -> %q", dbURL1, cfg2.DatabaseURL)
	}
}

func TestLoad_DatabaseFilename(t *testing.T) {
	base := t.TempDir()

	cfg, err := Load(base)
	if err != nil {
		t.Fatalf("Load() error: %v", err)
	}

	expectedSuffix := filepath.Join("data", "patentforgelocal.db")
	if !strings.HasSuffix(cfg.DatabaseURL, expectedSuffix) {
		t.Errorf("DatabaseURL = %q, want suffix %q", cfg.DatabaseURL, expectedSuffix)
	}
	if !strings.HasPrefix(cfg.DatabaseURL, "file:") {
		t.Errorf("DatabaseURL = %q, want prefix %q", cfg.DatabaseURL, "file:")
	}
}
