// Package config handles PatentForge configuration loading and generation.
// On first run it creates config/.env with a generated service secret,
// database URL, and default settings.
package config

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Config holds all PatentForge runtime configuration.
type Config struct {
	BaseDir   string
	DataDir   string
	LogsDir   string
	ConfigDir string
	EnvFile   string

	DatabaseURL   string
	ServiceSecret string

	// Port assignments for the 5 services
	PortUI         int // 3000 — Next.js frontend
	PortAPI        int // 3001 — API server
	PortGeneration int // 3002 — Generation service
	PortAnalysis   int // 3003 — Analysis service
	PortResearch   int // 3004 — Research service
}

// Load reads or creates the PatentForge configuration.
// If config/.env does not exist, it generates one with secure defaults.
func Load(baseDir string) (*Config, error) {
	cfg := &Config{
		BaseDir:        baseDir,
		DataDir:        filepath.Join(baseDir, "data"),
		LogsDir:        filepath.Join(baseDir, "logs"),
		ConfigDir:      filepath.Join(baseDir, "config"),
		PortUI:         3000,
		PortAPI:        3001,
		PortGeneration: 3002,
		PortAnalysis:   3003,
		PortResearch:   3004,
	}
	cfg.EnvFile = filepath.Join(cfg.ConfigDir, ".env")

	// Create directories
	for _, dir := range []string{cfg.DataDir, cfg.LogsDir, cfg.ConfigDir} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, fmt.Errorf("failed to create directory %s: %w", dir, err)
		}
	}

	if _, err := os.Stat(cfg.EnvFile); os.IsNotExist(err) {
		// First run — generate config
		if err := cfg.generate(); err != nil {
			return nil, fmt.Errorf("failed to generate config: %w", err)
		}
	} else if err != nil {
		return nil, fmt.Errorf("failed to check config file: %w", err)
	} else {
		// Config exists — read it
		if err := cfg.read(); err != nil {
			return nil, fmt.Errorf("failed to read config: %w", err)
		}
	}

	return cfg, nil
}

// generate creates a new .env file with secure defaults.
func (c *Config) generate() error {
	secret, err := generateSecret(32)
	if err != nil {
		return fmt.Errorf("failed to generate service secret: %w", err)
	}

	c.DatabaseURL = fmt.Sprintf("file:%s", filepath.Join(c.DataDir, "patentforge.db"))
	c.ServiceSecret = secret

	content := fmt.Sprintf(`DATABASE_URL=%s
INTERNAL_SERVICE_SECRET=%s
ALLOWED_ORIGINS=http://localhost:%d
NODE_ENV=production
PORT=%d
`, c.DatabaseURL, c.ServiceSecret, c.PortUI, c.PortUI)

	// Write with owner-only permissions (0600)
	if err := os.WriteFile(c.EnvFile, []byte(content), 0600); err != nil {
		return fmt.Errorf("failed to write %s: %w", c.EnvFile, err)
	}

	return nil
}

// read parses an existing .env file into the Config struct.
func (c *Config) read() error {
	data, err := os.ReadFile(c.EnvFile)
	if err != nil {
		return err
	}

	env := parseEnv(string(data))

	if v, ok := env["DATABASE_URL"]; ok {
		c.DatabaseURL = v
	}
	if v, ok := env["INTERNAL_SERVICE_SECRET"]; ok {
		c.ServiceSecret = v
	}

	return nil
}

// parseEnv parses KEY=VALUE lines, ignoring comments and blank lines.
func parseEnv(content string) map[string]string {
	env := make(map[string]string)
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		idx := strings.IndexByte(line, '=')
		if idx < 0 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		value := strings.TrimSpace(line[idx+1:])
		env[key] = value
	}
	return env
}

// generateSecret produces a cryptographically random hex string.
// n is the number of random bytes; the output is 2*n hex characters.
func generateSecret(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
