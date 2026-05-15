import { useState, useCallback, useMemo } from 'react';
import { api } from '../api';
import type { InstallEdition, Provider } from '../types';
import SystemCheck from './SystemCheck';
import ModelDownload from './ModelDownload';

type Step =
  | 'welcome'
  | 'provider-choice'
  | 'cloud-api-key'
  | 'system-check'
  | 'model-download'
  | 'ollama-account'
  | 'disclaimer'
  | 'ready';

interface FirstRunWizardProps {
  onComplete: (success: boolean) => void;
  /**
   * Installer edition, read from AppSettings.installEdition on app boot.
   * Lean installs skip the Local/Cloud chooser and force CLOUD; Full installs
   * open with the chooser and branch into Local or Cloud setup.
   */
  installEdition: InstallEdition;
}

function flowFor(edition: InstallEdition, chosenProvider: Provider | null): Step[] {
  // Lean install: no Ollama bundled. Force Cloud; no chooser.
  if (edition === 'Lean') {
    return ['welcome', 'cloud-api-key', 'disclaimer', 'ready'];
  }
  // Full install — open with chooser. The tail of the flow depends on the
  // chooser result, so before the user picks we render the welcome → chooser
  // pair only; once they pick, the full flow is known.
  if (chosenProvider === null) {
    return ['welcome', 'provider-choice'];
  }
  if (chosenProvider === 'CLOUD') {
    return ['welcome', 'provider-choice', 'cloud-api-key', 'disclaimer', 'ready'];
  }
  // LOCAL
  return [
    'welcome',
    'provider-choice',
    'system-check',
    'model-download',
    'ollama-account',
    'disclaimer',
    'ready',
  ];
}

