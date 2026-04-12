import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { AppSettings } from '../types';
import Toast from '../components/Toast';

const MODELS = [
  { value: '', label: '— Select a model —' },
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
];

const RESEARCH_MODELS = [
  { value: '', label: 'Same as default' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
];

export default function Settings() {
  const [settings, setSettings] = useState<Partial<AppSettings>>({
    anthropicApiKey: '',
    defaultModel: '',
    researchModel: '',
    maxTokens: 32000,
    interStageDelaySeconds: 5,
    exportPath: '',
    costCapUsd: 5.0,
    usptoApiKey: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showUsptoKey, setShowUsptoKey] = useState(false);
  const [odpUsage, setOdpUsage] = useState<{
    thisWeek: {
      totalQueries: number;
      totalResults: number;
      rateLimitHits: number;
      errorCount: number;
      callCount: number;
    };
    lastUsed: string | null;
  } | null>(null);

  useEffect(() => {
    loadSettings();
    api.settings
      .odpUsage()
      .then(setOdpUsage)
      .catch(() => {});
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      const data = await api.settings.get();
      setSettings(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      const updated = await api.settings.update(settings);
      setSettings(updated);
      setToast({ message: 'Settings saved', type: 'success' });
    } catch (e: any) {
      setError(e.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  function update(key: keyof AppSettings, value: any) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <span
          className="w-6 h-6 rounded-full border-2 border-gray-600 border-t-blue-500 animate-spin mr-3"
          aria-label="Loading"
        />
        Loading settings...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link to="/" className="hover:text-gray-300 transition-colors">
          Projects
        </Link>
        <span>/</span>
        <span className="text-gray-300">Settings</span>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Settings</h1>
        <p className="text-gray-400 text-sm mt-1">Configure API keys and analysis defaults</p>
      </div>

      {settings.encryptionHealthy === false && (
        <div className="mb-4 p-4 bg-amber-900/40 border border-amber-700 rounded-lg">
          <p className="text-amber-200 font-semibold text-sm">Encryption key mismatch detected</p>
          <p className="text-amber-300/80 text-sm mt-1">
            Your API keys could not be decrypted. This usually happens when the database was moved
            from another machine. Please re-enter your API keys below and save.
          </p>
        </div>
      )}

      <form onSubmit={handleSave} autoComplete="off" className="space-y-6">
        {/* Hidden dummy input to prevent Chrome autofill */}
        <input type="text" name="prevent-autofill" style={{ display: 'none' }} autoComplete="username" />

        {/* API Keys */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">API Keys</h2>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Anthropic API Key</label>
            <div className="flex gap-2">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={settings.anthropicApiKey || ''}
                onChange={(e) => update('anthropicApiKey', e.target.value)}
                placeholder="sk-ant-..."
                autoComplete="new-password"
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm font-mono"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm transition-colors"
              >
                {showApiKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              You are connecting to your own Anthropic API account. AI processing is performed by Anthropic's servers
              under their{' '}
              <a
                href="https://www.anthropic.com/policies/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                terms of service
              </a>
              . Review their data privacy policies before submitting invention details.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">USPTO Open Data Portal Key</label>
            <div className="flex gap-2">
              <input
                type={showUsptoKey ? 'text' : 'password'}
                value={settings.usptoApiKey || ''}
                onChange={(e) => update('usptoApiKey', e.target.value)}
                placeholder="Optional — 30-character key"
                autoComplete="new-password"
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm font-mono"
              />
              <button
                type="button"
                onClick={() => setShowUsptoKey((v) => !v)}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm transition-colors"
              >
                {showUsptoKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Optional. Adds structured patent search results with assignees, CPC codes, and filing dates. Free at{' '}
              <a
                href="https://data.uspto.gov/myodp"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                data.uspto.gov
              </a>{' '}
              (requires ID.me verification). Everything works without this key.
            </p>
          </div>
        </div>

        {/* ODP API Usage */}
        {odpUsage && settings.usptoApiKey && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
              USPTO API Usage (Last 7 Days)
            </h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-800 rounded p-3">
                <div className="text-gray-500 text-xs">Queries</div>
                <div className="text-gray-100 text-lg font-mono">{odpUsage.thisWeek.totalQueries}</div>
              </div>
              <div className="bg-gray-800 rounded p-3">
                <div className="text-gray-500 text-xs">Results Found</div>
                <div className="text-gray-100 text-lg font-mono">{odpUsage.thisWeek.totalResults}</div>
              </div>
              <div className="bg-gray-800 rounded p-3">
                <div className="text-gray-500 text-xs">Searches</div>
                <div className="text-gray-100 text-lg font-mono">{odpUsage.thisWeek.callCount}</div>
              </div>
              <div className="bg-gray-800 rounded p-3">
                <div className="text-gray-500 text-xs">Last Used</div>
                <div className="text-gray-100 text-sm font-mono">
                  {odpUsage.lastUsed ? new Date(odpUsage.lastUsed).toLocaleDateString() : 'Never'}
                </div>
              </div>
            </div>
            {odpUsage.thisWeek.rateLimitHits > 0 && (
              <p className="text-amber-400 text-xs">
                {odpUsage.thisWeek.rateLimitHits} rate limit hit{odpUsage.thisWeek.rateLimitHits > 1 ? 's' : ''} this
                week
              </p>
            )}
          </div>
        )}

        {/* Models */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Models</h2>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Default Model</label>
            <select
              value={settings.defaultModel || ''}
              onChange={(e) => update('defaultModel', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Research Model</label>
            <select
              value={settings.researchModel || ''}
              onChange={(e) => update('researchModel', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
            >
              {RESEARCH_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Used for prior art search stages. Defaults to the main model if not set.
            </p>
          </div>
        </div>

        {/* Analysis Parameters */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Analysis Parameters</h2>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Max Tokens</label>
            <input
              type="number"
              min={1000}
              max={100000}
              step={1000}
              value={settings.maxTokens ?? 32000}
              onChange={(e) => update('maxTokens', parseInt(e.target.value, 10))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">Maximum tokens per stage output. Range: 1,000–100,000.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Inter-Stage Delay (seconds)</label>
            <input
              type="number"
              min={0}
              max={60}
              step={1}
              value={settings.interStageDelaySeconds ?? 5}
              onChange={(e) => update('interStageDelaySeconds', parseInt(e.target.value, 10))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">Pause between pipeline stages. Range: 0–60 seconds.</p>
          </div>
        </div>

        {/* Export & Cost */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Export & Cost</h2>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="autoExport"
              checked={settings.autoExport !== false}
              onChange={(e) => update('autoExport', e.target.checked)}
              className="w-4 h-4 rounded bg-gray-800 border-gray-600 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="autoExport" className="text-sm text-gray-300">
              Auto-export reports to Desktop after analysis completes
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Output Folder</label>
            <input
              type="text"
              value={settings.exportPath || ''}
              onChange={(e) => update('exportPath', e.target.value)}
              placeholder="Server path for MD/HTML export"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm font-mono"
            />
            <p className="text-xs text-gray-500 mt-1">
              Server folder for MD/HTML file export. Word downloads go to your browser's download folder.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Cost Cap (USD)</label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={settings.costCapUsd ?? 5.0}
              onChange={(e) => update('costCapUsd', parseFloat(e.target.value) || 0)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Show a warning before running if estimated cost exceeds this amount. Set 0 to disable.
            </p>
          </div>
        </div>

        {error && <div className="p-3 bg-red-900/40 border border-red-800 rounded text-red-300 text-sm">{error}</div>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
