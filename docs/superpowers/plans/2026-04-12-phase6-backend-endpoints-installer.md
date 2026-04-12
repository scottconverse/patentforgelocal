# Phase 6: Backend Endpoints + Installer Updates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backend API endpoints that the frontend depends on (system check, model pull, Ollama validation) and update all 3 platform installers to bundle Ollama.

**Architecture:** New NestJS module (`SystemModule`) with controller + service for hardware detection and Ollama communication. The service talks to the Ollama API at `localhost:11434` for model status, pull progress, and connection testing. Installer scripts add `runtime/ollama/` to the install package alongside the existing `runtime/python/`.

**Tech Stack:** NestJS (TypeScript), Inno Setup (Windows), shell scripts (Mac/Linux)

---

## File Map

### New files

| File | Responsibility |
|------|---------------|
| `backend/src/system/system.module.ts` | NestJS module registering SystemController + SystemService |
| `backend/src/system/system.controller.ts` | REST endpoints: `/api/system-check`, `/api/model-pull`, `/api/model-pull-progress` |
| `backend/src/system/system.service.ts` | Hardware detection (RAM/disk/CPU/GPU), Ollama API communication |
| `backend/src/system/system.controller.spec.ts` | Controller tests with mocked service |

### Modified files

| File | Changes |
|------|---------|
| `backend/src/app.module.ts` | Import SystemModule |
| `backend/src/settings/settings.controller.ts` | Add `validate-ollama` endpoint |
| `installer/windows/patentforgelocal.iss` | Add `runtime\ollama\` section |
| `installer/mac/build-dmg.sh` | Add Ollama binary to app bundle |
| `installer/linux/build-appimage.sh` | Add Ollama binary to AppImage |
| `.github/workflows/release.yml` | Add `bundle-ollama.sh` step before installer build |

---

## Task 1: Create SystemService

**Files:**
- Create: `backend/src/system/system.service.ts`

- [ ] **Step 1: Read existing service pattern**

Read `backend/src/settings/settings.service.ts` (first 50 lines) to understand NestJS service patterns.

- [ ] **Step 2: Create the system service**

Create `backend/src/system/system.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import * as os from 'os';
import * as fs from 'fs';
import { execSync } from 'child_process';

const OLLAMA_URL = process.env.OLLAMA_HOST
  ? `http://${process.env.OLLAMA_HOST}`
  : 'http://127.0.0.1:11434';

interface SystemCheckResult {
  ramGB: number;
  diskFreeGB: number;
  cpuCores: number;
  gpuDetected: boolean;
  gpuName: string;
  modelDownloaded: boolean;
  modelName: string;
  ollamaRunning: boolean;
}

interface PullProgress {
  status: string;
  completed: number;
  total: number;
  percent: number;
  error?: string;
}

@Injectable()
export class SystemService {
  private pullProgress: PullProgress = { status: 'idle', completed: 0, total: 0, percent: 0 };
  private pulling = false;

  async getSystemCheck(): Promise<SystemCheckResult> {
    const ramGB = Math.round(os.totalmem() / (1024 ** 3));
    const cpuCores = os.cpus().length;

    // Disk free space
    let diskFreeGB = 0;
    try {
      if (process.platform === 'win32') {
        const out = execSync('wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace /value', { encoding: 'utf-8' });
        const match = out.match(/FreeSpace=(\d+)/);
        if (match) diskFreeGB = Math.round(parseInt(match[1], 10) / (1024 ** 3));
      } else {
        const out = execSync("df -k / | tail -1 | awk '{print $4}'", { encoding: 'utf-8' });
        diskFreeGB = Math.round(parseInt(out.trim(), 10) / (1024 ** 2));
      }
    } catch {
      diskFreeGB = -1; // Unknown
    }

    // GPU detection
    let gpuDetected = false;
    let gpuName = '';
    try {
      if (process.platform === 'win32') {
        const out = execSync('wmic path win32_videocontroller get name /value', { encoding: 'utf-8' });
        const match = out.match(/Name=(.+)/);
        if (match) {
          gpuName = match[1].trim();
          gpuDetected = /nvidia|radeon|arc/i.test(gpuName);
        }
      } else if (process.platform === 'linux') {
        const out = execSync('lspci | grep -i vga', { encoding: 'utf-8' });
        gpuName = out.trim();
        gpuDetected = /nvidia|radeon|arc/i.test(gpuName);
      } else {
        // macOS — check for Apple Silicon (always has GPU)
        const out = execSync('sysctl -n machdep.cpu.brand_string', { encoding: 'utf-8' });
        if (out.includes('Apple')) {
          gpuDetected = true;
          gpuName = 'Apple Silicon (integrated)';
        }
      }
    } catch {
      // GPU detection failed — not critical
    }

    // Ollama status + model check
    let ollamaRunning = false;
    let modelDownloaded = false;
    let modelName = process.env.OLLAMA_MODEL || 'gemma4:26b';

    try {
      const resp = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (resp.ok) {
        ollamaRunning = true;
        const data = (await resp.json()) as { models?: Array<{ name: string }> };
        if (data.models) {
          modelDownloaded = data.models.some(
            (m) => m.name === modelName || m.name === `${modelName}:latest`,
          );
        }
      }
    } catch {
      // Ollama not running
    }

    return {
      ramGB,
      diskFreeGB,
      cpuCores,
      gpuDetected,
      gpuName,
      modelDownloaded,
      modelName,
      ollamaRunning,
    };
  }

