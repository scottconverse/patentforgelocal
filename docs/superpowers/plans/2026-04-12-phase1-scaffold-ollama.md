# Phase 1: Fork & Scaffold + Ollama Bundling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clone PatentForge as the base for PatentForgeLocal, rename all branding/references, add Ollama as a bundled managed service in the Go tray app with model pull/progress API.

**Architecture:** PatentForge is a desktop app with a Go system-tray process (`tray/`) that manages 5 child services (backend, feasibility, claim-drafter, application-generator, compliance-checker). We fork the entire repo, rename PatentForge to PatentForgeLocal everywhere, then add Ollama as Service 0 — started before all others, with health checking, model pull progress, and environment isolation. A new `scripts/bundle-ollama.sh` downloads the portable Ollama binary per platform into `runtime/ollama/`.

**Tech Stack:** Go 1.26 (tray app, fyne.io/systray), Bash (bundle script), Inno Setup (Windows installer)

**Upstream repo:** `https://github.com/scottconverse/patentforge` (already cloned to `/c/Users/8745HX/Desktop/Claude/patentforge-upstream`)

---

## File Map

### New files (created in this phase)

| File | Responsibility |
|------|---------------|
| `scripts/bundle-ollama.sh` | Downloads portable Ollama binary per platform to `runtime/ollama/` |
| `tray/internal/services/ollama.go` | Ollama-specific service logic: model pull, progress polling, model readiness check |
| `tray/internal/config/ollama.go` | Ollama config: port, model name, models dir, env vars |

### Modified files (from upstream, renamed to PatentForgeLocal)

| File | Changes |
|------|---------|
| `tray/cmd/tray/main.go` | Rename all "PatentForge" strings to "PatentForgeLocal", add Ollama model readiness to startup flow |
| `tray/internal/services/manager.go` | Rename module import path, add Ollama as Service 0 (index 0 in service slice), update `buildBaseEnv` to remove `ANTHROPIC_API_KEY` and add Ollama env vars |
| `tray/internal/config/config.go` | Rename database filename, add `PortOllama int` (11434), add `OllamaModel string`, add `ModelsDir string` |
| `tray/internal/services/health.go` | No code changes needed — works generically on any `Service` |
| `tray/internal/services/service.go` | No code changes needed — works generically |
| `tray/go.mod` | Rename module from `github.com/scottconverse/patentforge/tray` to `github.com/scottconverse/patentforgelocal/tray` |
| `installer/windows/patentforge.iss` | Rename to `patentforgelocal.iss`, update AppName, AppId, binary names, add `runtime\ollama\` section |
| `.env.example` | Remove `ANTHROPIC_API_KEY`, add `OLLAMA_HOST`, `OLLAMA_MODEL` |

---

## Task 1: Copy upstream into PatentForgeLocal repo

**Files:**
- Copy: entire upstream repo contents into `C:\Users\8745HX\Desktop\Claude\PatentForgeLocal\`
- Preserve: existing `docs/superpowers/` directory (design spec + this plan)
- Preserve: existing `CLAUDE.md`, `README.md`, `.gitignore`

- [ ] **Step 1: Copy upstream files into PatentForgeLocal**

Copy all files from the upstream clone, excluding `.git/`, into the PatentForgeLocal working tree. Preserve our existing docs, CLAUDE.md, README.md, and .gitignore.

```bash
cd /c/Users/8745HX/Desktop/Claude

# Copy upstream contents (excluding .git) into PatentForgeLocal
rsync -a --exclude='.git' patentforge-upstream/ PatentForgeLocal/ \
  --exclude='CLAUDE.md' \
  --exclude='README.md' \
  --exclude='.gitignore' \
  --exclude='docs/superpowers/'
```

If `rsync` is not available on Windows Git Bash, use:
```bash
cd /c/Users/8745HX/Desktop/Claude/patentforge-upstream
# Use cp with exclusions
find . -not -path './.git/*' -not -path './.git' \
  -not -name 'CLAUDE.md' \
  -not -name 'README.md' \
  -not -name '.gitignore' \
  -not -path './docs/superpowers/*' \
  -not -path './docs/superpowers' \
  | while read f; do
    dest="/c/Users/8745HX/Desktop/Claude/PatentForgeLocal/$f"
    if [ -d "$f" ]; then
      mkdir -p "$dest"
    else
      mkdir -p "$(dirname "$dest")"
      cp "$f" "$dest"
    fi
  done
```

- [ ] **Step 2: Verify the copy**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
# Should see: backend/, frontend/, services/, tray/, installer/, scripts/, diagrams/, docs/, etc.
ls -d backend frontend services tray installer scripts diagrams docs
# Confirm our files are preserved
cat CLAUDE.md | head -3   # Should show "# PatentForgeLocal"
cat README.md | head -3   # Should show "# PatentForgeLocal"
ls docs/superpowers/specs/2026-04-12-patentforgelocal-design.md  # Should exist
```

Expected: all upstream directories present AND our PatentForgeLocal-specific files preserved.

- [ ] **Step 3: Commit the fork base**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
git add -A
git commit -m "feat: fork PatentForge upstream as base for PatentForgeLocal

