package config

import (
	"fmt"
	"path/filepath"
)

// OllamaEnv returns environment variables for the Ollama process.
func (c *Config) OllamaEnv() []string {
	return []string{
		fmt.Sprintf("OLLAMA_HOST=127.0.0.1:%d", c.PortOllama),
		fmt.Sprintf("OLLAMA_MODELS=%s", c.ModelsDir),
		fmt.Sprintf("OLLAMA_TMPDIR=%s", filepath.Join(c.BaseDir, "tmp")),
		"OLLAMA_NOPRUNE=1",
	}
}

// OllamaURL returns the base URL for Ollama API calls.
func (c *Config) OllamaURL() string {
	return fmt.Sprintf("http://127.0.0.1:%d", c.PortOllama)
}
