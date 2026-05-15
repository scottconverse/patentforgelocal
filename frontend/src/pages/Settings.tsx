import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { AppSettings, Provider } from '../types';
import { getModelsForProvider } from '../utils/modelPricing';
import Toast from '../components/Toast';

export default function Settings() {
  const [settings, setSettings] = useState<Partial<AppSettings>>({
    provider: 'LOCAL',
    cloudApiKey: '',
    cloudDefaultModel: 'claude-haiku-4-5-20251001',
    localDefaultModel: 'gemma4:e4b',
    ollamaApiKey: '',
    ollamaModel: '',
    ollamaUrl: 'http://localhost:11434',
    modelReady: false,
    maxTokens: 32000,
    interStageDelaySeconds: 5,
    exportPath: '',
    usptoApiKey: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showOllamaKey, setShowOllamaKey] = useState(false);
  const [showUsptoKey, setShowUsptoKey] = useState(false);
  const [showCloudKey, setShowCloudKey] = useState(false);
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

        {/* Provider — selects LLM routing (added in merge plan Run 5) */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Provider</h2>
          <p className="text-sm text-gray-400">
            Choose where AI inference runs. You can switch at any time; your settings for the unused mode are preserved.
          </p>

          <fieldset className="space-y-2" aria-label="LLM provider">
            <legend className="sr-only">Choose AI provider</legend>
            <label className="flex items-start gap-3 p-3 bg-gray-800/50 border border-gray-700 rounded-lg cursor-pointer hover:bg-gray-800 transition-colors">
              <input
                type="radio"
                name="provider"
                value="LOCAL"
                checked={(settings.provider ?? 'LOCAL') === 'LOCAL'}
                onChange={() => update('provider', 'LOCAL' as Provider)}
                className="mt-1 w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 focus:ring-blue-500"
                aria-label="Local mode (Ollama)"
              />
              <span>
                <span className="text-gray-100 font-medium">Local mode (Ollama)</span>
                <span className="block text-xs text-gray-400 mt-0.5">
                  Runs on your machine. Free. No data leaves your computer.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 p-3 bg-gray-800/50 border border-gray-700 rounded-lg cursor-pointer hover:bg-gray-800 transition-colors">
              <input
                type="radio"
                name="provider"
                value="CLOUD"
                checked={settings.provider === 'CLOUD'}
                onChange={() => update('provider', 'CLOUD' as Provider)}
                className="mt-1 w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 focus:ring-blue-500"
                aria-label="Cloud mode (Anthropic)"
              />
              <span>
                <span className="text-gray-100 font-medium">Cloud mode (Anthropic)</span>
                <span className="block text-xs text-gray-400 mt-0.5">
                  Uses Anthropic API. Pay per call. Requires an API key.
                </span>
              </span>
            </label>
          </fieldset>

          {/* Cloud-specific fields */}
          {settings.provider === 'CLOUD' && (
            <div
              className="space-y-4 pt-4 border-t border-gray-800"
              data-testid="provider-cloud-panel"
            >
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="cloud-api-key">
                  Anthropic API Key
                </label>
                <div className="flex gap-2">
                  <input
                    id="cloud-api-key"
                    type={showCloudKey ? 'text' : 'password'}
                    value={settings.cloudApiKey || ''}
                    onChange={(e) => update('cloudApiKey', e.target.value)}
                    placeholder="sk-ant-..."
                    autoComplete="new-password"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm font-mono"
                    aria-label="Anthropic API key"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCloudKey((v) => !v)}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm transition-colors"
                    aria-label={showCloudKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showCloudKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Get a key at{' '}
                  <a
                    href="https://console.anthropic.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    console.anthropic.com
                  </a>
                  . Encrypted at rest using a machine-derived key.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="cloud-default-model">
                  Cloud model
                </label>
                <select
                  id="cloud-default-model"
                  value={settings.cloudDefaultModel || 'claude-haiku-4-5-20251001'}
                  onChange={(e) => update('cloudDefaultModel', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
                  aria-label="Cloud default model"
                >
                  {getModelsForProvider('CLOUD').map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Default model for cloud inference. You can override per-run.
                </p>
              </div>
            </div>
          )}

          {/* Local-specific fields */}
          {(settings.provider ?? 'LOCAL') === 'LOCAL' && (
            <div
              className="space-y-4 pt-4 border-t border-gray-800"
              data-testid="provider-local-panel"
            >
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="ollama-url">
                  Ollama URL
                </label>
                <input
                  id="ollama-url"
                  type="text"
                  value={settings.ollamaUrl || ''}
                  onChange={(e) => update('ollamaUrl', e.target.value)}
                  placeholder="http://localhost:11434"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm font-mono"
                  aria-label="Ollama server URL"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Where your local Ollama instance is reachable. Default works for most installs.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="local-default-model">
                  Local model
                </label>
                <select
                  id="local-default-model"
                  value={settings.localDefaultModel || 'gemma4:e4b'}
                  onChange={(e) => update('localDefaultModel', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
                  aria-label="Local default model"
                >
                  {getModelsForProvider('LOCAL').map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Default Ollama model. Smaller models run faster; larger models think harder.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* AI Model Status */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">AI Model</h2>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-1">AI Model</label>
            <div className="flex items-center gap-3 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg">
              <span className={`w-2 h-2 rounded-full ${settings.modelReady ? 'bg-green-400' : 'bg-red-400'}`} />
              <span className="text-white">{settings.ollamaModel || 'gemma4:e4b'}</span>
              <span className="text-sm text-gray-400 ml-auto">{settings.modelReady ? 'Running' : 'Not loaded'}</span>
            </div>
          </div>
        </div>

        {/* API Keys */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">API Keys</h2>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Ollama API Key <span className="text-gray-500">(optional — enables web search)</span>
            </label>
            <div className="flex gap-2">
              <input
                type={showOllamaKey ? 'text' : 'password'}
                value={settings.ollamaApiKey || ''}
                onChange={(e) => update('ollamaApiKey', e.target.value)}
                placeholder="Optional — for web search"
                autoComplete="new-password"
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm font-mono"
              />
              <button
                type="button"
                onClick={() => setShowOllamaKey((v) => !v)}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm transition-colors"
              >
                {showOllamaKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Create a free account at{' '}
              <a
                href="https://ollama.com/signup"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                ollama.com
              </a>{' '}
              for web search during analysis.
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

        {/* Export */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Export</h2>
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
