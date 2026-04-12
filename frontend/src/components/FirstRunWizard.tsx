import { useState, useRef, useEffect } from 'react';
import { api } from '../api';
import Alert from './Alert';

interface FirstRunWizardProps {
  onComplete: (keyConfigured: boolean) => void;
}

export default function FirstRunWizard({ onComplete }: FirstRunWizardProps) {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [success, setSuccess] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up the redirect timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleValidate() {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setError('Please enter an API key. You can get one from console.anthropic.com.');
      return;
    }

    setError(null);
    setValidating(true);

    try {
      const result = await api.settings.validateKey(trimmed);

      if (result.valid) {
        await api.settings.update({ anthropicApiKey: trimmed });
        setSuccess(true);
        timerRef.current = setTimeout(() => {
          onComplete(true);
        }, 1200);
      } else {
        setError(result.error || 'Validation failed. Please try again.');
      }
    } catch {
      setError('Could not reach the PatentForge server. Make sure the application is running.');
    } finally {
      setValidating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wizard-title"
    >
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6">
        <h2 id="wizard-title" className="text-xl font-bold text-gray-100 mb-2">
          Welcome to PatentForge!
        </h2>
        <p className="text-sm text-gray-400 mb-5">
          To get started, you need an Anthropic API key. PatentForge uses Claude to analyze patents and generate
          reports.
        </p>

        <div className="text-sm text-gray-300 space-y-2 mb-5">
          <p className="font-medium text-gray-200">How to get your API key:</p>
          <ol className="list-decimal ml-5 space-y-1 text-gray-400">
            <li>
              Go to{' '}
              <a
                href="https://console.anthropic.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                console.anthropic.com
              </a>
            </li>
            <li>Create an account or sign in</li>
            <li>Navigate to API Keys and create a new key</li>
            <li>Copy the key and paste it below</li>
          </ol>
        </div>

        <div className="mb-4">
          <label htmlFor="wizard-api-key" className="block text-sm font-medium text-gray-300 mb-1">
            Anthropic API Key
          </label>
          <input
            id="wizard-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            autoComplete="off"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm font-mono"
          />
        </div>

        {error && (
          <Alert variant="error" className="mb-4">
            {error}
          </Alert>
        )}

        {success && (
          <Alert variant="success" className="mb-4">
            API key validated and saved. Starting PatentForge...
          </Alert>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleValidate}
            disabled={validating || success}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors text-sm"
          >
            {validating ? 'Validating...' : 'Validate Key'}
          </button>
          <button
            type="button"
            onClick={() => onComplete(false)}
            disabled={validating || success}
            className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 font-medium rounded-lg transition-colors text-sm"
          >
            Skip for Now
          </button>
        </div>
      </div>
    </div>
  );
}
