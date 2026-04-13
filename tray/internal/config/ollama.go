package config

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// OllamaEnv returns environment variables for the Ollama process.
// On Linux, it reads .env.hardware and injects HSA_OVERRIDE_GFX_VERSION
// and HSA_ENABLE_SDMA=0 for AMD iGPU ROCm acceleration.
func (c *Config) OllamaEnv() []string {
	env := []string{
		fmt.Sprintf("OLLAMA_HOST=127.0.0.1:%d", c.PortOllama),
		fmt.Sprintf("OLLAMA_MODELS=%s", c.ModelsDir),
		fmt.Sprintf("OLLAMA_TMPDIR=%s", filepath.Join(c.BaseDir, "tmp")),
		"OLLAMA_NOPRUNE=1",
	}

	// On Linux, inject ROCm GPU overrides from .env.hardware if present
	if runtime.GOOS == "linux" {
		env = append(env, c.readGPUEnv()...)
	}

	return env
}

// readGPUEnv reads .env.hardware and returns HSA environment variables
// needed for AMD iGPU ROCm acceleration on Linux.
func (c *Config) readGPUEnv() []string {
	hwFile := filepath.Join(c.BaseDir, ".env.hardware")
	data, err := os.ReadFile(hwFile)
	if err != nil {
		return nil
	}

	hwEnv := parseEnv(string(data))
	var extra []string

	// Inject HSA_OVERRIDE_GFX_VERSION if hardware detection found an AMD iGPU
	if override, ok := hwEnv["PATENTFORGELOCAL_HSA_OVERRIDE"]; ok {
		override = strings.Trim(override, "\"")
		if override != "" {
			extra = append(extra, "HSA_OVERRIDE_GFX_VERSION="+override)
			// Disable SDMA to prevent silent inference hangs on RDNA 3 iGPUs
			extra = append(extra, "HSA_ENABLE_SDMA=0")
		}
	}

	return extra
}

// OllamaURL returns the base URL for Ollama API calls.
func (c *Config) OllamaURL() string {
	return fmt.Sprintf("http://127.0.0.1:%d", c.PortOllama)
}
