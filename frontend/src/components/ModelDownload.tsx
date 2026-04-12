import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

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
            This may take 10-30 minutes depending on your internet speed.
          </p>
        </div>
      )}

      {status === 'complete' && (
        <div className="text-center py-4">
          <div className="text-green-400 text-2xl mb-2">{'\u2713'}</div>
          <p className="text-green-300 font-medium">Model downloaded successfully</p>
          <p className="text-sm text-gray-400 mt-1">Setting up...</p>
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
