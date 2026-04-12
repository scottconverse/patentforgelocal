import { useState, useEffect } from 'react';
import { api } from '../api';
import { InventionInput } from '../types';
import Alert from '../components/Alert';
import { validateDescriptionWordCount } from '../utils/validation';

interface InventionFormProps {
  projectId: string;
  initialData?: Partial<InventionInput>;
  onSaved?: (invention: InventionInput) => void;
  onRunFeasibility?: (invention: InventionInput) => void;
}

const optionalFields: { key: keyof InventionInput; label: string; placeholder?: string }[] = [
  { key: 'problemSolved', label: 'Problem Solved', placeholder: 'What problem does this invention solve?' },
  { key: 'howItWorks', label: 'How It Works', placeholder: 'Describe the mechanism or process...' },
  {
    key: 'aiComponents',
    label: 'AI / ML Components',
    placeholder: 'Describe any AI or machine learning components...',
  },
  {
    key: 'threeDPrintComponents',
    label: '3D Printing / Physical Design Components',
    placeholder: 'Describe any physical or 3D printed components...',
  },
  {
    key: 'whatIsNovel',
    label: 'What I Believe Is Novel',
    placeholder: 'What makes this invention unique or innovative?',
  },
  {
    key: 'currentAlternatives',
    label: 'Current Alternatives / Prior Solutions',
    placeholder: 'Describe existing solutions or prior art you are aware of...',
  },
  {
    key: 'whatIsBuilt',
    label: 'What Has Been Built So Far',
    placeholder: 'Describe any prototypes, proofs-of-concept, or working implementations...',
  },
  {
    key: 'whatToProtect',
    label: 'What I Want Protected',
    placeholder: 'Describe the specific aspects you want patent protection for...',
  },
  { key: 'additionalNotes', label: 'Additional Notes', placeholder: 'Any other relevant information...' },
];

export default function InventionForm({ projectId, initialData, onSaved, onRunFeasibility }: InventionFormProps) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [optionals, setOptionals] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    optionalFields.forEach((f) => {
      init[f.key] = (initialData as any)?.[f.key] || '';
    });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [runningAfterSave, setRunningAfterSave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (initialData) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing controlled fields from prop when project changes
      setTitle(initialData.title || '');
      setDescription(initialData.description || '');
      const upd: Record<string, string> = {};
      optionalFields.forEach((f) => {
        upd[f.key] = (initialData as any)?.[f.key] || '';
      });
      setOptionals(upd);
    }
  }, [initialData?.id]);

  function buildPayload() {
    return {
      title: title.trim(),
      description: description.trim(),
      ...Object.fromEntries(optionalFields.map((f) => [f.key, optionals[f.key]?.trim() || undefined])),
    };
  }

  async function save(): Promise<InventionInput | null> {
    setError(null);
    if (!title.trim()) {
      setError('Title is required.');
      return null;
    }
    if (!description.trim()) {
      setError('Description is required.');
      return null;
    }
    try {
      const result = await api.invention.upsert(projectId, buildPayload());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return result;
    } catch (e: any) {
      setError(e.message || 'Failed to save.');
      return null;
    }
  }

  async function handleSaveDraft(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = await save();
    setSaving(false);
    if (result && onSaved) onSaved(result);
  }

  async function handleSaveAndRun(e: React.FormEvent) {
    e.preventDefault();
    // Validate description word count before saving + running
    const descError = validateDescriptionWordCount(description);
    if (descError) {
      setError(descError);
      return;
    }
    setRunningAfterSave(true);
    const result = await save();
    setRunningAfterSave(false);
    if (result && onRunFeasibility) onRunFeasibility(result);
  }

  return (
    <form className="space-y-6 max-w-3xl">
      <div>
        <label htmlFor="invention-title" className="block text-sm font-medium text-gray-200 mb-1">
          Title <span className="text-red-400">*</span>
        </label>
        <input
          id="invention-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Name your invention"
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
        />
      </div>

      <div>
        <label htmlFor="invention-description" className="block text-sm font-medium text-gray-200 mb-1">
          Description <span className="text-red-400">*</span>
        </label>
        <textarea
          id="invention-description"
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 8000))}
          maxLength={8000}
          placeholder="Provide a detailed description of your invention..."
          rows={7}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm resize-y"
        />
        <p className={`text-xs mt-1 text-right ${description.length > 7500 ? 'text-amber-400' : 'text-gray-500'}`}>
          {(8000 - description.length).toLocaleString()} characters remaining
        </p>
      </div>

      <div className="border-t border-gray-800 pt-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-4">Optional Fields</p>
        <div className="space-y-4">
          {optionalFields.map((field) => (
            <div key={field.key}>
              <label htmlFor={`invention-${field.key}`} className="block text-sm font-medium text-gray-400 mb-1">
                {field.label}
              </label>
              <textarea
                id={`invention-${field.key}`}
                value={optionals[field.key] || ''}
                onChange={(e) => setOptionals((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500 text-sm resize-y"
              />
            </div>
          ))}
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {saved && <Alert variant="success">Draft saved successfully.</Alert>}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={saving || runningAfterSave}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 rounded font-medium text-sm transition-colors"
        >
          {saving ? 'Saving...' : 'Save Draft'}
        </button>
        {onRunFeasibility && (
          <button
            type="button"
            onClick={handleSaveAndRun}
            disabled={saving || runningAfterSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded font-medium text-sm transition-colors"
          >
            {runningAfterSave ? 'Saving...' : 'Save & Run Feasibility'}
          </button>
        )}
      </div>
    </form>
  );
}
