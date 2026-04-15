import { Injectable } from '@nestjs/common';
import * as os from 'os';
import { execSync } from 'child_process';

const OLLAMA_URL = (() => {
  const host = process.env.OLLAMA_HOST;
  if (!host) return 'http://127.0.0.1:11434';
  return host.startsWith('http://') || host.startsWith('https://') ? host : `http://${host}`;
})();

export interface SystemCheckResult {
  ramGB: number;
  diskFreeGB: number;
  cpuCores: number;
  gpuDetected: boolean;
  gpuName: string;
  modelDownloaded: boolean;
  modelName: string;
  ollamaRunning: boolean;
}

export interface PullProgress {
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
        const out = execSync(
          `C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -NoProfile -NonInteractive -Command "(Get-CimInstance Win32_LogicalDisk -Filter 'DeviceID=''C:''').FreeSpace"`,
          { encoding: 'utf-8' },
        );
        const freeBytes = parseInt(out.trim(), 10);
        if (!isNaN(freeBytes)) diskFreeGB = Math.round(freeBytes / (1024 ** 3));
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
        const out = execSync(
          `C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -NoProfile -NonInteractive -Command "(Get-CimInstance Win32_VideoController).Name"`,
          { encoding: 'utf-8' },
        );
        const name = out.trim().split('\n')[0].trim();
        if (name) {
          gpuName = name;
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
    const modelName = process.env.OLLAMA_MODEL || 'gemma4:e4b';

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

    const modelName = process.env.OLLAMA_MODEL || 'gemma4:e4b';
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
    const modelName = process.env.OLLAMA_MODEL || 'gemma4:e4b';
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
