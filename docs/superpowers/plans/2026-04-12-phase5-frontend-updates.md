# Phase 5: Frontend Updates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the React frontend to remove Anthropic-specific UI (API key, model tiers, cost caps), add Ollama-specific UI (model status, system check, model download progress), and update the first-run wizard for local-first setup.

**Architecture:** The frontend is a React 18 SPA with React Router, Tailwind CSS, and Vite. Settings are stored server-side (NestJS backend) and fetched via REST API. The first-run wizard currently gates on Anthropic API key presence — we replace this with a system check + model download flow. The cost confirm modal is simplified to show estimated time instead of dollar amounts.

**Tech Stack:** React 18, TypeScript 5, Tailwind CSS 3.4, Vite, Vitest

---

## File Map

### Modified files

| File | Changes |
|------|---------|
| `frontend/src/types.ts` | Replace `anthropicApiKey` with `ollamaApiKey` in `AppSettings`, add `ollamaModel`, remove `costCapUsd` |
| `frontend/src/pages/Settings.tsx` | Remove API key/model tier/cost cap. Add model status, Ollama API key (optional), model name display |
| `frontend/src/components/FirstRunWizard.tsx` | Replace API key wizard with system check → model download → optional Ollama account flow |
| `frontend/src/components/CostConfirmModal.tsx` | Remove dollar estimates, show estimated time + token count instead |
| `frontend/src/api.ts` | Update settings endpoints for new field names |
| `frontend/src/App.tsx` | Change wizard gate from API key presence to model availability |

### New files

| File | Responsibility |
|------|---------------|
| `frontend/src/components/SystemCheck.tsx` | Hardware check screen (RAM, disk, CPU) shown on first run |
| `frontend/src/components/ModelDownload.tsx` | Model download progress screen with progress bar |

---

## Task 1: Update types.ts

**Files:**
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: Read the current file**

Read `frontend/src/types.ts`.

- [ ] **Step 2: Update AppSettings interface**

Replace `AppSettings`:

```typescript
export interface AppSettings {
  ollamaApiKey: string;       // Optional — enables web search
  ollamaModel: string;        // e.g. "gemma4:26b"
  ollamaUrl: string;          // e.g. "http://127.0.0.1:11434"
  modelReady: boolean;        // Whether the model is downloaded and loaded
  defaultModel: string;       // Same as ollamaModel (compatibility)
  researchModel: string;
  maxTokens: number;
  interStageDelaySeconds: number;
  usptoApiKey: string;
  exportPath: string;
  autoExport: boolean;
  encryptionHealthy: boolean;
}
```

Remove `costCapUsd` and `anthropicApiKey`.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
git add frontend/src/types.ts
git commit -m "feat(frontend): update AppSettings type for Ollama"
```

---

## Task 2: Update api.ts

**Files:**
- Modify: `frontend/src/api.ts`

- [ ] **Step 1: Read the current file**

Read `frontend/src/api.ts`.

- [ ] **Step 2: Update settings-related code**

Find any references to `anthropicApiKey` and replace with `ollamaApiKey`. Find `costCapUsd` references and remove them.

Add a new API function for checking system readiness:

```typescript
systemCheck: async (): Promise<{
  ramGB: number;
  diskFreeGB: number;
  cpuCores: number;
  gpuDetected: boolean;
  gpuName: string;
  modelDownloaded: boolean;
  modelName: string;
  ollamaRunning: boolean;
}> => {
  const res = await fetchWithTimeout('/api/system-check');
  return res.json();
},

modelPullProgress: async (): Promise<{
  status: string;
  completed: number;
  total: number;
  percent: number;
  error?: string;
}> => {
  const res = await fetchWithTimeout('/api/model-pull-progress');
  return res.json();
},

startModelPull: async (): Promise<{ started: boolean; error?: string }> => {
  const res = await fetchWithTimeout('/api/model-pull', { method: 'POST' });
  return res.json();
},
```

Also remove or update `validateApiKey` — it was used for Anthropic key validation. Replace with:

```typescript
validateOllamaConnection: async (): Promise<{ connected: boolean; model: string; error?: string }> => {
  const res = await fetchWithTimeout('/api/settings/validate-ollama');
  return res.json();
},
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.ts
git commit -m "feat(frontend): update API client for Ollama endpoints"
```

---

## Task 3: Create SystemCheck component

**Files:**
- Create: `frontend/src/components/SystemCheck.tsx`

This component checks hardware requirements on first run.

- [ ] **Step 1: Create the component**

Create `frontend/src/components/SystemCheck.tsx`:

```tsx
import { useState, useEffect } from 'react';
import api from '../api';

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