Copies all source from github.com/scottconverse/patentforge (v0.9.3)
as the starting point for the local-AI fork. PatentForgeLocal-specific
files (CLAUDE.md, README.md, design spec) are preserved."
```

---

## Task 2: Rename all PatentForge references to PatentForgeLocal

This task does a systematic find-and-replace across the entire codebase. The renames are case-sensitive and cover all variations.

**Files:**
- Modify: `tray/go.mod` (module path)
- Modify: `tray/cmd/tray/main.go` (all string literals, import paths)
- Modify: `tray/internal/services/manager.go` (import path, comments)
- Modify: `tray/internal/config/config.go` (comments, database filename)
- Modify: `tray/internal/services/health.go` (import path if any)
- Modify: `tray/internal/services/service.go` (import path if any)
- Modify: `tray/internal/services/port.go` (import path if any)
- Modify: `tray/internal/assets/embed.go` (import path if any)
- Modify: `tray/internal/instance/instance.go` (import path if any)
- Modify: `tray/internal/instance/process_unix.go` (import path if any)
- Modify: `tray/internal/instance/process_windows.go` (import path if any)
- Modify: `tray/internal/logging/logging.go` (import path if any)
- Modify: `installer/windows/patentforge.iss` (rename file to `patentforgelocal.iss`, update all internal references)
- Modify: `installer/mac/build-dmg.sh`
- Modify: `installer/linux/build-appimage.sh`
- Modify: `scripts/build-backend-sea.sh`
- Modify: `scripts/build-feasibility-sea.sh`
- Modify: `scripts/verify-release.sh`
- Modify: `scripts/cleanroom-e2e.sh`
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `ARCHITECTURE.md`
- Modify: `CONTRIBUTING.md`
- Modify: `CHANGELOG.md`
- Modify: `SECURITY.md`
- Modify: `LEGAL_NOTICE.md`
- Modify: `PatentForge.bat` (rename to `PatentForgeLocal.bat`)
- Modify: `PatentForge.ps1` (rename to `PatentForgeLocal.ps1`)
- Modify: `PatentForge.vbs` (rename to `PatentForgeLocal.vbs`)

- [ ] **Step 1: Rename Go module path**

In `tray/go.mod`, change:
```
module github.com/scottconverse/patentforge/tray
```
to:
```
module github.com/scottconverse/patentforgelocal/tray
```

- [ ] **Step 2: Update all Go import paths**

In every `.go` file under `tray/`, replace:
```
github.com/scottconverse/patentforge/tray
```
with:
```
github.com/scottconverse/patentforgelocal/tray
```

Files to update (check each for import statements):
- `tray/cmd/tray/main.go` — has 5 imports from the module
- `tray/internal/services/manager.go` — imports `config` package
- All other `.go` files — check for cross-package imports

- [ ] **Step 3: Rename user-visible strings in main.go**

In `tray/cmd/tray/main.go`, replace these string literals:

| Old | New |
|-----|-----|
| `"PatentForge"` (systray.SetTitle) | `"PatentForgeLocal"` |
| `"PatentForge — Starting..."` | `"PatentForgeLocal — Starting..."` |
| `"Open PatentForge"` | `"Open PatentForgeLocal"` |
| `"About PatentForge v%s"` | `"About PatentForgeLocal v%s"` |
| `"PatentForge — %s"` (2 occurrences) | `"PatentForgeLocal — %s"` |
| `"PatentForge tray starting..."` | `"PatentForgeLocal tray starting..."` |
| `"PatentForge shutting down..."` | `"PatentForgeLocal shutting down..."` |
| `"https://github.com/scottconverse/patentforge/releases"` | `"https://github.com/scottconverse/patentforgelocal/releases"` |
| `version = "0.7.0-dev"` | `version = "0.1.0-dev"` |

Also in `config.go`, the database filename in the `generate()` method:
```go
// Old:
c.DatabaseURL = fmt.Sprintf("file:%s", filepath.Join(c.DataDir, "patentforge.db"))
// New:
c.DatabaseURL = fmt.Sprintf("file:%s", filepath.Join(c.DataDir, "patentforgelocal.db"))
```

And in `config.go` comments, replace "PatentForge" with "PatentForgeLocal".

- [ ] **Step 4: Rename binary references in manager.go**

In `tray/internal/services/manager.go`:

```go
// Old (line 78):
Command: filepath.Join(baseDir, "patentforge-backend"+ext),
// New:
Command: filepath.Join(baseDir, "patentforgelocal-backend"+ext),

// Old (line 98):
Command: filepath.Join(baseDir, "patentforge-feasibility"+ext),
// New:
Command: filepath.Join(baseDir, "patentforgelocal-feasibility"+ext),
```

Also in `findPrismaEngine()`:
```go
// Old (line 257):
prismaDir := filepath.Join(baseDir, "patentforge-backend-prisma")
// New:
prismaDir := filepath.Join(baseDir, "patentforgelocal-backend-prisma")
```

And in `buildBaseEnv()`, remove the `ANTHROPIC_API_KEY` passthrough (lines 161-163):
```go
// DELETE these lines:
if apiKey := os.Getenv("ANTHROPIC_API_KEY"); apiKey != "" {
    env = append(env, fmt.Sprintf("ANTHROPIC_API_KEY=%s", apiKey))
}
```

Update the comment on `buildBaseEnv`:
```go
// buildBaseEnv constructs the base environment variable slice that all
// services inherit. Includes PATH from the host.
```

Update the `NewManager` comment:
```go
// NewManager creates a Manager with all PatentForgeLocal services configured.
```

Update `buildServices` comment:
```go
// buildServices constructs the Service structs with correct commands,
// paths, environment variables, and health endpoints.
```

- [ ] **Step 5: Rename launcher scripts**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
mv PatentForge.bat PatentForgeLocal.bat
mv PatentForge.ps1 PatentForgeLocal.ps1
mv PatentForge.vbs PatentForgeLocal.vbs
```

Update the contents of each file — replace all occurrences of `patentforge` with `patentforgelocal` and `PatentForge` with `PatentForgeLocal`.

