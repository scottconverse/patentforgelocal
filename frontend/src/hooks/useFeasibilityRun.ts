import { useState, useRef } from 'react';
import { api } from '../api';
import {
  InventionInput,
  FeasibilityStage,
  FeasibilityRun,
  RunStatus,
  AppSettings,
  Project,
  PriorArtSearch,
} from '../types';
import { ViewMode } from './useProjectDetail';
import { formatCost } from '../utils/format';
import { getModelPricing } from '../utils/modelPricing';
import { validateDescriptionWordCount } from '../utils/validation';

// ----- Narrative builder -----
export function toNarrative(inv: InventionInput): string {
  const parts: string[] = [];
  function add(label: string, value?: string) {
    if (value && value.trim()) parts.push(`**${label}:** ${value.trim()}`);
  }
  add('Invention Title', inv.title);
  add('Description', inv.description);
  add('Problem Solved', inv.problemSolved);
  add('How It Works', inv.howItWorks);
  add('AI / ML Components', inv.aiComponents);
  add('3D Printing / Physical Design Components', inv.threeDPrintComponents);
  add('What I Believe Is Novel', inv.whatIsNovel);
  add('Current Alternatives / Prior Solutions', inv.currentAlternatives);
  add('What Has Been Built So Far', inv.whatIsBuilt);
  add('What I Want Protected', inv.whatToProtect);
  add('Additional Notes', inv.additionalNotes);
  return parts.join('\n\n');
}

// ----- Default stage placeholders (shown before a run starts) -----
const DEFAULT_STAGE_NAMES = [
  'Technical Intake & Restatement',
  'Prior Art Research',
  'Patentability Analysis',
  'Deep Dive Analysis',
  'IP Strategy & Recommendations',
  'Comprehensive Report',
];

export function makePlaceholderStages(): FeasibilityStage[] {
  return DEFAULT_STAGE_NAMES.map((name, idx) => ({
    id: `placeholder-${idx + 1}`,
    feasibilityRunId: '',
    stageNumber: idx + 1,
    stageName: name,
    status: 'PENDING' as RunStatus,
    webSearchUsed: false,
  }));
}

// ----- Cost estimation -----

// Web search: Anthropic charges $0.01 per search. Stage 2 always searches;
// other stages occasionally do. Estimate ~15 searches per run.
const WEB_SEARCH_COST_PER_SEARCH = 0.01;
const ESTIMATED_SEARCHES_PER_RUN = 15;
const ESTIMATED_WEB_SEARCH_COST = ESTIMATED_SEARCHES_PER_RUN * WEB_SEARCH_COST_PER_SEARCH;

const COST_BUFFER = 1.25; // 25% buffer over estimate

async function estimateRunCosts(
  projectId: string,
  model: string,
): Promise<{ tokenCost: number; webSearchCost: number; source: 'history' | 'static'; runsUsed: number }> {
  const estimate = await api.feasibility.costEstimate(projectId);
  const p = getModelPricing(model);
  const stages = 6;

  if (estimate.hasHistory && estimate.avgCostPerStage > 0) {
    const tokenCost = stages * estimate.avgCostPerStage * COST_BUFFER;
    return { tokenCost, webSearchCost: ESTIMATED_WEB_SEARCH_COST, source: 'history', runsUsed: estimate.runsUsed };
  }

  const tokenCost =
    stages *
    ((estimate.avgInputTokens / 1_000_000) * p.inputPer1M + (estimate.avgOutputTokens / 1_000_000) * p.outputPer1M) *
    COST_BUFFER;
  return { tokenCost, webSearchCost: ESTIMATED_WEB_SEARCH_COST, source: 'static', runsUsed: 0 };
}

// ----- Hook parameters -----

