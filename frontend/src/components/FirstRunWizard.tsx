import { useState, useCallback } from 'react';
import { api } from '../api';
import SystemCheck from './SystemCheck';
import ModelDownload from './ModelDownload';

type Step = 'welcome' | 'system-check' | 'model-download' | 'ollama-account' | 'disclaimer' | 'ready';

const STEPS: Step[] = ['welcome', 'system-check', 'model-download', 'ollama-account', 'disclaimer', 'ready'];

interface FirstRunWizardProps {
  onComplete: (success: boolean) => void;
}

export default function FirstRunWizard({ onComplete }: FirstRunWizardProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [modelDownloaded, setModelDownloaded] = useState(false);
  const [ollamaApiKey, setOllamaApiKey] = useState('');
  const [usptoApiKey, setUsptoApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  const stepIndex = STEPS.indexOf(step);

  const goNext = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) {
      let next = STEPS[idx + 1];
      // Skip model-download if already downloaded
      if (next === 'model-download' && modelDownloaded) {
        next = STEPS[idx + 2];
      }
      setStep(next);
    }
  }, [step, modelDownloaded]);

  async function handleFinish() {
    setSaving(true);
    try {
      await api.settings.update({
        ollamaApiKey: ollamaApiKey.trim(),
        usptoApiKey: usptoApiKey.trim(),
      });
      onComplete(true);
    } catch {
      // Still complete even if save fails -- settings page can fix it
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
              Welcome to PatentForgeLocal
            </h2>
            <p className="text-sm text-gray-400 mb-4">
              Patent analysis powered by AI running entirely on your computer.
              Your inventions never leave your machine.
            </p>
            <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 mb-6">
              <p className="text-green-300 text-sm font-medium mb-1">100% Private</p>
              <p className="text-green-400/80 text-sm">
                All AI processing happens locally using Ollama. No cloud APIs, no data sharing,
                no usage tracking. Your intellectual property stays on your hardware.
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

        {/* Step: System Check */}
        {step === 'system-check' && (
          <SystemCheck
            onPass={(result) => {
              setModelDownloaded(result.modelDownloaded);
              goNext();
            }}
            onFail={() => onComplete(false)}
          />
        )}

        {/* Step: Model Download */}
        {step === 'model-download' && (
          <ModelDownload
            modelName="gemma4:26b"
            onComplete={() => {
              setModelDownloaded(true);
              goNext();
            }}
            onSkip={goNext}
          />
        )}

        {/* Step: Ollama Account + USPTO Key */}
        {step === 'ollama-account' && (
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">Optional API Keys</h2>
            <p className="text-sm text-gray-400 mb-6">
              These are optional. PatentForgeLocal works fully offline without them.
            </p>

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Ollama API Key <span className="text-gray-500">(optional)</span>
              </label>
              <input
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
              <label className="block text-sm font-medium text-gray-300 mb-1">
                USPTO API Key <span className="text-gray-500">(optional)</span>
              </label>
              <input
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
                PatentForgeLocal is a research and analysis tool. It does not provide legal advice
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
            <div className="text-green-400 text-4xl mb-4">{'\u2713'}</div>
            <h2 className="text-xl font-bold text-gray-100 mb-2">You're All Set</h2>
            <p className="text-sm text-gray-400 mb-6">
              PatentForgeLocal is ready to analyze your inventions. Everything runs locally on
              your machine.
            </p>
            <button
              onClick={handleFinish}
              disabled={saving}
              className="w-full py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-500 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Start Using PatentForgeLocal'}
            </button>
          </div>
        )}

        {/* Step indicator dots */}
        <div className="flex justify-center gap-2 mt-6">
          {STEPS.map((s, i) => (
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