- [ ] **Step 6: Rename installer file and update contents**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/installer/windows
mv patentforge.iss patentforgelocal.iss
```

In `patentforgelocal.iss`, replace:
- `PatentForge` with `PatentForgeLocal` (all occurrences)
- `patentforge` with `patentforgelocal` (all lowercase occurrences)
- Update the `AppId` to a new GUID (generate one)
- Update `AppVersion` to `0.1.0`

In `installer/mac/build-dmg.sh` and `installer/linux/build-appimage.sh`, replace all `patentforge`/`PatentForge` with `patentforgelocal`/`PatentForgeLocal`.

- [ ] **Step 7: Rename in build scripts**

In `scripts/build-backend-sea.sh`:
- Replace `patentforge-backend` with `patentforgelocal-backend`
- Replace `PatentForge` with `PatentForgeLocal`

In `scripts/build-feasibility-sea.sh`:
- Replace `patentforge-feasibility` with `patentforgelocal-feasibility`
- Replace `PatentForge` with `PatentForgeLocal`

In `scripts/verify-release.sh`:
- Replace all `patentforge`/`PatentForge` with `patentforgelocal`/`PatentForgeLocal`

In `scripts/cleanroom-e2e.sh`:
- Replace all `patentforge`/`PatentForge` with `patentforgelocal`/`PatentForgeLocal`

- [ ] **Step 8: Update .env.example**

Replace the contents of `.env.example`:
```env
# PatentForgeLocal — Environment Configuration
# Copy this to config/.env and adjust values

# Database (auto-generated on first run)
DATABASE_URL=file:./data/patentforgelocal.db
INTERNAL_SERVICE_SECRET=change-me-to-random-hex

# Ollama (local AI)
OLLAMA_HOST=127.0.0.1:11434
OLLAMA_MODEL=gemma4:26b

# Optional: Ollama cloud account for web search
# OLLAMA_API_KEY=

# Optional: USPTO Open Data Portal
# USPTO_ODP_API_KEY=
```

- [ ] **Step 9: Update documentation files**

In `ARCHITECTURE.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `SECURITY.md`, `LEGAL_NOTICE.md`, and `docker-compose.yml`:
- Replace all `PatentForge` with `PatentForgeLocal`
- Replace all `patentforge` (lowercase) with `patentforgelocal`
- Replace GitHub URLs from `scottconverse/patentforge` to `scottconverse/patentforgelocal`

Reset `CHANGELOG.md` to:
```markdown
# Changelog

All notable changes to PatentForgeLocal will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Forked from PatentForge v0.9.3 as local-AI variant
- Design specification for Ollama + Gemma 4 integration
```

- [ ] **Step 10: Verify Go module compiles**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/tray
go build ./cmd/tray/
```

Expected: successful compilation (binary `tray.exe` or `tray` produced). If there are import path errors, fix them before proceeding.

- [ ] **Step 11: Run grep to confirm no stray PatentForge references in tray/**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
grep -r "patentforge" tray/ --include="*.go" | grep -v "patentforgelocal"
grep -r "PatentForge" tray/ --include="*.go" | grep -v "PatentForgeLocal"
```

Expected: no output (all references renamed). If any remain, fix them.

- [ ] **Step 12: Commit the rename**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
git add -A
git commit -m "feat: rename all PatentForge references to PatentForgeLocal

Systematic rename across Go tray app, installer scripts, build scripts,
launcher scripts, documentation, and config. Module path updated to
github.com/scottconverse/patentforgelocal/tray. Version set to 0.1.0-dev.
Removed ANTHROPIC_API_KEY passthrough from service manager."
```

---

## Task 3: Create `scripts/bundle-ollama.sh`

**Files:**
- Create: `scripts/bundle-ollama.sh`

This follows the exact same pattern as the existing `scripts/bundle-python.sh` — download a platform-specific portable binary and extract it to `runtime/ollama/`.

- [ ] **Step 1: Write the bundle script**

Create `scripts/bundle-ollama.sh`:

```bash
#!/bin/bash
set -e

OLLAMA_VERSION="latest"
PLATFORM=${1:-windows}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

echo "=== Bundling Portable Ollama (${PLATFORM}) ==="

mkdir -p runtime/ollama

case $PLATFORM in
    windows)
        URL="https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip"
        echo "  Downloading Ollama for Windows..."
        curl -L -o ollama-windows.zip "$URL"
        unzip -o ollama-windows.zip -d runtime/ollama/
        rm ollama-windows.zip

        # Verify the binary exists
        if [ ! -f runtime/ollama/ollama.exe ]; then
            echo "  ERROR: ollama.exe not found after extraction"
            exit 1
        fi

        # Verify it runs
        echo "  Verifying Ollama binary..."
        runtime/ollama/ollama.exe --version
        ;;

    mac)
        # On macOS, Ollama is distributed as a single binary
        URL="https://github.com/ollama/ollama/releases/latest/download/ollama-darwin"
        echo "  Downloading Ollama for macOS..."
        curl -L -o runtime/ollama/ollama "$URL"
        chmod +x runtime/ollama/ollama

        echo "  Verifying Ollama binary..."
        runtime/ollama/ollama --version
        ;;

    linux)
        URL="https://github.com/ollama/ollama/releases/latest/download/ollama-linux-amd64.tgz"
        echo "  Downloading Ollama for Linux..."
        curl -L -o ollama-linux.tgz "$URL"
        tar xzf ollama-linux.tgz -C runtime/ollama/
        rm ollama-linux.tgz

        # The tgz may extract into a subdirectory — normalize
        if [ -f runtime/ollama/bin/ollama ]; then
            mv runtime/ollama/bin/ollama runtime/ollama/ollama
            rm -rf runtime/ollama/bin
        fi

        chmod +x runtime/ollama/ollama

        echo "  Verifying Ollama binary..."
        runtime/ollama/ollama --version
        ;;

    *)
        echo "  ERROR: Unknown platform '$PLATFORM'. Use: windows, mac, linux"
        exit 1
        ;;