export interface UseFeasibilityRunParams {
  projectId: string | undefined;
  project: Project | null;
  setProject: React.Dispatch<React.SetStateAction<Project | null>>;
  getLatestRun: (p: Project | null) => FeasibilityRun | null;
  setViewMode: (vm: ViewMode) => void;
  setToast: (t: { message: string; detail?: string; type?: 'success' | 'error' | 'info' } | null) => void;
  setCostModal: (m: {
    tokenCost: number;
    webSearchCost: number;
    cap: number;
    model: string;
    source: 'history' | 'static';
    runsUsed: number;
    stageCount?: number;
  } | null) => void;
  setError: (e: string | null) => void;
  loadProject: () => Promise<void>;
  setPriorArtSearch: (pa: PriorArtSearch | null) => void;
  setSelectedRunVersion: (v: number | null) => void;
  setHistoricalReport: (r: string | null) => void;
  viewMode: ViewMode;
  latestRun: FeasibilityRun | null;
}

export interface UseFeasibilityRunReturn {
  stages: FeasibilityStage[];
  setStages: React.Dispatch<React.SetStateAction<FeasibilityStage[]>>;
  activeStageNum: number | undefined;
  currentStageName: string;
  streamText: string;
  isStreamComplete: boolean;
  runError: string | null;
  setRunError: React.Dispatch<React.SetStateAction<string | null>>;
  cancelling: boolean;
  isRunning: boolean;
  isPipelineStreaming: boolean;
  pendingRunRef: React.MutableRefObject<(() => Promise<void>) | null>;
  runIdRef: React.MutableRefObject<string | null>;
  abortRef: React.MutableRefObject<AbortController | null>;
  handleRunFeasibility: (invention?: InventionInput) => Promise<void>;
  handleResume: () => Promise<void>;
  handleCancel: () => Promise<void>;
  displayStages: FeasibilityStage[];
  /** Inline validation error for the description word count check. Cleared on next successful run. */
  descriptionError: string | null;
  proceedWithRun: (
    appSettings: AppSettings,
    inv: InventionInput,
    startFromStage?: number,
    previousOutputs?: Record<number, string>,
  ) => Promise<void>;
}