  async startModelPull(): Promise<{ started: boolean; error?: string }> {
    if (this.pulling) {
      return { started: false, error: 'Pull already in progress' };
    }

    const modelName = process.env.OLLAMA_MODEL || 'gemma4:26b';
    this.pulling = true;
    this.pullProgress = { status: 'pulling', completed: 0, total: 0, percent: 0 };

    // Start pull in background
    this.doPull(modelName).catch((err) => {
      this.pullProgress = { status: 'error', completed: 0, total: 0, percent: 0, error: err.message };
      this.pulling = false;
    });

    return { started: true };
  }

  getModelPullProgress(): PullProgress {
    return { ...this.pullProgress };
  }

  async validateOllamaConnection(): Promise<{ connected: boolean; model: string; error?: string }> {
    const modelName = process.env.OLLAMA_MODEL || 'gemma4:26b';
    try {
      const resp = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) {
        return { connected: false, model: modelName, error: `Ollama returned HTTP ${resp.status}` };
      }
      return { connected: true, model: modelName };
    } catch (err) {
      return { connected: false, model: modelName, error: `Cannot reach Ollama: ${(err as Error).message}` };
    }
  }

  private async doPull(modelName: string): Promise<void> {
    try {
      const resp = await fetch(`${OLLAMA_URL}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, stream: true }),
      });

      if (!resp.ok) {
        this.pullProgress = { status: 'error', completed: 0, total: 0, percent: 0, error: `HTTP ${resp.status}` };
        this.pulling = false;
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) {
        this.pullProgress = { status: 'error', completed: 0, total: 0, percent: 0, error: 'No response body' };
        this.pulling = false;
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.error) {
              this.pullProgress = { status: 'error', completed: 0, total: 0, percent: 0, error: event.error };
              this.pulling = false;
              return;
            }
            if (event.total && event.total > 0) {
              this.pullProgress = {
                status: 'pulling',
                completed: event.completed || 0,
                total: event.total,
                percent: ((event.completed || 0) / event.total) * 100,
              };
            }
            if (event.status === 'success') {
              this.pullProgress = { status: 'complete', completed: this.pullProgress.total, total: this.pullProgress.total, percent: 100 };
              this.pulling = false;
              return;
            }
          } catch {
            // Ignore JSON parse errors on partial lines
          }
        }
      }

      // Stream ended without success — check if model is available
      const check = await this.getSystemCheck();
      if (check.modelDownloaded) {
        this.pullProgress = { status: 'complete', completed: this.pullProgress.total, total: this.pullProgress.total, percent: 100 };
      } else {
        this.pullProgress = { status: 'error', completed: 0, total: 0, percent: 0, error: 'Pull ended without confirmation' };
      }
    } finally {
      this.pulling = false;
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
git add backend/src/system/system.service.ts
git commit -m "feat(backend): add SystemService for hardware detection and Ollama API"
```

---

## Task 2: Create SystemController and SystemModule

**Files:**
- Create: `backend/src/system/system.controller.ts`
- Create: `backend/src/system/system.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Create the controller**

Create `backend/src/system/system.controller.ts`:

```typescript
import { Controller, Get, Post } from '@nestjs/common';
import { SystemService } from './system.service';

@Controller('api')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('system-check')
  async getSystemCheck() {
    return this.systemService.getSystemCheck();
  }

  @Post('model-pull')
  async startModelPull() {
    return this.systemService.startModelPull();
  }

  @Get('model-pull-progress')
  getModelPullProgress() {
    return this.systemService.getModelPullProgress();
  }
}
```

- [ ] **Step 2: Create the module**

Create `backend/src/system/system.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({
  controllers: [SystemController],
  providers: [SystemService],
  exports: [SystemService],
})
export class SystemModule {}
```

- [ ] **Step 3: Register in app.module.ts**

Read `backend/src/app.module.ts`. Add `SystemModule` to imports:

```typescript
import { SystemModule } from './system/system.module';

@Module({
  imports: [
    // ... existing imports
    SystemModule,
  ],
  // ...
})
```

- [ ] **Step 4: Add validate-ollama endpoint to settings controller**

Read `backend/src/settings/settings.controller.ts`. Add:

```typescript
import { SystemService } from '../system/system.service';

// Add to constructor injection:
constructor(
  private readonly settingsService: SettingsService,
  private readonly systemService: SystemService,
) {}

@Get('validate-ollama')
async validateOllama() {
  return this.systemService.validateOllamaConnection();
}
```

Also update `backend/src/settings/settings.module.ts` to import `SystemModule`:
```typescript
import { SystemModule } from '../system/system.module';

@Module({
  imports: [PrismaModule, SystemModule],
  // ...
})
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/system/ backend/src/app.module.ts backend/src/settings/settings.controller.ts backend/src/settings/settings.module.ts
git commit -m "feat(backend): add system-check, model-pull, validate-ollama endpoints"
```

---

## Task 3: Write backend tests

**Files:**
- Create: `backend/src/system/system.controller.spec.ts`

- [ ] **Step 1: Create controller tests**

Create `backend/src/system/system.controller.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

describe('SystemController', () => {
  let controller: SystemController;
  let service: SystemService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SystemController],
      providers: [SystemService],
    }).compile();

    controller = module.get<SystemController>(SystemController);
    service = module.get<SystemService>(SystemService);
  });

  describe('getSystemCheck', () => {
    it('returns system info with required fields', async () => {
      const result = await controller.getSystemCheck();
      expect(result).toHaveProperty('ramGB');
      expect(result).toHaveProperty('diskFreeGB');
      expect(result).toHaveProperty('cpuCores');
      expect(result).toHaveProperty('gpuDetected');
      expect(result).toHaveProperty('ollamaRunning');
      expect(result).toHaveProperty('modelDownloaded');
      expect(result).toHaveProperty('modelName');
      expect(typeof result.ramGB).toBe('number');
      expect(result.cpuCores).toBeGreaterThan(0);
    });
  });

  describe('getModelPullProgress', () => {
    it('returns idle status initially', () => {
      const result = controller.getModelPullProgress();
      expect(result.status).toBe('idle');
      expect(result.percent).toBe(0);
    });
  });

  describe('startModelPull', () => {
    it('returns started true when no pull is running', async () => {
      // This will fail to connect to Ollama in test env but should not throw
      const result = await controller.startModelPull();
      expect(result).toHaveProperty('started');
      // Wait a moment then check progress shows an error (no Ollama in test)
      await new Promise((r) => setTimeout(r, 500));
      const progress = controller.getModelPullProgress();
      expect(['pulling', 'error']).toContain(progress.status);
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/backend
npx jest src/system/system.controller.spec.ts --verbose
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/system/system.controller.spec.ts
git commit -m "test(backend): add system controller tests"
```

---

## Task 4: Update Windows installer to bundle Ollama

**Files:**
- Modify: `installer/windows/patentforgelocal.iss`

- [ ] **Step 1: Read the current file**

Read `installer/windows/patentforgelocal.iss`.

- [ ] **Step 2: Add Ollama section**

Add a `[Files]` entry for the Ollama runtime. Find the existing `runtime\python` entry and add after it:

```innosetup
; Ollama runtime (portable, bundled)
Source: "{#SourceDir}\runtime\ollama\*"; DestDir: "{app}\runtime\ollama"; Flags: recursesubdirs createallsubdirs
```

Add a `[Dirs]` entry for the models directory (persists on uninstall):

```innosetup
; Model directory (persists on uninstall — user doesn't want to re-download 18GB)
Name: "{app}\models"; Flags: uninsneveruninstall
```

- [ ] **Step 3: Commit**

```bash
git add installer/windows/patentforgelocal.iss
git commit -m "feat(installer): add Ollama runtime to Windows installer"
```

---

## Task 5: Update Mac and Linux installers

**Files:**
- Modify: `installer/mac/build-dmg.sh`
- Modify: `installer/linux/build-appimage.sh`

- [ ] **Step 1: Read both files**

Read `installer/mac/build-dmg.sh` and `installer/linux/build-appimage.sh`.

- [ ] **Step 2: Add Ollama to Mac installer**

In `build-dmg.sh`, find where `runtime/python` is copied. Add after it:

```bash
# Bundle Ollama
echo "  Copying Ollama runtime..."
mkdir -p "$APP_DIR/Contents/Resources/runtime/ollama"
cp -r runtime/ollama/* "$APP_DIR/Contents/Resources/runtime/ollama/"
```

- [ ] **Step 3: Add Ollama to Linux installer**

In `build-appimage.sh`, find where `runtime/python` is copied. Add after it:

```bash
# Bundle Ollama
echo "  Copying Ollama runtime..."
mkdir -p "$APP_DIR/usr/lib/patentforgelocal/runtime/ollama"
cp -r runtime/ollama/* "$APP_DIR/usr/lib/patentforgelocal/runtime/ollama/"
```

- [ ] **Step 4: Commit**

```bash
git add installer/mac/build-dmg.sh installer/linux/build-appimage.sh
git commit -m "feat(installer): add Ollama runtime to Mac and Linux installers"
```

---

## Task 6: Update CI/CD release workflow

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Read the current file**

Read `.github/workflows/release.yml`.

- [ ] **Step 2: Add bundle-ollama step**

Find the build steps for each platform. Before the installer build step, add:

```yaml
- name: Bundle Ollama
  run: bash scripts/bundle-ollama.sh ${{ matrix.os == 'windows-latest' && 'windows' || matrix.os == 'macos-latest' && 'mac' || 'linux' }}
```

If the workflow uses separate jobs per platform instead of a matrix, add the appropriate `bundle-ollama.sh windows`, `bundle-ollama.sh mac`, `bundle-ollama.sh linux` in each job.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add bundle-ollama step to release workflow"
```

---

## Task 7: Verification

- [ ] **Step 1: Run backend tests**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/backend
npx jest src/system/ --verbose
```

- [ ] **Step 2: Run Go tests**

```bash
wsl -d Ubuntu -u root -e bash -c "cd /mnt/c/Users/8745HX/Desktop/Claude/PatentForgeLocal/tray && go test ./... -count=1 2>&1"
```

- [ ] **Step 3: Run feasibility tests**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/services/feasibility
npx jest --verbose 2>&1 | tail -10
```

- [ ] **Step 4: Verify installer file references exist**

```bash
grep -c "runtime.ollama" installer/windows/patentforgelocal.iss
grep -c "runtime/ollama" installer/mac/build-dmg.sh
grep -c "runtime/ollama" installer/linux/build-appimage.sh
grep -c "bundle-ollama" .github/workflows/release.yml
```

Expected: at least 1 match per file.

- [ ] **Step 5: Commit if fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during Phase 6 verification"
```

---

## Summary

| Task | What | Commits |
|------|------|---------|
| 1 | Create SystemService | 1 |
| 2 | Create SystemController + SystemModule, wire into app | 1 |
| 3 | Write backend tests | 1 |
| 4 | Update Windows installer for Ollama | 1 |
| 5 | Update Mac/Linux installers for Ollama | 1 |
| 6 | Update CI/CD release workflow | 1 |
| 7 | Verification | 0-1 |

**Total: 7 tasks, 6-7 commits**

**After Phase 6:**
- Backend serves all endpoints the frontend needs (system-check, model-pull, validate-ollama)
- All 3 platform installers bundle Ollama in `runtime/ollama/`
- CI/CD runs `bundle-ollama.sh` before building installers
- Models directory persists across uninstall/reinstall (user keeps their 18GB download)
- Full pipeline from install → first-run → analysis is wired end-to-end

**Next phase (Phase 7):** E2E testing, documentation updates, and v0.1.0 release.