esac

echo ""
echo "=== Ollama bundling complete ==="
echo "  Location: runtime/ollama/"
du -sh runtime/ollama/ 2>/dev/null || echo "  (size check not available)"
```

- [ ] **Step 2: Make it executable and test on Windows**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
chmod +x scripts/bundle-ollama.sh
bash scripts/bundle-ollama.sh windows
```

Expected: downloads Ollama zip (~150MB), extracts to `runtime/ollama/`, prints version.

- [ ] **Step 3: Verify runtime/ollama/ is gitignored**

Check that `.gitignore` includes `runtime/` so the downloaded binary is not committed:

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
grep "runtime/" .gitignore
```

If not present, add `runtime/` to `.gitignore`.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
git add scripts/bundle-ollama.sh .gitignore
git commit -m "feat: add bundle-ollama.sh for portable Ollama bundling

Downloads platform-specific Ollama portable binary to runtime/ollama/.
Follows same pattern as bundle-python.sh. Supports windows, mac, linux."
```

---

## Task 4: Add Ollama config to the Go tray app

**Files:**
- Create: `tray/internal/config/ollama.go`
- Modify: `tray/internal/config/config.go`

- [ ] **Step 1: Add Ollama fields to Config struct**

In `tray/internal/config/config.go`, add to the `Config` struct (after the existing port fields):

```go
// Ollama configuration
PortOllama int    // 11434 — Ollama API
OllamaModel string // default: gemma4:26b
ModelsDir   string // <baseDir>/models
```

In the `Load` function, after existing directory creation, add:
```go
cfg.PortOllama = 11434
cfg.OllamaModel = "gemma4:26b"
cfg.ModelsDir = filepath.Join(baseDir, "models")
```

Add `cfg.ModelsDir` to the directory creation loop:
```go
for _, dir := range []string{cfg.DataDir, cfg.LogsDir, cfg.ConfigDir, cfg.ModelsDir} {
```

- [ ] **Step 2: Add Ollama config read/write support**

In `tray/internal/config/config.go`, update the `generate()` method to include Ollama settings in the .env:

```go
content := fmt.Sprintf(`DATABASE_URL=%s
INTERNAL_SERVICE_SECRET=%s
ALLOWED_ORIGINS=http://localhost:%d
NODE_ENV=production
PORT=%d
OLLAMA_HOST=127.0.0.1:%d
OLLAMA_MODEL=%s
`, c.DatabaseURL, c.ServiceSecret, c.PortUI, c.PortUI, c.PortOllama, c.OllamaModel)
```

In the `read()` method, add:
```go
if v, ok := env["OLLAMA_MODEL"]; ok {
    c.OllamaModel = v
}
```

- [ ] **Step 3: Create `tray/internal/config/ollama.go`**

This file provides helper methods for Ollama environment variables:

```go
package config

import (
	"fmt"
	"path/filepath"
)

// OllamaEnv returns the environment variables needed by the Ollama process.
// These isolate Ollama's data to the app directory (not ~/.ollama).
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
```

- [ ] **Step 4: Verify compilation**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/tray
go build ./cmd/tray/
```

Expected: compiles successfully.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
git add tray/internal/config/
git commit -m "feat: add Ollama configuration to tray app

Adds PortOllama (11434), OllamaModel (gemma4:26b), ModelsDir to Config.
New ollama.go provides OllamaEnv() and OllamaURL() helpers. Env vars
isolate Ollama data to app directory (not ~/.ollama)."
```

---

## Task 5: Add Ollama as Service 0 in the service manager

**Files:**
- Modify: `tray/internal/services/manager.go`

Ollama must start before all other services and be healthy before they launch. It is inserted at index 0 in the services slice.

- [ ] **Step 1: Add Ollama service definition to `buildServices()`**

In `tray/internal/services/manager.go`, inside `buildServices()`, add the Ollama service BEFORE the backend definition. Insert after the `baseEnv` construction (around line 53):

```go
// Platform-specific Ollama binary
ollamaCmd := filepath.Join(baseDir, "runtime", "ollama", "ollama")
if runtime.GOOS == "windows" {
    ollamaCmd = filepath.Join(baseDir, "runtime", "ollama", "ollama.exe")
}

// 0. Ollama — Local AI inference server (starts first)
ollamaEnv := append(copyEnv(baseEnv), m.cfg.OllamaEnv()...)

ollama := &Service{
    Name:      "ollama",
    Command:   ollamaCmd,
    Args:      []string{"serve"},
    WorkDir:   baseDir,
    Port:      m.cfg.PortOllama,
    HealthURL: fmt.Sprintf("http://127.0.0.1:%d/api/tags", m.cfg.PortOllama),
    Env:       ollamaEnv,
    LogFile:   filepath.Join(logsDir, "ollama.log"),
}
```

- [ ] **Step 2: Update the return statement**

Change the return from:
```go
return []*Service{backend, feasibility, claimDrafter, appGenerator, complianceChecker}
```
to:
```go
return []*Service{ollama, backend, feasibility, claimDrafter, appGenerator, complianceChecker}
```

- [ ] **Step 3: Update the NewManager comment**

```go
// NewManager creates a Manager with all 6 PatentForgeLocal services configured.
// Service 0 (Ollama) starts first and must be healthy before others launch.
func NewManager(cfg *config.Config) *Manager {
```