export default function FirstRunWizard({ onComplete, installEdition }: FirstRunWizardProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [chosenProvider, setChosenProvider] = useState<Provider | null>(null);
  const [modelDownloaded, setModelDownloaded] = useState(false);
  const [ollamaApiKey, setOllamaApiKey] = useState('');
  const [cloudApiKey, setCloudApiKey] = useState('');
  const [usptoApiKey, setUsptoApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  // The effective provider for finish/save: Lean → always CLOUD;
  // Full → whatever the user picked (defaults LOCAL if they somehow bypassed
  // the chooser, which shouldn't happen but is a safe fallback).
  const effectiveProvider: Provider = installEdition === 'Lean' ? 'CLOUD' : (chosenProvider ?? 'LOCAL');

  const flow = useMemo(() => flowFor(installEdition, chosenProvider), [installEdition, chosenProvider]);
  const stepIndex = flow.indexOf(step);

  const goNext = useCallback(() => {
    const currentFlow = flowFor(installEdition, chosenProvider);
    const idx = currentFlow.indexOf(step);
    if (idx < 0) return;
    if (idx >= currentFlow.length - 1) return;

    let next = currentFlow[idx + 1];
    // Existing Local-flow behavior: skip model-download if SystemCheck reported
    // the model is already downloaded.
    if (next === 'model-download' && modelDownloaded) {
      next = currentFlow[idx + 2] ?? next;
    }
    setStep(next);
  }, [step, modelDownloaded, installEdition, chosenProvider]);

  function pickProvider(p: Provider) {
    setChosenProvider(p);
    // Recompute flow with the new provider, then move to the next step
    // (cloud-api-key for CLOUD, system-check for LOCAL).
    const nextFlow = flowFor(installEdition, p);
    const idx = nextFlow.indexOf('provider-choice');
    if (idx >= 0 && idx < nextFlow.length - 1) {
      setStep(nextFlow[idx + 1]);
    }
  }

  async function handleFinish() {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        provider: effectiveProvider,
        usptoApiKey: usptoApiKey.trim(),
        // Mark first-run setup as complete. modelReady doubles as the
        // "wizard finished; don't show again" indicator (see App.tsx).
        modelReady: true,
      };
      if (effectiveProvider === 'CLOUD') {
        payload.cloudApiKey = cloudApiKey.trim();
      } else {
        // LOCAL flow may have collected the Ollama-Cloud Web Search token;
        // pass it via the legacy field (backend silently no-ops until the
        // field is restored — see handoff Discovered finding #1).
        payload.ollamaApiKey = ollamaApiKey.trim();
      }
      await api.settings.update(payload);
      onComplete(true);
    } catch {
      // Still complete even if save fails — Settings page can fix it.
      onComplete(true);
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
        {/* Step: Welcome */}
        {step === 'welcome' && (
          <div>
            <h2 id="wizard-title" className="text-xl font-bold text-gray-100 mb-2">
              Welcome to PatentForge
            </h2>
            <p className="text-sm text-gray-400 mb-4">
              {installEdition === 'Lean'
                ? 'Patent analysis powered by AI in the cloud. You bring your own Anthropic API key; your work stays in your account.'
                : 'Patent analysis powered by AI. Run locally on your own hardware, or use the Anthropic cloud — your choice.'}
            </p>
            <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 mb-6">
              <p className="text-blue-300 text-sm font-medium mb-1">
                {installEdition === 'Lean' ? 'Cloud Mode' : 'Local or Cloud'}
              </p>
              <p className="text-blue-400/80 text-sm">
                {installEdition === 'Lean'
                  ? 'This installer is the Lean edition — no local model bundled. You\'ll connect to Anthropic on the next screen.'
                  : 'This installer is the Full edition — it includes Ollama + Gemma 4 for local inference. Pick the mode that fits your work.'}
              </p>
            </div>
            <button
              onClick={goNext}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors"
            >
              Get Started
            </button>
          </div>
        )}

        {/* Step: Provider Choice (Full only) */}
        {step === 'provider-choice' && (
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">Pick a mode</h2>
            <p className="text-sm text-gray-400 mb-6">
              You can change this any time in Settings. Both modes use the same prompts and
              produce the same outputs; what differs is where the model runs.
            </p>

            <button
              type="button"
              onClick={() => pickProvider('LOCAL')}
              className="block w-full text-left p-4 mb-3 rounded-lg border border-gray-700 bg-gray-800 hover:border-blue-500 hover:bg-gray-700 transition-colors"
              aria-label="Choose Local mode (Ollama + Gemma 4 on this machine)"
            >
              <div className="font-medium text-gray-100 mb-1">Local mode</div>
              <div className="text-sm text-gray-400">
                Gemma 4 runs on your hardware via Ollama. Free. No API key. Your inventions
                never leave this machine.
              </div>
            </button>

            <button
              type="button"
              onClick={() => pickProvider('CLOUD')}
              className="block w-full text-left p-4 mb-6 rounded-lg border border-gray-700 bg-gray-800 hover:border-blue-500 hover:bg-gray-700 transition-colors"
              aria-label="Choose Cloud mode (Anthropic Claude)"
            >
              <div className="font-medium text-gray-100 mb-1">Cloud mode</div>
              <div className="text-sm text-gray-400">
                Use Anthropic Claude. You bring your own API key; costs ride on your Anthropic
                account. Faster on lower-end hardware.
              </div>
            </button>
          </div>
        )}

        {/* Step: Cloud API Key (Lean and Full+CLOUD) */}
        {step === 'cloud-api-key' && (
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">Anthropic API key</h2>
            <p className="text-sm text-gray-400 mb-6">
              PatentForge calls Claude on your behalf in Cloud mode. Your key is encrypted at
              rest and never leaves this machine except in calls to the Anthropic API.
            </p>

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="wizard-cloud-key">
                Anthropic API Key
              </label>
              <input
                id="wizard-cloud-key"
                type="password"
                value={cloudApiKey}
                onChange={(e) => setCloudApiKey(e.target.value)}
                placeholder="sk-ant-..."
                autoComplete="new-password"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">
                Get a key at{' '}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  console.anthropic.com
                </a>
                . You can also paste it later in Settings.
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="wizard-uspto-key">
                USPTO API Key <span className="text-gray-500">(optional)</span>
              </label>
              <input
                id="wizard-uspto-key"
                type="password"
                value={usptoApiKey}
                onChange={(e) => setUsptoApiKey(e.target.value)}
                placeholder="30-character key from data.uspto.gov"
                autoComplete="new-password"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">
                Free at{' '}
                <a
                  href="https://data.uspto.gov/myodp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  data.uspto.gov
                </a>
                . Adds structured patent search results.
              </p>
            </div>

            <button
              onClick={goNext}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors"
            >
              {cloudApiKey ? 'Continue' : 'Skip for Now'}
            </button>
          </div>
        )}

        {/* Step: System Check (Full + LOCAL) */}
        {step === 'system-check' && (
          <SystemCheck
            onPass={(result) => {
              setModelDownloaded(result.modelDownloaded);
              goNext();
            }}
            onFail={() => onComplete(false)}
          />
        )}

        {/* Step: Model Download (Full + LOCAL) */}
        {step === 'model-download' && (
          <ModelDownload
            modelName="gemma4:e4b"
            onComplete={() => {
              setModelDownloaded(true);
              goNext();
            }}
            onSkip={goNext}
          />
        )}

        {/* Step: Ollama Account + USPTO Key (Full + LOCAL) */}
        {step === 'ollama-account' && (
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">Optional API Keys</h2>
            <p className="text-sm text-gray-400 mb-6">
              These are optional. PatentForge in Local mode works fully offline without them.
            </p>

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="wizard-ollama-key">
                Ollama Web Search Key <span className="text-gray-500">(optional)</span>
              </label>
              <input
                id="wizard-ollama-key"
                type="password"
                value={ollamaApiKey}
                onChange={(e) => setOllamaApiKey(e.target.value)}
                placeholder="Enables web search during analysis"
                autoComplete="new-password"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">
                Free account at{' '}
                <a
                  href="https://ollama.com/signup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  ollama.com
                </a>{' '}
                for web search during patent analysis.
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="wizard-uspto-key-local">
                USPTO API Key <span className="text-gray-500">(optional)</span>
              </label>
              <input
                id="wizard-uspto-key-local"
                type="password"
                value={usptoApiKey}
                onChange={(e) => setUsptoApiKey(e.target.value)}
                placeholder="30-character key from data.uspto.gov"
                autoComplete="new-password"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">
                Free at{' '}
                <a
                  href="https://data.uspto.gov/myodp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  data.uspto.gov
                </a>
                . Adds structured patent search results.
              </p>
            </div>

            <button
              onClick={goNext}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors"
            >
              {ollamaApiKey || usptoApiKey ? 'Continue' : 'Skip for Now'}
            </button>
          </div>
        )}

        {/* Step: Disclaimer */}
        {step === 'disclaimer' && (
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">Important Notice</h2>
            <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-4 mb-6">
              <p className="text-amber-200 font-medium text-sm mb-2">Research Tool Only</p>
              <p className="text-sm text-amber-300/80 mb-3">
                PatentForge is a research and analysis tool. It does not provide legal advice
                and is not a substitute for a registered patent attorney.
              </p>
              <p className="text-sm text-amber-300/80">
                AI-generated patent analysis may contain errors or omissions. Always consult a
                qualified patent professional before making filing decisions.
              </p>
            </div>
            <button
              onClick={goNext}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors"
            >
              I Understand
            </button>
          </div>
        )}

        {/* Step: Ready */}
        {step === 'ready' && (
          <div className="text-center">
            <div className="text-green-400 text-4xl mb-4">{'✓'}</div>
            <h2 className="text-xl font-bold text-gray-100 mb-2">You're All Set</h2>
            <p className="text-sm text-gray-400 mb-6">
              {effectiveProvider === 'LOCAL'
                ? 'PatentForge is ready in Local mode. Inference runs on this machine.'
                : 'PatentForge is ready in Cloud mode. Inference runs on Anthropic; your key is encrypted at rest.'}
            </p>
            <button
              onClick={handleFinish}
              disabled={saving}
              className="w-full py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-500 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Start Using PatentForge'}
            </button>
          </div>
        )}

        {/* Step indicator dots — reflect the flow for the current edition + chosen provider */}
        <div className="flex justify-center gap-2 mt-6">
          {flow.map((s, i) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === stepIndex ? 'bg-blue-500' : i < stepIndex ? 'bg-blue-800' : 'bg-gray-700'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