interface Props {
  onPass: (result: SystemCheckResult) => void;
  onFail: (reason: string) => void;
}

function CheckItem({ label, status, detail }: { label: string; status: 'pass' | 'warn' | 'fail' | 'checking'; detail: string }) {
  const icons = { pass: '✓', warn: '⚠', fail: '✗', checking: '…' };
  const colors = {
    pass: 'text-green-400',
    warn: 'text-amber-400',
    fail: 'text-red-400',
    checking: 'text-gray-400',
  };

  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-700">
      <div className="flex items-center gap-2">
        <span className={`text-lg font-bold ${colors[status]}`}>{icons[status]}</span>
        <span className="text-gray-200">{label}</span>
      </div>
      <span className="text-sm text-gray-400">{detail}</span>
    </div>
  );
}

export default function SystemCheck({ onPass, onFail }: Props) {
  const [checking, setChecking] = useState(true);
  const [result, setResult] = useState<SystemCheckResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.systemCheck()
      .then((r) => {
        if (!cancelled) {
          setResult(r);
          setChecking(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'System check failed');
          setChecking(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  if (checking) {
    return (
      <div className="text-center py-12">
        <div className="text-lg text-gray-300 mb-2">Checking your system…</div>
        <div className="text-sm text-gray-500">This takes a few seconds.</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-400 mb-4">System check failed: {error}</div>
        <p className="text-sm text-gray-400 mb-6">
          Make sure PatentForgeLocal services are running and try again.
        </p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500">
          Retry
        </button>
      </div>
    );
  }

  if (!result) return null;

  const ramOk = result.ramGB >= 16;
  const diskOk = result.diskFreeGB >= 25;
  const hardFail = !ramOk || !diskOk;

  const checks = [
    {
      label: 'Ollama',
      status: result.ollamaRunning ? 'pass' as const : 'fail' as const,
      detail: result.ollamaRunning ? 'Running' : 'Not detected',
    },
    {
      label: 'RAM',
      status: result.ramGB >= 32 ? 'pass' as const : result.ramGB >= 16 ? 'warn' as const : 'fail' as const,
      detail: `${result.ramGB} GB${result.ramGB < 32 ? ' (32 GB recommended)' : ''}`,
    },
    {
      label: 'Disk Space',
      status: result.diskFreeGB >= 50 ? 'pass' as const : result.diskFreeGB >= 25 ? 'warn' as const : 'fail' as const,
      detail: `${result.diskFreeGB} GB free`,
    },
    {
      label: 'CPU',
      status: result.cpuCores >= 4 ? 'pass' as const : 'warn' as const,
      detail: `${result.cpuCores} cores`,
    },
    {
      label: 'GPU',
      status: result.gpuDetected ? 'pass' as const : 'warn' as const,
      detail: result.gpuDetected ? result.gpuName : 'Not detected (CPU mode — slower)',
    },
    {
      label: 'AI Model',
      status: result.modelDownloaded ? 'pass' as const : 'warn' as const,
      detail: result.modelDownloaded ? `${result.modelName} ready` : 'Not yet downloaded',
    },
  ];

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-4">System Check</h2>
      <div className="mb-6">
        {checks.map((c) => (
          <CheckItem key={c.label} {...c} />
        ))}
      </div>

      {hardFail ? (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-4">
          <p className="text-red-300 font-medium mb-1">System does not meet minimum requirements</p>
          <p className="text-sm text-red-400">
            PatentForgeLocal requires at least 16 GB RAM and 25 GB free disk space.
            For a cloud-powered alternative, try{' '}
            <a href="https://github.com/scottconverse/patentforge" className="underline" target="_blank" rel="noopener">
              PatentForge
            </a>.
          </p>
          <button onClick={() => onFail('System requirements not met')} className="mt-3 px-4 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600">
            Close
          </button>
        </div>
      ) : (
        <button
          onClick={() => onPass(result)}
          className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors"
        >
          {result.modelDownloaded ? 'Continue' : 'Continue to Model Download'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/SystemCheck.tsx
git commit -m "feat(frontend): add SystemCheck component for first-run hardware check"
```

---

## Task 4: Create ModelDownload component

**Files:**
- Create: `frontend/src/components/ModelDownload.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/ModelDownload.tsx`:

```tsx
import { useState, useEffect, useRef } from 'react';
import api from '../api';

interface Props {
  modelName: string;
  onComplete: () => void;
  onSkip?: () => void;
}

export default function ModelDownload({ modelName, onComplete, onSkip }: Props) {
  const [status, setStatus] = useState<'idle' | 'downloading' | 'complete' | 'error'>('idle');
  const [percent, setPercent] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function startDownload() {
    setStatus('downloading');
    setError('');

    try {
      const result = await api.startModelPull();
      if (!result.started) {
        setError(result.error || 'Failed to start download');
        setStatus('error');
        return;
      }
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
      return;
    }

    // Poll for progress
    pollRef.current = setInterval(async () => {
      try {
        const progress = await api.modelPullProgress();
        setPercent(progress.percent);
        setCompleted(progress.completed);
        setTotal(progress.total);

        if (progress.status === 'complete') {
          setStatus('complete');
          if (pollRef.current) clearInterval(pollRef.current);
          setTimeout(onComplete, 1500);
        } else if (progress.status === 'error') {
          setError(progress.error || 'Download failed');
          setStatus('error');
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 2000);
  }

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-2">Download AI Model</h2>
      <p className="text-sm text-gray-400 mb-6">
        PatentForgeLocal uses <span className="text-gray-200 font-medium">{modelName}</span> for patent analysis.
        This is a one-time download ({'>'}18 GB). Future launches take about 30 seconds.
      </p>

      {status === 'idle' && (
        <div>
          <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 mb-6">
            <p className="text-blue-300 text-sm">
              Everything runs on this computer. Your inventions never leave your machine.
            </p>
          </div>
          <button
            onClick={startDownload}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors"
          >
            Download Model
          </button>
        </div>
      )}

      {status === 'downloading' && (
        <div>
          <div className="w-full bg-gray-700 rounded-full h-4 mb-3">
            <div
              className="bg-blue-500 h-4 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-sm text-gray-400">
            <span>{percent.toFixed(1)}%</span>
            <span>{formatBytes(completed)} / {formatBytes(total)}</span>
          </div>
          <p className="text-xs text-gray-500 mt-4 text-center">
            This may take 10–30 minutes depending on your internet speed.
          </p>
        </div>
      )}

      {status === 'complete' && (
        <div className="text-center py-4">
          <div className="text-green-400 text-2xl mb-2">✓</div>
          <p className="text-green-300 font-medium">Model downloaded successfully</p>
          <p className="text-sm text-gray-400 mt-1">Setting up…</p>
        </div>
      )}

      {status === 'error' && (
        <div>
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-4">
            <p className="text-red-300">{error}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={startDownload} className="flex-1 py-2 bg-blue-600 text-white rounded hover:bg-blue-500">
              Retry
            </button>
            {onSkip && (
              <button onClick={onSkip} className="flex-1 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600">
                Skip for Now
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ModelDownload.tsx
git commit -m "feat(frontend): add ModelDownload component with progress bar"
```

---

## Task 5: Rewrite FirstRunWizard

**Files:**
- Modify: `frontend/src/components/FirstRunWizard.tsx`

The current wizard is a single-step API key entry form. Replace with a multi-step flow:
1. Welcome
2. System Check
3. Model Download (if model not already downloaded)
4. Optional: Ollama account for web search
5. Optional: USPTO API key
6. Disclaimer
7. Ready

- [ ] **Step 1: Read the current file**

Read `frontend/src/components/FirstRunWizard.tsx`.

- [ ] **Step 2: Rewrite the wizard**

Replace the entire contents of `frontend/src/components/FirstRunWizard.tsx`:

```tsx
import { useState } from 'react';
import SystemCheck from './SystemCheck';
import ModelDownload from './ModelDownload';
import api from '../api';

interface Props {
  onComplete: (success: boolean) => void;
}

type WizardStep = 'welcome' | 'system-check' | 'model-download' | 'ollama-account' | 'disclaimer' | 'ready';

export default function FirstRunWizard({ onComplete }: Props) {
  const [step, setStep] = useState<WizardStep>('welcome');
  const [modelName, setModelName] = useState('gemma4:26b');
  const [modelReady, setModelReady] = useState(false);
  const [ollamaApiKey, setOllamaApiKey] = useState('');
  const [usptoKey, setUsptoKey] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleFinish() {
    setSaving(true);
    try {
      await api.settings.update({
        ollamaApiKey: ollamaApiKey || undefined,
        usptoApiKey: usptoKey || undefined,
      });
      onComplete(true);
    } catch {
      onComplete(true); // Don't block on settings save failure
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-8">

        {step === 'welcome' && (
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white mb-3">Welcome to PatentForgeLocal</h1>
            <p className="text-gray-400 mb-2">Private patent analysis, running entirely on your machine.</p>
            <p className="text-sm text-gray-500 mb-8">
              Your inventions never leave this computer. No cloud AI, no API costs, complete privacy.
            </p>
            <button
              onClick={() => setStep('system-check')}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors"
            >
              Get Started
            </button>
          </div>
        )}

        {step === 'system-check' && (
          <SystemCheck
            onPass={(result) => {
              setModelName(result.modelName || 'gemma4:26b');
              if (result.modelDownloaded) {
                setModelReady(true);
                setStep('ollama-account');
              } else {
                setStep('model-download');
              }
            }}
            onFail={() => onComplete(false)}
          />
        )}

        {step === 'model-download' && (
          <ModelDownload
            modelName={modelName}
            onComplete={() => {
              setModelReady(true);
              setStep('ollama-account');
            }}
            onSkip={() => setStep('ollama-account')}
          />
        )}

        {step === 'ollama-account' && (
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">Web Search (Optional)</h2>
            <p className="text-sm text-gray-400 mb-4">
              A free Ollama account enables web search during analysis for better prior art discovery.
              Without it, analysis uses patent databases and AI knowledge only.
            </p>
            <label className="block text-sm font-medium text-gray-300 mb-1">Ollama API Key</label>
            <input
              type="password"
              value={ollamaApiKey}
              onChange={(e) => setOllamaApiKey(e.target.value)}
              placeholder="Optional"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none mb-2"
            />
            <a
              href="https://ollama.com/signup"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              Create a free Ollama account →
            </a>

            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-300 mb-1">USPTO API Key (Optional)</label>
              <input
                type="password"
                value={usptoKey}
                onChange={(e) => setUsptoKey(e.target.value)}
                placeholder="Optional — improves prior art search"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <button
              onClick={() => setStep('disclaimer')}
              className="w-full mt-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors"
            >
              Continue
            </button>
            <button
              onClick={() => setStep('disclaimer')}
              className="w-full mt-2 py-2 text-gray-400 text-sm hover:text-gray-300"
            >
              Skip — I'll set these up later
            </button>
          </div>
        )}

        {step === 'disclaimer' && (
          <div>
            <h2 className="text-xl font-semibold text-white mb-4">Important Notice</h2>
            <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-4 mb-6 text-sm text-amber-200 space-y-2">
              <p><strong>PatentForgeLocal is a research and analysis tool.</strong></p>
              <p>It does not provide legal advice. All analysis is generated by AI and may contain errors, omissions, or inaccuracies.</p>
              <p>Always consult a registered patent attorney before filing any patent application or making legal decisions based on this tool's output.</p>
              <p>By proceeding, you acknowledge that PatentForgeLocal is not a substitute for professional legal counsel.</p>
            </div>
            <button
              onClick={() => setStep('ready')}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors"
            >
              I Understand
            </button>
          </div>
        )}

        {step === 'ready' && (
          <div className="text-center">
            <div className="text-4xl mb-4">🔒</div>
            <h2 className="text-xl font-semibold text-white mb-2">You're All Set</h2>
            <p className="text-gray-400 mb-6">
              PatentForgeLocal is ready. Everything runs locally on this machine.
            </p>
            <button
              onClick={handleFinish}
              disabled={saving}
              className="w-full py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-500 transition-colors disabled:opacity-50"
            >
              {saving ? 'Setting up…' : 'Start Using PatentForgeLocal'}
            </button>
          </div>
        )}

        {/* Step indicator */}
        <div className="flex justify-center gap-2 mt-6">
          {(['welcome', 'system-check', 'model-download', 'ollama-account', 'disclaimer', 'ready'] as WizardStep[]).map((s) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full ${s === step ? 'bg-blue-500' : 'bg-gray-700'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/FirstRunWizard.tsx
git commit -m "feat(frontend): rewrite first-run wizard for local-first setup

Multi-step flow: welcome → system check → model download → optional
web search account → disclaimer → ready. No API key required."
```

---

## Task 6: Update Settings page

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`

- [ ] **Step 1: Read the current file**

Read `frontend/src/pages/Settings.tsx`.

- [ ] **Step 2: Apply changes**

Major changes:
1. **Remove** the Anthropic API key field entirely
2. **Remove** model tier selection dropdowns (Sonnet/Opus/Haiku) — replace with a read-only model display showing the current Ollama model name
3. **Remove** the cost cap field
4. **Add** Ollama API key field (optional, for web search) — same password input style
5. **Add** model status indicator: "Gemma 4 26B — Running" or "Model not loaded"
6. **Keep** USPTO API key field, export path, auto-export, inter-stage delay, max tokens
7. **Update** field names: `anthropicApiKey` → `ollamaApiKey`, remove `costCapUsd`
8. **Replace** the "Validate API Key" button with "Test Ollama Connection"

The model display section should look like:
```tsx
<div className="mb-6">
  <label className="block text-sm font-medium text-gray-300 mb-1">AI Model</label>
  <div className="flex items-center gap-3 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg">
    <span className={`w-2 h-2 rounded-full ${modelReady ? 'bg-green-400' : 'bg-red-400'}`} />
    <span className="text-white">{settings.ollamaModel || 'gemma4:26b'}</span>
    <span className="text-sm text-gray-400">{modelReady ? 'Running' : 'Not loaded'}</span>
  </div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Settings.tsx
git commit -m "feat(frontend): update Settings page for Ollama

Remove Anthropic API key, model tiers, cost cap. Add Ollama API key
(optional web search), model status indicator. Keep USPTO key, export
settings, and tuning parameters."
```

---

## Task 7: Update CostConfirmModal

**Files:**
- Modify: `frontend/src/components/CostConfirmModal.tsx`

- [ ] **Step 1: Read the current file**

Read `frontend/src/components/CostConfirmModal.tsx`.

- [ ] **Step 2: Replace dollar estimates with time estimates**

Remove all dollar-amount calculations. Replace with:
- Estimated time: "~5-10 minutes on your hardware"
- Token estimate (informational): "Estimated tokens: ~50,000 input / ~15,000 output"
- Remove the cost cap warning

Keep:
- The confirmation gate (user still approves before long-running analysis)
- The disclaimer text
- The model name display
- The button with "Start Analysis"

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CostConfirmModal.tsx
git commit -m "feat(frontend): replace cost estimates with time estimates

No dollar amounts for local inference. Shows estimated time and
token counts. Keeps confirmation gate and disclaimer."
```

---

## Task 8: Update App.tsx wizard gate

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Read the current file**

Read `frontend/src/App.tsx`.

- [ ] **Step 2: Change the wizard gate condition**

Currently the wizard is shown when `settings.anthropicApiKey` is empty. Change to check `modelReady`:

The app should:
1. On mount, call `api.settings.get()`
2. If `settings.modelReady` is false (or settings fetch fails), show `FirstRunWizard`
3. Otherwise, show the normal app

Replace the wizard check logic:
```tsx
// Old: showWizard = !settings.anthropicApiKey
// New: showWizard = !settings.modelReady
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(frontend): gate wizard on model readiness, not API key"
```

---

## Task 9: Verification

- [ ] **Step 1: Verify no Anthropic references in frontend**

```bash
grep -r "anthropic\|Anthropic\|ANTHROPIC" frontend/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules
```

Expected: no output (or only in comments explaining migration).

- [ ] **Step 2: TypeScript compilation**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/frontend
npx tsc --noEmit
```

Note: may have errors related to backend API types not matching yet — document any type errors that are backend-side blockers.

- [ ] **Step 3: Run existing frontend tests**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/frontend
npx vitest run --reporter verbose 2>&1 | tail -20
```

- [ ] **Step 4: Commit if fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during Phase 5 frontend verification"
```

---

## Summary

| Task | What | Commits |
|------|------|---------|
| 1 | Update types.ts | 1 |
| 2 | Update api.ts | 1 |
| 3 | Create SystemCheck component | 1 |
| 4 | Create ModelDownload component | 1 |
| 5 | Rewrite FirstRunWizard | 1 |
| 6 | Update Settings page | 1 |
| 7 | Update CostConfirmModal | 1 |
| 8 | Update App.tsx wizard gate | 1 |
| 9 | Verification | 0-1 |

**Total: 9 tasks, 8-9 commits**

**After Phase 5:**
- No Anthropic-specific UI anywhere in the frontend
- System check validates hardware before first use
- Model download with progress bar for first-time setup
- Optional Ollama account for web search (not required)
- Cost confirm modal shows estimated time, not dollars
- Settings page shows model status instead of API key
- Wizard gates on model readiness, not API key presence

**Next phase (Phase 6):** Installer updates + E2E testing + documentation + release.