And update the `buildServices` comment:
```go
// buildServices constructs the 6 Service structs with correct commands,
// paths, environment variables, and health endpoints.
// Order matters: Ollama is index 0 (starts first, stops last).
```

- [ ] **Step 4: Verify compilation**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/tray
go build ./cmd/tray/
```

Expected: compiles successfully.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
git add tray/internal/services/manager.go
git commit -m "feat: add Ollama as Service 0 in tray service manager

Ollama starts before all other services (index 0 in slice). Uses
portable binary from runtime/ollama/, env vars isolate models dir
and temp dir to app directory. Health check: GET /api/tags."
```

---

## Task 6: Add Ollama model pull and progress API

**Files:**
- Create: `tray/internal/services/ollama.go`
- Modify: `tray/cmd/tray/main.go`

The tray app needs to pull the default model on first run and expose progress for the frontend. Ollama's `/api/pull` returns streaming JSON with `completed`/`total` bytes.

- [ ] **Step 1: Create `tray/internal/services/ollama.go`**

```go
package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

// OllamaManager handles model lifecycle for the Ollama service.
type OllamaManager struct {
	baseURL   string
	modelName string
	mu        sync.Mutex
	pulling   bool
	progress  PullProgress
}

// PullProgress tracks the current model pull state.
type PullProgress struct {
	Status    string  `json:"status"`    // "pulling", "complete", "error", "idle"
	Completed int64   `json:"completed"` // bytes downloaded
	Total     int64   `json:"total"`     // total bytes
	Percent   float64 `json:"percent"`   // 0.0 - 100.0
	Error     string  `json:"error,omitempty"`
}

// NewOllamaManager creates an OllamaManager for the given Ollama API URL and model.
func NewOllamaManager(baseURL, modelName string) *OllamaManager {
	return &OllamaManager{
		baseURL:   baseURL,
		modelName: modelName,
		progress:  PullProgress{Status: "idle"},
	}
}

// IsModelAvailable checks if the configured model is already downloaded
// by querying Ollama's /api/tags endpoint.
func (o *OllamaManager) IsModelAvailable() (bool, error) {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(o.baseURL + "/api/tags")
	if err != nil {
		return false, fmt.Errorf("ollama not reachable: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false, fmt.Errorf("failed to parse /api/tags: %w", err)
	}

	for _, m := range result.Models {
		if m.Name == o.modelName || m.Name == o.modelName+":latest" {
			return true, nil
		}
	}
	return false, nil
}

// PullModel starts downloading the model in the background.
// Progress can be polled via GetProgress().
func (o *OllamaManager) PullModel() error {
	o.mu.Lock()
	if o.pulling {
		o.mu.Unlock()
		return fmt.Errorf("pull already in progress")
	}
	o.pulling = true
	o.progress = PullProgress{Status: "pulling"}
	o.mu.Unlock()

	go o.doPull()
	return nil
}

// GetProgress returns the current pull progress (thread-safe).
func (o *OllamaManager) GetProgress() PullProgress {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.progress
}

// doPull performs the actual HTTP request to Ollama /api/pull and
// reads the streaming JSON progress updates.
func (o *OllamaManager) doPull() {
	defer func() {
		o.mu.Lock()
		o.pulling = false
		o.mu.Unlock()
	}()

	body, _ := json.Marshal(map[string]interface{}{
		"name":   o.modelName,
		"stream": true,
	})

	resp, err := http.Post(o.baseURL+"/api/pull", "application/json", bytes.NewReader(body))
	if err != nil {
		o.mu.Lock()
		o.progress = PullProgress{Status: "error", Error: err.Error()}
		o.mu.Unlock()
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		o.mu.Lock()
		o.progress = PullProgress{Status: "error", Error: fmt.Sprintf("HTTP %d", resp.StatusCode)}
		o.mu.Unlock()
		return
	}

	decoder := json.NewDecoder(resp.Body)
	for {
		var event struct {
			Status    string `json:"status"`
			Completed int64  `json:"completed"`
			Total     int64  `json:"total"`
			Error     string `json:"error"`
		}

		if err := decoder.Decode(&event); err != nil {
			if err == io.EOF {
				break
			}
			o.mu.Lock()
			o.progress = PullProgress{Status: "error", Error: err.Error()}
			o.mu.Unlock()
			return
		}

		if event.Error != "" {
			o.mu.Lock()
			o.progress = PullProgress{Status: "error", Error: event.Error}
			o.mu.Unlock()
			return
		}

		o.mu.Lock()
		o.progress.Status = "pulling"
		if event.Total > 0 {
			o.progress.Completed = event.Completed
			o.progress.Total = event.Total
			o.progress.Percent = float64(event.Completed) / float64(event.Total) * 100.0
		}
		// Ollama sends "success" as the final status
		if event.Status == "success" {
			o.progress = PullProgress{
				Status:    "complete",
				Completed: o.progress.Total,
				Total:     o.progress.Total,
				Percent:   100.0,
			}
		}
		o.mu.Unlock()
	}

	// If we reach EOF without "success", check if model is now available
	available, _ := o.IsModelAvailable()
	o.mu.Lock()
	if available && o.progress.Status != "error" {
		o.progress.Status = "complete"
		o.progress.Percent = 100.0
	} else if o.progress.Status == "pulling" {
		o.progress.Status = "error"
		o.progress.Error = "pull ended without success confirmation"
	}
	o.mu.Unlock()
}
```

- [ ] **Step 2: Wire model readiness into tray startup**

In `tray/cmd/tray/main.go`, add an `ollamaMgr` variable at package level:

```go
var (
	version    = "0.1.0-dev"
	cfg        *config.Config
	mgr        *services.Manager
	healthMon  *services.HealthMonitor
	ollamaMgr  *services.OllamaManager
	mStatus    *systray.MenuItem
	logger     *log.Logger
)
```

