import { useState, useEffect } from 'react';
import { api } from '../api';

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
  const icons = { pass: '\u2713', warn: '\u26A0', fail: '\u2717', checking: '\u2026' };
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
      .then((r: SystemCheckResult) => {
        if (!cancelled) {
          setResult(r);
          setChecking(false);
        }
      })
      .catch((err: Error) => {
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
        <div className="text-lg text-gray-300 mb-2">Checking your system...</div>
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
      detail: result.gpuDetected ? result.gpuName : 'Not detected (CPU mode -- slower)',
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