export function useFeasibilityRun(params: UseFeasibilityRunParams): UseFeasibilityRunReturn {
  const {
    projectId,
    project,
    setProject,
    getLatestRun,
    setViewMode,
    setToast,
    setCostModal,
    setError,
    loadProject,
    setPriorArtSearch,
    setSelectedRunVersion,
    setHistoricalReport,
    viewMode,
    latestRun,
  } = params;

  // Streaming state
  const [stages, setStages] = useState<FeasibilityStage[]>(makePlaceholderStages());
  const [activeStageNum, setActiveStageNum] = useState<number | undefined>();
  const [currentStageName, setCurrentStageName] = useState('');
  const [streamText, setStreamText] = useState('');
  const [isStreamComplete, setIsStreamComplete] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [isPipelineStreaming, setIsPipelineStreaming] = useState(false);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const isRunningRef = useRef(false);
  const runIdRef = useRef<string | null>(null);
  const pendingRunRef = useRef<(() => Promise<void>) | null>(null);

  // Compute displayStages — used by sidebar, resume, and re-run.
  // Prefer the `stages` state when it has real (non-placeholder) data, because
  // useViewInit populates it with full outputText for COMPLETE/ERROR runs, making
  // stage cards clickable. Fall back to latestRun.stages (no outputText) or
  // placeholders only while stages haven't been populated yet.
  const stagesAreReal = stages.length > 0 && stages[0].feasibilityRunId !== '';
  const displayStages =
    viewMode === 'running' || viewMode === 'report' || stagesAreReal
      ? stages
      : latestRun?.stages?.length
        ? latestRun.stages
        : makePlaceholderStages();

  // Derived state
  const isRunning =
    stages.some((s) => s.status === 'RUNNING') || (activeStageNum !== undefined && !runError);

  // ----- Run feasibility -----
  async function handleRunFeasibility(invention?: InventionInput) {
    if (!projectId) return;
    const inv = invention || project?.invention;
    if (!inv) {
      setError('Please fill in invention details first.');
      setViewMode('invention-form');
      return;
    }

    // Validate description meets minimum word count
    const descError = validateDescriptionWordCount(inv.description);
    if (descError) {
      setDescriptionError(descError);
      return;
    }
    setDescriptionError(null);

    // Load settings first to show cost modal
    let appSettings: AppSettings;
    try {
      appSettings = await api.settings.get();
    } catch (e: any) {
      setToast({ message: 'Failed to load settings', detail: e.message, type: 'error' });
      return;
    }

    if (!appSettings.anthropicApiKey) {
      setToast({
        message: 'No API key configured',
        detail: 'Add your Anthropic API key in Settings before running.',
        type: 'error',
      });
      return;
    }

    const model = appSettings.defaultModel || 'claude-haiku-4-5-20251001';
    const cap = appSettings.costCapUsd ?? 5.0;
    const { tokenCost, webSearchCost, source, runsUsed } = await estimateRunCosts(projectId, model);

    // Store run closure and show modal
    pendingRunRef.current = async () => {
      setCostModal(null);
      await proceedWithRun(appSettings, inv);
    };
    setCostModal({ tokenCost, webSearchCost, cap, model, source, runsUsed });
  }

  // Resume a failed/interrupted run from the first incomplete stage,
  // reusing saved outputs from already-completed stages.
  async function handleResume() {
    if (!projectId || !project?.invention) return;
    const inv = project.invention;

    // Find first stage that didn't complete
    const completedOutputs: Record<number, string> = {};
    let resumeFrom = 1;
    const sortedStages = [...displayStages].sort((a, b) => a.stageNumber - b.stageNumber);
    for (const s of sortedStages) {
      if (s.status === 'COMPLETE' && s.outputText) {
        completedOutputs[s.stageNumber] = s.outputText;
        resumeFrom = s.stageNumber + 1;
      } else {
        break;
      }
    }
    if (resumeFrom > 6) return; // already all done

    let appSettings: AppSettings;
    try {
      appSettings = await api.settings.get();
    } catch (e: any) {
      setToast({ message: 'Failed to load settings', detail: (e as Error).message, type: 'error' });
      return;
    }
    if (!appSettings.anthropicApiKey) {
      setToast({ message: 'No API key configured', detail: 'Add your Anthropic API key in Settings.', type: 'error' });
      return;
    }

    const model = appSettings.defaultModel || 'claude-haiku-4-5-20251001';
    const cap = appSettings.costCapUsd ?? 5.0;
    const remainingStages = 6 - resumeFrom + 1;
    // Estimate cost only for remaining stages
    const { tokenCost, webSearchCost, source, runsUsed } = await estimateRunCosts(projectId, model);
    const partialTokenCost = parseFloat(((tokenCost * remainingStages) / 6).toFixed(3));
    const partialWebCost = parseFloat(((webSearchCost * remainingStages) / 6).toFixed(2));

    pendingRunRef.current = async () => {
      setCostModal(null);
      await proceedWithRun(appSettings, inv, resumeFrom, completedOutputs);
    };
    setCostModal({
      tokenCost: partialTokenCost,
      webSearchCost: partialWebCost,
      cap,
      model,
      source,
      runsUsed,
      stageCount: remainingStages,
    });
  }

  async function proceedWithRun(
    appSettings: AppSettings,
    inv: InventionInput,
    startFromStage = 1,
    previousOutputs: Record<number, string> = {},
  ) {
    if (!projectId) return;
    // Guard against concurrent pipeline runs (rapid Resume→Cancel→Resume)
    if (isRunningRef.current) return;
    isRunningRef.current = true;

    setIsPipelineStreaming(true);
    setRunError(null);
    setStreamText('');
    setIsStreamComplete(false);
    setActiveStageNum(undefined);
    // When resuming, preserve completed stage display; otherwise reset to placeholders
    if (startFromStage > 1) {
      setStages((prev) =>
        prev.map((s) =>
          s.stageNumber < startFromStage ? s : { ...s, status: 'PENDING' as RunStatus, outputText: undefined },
        ),
      );
    } else {
      setStages(makePlaceholderStages());
    }
    setSelectedRunVersion(null);
    setHistoricalReport(null);
    setViewMode('running');

    try {
      if (!appSettings.defaultModel) {
        throw new Error('No AI model configured. Go to Settings and select a default model before running analysis.');
      }

      // Map AppSettings → AnalysisSettings (feasibility service field names)
      // API key is NOT sent from the frontend — the backend injects it server-side
      const settings = {
        model: appSettings.defaultModel,
        researchModel: appSettings.researchModel || undefined,
        maxTokens: appSettings.maxTokens || 32000,
        interStageDelaySeconds: appSettings.interStageDelaySeconds ?? 5,
      };

      // Build narrative
      const narrative = toNarrative(inv);

      // When resuming, reuse the interrupted run (keeps all stage data intact).
      // When starting fresh, create a new run.
      let runId: string;
      if (startFromStage > 1) {
        const existingRun = getLatestRun(project);
        if (!existingRun) throw new Error('No existing run to resume');
        runId = existingRun.id;
        runIdRef.current = runId;
        try {
          await api.feasibility.patchRun(projectId, { status: 'RUNNING', runId });
        } catch {
          /* non-fatal */
        }
      } else {
        const run = await api.feasibility.start(projectId, { narrative });
        runId = run.id;
        runIdRef.current = runId;
        setProject((prev) => {
          if (!prev) return prev;
          const existing = prev.feasibility || [];
          return { ...prev, feasibility: [...existing, run] };
        });
        try {
          await api.feasibility.patchRun(projectId, { status: 'RUNNING', runId });
        } catch {
          /* non-fatal */
        }
      }

      // Tag all stages with the run ID so displayStages knows they're real
      // (not placeholders) and uses them even after viewMode transitions.
      setStages((prev) => prev.map((s) => ({ ...s, feasibilityRunId: runId })));

      // Wait up to 45s for prior art to complete before starting pipeline
      async function waitForPriorArt(pid: string, maxWaitMs: number): Promise<string | null> {
        const start = Date.now();
        while (Date.now() - start < maxWaitMs) {
          try {
            const status = await api.priorArt.status(pid);
            if (status.status === 'COMPLETE') {
              const search = await api.priorArt.get(pid);
              setPriorArtSearch(search);
              if (search.results.length > 0) {
                const rows = search.results
                  .slice(0, 10)
                  .map(
                    (r) => `| ${r.patentNumber} | ${r.title.slice(0, 60)} | ${Math.round(r.relevanceScore * 100)}% |`,
                  );
                const table = ['| Patent | Title | Relevance |', '|---|---|---|', ...rows].join('\n');
                const abstracts = search.results
                  .slice(0, 5)
                  .map((r) => `**${r.patentNumber}** — ${r.title}\n${r.snippet || r.abstract?.slice(0, 250) || ''}`)
                  .join('\n\n');
                return `${table}\n\n**Key abstracts:**\n\n${abstracts}`;
              }
              return null;
            }
            if (status.status === 'ERROR' || status.status === 'NONE') return null;
          } catch {
            return null;
          }
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
        return null;
      }

      // Skip prior art wait when resuming (Stage 2 already completed with prior art context)
      const priorArtContext = startFromStage <= 2 ? await waitForPriorArt(projectId, 45_000) : null;

      // Connect to feasibility service via SSE
      const abortController = new AbortController();
      abortRef.current = abortController;

      // SSE stream proxied through the backend — feasibility service is internal-only
      const response = await fetch(`/api/projects/${projectId}/feasibility/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventionNarrative: narrative,
          settings,
          priorArtContext: priorArtContext || undefined,
          ...(startFromStage > 1 ? { startFromStage, previousOutputs } : {}),
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Feasibility service error ${response.status}: ${await response.text()}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';
      let stageOutputAccumulator = '';
      let currentStageNum = 0;
      let currentStageNameLocal = '';
      let currentStageStart: string | null = null;
      let pipelineCompleted = false;

      // Throttle stream text updates — render at most every 250ms (~4fps).
      // Even plain-text <pre> re-renders + scrollIntoView crash the browser at 60fps.
      let streamDirty = false;
      let throttleTimer: ReturnType<typeof setTimeout> | null = null;
      function scheduleStreamUpdate() {
        streamDirty = true;
        if (throttleTimer !== null) return; // already scheduled
        throttleTimer = setTimeout(() => {
          throttleTimer = null;
          if (streamDirty) {
            setStreamText(stageOutputAccumulator);
            streamDirty = false;
          }
        }, 250);
      }
      let totalActualCost = 0;

      const updateStageStatus = (stageNum: number, updates: Partial<FeasibilityStage>) => {
        setStages((prev) => prev.map((s) => (s.stageNumber === stageNum ? { ...s, ...updates } : s)));
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!; // keep incomplete last line

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            let data: any;
            try {
              data = JSON.parse(line.slice(6));
            } catch {
              continue;
            }

            const eventType = data.type || currentEvent;

            if (eventType === 'stage_start') {
              currentStageNum = data.stage;
              currentStageNameLocal = data.name || `Stage ${data.stage}`;
              currentStageStart = new Date().toISOString();
              stageOutputAccumulator = '';
              setActiveStageNum(currentStageNum);
              setCurrentStageName(currentStageNameLocal);
              setStreamText('');
              setIsStreamComplete(false);
              updateStageStatus(currentStageNum, {
                stageName: currentStageNameLocal,
                status: 'RUNNING',
                startedAt: currentStageStart,
              });
            } else if (eventType === 'token') {
              stageOutputAccumulator += data.text || '';
              streamDirty = true;
              scheduleStreamUpdate();
            } else if (eventType === 'stage_complete') {
              // Flush any pending stream update
              if (throttleTimer !== null) {
                clearTimeout(throttleTimer);
                throttleTimer = null;
              }
              setStreamText(stageOutputAccumulator);
              streamDirty = false;

              const completedAt = new Date().toISOString();
              const outputText = data.output || stageOutputAccumulator;
              const inputTokens: number = data.inputTokens ?? 0;
              const outputTokens: number = data.outputTokens ?? 0;
              const estimatedCostUsd: number = data.estimatedCostUsd ?? 0;
              totalActualCost += estimatedCostUsd;
              updateStageStatus(currentStageNum, {
                status: 'COMPLETE',
                outputText,
                completedAt,
                webSearchUsed: data.webSearchUsed || false,
                model: data.model,
                inputTokens,
                outputTokens,
                estimatedCostUsd,
              });
              setIsStreamComplete(true);

              // Patch the stage in the backend and check cost cap
              try {
                const patchResult = await api.feasibility.patchStage(projectId, currentStageNum, {
                  status: 'COMPLETE',
                  outputText,
                  ...(currentStageStart ? { startedAt: currentStageStart } : {}),
                  completedAt,
                  webSearchUsed: data.webSearchUsed || false,
                  model: data.model,
                  inputTokens,
                  outputTokens,
                  estimatedCostUsd,
                  runId: runIdRef.current || undefined,
                });

                // If cost cap exceeded, cancel the pipeline
                if (patchResult?.costCapExceeded) {
                  // Cost cap exceeded — cancel pipeline and show UI error (below)
                  try {
                    await api.feasibility.cancel(projectId);
                  } catch {
                    /* best-effort cancel — ignore failure */
                  }
                  setError(
                    `Cost cap reached ($${patchResult.cumulativeCost.toFixed(2)} of $${patchResult.costCapUsd.toFixed(2)}). Pipeline stopped. Increase the cap in Settings to continue.`,
                  );
                  setViewMode('overview');
                }
              } catch {
                // non-fatal
              }
            } else if (eventType === 'stage_error') {
              updateStageStatus(currentStageNum, {
                status: 'ERROR',
                errorMessage: data.error || 'Stage failed',
                completedAt: new Date().toISOString(),
              });
              setRunError(`Stage ${currentStageNum} error: ${data.error || 'Unknown error'}`);
            } else if (eventType === 'pipeline_complete') {
              pipelineCompleted = true;
              // Persist finalReport to backend
              try {
                await api.feasibility.patchRun(projectId, {
                  status: 'COMPLETE',
                  finalReport: data.finalReport || stageOutputAccumulator,
                  runId: runIdRef.current || undefined,
                });
              } catch {
                // non-fatal
              }
              // Auto-export to desktop (opt-in via Settings)
              if (appSettings.autoExport !== false) try {
                const exportResult = await api.feasibility.exportToDisk(projectId);
                setToast({
                  message: `Analysis complete · actual cost: ${formatCost(totalActualCost)}`,
                  detail: exportResult.folderPath,
                  type: 'success',
                });
              } catch {
                setToast({
                  message: `Analysis complete · actual cost: ${formatCost(totalActualCost)}`,
                  type: 'success',
                });
              }
              await loadProject();
              // Explicitly transition to overview — the view init effect
              // won't re-trigger because projectLoadedRef guards against
              // re-initialization for the same project ID.
              setViewMode('overview');
              return;
            } else if (eventType === 'error' || eventType === 'pipeline_error') {
              // The feasibility service sends 'error' events for stage-level Anthropic
              // failures (billing, auth, rate limit). 'pipeline_error' is the legacy name.
              pipelineCompleted = true; // Prevent the generic "connection lost" fallback
              const rawMsg = data.message || data.error || 'Pipeline failed';
              // Parse Anthropic JSON error into human-readable message (P3-2 fix)
              let errorMsg = rawMsg;
              try {
                const parsed = typeof rawMsg === 'string' && rawMsg.includes('"message"')
                  ? JSON.parse(rawMsg.startsWith('{') ? rawMsg : rawMsg.slice(rawMsg.indexOf('{')))
                  : null;
                if (parsed?.error?.message) errorMsg = parsed.error.message;
                else if (parsed?.message) errorMsg = parsed.message;
              } catch { /* use raw message */ }
              setRunError(`Stage ${data.stage || '?'} error: ${errorMsg}`);
              setStages((prev) =>
                prev.map((s) => (s.status === 'RUNNING' ? { ...s, status: 'ERROR' as RunStatus } : s)),
              );
              // Re-fetch project so overview has current status (P3-5 fix)
              loadProject().catch(() => {/* non-fatal */});
            } else if (eventType === 'cancelled') {
              setStages((prev) =>
                prev.map((s) =>
                  s.status === 'RUNNING' || s.status === 'PENDING' ? { ...s, status: 'CANCELLED' as RunStatus } : s,
                ),
              );
              setRunError('Analysis was cancelled.');
            }

            currentEvent = '';
          }
        }
      }

      // Stream ended without pipeline_complete — connection dropped or service crashed
      if (!pipelineCompleted) {
        setRunError(
          `Connection to analysis service lost after Stage ${currentStageNum || '?'}. ` +
            `Check the feasibility service logs and re-run.`,
        );
        setStages((prev) =>
          prev.map((s) =>
            s.status === 'RUNNING' || s.status === 'PENDING' ? { ...s, status: 'ERROR' as RunStatus } : s,
          ),
        );
        loadProject().catch(() => {/* non-fatal */});
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setRunError('Analysis cancelled.');
        return;
      }
      setRunError(e.message || 'Failed to run feasibility analysis');
      setStages((prev) =>
        prev.map((s) =>
          s.status === 'RUNNING' || s.status === 'PENDING' ? { ...s, status: 'ERROR' as RunStatus } : s,
        ),
      );
      loadProject().catch(() => {/* non-fatal */});
    } finally {
      isRunningRef.current = false;
      setIsPipelineStreaming(false);
    }
  }

  async function handleCancel() {
    if (!projectId) return;
    try {
      setCancelling(true);
      isRunningRef.current = false;
      abortRef.current?.abort();
      await api.feasibility.cancel(projectId);
      setStages((prev) =>
        prev.map((s) =>
          s.status === 'RUNNING' || s.status === 'PENDING' ? { ...s, status: 'CANCELLED' as RunStatus } : s,
        ),
      );
      setRunError('Analysis cancelled.');
    } catch {
      // ignore
    } finally {
      setCancelling(false);
    }
  }

  return {
    stages,
    setStages,
    activeStageNum,
    currentStageName,
    streamText,
    isStreamComplete,
    runError,
    setRunError,
    cancelling,
    isRunning,
    isPipelineStreaming,
    pendingRunRef,
    runIdRef,
    abortRef,
    handleRunFeasibility,
    handleResume,
    handleCancel,
    displayStages,
    descriptionError,
    proceedWithRun,
  };
}