In the `onReady` goroutine that starts services, after `mgr.StartAll()` succeeds, add model check and pull:

```go
go func() {
    if err := mgr.StartAll(); err != nil {
        logger.Printf("Service startup failed: %v", err)
        updateStatus()
        return
    }
    updateStatus()

    // Check if the default model is available; pull if not
    ollamaMgr = services.NewOllamaManager(cfg.OllamaURL(), cfg.OllamaModel)
    available, err := ollamaMgr.IsModelAvailable()
    if err != nil {
        logger.Printf("Warning: could not check model availability: %v", err)
    } else if !available {
        logger.Printf("Model %s not found — starting pull...", cfg.OllamaModel)
        mStatus.SetTitle("Status: Downloading model...")
        systray.SetTooltip("PatentForgeLocal — Downloading model...")
        if err := ollamaMgr.PullModel(); err != nil {
            logger.Printf("Failed to start model pull: %v", err)
        }
        // Poll until complete
        for {
            time.Sleep(2 * time.Second)
            prog := ollamaMgr.GetProgress()
            if prog.Status == "complete" {
                logger.Printf("Model %s downloaded successfully", cfg.OllamaModel)
                break
            }
            if prog.Status == "error" {
                logger.Printf("Model pull failed: %s", prog.Error)
                break
            }
            logger.Printf("Model pull: %.1f%% (%d/%d bytes)", prog.Percent, prog.Completed, prog.Total)
        }
    } else {
        logger.Printf("Model %s is available", cfg.OllamaModel)
    }

    updateStatus()

    // Begin background health monitoring
    healthMon = services.NewHealthMonitor(mgr, logger, func(status string) {
        mStatus.SetTitle(fmt.Sprintf("Status: %s", status))
        systray.SetTooltip(fmt.Sprintf("PatentForgeLocal — %s", status))
    })
    healthMon.Start()

    // Open browser once all services are ready
    if err := openBrowser(fmt.Sprintf("http://localhost:%d", cfg.PortUI)); err != nil {
        logger.Printf("Failed to open browser: %v", err)
    }
}()
```

Add the `time` import to main.go if not already present.

- [ ] **Step 3: Verify compilation**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/tray
go build ./cmd/tray/
```

Expected: compiles successfully.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
git add tray/internal/services/ollama.go tray/cmd/tray/main.go
git commit -m "feat: add Ollama model pull with progress tracking

OllamaManager checks model availability via /api/tags, pulls via
/api/pull with streaming progress. Tray app auto-pulls default model
(gemma4:26b) on first run. Progress exposed via GetProgress() for
future frontend integration."
```

---

## Task 7: Write Go tests for Ollama integration

**Files:**
- Create: `tray/internal/services/ollama_test.go`
- Create: `tray/internal/config/ollama_test.go`
- Create: `tray/internal/config/config_test.go`

- [ ] **Step 1: Create config tests**

Create `tray/internal/config/config_test.go`:

```go
package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoad_CreatesDirectories(t *testing.T) {
	tmpDir := t.TempDir()
	baseDir := filepath.Join(tmpDir, "app")
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		t.Fatal(err)
	}

	cfg, err := Load(baseDir)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	// Verify directories were created
	for _, dir := range []string{cfg.DataDir, cfg.LogsDir, cfg.ConfigDir, cfg.ModelsDir} {
		if _, err := os.Stat(dir); os.IsNotExist(err) {
			t.Errorf("directory not created: %s", dir)
		}
	}
}

func TestLoad_DefaultPorts(t *testing.T) {
	tmpDir := t.TempDir()
	baseDir := filepath.Join(tmpDir, "app")
	os.MkdirAll(baseDir, 0755)

	cfg, err := Load(baseDir)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if cfg.PortUI != 3000 {
		t.Errorf("PortUI = %d, want 3000", cfg.PortUI)
	}
	if cfg.PortOllama != 11434 {
		t.Errorf("PortOllama = %d, want 11434", cfg.PortOllama)
	}
	if cfg.OllamaModel != "gemma4:26b" {
		t.Errorf("OllamaModel = %q, want gemma4:26b", cfg.OllamaModel)
	}
}

func TestLoad_GeneratesEnvFile(t *testing.T) {
	tmpDir := t.TempDir()
	baseDir := filepath.Join(tmpDir, "app")
	os.MkdirAll(baseDir, 0755)

	cfg, err := Load(baseDir)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	// .env file should exist
	if _, err := os.Stat(cfg.EnvFile); os.IsNotExist(err) {
		t.Error(".env file was not created")
	}

	// Database URL should be set
	if cfg.DatabaseURL == "" {
		t.Error("DatabaseURL is empty")
	}

	// Service secret should be set and non-empty
	if cfg.ServiceSecret == "" {
		t.Error("ServiceSecret is empty")
	}
	if len(cfg.ServiceSecret) < 32 {
		t.Errorf("ServiceSecret too short: %d chars", len(cfg.ServiceSecret))
	}
}

func TestLoad_ReadsExistingEnvFile(t *testing.T) {
	tmpDir := t.TempDir()
	baseDir := filepath.Join(tmpDir, "app")
	os.MkdirAll(baseDir, 0755)

	// First load creates the env file
	_, err := Load(baseDir)
	if err != nil {
		t.Fatalf("First Load failed: %v", err)
	}

	// Second load reads it
	cfg2, err := Load(baseDir)
	if err != nil {
		t.Fatalf("Second Load failed: %v", err)
	}

	if cfg2.DatabaseURL == "" {
		t.Error("DatabaseURL not read from existing .env")
	}
	if cfg2.ServiceSecret == "" {
		t.Error("ServiceSecret not read from existing .env")
	}
}

func TestLoad_DatabaseFilename(t *testing.T) {
	tmpDir := t.TempDir()
	baseDir := filepath.Join(tmpDir, "app")
	os.MkdirAll(baseDir, 0755)

	cfg, err := Load(baseDir)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	expected := "patentforgelocal.db"
	if filepath.Base(cfg.DatabaseURL[len("file:"):]) != expected {
		t.Errorf("database filename = %q, want %q in URL %q", filepath.Base(cfg.DatabaseURL[len("file:"):]), expected, cfg.DatabaseURL)
	}
}
```

