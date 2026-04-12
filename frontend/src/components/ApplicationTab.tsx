import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { slugify } from '../utils/slugify';
import { useElapsedTimer } from '../hooks/useElapsedTimer';
import Alert from './Alert';
import { startSSEStream } from '../utils/sseStream';
import StepProgress, { APPLICATION_STEPS, StepState } from './StepProgress';

interface ApplicationTabProps {
  projectId: string;
  hasClaims: boolean;
}

const SECTION_KEYS = [
  'title',
  'crossReferences',
  'background',
  'summary',
  'detailedDescription',
  'claims',
  'abstract',
  'figureDescriptions',
  'idsTable',
] as const;

const SECTION_LABELS: Record<string, string> = {
  title: 'Title',
  crossReferences: 'Cross-References',
  background: 'Background',
  summary: 'Summary',
  detailedDescription: 'Detailed Description',
  claims: 'Claims',
  abstract: 'Abstract',
  figureDescriptions: 'Figure Descriptions',
  idsTable: 'Information Disclosure Statement',
};

export default function ApplicationTab({ projectId, hasClaims }: ApplicationTabProps) {
  const [application, setApplication] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('title');
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [docxLoading, setDocxLoading] = useState(false);
  const [docxError, setDocxError] = useState<string | null>(null);
  const [mdLoading, setMdLoading] = useState(false);
  // SSE streaming state
  const [sseSteps, setSseSteps] = useState<StepState[]>([]);
  const [useSSE, setUseSSE] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { formatted: elapsedFormatted } = useElapsedTimer(
    generating || application?.status === 'RUNNING',
  );

  useEffect(() => {
    loadApplication();
  }, [projectId]);

  // Poll while generating
  useEffect(() => {
    if (!generating) return;
    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const a = await api.application.getLatest(projectId);
        if (!isMounted) return;
        if (a.status === 'COMPLETE' || a.status === 'ERROR') {
          setApplication(a);
          setGenerating(false);
          // Clear any start-time error — generation errors are shown via application.errorMessage below
          setError(null);
        }
      } catch {
        /* poll error — ignore to avoid spamming error state */
      }
    }, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [generating, projectId]);

  async function loadApplication() {
    try {
      setLoading(true);
      const a = await api.application.getLatest(projectId);
      setApplication(a.status === 'NONE' ? null : a);
      if (a.status === 'RUNNING') setGenerating(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  /** Start application generation via SSE stream, falling back to polling on failure. */
  async function startGenerationSSE() {
    setGenerating(true);
    setError(null);
    setUseSSE(true);
    setSseSteps(APPLICATION_STEPS.map((s) => ({ key: s.key, status: 'pending' })));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { stream } = await startSSEStream(
        `/api/projects/${projectId}/application/stream`,
        {},
        controller.signal,
      );

      for await (const event of stream) {
        if (event.event === 'step') {
          const stepKey = event.data.step;
          const stepStatus = event.data.status === 'complete' ? 'complete' : 'running';
          setSseSteps((prev) =>
            prev.map((s) =>
              s.key === stepKey
                ? { ...s, status: stepStatus, detail: event.data.detail }
                : s.status === 'running' && stepStatus === 'running'
                  ? { ...s, status: 'complete' }
                  : s,
            ),
          );
        } else if (event.event === 'complete') {
          setSseSteps((prev) => prev.map((s) => ({ ...s, status: 'complete' })));
          await loadApplication();
          setGenerating(false);
          setUseSSE(false);
          return;
        } else if (event.event === 'error') {
          setError(event.data.message || 'Application generation failed');
          setGenerating(false);
          setUseSSE(false);
          return;
        }
      }

      // Stream ended without complete — fall back to polling
      setUseSSE(false);
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setGenerating(false);
        setUseSSE(false);
        return;
      }
      console.warn('Application SSE stream failed, falling back to polling:', e.message);
      setUseSSE(false);
      try {
        await api.application.start(projectId);
      } catch (fallbackErr: any) {
        setError(fallbackErr.message);
        setGenerating(false);
      }
    }
  }

  async function startGeneration() {
    if (!acknowledged) {
      setShowModal(true);
      return;
    }
    try {
      setError(null);
      await startGenerationSSE();
    } catch (e: any) {
      setError(e.message);
      setGenerating(false);
    }
  }

  async function handleSaveSection() {
    if (!editingSection) return;
    try {
      await api.application.updateSection(projectId, editingSection, editText);
      setApplication((prev: any) => (prev ? { ...prev, [editingSection]: editText } : prev));
      setEditingSection(null);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleDownloadDocx() {
    setDocxLoading(true);
    setDocxError(null);
    try {
      const blob = await api.application.exportDocx(projectId);
      const url = URL.createObjectURL(blob);
      const slug = slugify(application?.title || 'patent-application');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}-patent-application.docx`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 2000);
    } catch (e: any) {
      setDocxError(e.message || 'Word export failed');
    } finally {
      setDocxLoading(false);
    }
  }

  async function handleDownloadMarkdown() {
    setMdLoading(true);
    try {
      const md = await api.application.exportMarkdown(projectId);
      const slug = slugify(application?.title || 'patent-application');
      const blob = new Blob([md as any], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}-patent-application.md`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 2000);
    } catch (e: any) {
      setError(e.message || 'Markdown export failed');
    } finally {
      setMdLoading(false);
    }
  }

  if (loading) {
    return <div className="text-gray-500 py-8 text-center">Loading application data...</div>;
  }

  // State 1: No claims
  if (!hasClaims) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg font-medium text-gray-400">Draft claims before generating an application</p>
        <p className="text-sm mt-1">Application generation requires completed claim drafts.</p>
      </div>
    );
  }

  // State 2: Generating
  if (generating || application?.status === 'RUNNING') {
    // SSE mode: show real-time step progress
    if (useSSE && sseSteps.length > 0) {
      return (
        <StepProgress
          steps={APPLICATION_STEPS}
          stepStates={sseSteps}
          elapsed={elapsedFormatted}
          description="Application generation typically takes 2-4 minutes. Your patent application document is being assembled."
          error={error}
        />
      );
    }

    // Polling fallback: show simple spinner
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center gap-3">
          <div
            className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"
            aria-label="Loading"
          />
          <span className="text-gray-300">Generating patent application...</span>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Application generation typically takes 2-4 minutes. Your patent application document is being assembled.
        </p>
        <p className="text-xs text-gray-600 mt-2 font-mono">{elapsedFormatted} elapsed</p>
      </div>
    );
  }

  // State 3: Complete — show sections
  if (application?.status === 'COMPLETE') {
    return renderSections();
  }

  // State 4: Error or no application yet
  return (
    <div className="text-center py-12">
      {application?.status === 'ERROR' && (
        <p className="text-red-400 mb-3">
          Generation failed{application.errorMessage ? `: ${application.errorMessage}` : '.'}
        </p>
      )}
      {!application && (
        <p className="text-gray-400 mb-4">No application draft yet. Generate one from your claim drafts.</p>
      )}
      <button
        onClick={startGeneration}
        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm transition-colors"
      >
        {application?.status === 'ERROR' ? 'Try Again' : 'Generate Application'}
      </button>
      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      {renderModal()}
    </div>
  );

  // ----- Sections view -----
  function renderSections() {
    if (!application) return null;

    // Count sections that have actual content
    const populatedSections = SECTION_KEYS.filter(
      (k) => application[k] && (application[k] as string).trim().length > 0,
    );
    const sectionsEmpty = populatedSections.length === 0;

    const sectionText = application[activeSection] || '';

    return (
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadDocx}
              disabled={docxLoading}
              className="px-3 py-1.5 text-sm bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded transition-colors"
            >
              {docxLoading ? 'Preparing...' : 'Export Word'}
            </button>
            <button
              onClick={handleDownloadMarkdown}
              disabled={mdLoading}
              className="px-3 py-1.5 text-sm bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded transition-colors"
            >
              {mdLoading ? 'Preparing...' : 'Export Markdown'}
            </button>
          </div>
          <button
            onClick={startGeneration}
            className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
          >
            Regenerate
          </button>
        </div>

        {docxError && <Alert variant="error">Word export failed: {docxError}</Alert>}

        {/* Empty-sections warning — generation completed but no content was saved */}
        {sectionsEmpty && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
            <p className="text-red-300 text-sm font-semibold">Application generated but all sections are empty</p>
            <p className="text-red-400/70 text-sm mt-2">
              Generation completed without producing content. This can happen if the request timed out, the AI
              service returned an unexpected response, or the generation was interrupted before content was saved.
            </p>
            <p className="text-red-400/70 text-sm mt-2">
              <strong className="text-red-300">To fix this:</strong> Click <strong>Regenerate</strong> above to run
              application generation again. If it fails again, check your API key in Settings and ensure all
              upstream steps (Feasibility, Claims) have completed successfully.
            </p>
          </div>
        )}

        {/* UPL disclaimer banner */}
        <div className="bg-amber-900/20 border border-amber-800 rounded-lg p-3 text-center">
          <p className="text-amber-300 text-xs font-semibold uppercase tracking-wider">
            RESEARCH OUTPUT — NOT LEGAL ADVICE
          </p>
          <p className="text-amber-400/70 text-xs mt-1">
            This is an AI-generated patent application draft. It must be reviewed by a registered patent attorney.
          </p>
        </div>

        {/* Prior art warning if IDS is empty */}
        {application && !application.idsTable && (
          <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-4">
            <p className="text-yellow-300 text-sm font-semibold">Information Disclosure Statement is empty</p>
            <p className="text-yellow-400/70 text-sm mt-2">
              The IDS lists all known prior art references and is a legal requirement when filing a patent application.
              It is empty because no prior art search has been completed for this project.
            </p>
            <p className="text-yellow-400/70 text-sm mt-2">
              <strong className="text-yellow-300">To fix this:</strong>
            </p>
            <ol className="text-yellow-400/70 text-sm mt-1 ml-5 list-decimal space-y-1">
              <li>
                Go to{' '}
                <a href="/settings" className="text-blue-400 hover:underline font-medium">
                  Settings
                </a>{' '}
                and enter a USPTO Open Data Portal API key. You can get a free key at{' '}
                <a
                  href="https://data.uspto.gov/myodp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline font-medium"
                >
                  data.uspto.gov/myodp
                </a>
              </li>
              <li>
                Go to the <strong className="text-yellow-300">Prior Art</strong> tab and run a prior art search
              </li>
              <li>Then regenerate this application — the IDS will be populated automatically</li>
            </ol>
          </div>
        )}

        {/* Two-column layout: nav + content */}
        <div className="flex flex-col md:flex-row gap-4">
          {/* Section navigation */}
          <nav className="md:w-48 flex-shrink-0 space-y-1">
            {SECTION_KEYS.map((key) => (
              <button
                key={key}
                onClick={() => {
                  setActiveSection(key);
                  setEditingSection(null);
                }}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                  activeSection === key
                    ? 'bg-blue-900 border border-blue-700 text-blue-200'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                {SECTION_LABELS[key]}
              </button>
            ))}
          </nav>

          {/* Section content */}
          <div className="flex-1 min-w-0 bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-200">{SECTION_LABELS[activeSection]}</h3>
              {editingSection !== activeSection && sectionText && (
                <button
                  onClick={() => {
                    setEditingSection(activeSection);
                    setEditText(sectionText);
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  aria-label={`Edit ${SECTION_LABELS[activeSection]} section`}
                >
                  Edit
                </button>
              )}
            </div>

            {editingSection === activeSection ? (
              <div className="space-y-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full h-64 bg-gray-800 border border-gray-700 rounded p-3 text-sm text-gray-200 font-mono resize-y focus:outline-none focus:border-blue-600"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveSection}
                    className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingSection(null)}
                    className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : sectionText ? (
              <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto">
                {sectionText.split('\n').map((line: string, i: number) => (
                  <div key={i} className="flex gap-3">
                    <span className="text-gray-600 text-xs select-none w-6 text-right flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span>{line || '\u00A0'}</span>
                  </div>
                ))}
              </div>
            ) : activeSection === 'crossReferences' ? (
              <div className="space-y-2">
                <p className="text-gray-400 text-sm">No cross-references to related applications.</p>
                <p className="text-gray-500 text-xs">
                  If you have filed related patent applications (provisionals, continuations, divisionals), click Edit
                  to add references to them here.
                </p>
                <button
                  onClick={() => {
                    setEditingSection('crossReferences');
                    setEditText('');
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Add Cross-References
                </button>
              </div>
            ) : activeSection === 'idsTable' ? (
              <p className="text-gray-500 text-sm italic">
                No prior art data. See the instructions above to populate the IDS.
              </p>
            ) : (
              <p className="text-gray-500 text-sm italic">No content for this section.</p>
            )}
          </div>
        </div>

        {/* Cost */}
        {application.estimatedCostUsd != null && application.estimatedCostUsd > 0 && (
          <div className="pt-4 border-t border-gray-800 text-right">
            <span className="text-xs text-gray-500">
              Estimated cost:{' '}
              <span className="text-amber-400 font-mono">${application.estimatedCostUsd.toFixed(2)}</span>
            </span>
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}
        {renderModal()}
      </div>
    );
  }

  // ----- UPL Modal -----
  function renderModal() {
    if (!showModal) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6">
          <h2 className="text-lg font-bold text-gray-100 mb-4">
            Important: This is a research tool, not a legal service.
          </h2>
          <div className="text-sm text-gray-300 space-y-3 mb-6 max-h-64 overflow-y-auto">
            <p>
              The patent application draft below is an{' '}
              <strong className="text-gray-100">AI-generated research document</strong> to help you discuss patent
              strategy with your attorney. It is NOT a legal filing.
            </p>
            <ul className="list-disc ml-5 space-y-2">
              <li>
                The draft may contain <strong className="text-gray-100">errors or missing elements</strong>
              </li>
              <li>
                Claims and descriptions may be <strong className="text-gray-100">incomplete or overbroad</strong>
              </li>
              <li>
                Statutory requirements may not be <strong className="text-gray-100">fully satisfied</strong>
              </li>
              <li>
                This is a <strong className="text-gray-100">starting point, not a final application</strong>
              </li>
            </ul>
            <p className="font-semibold text-gray-100">
              Every section must be reviewed by a registered patent attorney before filing.
            </p>
          </div>
          <label className="flex items-start gap-3 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-1 rounded border-gray-600"
            />
            <span className="text-sm text-gray-300">I understand this is AI-generated research, not legal advice</span>
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowModal(false);
                if (acknowledged) startGeneration();
              }}
              disabled={!acknowledged}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors"
            >
              Generate Application
            </button>
            <button
              onClick={() => setShowModal(false)}
              className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }
}
