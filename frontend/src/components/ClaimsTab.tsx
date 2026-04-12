import { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../api';
import Alert from './Alert';
import ClaimTree from './ClaimTree';
import { markdownToHtml } from '../utils/markdown';
import { startSSEStream } from '../utils/sseStream';
import StepProgress, { CLAIMS_STEPS, StepState } from './StepProgress';
import { useElapsedTimer } from '../hooks/useElapsedTimer';

interface ClaimsTabProps {
  projectId: string;
  hasFeasibility: boolean; // Whether a completed feasibility run exists
  priorArtTitles?: Array<{ patentNumber: string; title: string }>;
}

interface ClaimData {
  id: string;
  claimNumber: number;
  claimType: string;
  scopeLevel: string | null;
  statutoryType: string | null;
  parentClaimNumber: number | null;
  text?: string;
  preview?: string;
  examinerNotes: string;
}

interface DraftData {
  id: string;
  version: number;
  status: string;
  claims: ClaimData[];
  specLanguage: string | null;
  plannerStrategy: string | null;
  examinerFeedback: string | null;
  revisionNotes: string | null;
}

export default function ClaimsTab({ projectId, hasFeasibility, priorArtTitles }: ClaimsTabProps) {
  const [draft, setDraft] = useState<DraftData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingClaim, setEditingClaim] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list');
  const [docxLoading, setDocxLoading] = useState(false);
  const [docxError, setDocxError] = useState<string | null>(null);
  // Claims start collapsed — expand on click to avoid rendering all markdown at once
  const [expandedClaims, setExpandedClaims] = useState<Set<number>>(new Set());
  // Lazy-load cache: claimId → full text (fetched on expand)
  const [claimTexts, setClaimTexts] = useState<Record<string, string>>({});
  // Track which claims are currently loading their full text
  const [loadingClaims, setLoadingClaims] = useState<Set<string>>(new Set());
  // SSE streaming state
  const [sseSteps, setSseSteps] = useState<StepState[]>([]);
  const [useSSE, setUseSSE] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { formatted: elapsedFormatted } = useElapsedTimer(generating || draft?.status === 'RUNNING');
  // Legacy elapsed timer (kept for polling fallback)
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadDraft();
  }, [projectId]);

  // Poll while generating
  useEffect(() => {
    if (!generating) return;
    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const d = await api.claimDraft.getLatest(projectId);
        if (!isMounted) return;
        if (d.status === 'COMPLETE' || d.status === 'ERROR') {
          setDraft(d);
          setGenerating(false);
          setError(d.status === 'ERROR' ? `Claim generation failed${(d as any).errorMessage ? ': ' + (d as any).errorMessage : '. Try again.'}` : null);
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

  // Elapsed timer for progress indication during long generation
  useEffect(() => {
    if (generating || draft?.status === 'RUNNING') {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [generating, draft?.status]);

  async function loadDraft() {
    try {
      setLoading(true);
      const d = await api.claimDraft.getLatest(projectId);
      setDraft(d.status === 'NONE' ? null : d);
      setClaimTexts({}); // Clear cached texts — draft data may have changed
      if (d.status === 'RUNNING') setGenerating(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  /** Fetch full text for a claim, caching it for subsequent views. */
  async function loadClaimText(claimId: string) {
    if (claimTexts[claimId]) return; // already cached
    setLoadingClaims((prev) => new Set(prev).add(claimId));
    try {
      const result = await api.claimDraft.getClaimText(projectId, claimId);
      setClaimTexts((prev) => ({ ...prev, [claimId]: result.text }));
    } catch (e: any) {
      setError(`Failed to load claim text: ${e.message}`);
    } finally {
      setLoadingClaims((prev) => {
        const next = new Set(prev);
        next.delete(claimId);
        return next;
      });
    }
  }

  /**
   * Get the display text for a claim — returns cached full text if available,
   * otherwise returns the preview snippet from the initial load.
   */
  function getClaimDisplayText(claim: ClaimData): string {
    if (claimTexts[claim.id]) return claimTexts[claim.id];
    if (claim.text) return claim.text; // full text from ?full=true or inline
    return claim.preview ?? '';
  }

  /** Whether a claim's full text is available (either cached or inline). */
  function hasFullText(claim: ClaimData): boolean {
    return !!(claimTexts[claim.id] || claim.text);
  }

  /** Start claim generation via SSE stream, falling back to polling on failure. */
  async function handleGenerateSSE() {
    setGenerating(true);
    setError(null);
    setUseSSE(true);
    setSseSteps(CLAIMS_STEPS.map((s) => ({ key: s.key, status: 'pending' })));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { stream } = await startSSEStream(
        `/api/projects/${projectId}/claims/stream`,
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
                  ? { ...s, status: 'complete' } // auto-complete prior running step
                  : s,
            ),
          );
        } else if (event.event === 'complete') {
          // Mark all steps complete
          setSseSteps((prev) => prev.map((s) => ({ ...s, status: 'complete' })));
          // Refresh claim data from the server
          await loadDraft();
          setGenerating(false);
          setUseSSE(false);
          return;
        } else if (event.event === 'error') {
          setError(event.data.message || 'Claim generation failed');
          setGenerating(false);
          setUseSSE(false);
          return;
        }
      }

      // Stream ended without complete event — fall back to polling
      setUseSSE(false);
      // Polling effect will take over
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setGenerating(false);
        setUseSSE(false);
        return;
      }
      // SSE stream failed — fall back to polling
      console.warn('Claims SSE stream failed, falling back to polling:', e.message);
      setUseSSE(false);
      // Start the non-SSE generation as fallback
      try {
        await api.claimDraft.start(projectId);
      } catch (fallbackErr: any) {
        setError(fallbackErr.message);
        setGenerating(false);
      }
    }
  }

  async function handleGenerate() {
    if (!acknowledged) {
      setShowModal(true);
      return;
    }
    try {
      setError(null);
      // Try SSE streaming first
      await handleGenerateSSE();
    } catch (e: any) {
      setError(e.message);
      setGenerating(false);
    }
  }

  async function handleSaveClaim(claimId: string) {
    try {
      await api.claimDraft.updateClaim(projectId, claimId, editText);
      setEditingClaim(null);
      await loadDraft();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleRegenerate(claimNumber: number) {
    try {
      setRegenerating(claimNumber);
      await api.claimDraft.regenerateClaim(projectId, claimNumber);
      await loadDraft();
    } catch (e: any) {
      setError(`Failed to regenerate claim ${claimNumber}: ${e.message}`);
    } finally {
      setRegenerating(null);
    }
  }

  function toggleSection(key: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  if (loading) {
    return <div className="text-gray-500 py-8 text-center">Loading claims...</div>;
  }

  // State: No feasibility analysis
  if (!hasFeasibility) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg font-medium text-gray-400">Run a feasibility analysis first</p>
        <p className="text-sm mt-1">Claim drafting requires a completed 6-stage analysis.</p>
      </div>
    );
  }

  // State: Generating (must come before !draft check — generating can be true while draft is null)
  if (generating || draft?.status === 'RUNNING') {
    // SSE mode: show real-time step progress
    if (useSSE && sseSteps.length > 0) {
      return (
        <StepProgress
          steps={CLAIMS_STEPS}
          stepStates={sseSteps}
          elapsed={elapsedFormatted}
          description="This takes 2-5 minutes. The AI is planning, drafting, and reviewing your claims."
          error={error}
        />
      );
    }

    // Polling fallback: show simple spinner
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center gap-3">
          <div
            className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"
            aria-label="Loading"
          />
          <span className="text-gray-300">Generating claim drafts...</span>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          This takes 2-5 minutes. The AI is planning, drafting, and reviewing your claims.
        </p>
        <p className="text-xs text-gray-600 mt-2 font-mono">
          {mins > 0 ? `${mins}m ${secs.toString().padStart(2, '0')}s` : `${secs}s`} elapsed
        </p>
      </div>
    );
  }

  // State: No draft yet — show generate button
  if (!draft) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 mb-4">
          No claim draft yet. Generate AI-drafted research claims based on your feasibility analysis.
        </p>
        <button
          onClick={handleGenerate}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm transition-colors"
        >
          Generate Draft Claims
        </button>
        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        {renderModal()}
      </div>
    );
  }

  // State: Error
  if (draft.status === 'ERROR') {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-3">Claim generation failed.</p>
        {(draft as any).errorMessage && (
          <p className="text-red-400/70 text-xs mb-4 max-w-md mx-auto">{(draft as any).errorMessage}</p>
        )}
        <button
          onClick={handleGenerate}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
        >
          Try Again
        </button>
        {renderModal()}
      </div>
    );
  }

  // State: Complete — show claims
  const independentClaims = draft.claims.filter((c) => c.claimType === 'INDEPENDENT');
  const dependentClaims = draft.claims.filter((c) => c.claimType === 'DEPENDENT');

  async function handleDownloadDocx() {
    setDocxLoading(true);
    setDocxError(null);
    try {
      const blob = await api.claimDraft.exportToDocx(projectId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `patentforge-claims-${projectId.slice(0, 8)}.docx`;
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

  return (
    <div className="space-y-6">
      {/* DRAFT watermark */}
      <div className="bg-amber-900/20 border border-amber-800 rounded-lg p-3 text-center">
        <p className="text-amber-300 text-xs font-semibold uppercase tracking-wider">DRAFT — NOT FOR FILING</p>
        <p className="text-amber-400/70 text-xs mt-1">
          These are AI-generated research concepts. They must be reviewed by a registered patent attorney before any
          filing.
        </p>
      </div>

      {/* View toggle + export */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5 w-fit">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:text-gray-200'}`}
          >
            List
          </button>
          <button
            onClick={() => setViewMode('tree')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${viewMode === 'tree' ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:text-gray-200'}`}
          >
            Tree
          </button>
        </div>
        <button
          onClick={handleDownloadDocx}
          disabled={docxLoading}
          className="px-3 py-1.5 text-sm bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded transition-colors"
        >
          {docxLoading ? 'Preparing...' : 'Export Word'}
        </button>
      </div>

      {docxError && <Alert variant="error">Word export failed: {docxError}</Alert>}

      {/* Tree view */}
      {viewMode === 'tree' && (
        <ClaimTree
          claims={draft.claims}
          onClaimClick={(claimId) => {
            setViewMode('list');
            const claim = draft.claims.find((c) => c.id === claimId);
            if (claim) {
              // Expand the parent group and load full text before editing
              setExpandedClaims((prev) => new Set(prev).add(claim.claimNumber));
              if (!hasFullText(claim)) {
                loadClaimText(claim.id);
              } else {
                setEditingClaim(claimId);
                setEditText(getClaimDisplayText(claim));
              }
            }
          }}
        />
      )}

      {/* Claims list — collapsed by default to avoid freezing browser with large claim sets */}
      {viewMode === 'list' && (
        <>
          {independentClaims.length > 0 && (
            <p className="text-xs text-gray-500">
              {independentClaims.length} independent claims, {dependentClaims.length} dependent claims.
              Click a claim to expand.
            </p>
          )}
          {independentClaims.map((indep) => (
            <div key={indep.id} className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              {/* Independent claim header — click to expand/collapse + lazy-load full text */}
              <button
                onClick={() => {
                  setExpandedClaims((prev) => {
                    const next = new Set(prev);
                    if (next.has(indep.claimNumber)) {
                      next.delete(indep.claimNumber);
                    } else {
                      next.add(indep.claimNumber);
                      // Lazy-load full text for independent claim + its dependents
                      if (!hasFullText(indep)) loadClaimText(indep.id);
                      dependentClaims
                        .filter((d) => d.parentClaimNumber === indep.claimNumber)
                        .forEach((d) => { if (!hasFullText(d)) loadClaimText(d.id); });
                    }
                    return next;
                  });
                }}
                className="w-full px-4 py-3 border-b border-gray-800 flex items-center gap-3 hover:bg-gray-800/50 transition-colors"
              >
                <span className={`transform transition-transform text-gray-500 text-xs ${expandedClaims.has(indep.claimNumber) ? 'rotate-90' : ''}`}>&#9654;</span>
                <span className="text-xs px-2 py-0.5 bg-blue-900 text-blue-300 rounded font-semibold">
                  Claim {indep.claimNumber}
                </span>
                <span className="text-xs px-2 py-0.5 bg-gray-800 text-gray-400 rounded">
                  {indep.scopeLevel ?? 'INDEPENDENT'}
                </span>
                {indep.statutoryType && (
                  <span className="text-xs px-2 py-0.5 bg-gray-800 text-gray-400 rounded capitalize">
                    {indep.statutoryType}
                  </span>
                )}
                {!expandedClaims.has(indep.claimNumber) && (indep.preview || indep.text) && (
                  <span className="text-xs text-gray-500 truncate max-w-[40%]">
                    {(indep.preview || indep.text || '').slice(0, 80)}...
                  </span>
                )}
                <span className="ml-auto text-xs text-gray-600 shrink-0">
                  {dependentClaims.filter((d) => d.parentClaimNumber === indep.claimNumber).length} dependent
                </span>
              </button>

              {/* Claim body + dependent claims — only rendered when expanded */}
              {expandedClaims.has(indep.claimNumber) && <><div className="p-4">
                {loadingClaims.has(indep.id) ? (
                  <div className="flex items-center gap-2 py-3">
                    <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" aria-label="Loading claim text" />
                    <span className="text-xs text-gray-500">Loading claim text...</span>
                  </div>
                ) : editingClaim === indep.id ? (
                  <div>
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 text-sm font-mono resize-y"
                      rows={6}
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleSaveClaim(indep.id)}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-xs"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingClaim(null)}
                        className="px-3 py-1 bg-gray-700 text-gray-300 rounded text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div
                      className="group relative text-sm text-gray-300 leading-relaxed cursor-text hover:bg-gray-800/50 hover:border-gray-600 border border-transparent rounded p-1 -m-1 transition-colors"
                      onClick={() => {
                        if (!hasFullText(indep)) return; // don't edit while loading
                        setEditingClaim(indep.id);
                        setEditText(getClaimDisplayText(indep));
                      }}
                      title="Click to edit"
                    >
                      <svg
                        className="absolute top-1 right-1 w-3.5 h-3.5 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                      <div
                        className="markdown-content"
                        dangerouslySetInnerHTML={{ __html: markdownToHtml(getClaimDisplayText(indep)) }}
                      />
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <button
                        onClick={() => handleRegenerate(indep.claimNumber)}
                        disabled={regenerating === indep.claimNumber}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
                      >
                        {regenerating === indep.claimNumber ? (
                          <span className="inline-flex items-center gap-1">
                            <span
                              className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin"
                              aria-label="Loading"
                            />
                            Regenerating...
                          </span>
                        ) : (
                          'Regenerate'
                        )}
                      </button>
                    </div>
                    {(() => {
                      const overlappingArt = findOverlaps(getClaimDisplayText(indep), priorArtTitles ?? []);
                      return overlappingArt.length > 0 ? (
                        <div
                          className="mt-1 flex items-center gap-1 text-amber-400 text-xs"
                          title={`Potential overlap with: ${overlappingArt.map((a) => a.patentNumber).join(', ')}`}
                        >
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <span>Potential prior art overlap</span>
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}
              </div>

              {/* Dependent claims — only when expanded */}
              {dependentClaims
                .filter((d) => d.parentClaimNumber === indep.claimNumber)
                .map((dep) => (
                  <div key={dep.id} className="border-t border-gray-800/50 px-4 py-3 pl-8">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-gray-500 font-mono">Claim {dep.claimNumber}</span>
                      <span className="text-xs text-gray-600">depends on {dep.parentClaimNumber}</span>
                    </div>
                    {loadingClaims.has(dep.id) ? (
                      <div className="flex items-center gap-2 py-2">
                        <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" aria-label="Loading claim text" />
                        <span className="text-xs text-gray-500">Loading...</span>
                      </div>
                    ) : editingClaim === dep.id ? (
                      <div>
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 text-xs font-mono resize-y"
                          rows={3}
                        />
                        <div className="flex gap-2 mt-1">
                          <button
                            onClick={() => handleSaveClaim(dep.id)}
                            className="px-2 py-1 bg-blue-600 text-white rounded text-xs"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingClaim(null)}
                            className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div
                          className="group relative text-xs text-gray-400 leading-relaxed cursor-text hover:bg-gray-800/50 hover:border-gray-600 border border-transparent rounded p-1 -m-1 transition-colors"
                          onClick={() => {
                            if (!hasFullText(dep)) return; // don't edit while loading
                            setEditingClaim(dep.id);
                            setEditText(getClaimDisplayText(dep));
                          }}
                          title="Click to edit"
                        >
                          <svg
                            className="absolute top-1 right-1 w-3 h-3 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            />
                          </svg>
                          <div
                            className="markdown-content"
                            dangerouslySetInnerHTML={{ __html: markdownToHtml(getClaimDisplayText(dep)) }}
                          />
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <button
                            onClick={() => handleRegenerate(dep.claimNumber)}
                            disabled={regenerating === dep.claimNumber}
                            className="text-xs text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
                          >
                            {regenerating === dep.claimNumber ? (
                              <span className="inline-flex items-center gap-1">
                                <span
                                  className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin"
                                  aria-label="Loading"
                                />
                                Regenerating...
                              </span>
                            ) : (
                              'Regenerate'
                            )}
                          </button>
                        </div>
                        {(() => {
                          const overlappingArt = findOverlaps(getClaimDisplayText(dep), priorArtTitles ?? []);
                          return overlappingArt.length > 0 ? (
                            <div
                              className="mt-1 flex items-center gap-1 text-amber-400 text-xs"
                              title={`Potential overlap with: ${overlappingArt.map((a) => a.patentNumber).join(', ')}`}
                            >
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                  fillRule="evenodd"
                                  d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              <span>Potential prior art overlap</span>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>
                ))}
              {/* Close expanded conditional */}
              </>}
            </div>
          ))}
        </>
      )}

      {/* Collapsible sections: Strategy, Feedback, Specification */}
      {draft.plannerStrategy && (
        <CollapsibleSection
          title="Planner Strategy"
          isOpen={expandedSections.has('strategy')}
          onToggle={() => toggleSection('strategy')}
          content={draft.plannerStrategy}
        />
      )}
      {draft.examinerFeedback && (
        <CollapsibleSection
          title="Examiner Feedback"
          isOpen={expandedSections.has('examiner')}
          onToggle={() => toggleSection('examiner')}
          content={draft.examinerFeedback}
        />
      )}
      {draft.specLanguage && (
        <CollapsibleSection
          title="Supporting Specification Language"
          isOpen={expandedSections.has('spec')}
          onToggle={() => toggleSection('spec')}
          content={draft.specLanguage}
        />
      )}

      {/* Regenerate button */}
      <div className="pt-4 border-t border-gray-800">
        <button
          onClick={handleGenerate}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm transition-colors"
        >
          Regenerate Claims
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {renderModal()}
    </div>
  );

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
              The claims generated below are <strong className="text-gray-100">AI-drafted research concepts</strong> to
              help you discuss patent strategy with your attorney. They are NOT ready for filing.
            </p>
            <ul className="list-disc ml-5 space-y-2">
              <li>
                Claims may be <strong className="text-gray-100">too broad or too narrow</strong> for your actual
                invention
              </li>
              <li>
                The AI may have <strong className="text-gray-100">missed critical limitations</strong> needed to
                distinguish from prior art
              </li>
              <li>
                Language may <strong className="text-gray-100">not survive patent examination</strong>
              </li>
              <li>
                Technical details may be <strong className="text-gray-100">fabricated or mischaracterized</strong>
              </li>
            </ul>
            <p className="font-semibold text-gray-100">
              Every claim must be reviewed, revised, and finalized by a registered patent attorney before filing.
            </p>
          </div>
          <label className="flex items-start gap-3 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-1 rounded border-gray-600"
            />
            <span className="text-sm text-gray-300">
              I understand these are draft research concepts, not filing-ready claims
            </span>
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowModal(false);
                if (acknowledged) handleGenerate();
              }}
              disabled={!acknowledged}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors"
            >
              Generate Draft Claims
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

function findOverlaps(claimText: string, priorArt: Array<{ patentNumber: string; title: string }>) {
  if (!priorArt?.length) return [];
  const stopWords = new Set([
    'method',
    'system',
    'device',
    'apparatus',
    'comprising',
    'wherein',
    'claim',
    'said',
    'based',
    'using',
    'having',
    'includes',
    'providing',
  ]);
  const claimLower = claimText.toLowerCase();
  return priorArt.filter((art) => {
    const titleWords = art.title
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !stopWords.has(w));
    return titleWords.some((word) => claimLower.includes(word));
  });
}

function CollapsibleSection({
  title,
  isOpen,
  onToggle,
  content,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  content: string;
}) {
  const html = useMemo(() => markdownToHtml(content), [content]);
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-2 text-sm font-semibold text-gray-300 hover:text-gray-100 transition-colors"
      >
        <span className={`transform transition-transform ${isOpen ? 'rotate-90' : ''}`}>&#9654;</span>
        {title}
      </button>
      {isOpen && (
        <div className="px-4 pb-4">
          <div
            className="markdown-content text-xs text-gray-400 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      )}
    </div>
  );
}