- [ ] **Step 2: Create Ollama config tests**

Create `tray/internal/config/ollama_test.go`:

```go
package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestOllamaEnv(t *testing.T) {
	tmpDir := t.TempDir()
	baseDir := filepath.Join(tmpDir, "app")
	os.MkdirAll(baseDir, 0755)

	cfg, err := Load(baseDir)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	env := cfg.OllamaEnv()

	// Should have OLLAMA_HOST, OLLAMA_MODELS, OLLAMA_TMPDIR, OLLAMA_NOPRUNE
	if len(env) != 4 {
		t.Errorf("OllamaEnv returned %d vars, want 4", len(env))
	}

	found := map[string]bool{}
	for _, e := range env {
		parts := strings.SplitN(e, "=", 2)
		found[parts[0]] = true
	}

	for _, key := range []string{"OLLAMA_HOST", "OLLAMA_MODELS", "OLLAMA_TMPDIR", "OLLAMA_NOPRUNE"} {
		if !found[key] {
			t.Errorf("missing env var: %s", key)
		}
	}
}

func TestOllamaURL(t *testing.T) {
	tmpDir := t.TempDir()
	baseDir := filepath.Join(tmpDir, "app")
	os.MkdirAll(baseDir, 0755)

	cfg, err := Load(baseDir)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	url := cfg.OllamaURL()
	if url != "http://127.0.0.1:11434" {
		t.Errorf("OllamaURL = %q, want http://127.0.0.1:11434", url)
	}
}

func TestOllamaEnv_ModelsDir(t *testing.T) {
	tmpDir := t.TempDir()
	baseDir := filepath.Join(tmpDir, "app")
	os.MkdirAll(baseDir, 0755)

	cfg, err := Load(baseDir)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	env := cfg.OllamaEnv()
	for _, e := range env {
		if strings.HasPrefix(e, "OLLAMA_MODELS=") {
			val := strings.TrimPrefix(e, "OLLAMA_MODELS=")
			expected := filepath.Join(baseDir, "models")
			if val != expected {
				t.Errorf("OLLAMA_MODELS = %q, want %q", val, expected)
			}
			return
		}
	}
	t.Error("OLLAMA_MODELS not found in OllamaEnv()")
}
```

- [ ] **Step 3: Create Ollama service tests (with mock HTTP server)**

Create `tray/internal/services/ollama_test.go`:

```go
package services

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestIsModelAvailable_Found(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/tags" {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"models": []map[string]interface{}{
					{"name": "gemma4:26b"},
				},
			})
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	mgr := NewOllamaManager(server.URL, "gemma4:26b")
	available, err := mgr.IsModelAvailable()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !available {
		t.Error("expected model to be available")
	}
}

func TestIsModelAvailable_NotFound(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/tags" {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"models": []map[string]interface{}{
					{"name": "llama3:8b"},
				},
			})
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	mgr := NewOllamaManager(server.URL, "gemma4:26b")
	available, err := mgr.IsModelAvailable()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if available {
		t.Error("expected model to NOT be available")
	}
}

func TestIsModelAvailable_EmptyModels(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"models": []map[string]interface{}{},
		})
	}))
	defer server.Close()

	mgr := NewOllamaManager(server.URL, "gemma4:26b")
	available, err := mgr.IsModelAvailable()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if available {
		t.Error("expected model to NOT be available with empty model list")
	}
}

func TestIsModelAvailable_ServerDown(t *testing.T) {
	mgr := NewOllamaManager("http://127.0.0.1:1", "gemma4:26b")
	_, err := mgr.IsModelAvailable()
	if err == nil {
		t.Error("expected error when server is unreachable")
	}
}

func TestPullModel_Progress(t *testing.T) {
	pullCalled := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/pull" {
			pullCalled = true
			w.Header().Set("Content-Type", "application/x-ndjson")
			flusher, _ := w.(http.Flusher)

			// Simulate streaming progress
			events := []map[string]interface{}{
				{"status": "pulling manifest"},
				{"status": "downloading", "completed": 5000, "total": 10000},
				{"status": "downloading", "completed": 10000, "total": 10000},
				{"status": "success"},
			}
			for _, event := range events {
				json.NewEncoder(w).Encode(event)
				if flusher != nil {
					flusher.Flush()
				}
			}
			return
		}
		if r.URL.Path == "/api/tags" {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"models": []map[string]interface{}{
					{"name": "gemma4:26b"},
				},
			})
			return
		}
	}))
	defer server.Close()

	mgr := NewOllamaManager(server.URL, "gemma4:26b")
	if err := mgr.PullModel(); err != nil {
		t.Fatalf("PullModel failed: %v", err)
	}

	// Wait for pull to complete (should be fast with mock)
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		prog := mgr.GetProgress()
		if prog.Status == "complete" {
			break
		}
		if prog.Status == "error" {
			t.Fatalf("pull errored: %s", prog.Error)
		}
		time.Sleep(100 * time.Millisecond)
	}

	if !pullCalled {
		t.Error("pull endpoint was never called")
	}

	prog := mgr.GetProgress()
	if prog.Status != "complete" {
		t.Errorf("final status = %q, want complete", prog.Status)
	}
	if prog.Percent != 100.0 {
		t.Errorf("final percent = %.1f, want 100.0", prog.Percent)
	}
}

func TestPullModel_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, "internal server error")
	}))
	defer server.Close()

	mgr := NewOllamaManager(server.URL, "gemma4:26b")
	if err := mgr.PullModel(); err != nil {
		t.Fatalf("PullModel start failed: %v", err)
	}

	// Wait for pull to fail
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		prog := mgr.GetProgress()
		if prog.Status == "error" {
			if prog.Error == "" {
				t.Error("error status but empty error message")
			}
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Error("pull did not report error within timeout")
}

func TestPullModel_DuplicatePull(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Slow response to keep the first pull active
		time.Sleep(2 * time.Second)
		json.NewEncoder(w).Encode(map[string]interface{}{"status": "success"})
	}))
	defer server.Close()

	mgr := NewOllamaManager(server.URL, "gemma4:26b")
	if err := mgr.PullModel(); err != nil {
		t.Fatalf("first PullModel failed: %v", err)
	}

	// Second pull should fail because first is still running
	err := mgr.PullModel()
	if err == nil {
		t.Error("expected error on duplicate pull, got nil")
	}
}

func TestGetProgress_InitialState(t *testing.T) {
	mgr := NewOllamaManager("http://localhost:11434", "gemma4:26b")
	prog := mgr.GetProgress()
	if prog.Status != "idle" {
		t.Errorf("initial status = %q, want idle", prog.Status)
	}
}
```

- [ ] **Step 4: Run all Go tests**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/tray
go test ./... -v
```

Expected: all tests pass. If any fail, fix them before proceeding.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
git add tray/internal/config/config_test.go tray/internal/config/ollama_test.go tray/internal/services/ollama_test.go
git commit -m "test: add Go tests for config and Ollama service

Config tests: directory creation, default ports, env file generation,
database filename. Ollama tests: model availability check (found, not
found, empty, server down), model pull with progress (streaming mock),
server error, duplicate pull prevention, initial state."
```

---

## Task 8: Update .gitignore and verify clean state

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Update .gitignore for Ollama and runtime artifacts**

Ensure `.gitignore` includes these entries (add any that are missing):

```gitignore
# Runtime binaries (downloaded, not committed)
runtime/
models/

# Build artifacts
tray/cmd/tray/tray
tray/cmd/tray/tray.exe

# Temporary files
tmp/

# Ollama data
*.gguf
```

- [ ] **Step 2: Verify git status is clean**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
git status
```

Expected: clean working tree (or only the .gitignore change to commit).

- [ ] **Step 3: Commit**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
git add .gitignore
git commit -m "chore: update .gitignore for Ollama runtime and model artifacts"
```

---

## Task 9: Integration smoke test

This task verifies the full Phase 1 deliverable works end-to-end.

- [ ] **Step 1: Bundle Ollama**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
bash scripts/bundle-ollama.sh windows
```

Expected: Ollama binary downloaded to `runtime/ollama/ollama.exe`, version printed.

- [ ] **Step 2: Run the Go test suite**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/tray
go test ./... -v -count=1
```

Expected: all tests pass (config tests + ollama mock tests).

- [ ] **Step 3: Build the tray binary**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/tray
go build -o ../patentforgelocal-tray.exe ./cmd/tray/
```

Expected: `patentforgelocal-tray.exe` produced in repo root.

- [ ] **Step 4: Manual Ollama smoke test**

Start Ollama manually to verify the bundled binary works:

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
# Set env vars to isolate from any system Ollama
export OLLAMA_MODELS="$(pwd)/models"
export OLLAMA_HOST="127.0.0.1:11434"
runtime/ollama/ollama.exe serve &
OLLAMA_PID=$!
sleep 3

# Health check
curl -s http://127.0.0.1:11434/api/tags | python -m json.tool

# Clean up (don't pull model — that's 18GB and tested in Task 7 via mocks)
kill $OLLAMA_PID 2>/dev/null
```

Expected: Ollama starts, `/api/tags` returns JSON with empty models list.

- [ ] **Step 5: Clean up build artifacts**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
rm -f patentforgelocal-tray.exe
rm -rf models/
```

- [ ] **Step 6: Final commit (if any fixes were needed)**

If any issues were found and fixed during smoke testing:

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
git add -A
git commit -m "fix: address issues found during Phase 1 smoke test"
```

---

## Summary

| Task | What it does | Commits |
|------|-------------|---------|
| 1 | Copy upstream PatentForge into repo | 1 |
| 2 | Rename all PatentForge → PatentForgeLocal | 1 |
| 3 | Create `scripts/bundle-ollama.sh` | 1 |
| 4 | Add Ollama config to Go tray app | 1 |
| 5 | Add Ollama as Service 0 in manager | 1 |
| 6 | Add model pull/progress API | 1 |
| 7 | Write Go tests | 1 |
| 8 | Update .gitignore | 1 |
| 9 | Integration smoke test | 0-1 |

**Total: 9 tasks, 8-9 commits, ~15 new/modified files**

**After Phase 1, the repo has:**
- Full PatentForge codebase renamed to PatentForgeLocal
- Ollama portable binary bundling (Windows, Mac, Linux)
- Ollama as a managed service in the Go tray app (Service 0)
- Model availability check and pull with streaming progress
- 10+ Go tests covering config and Ollama service logic
- Clean git history with atomic commits

**Next phase (Phase 2):** Context-mode integration + LLM client swap for the feasibility service.
