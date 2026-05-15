import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import type { FeasibilityStage, InventionInput, Provider } from '../types';
import { isProvider } from '../types';
import CostConfirmModal from '../components/CostConfirmModal';
import { useProjectDetail, ViewMode } from '../hooks/useProjectDetail';
import { useRunHistory } from '../hooks/useRunHistory';
import { useFeasibilityRun } from '../hooks/useFeasibilityRun';
import { useViewInit } from '../hooks/useViewInit';
import { useReportContent } from '../hooks/useReportContent';
import InventionForm from './InventionForm';
import ProjectSidebar from '../components/ProjectSidebar';
import ContentPanel from '../components/ContentPanel';
import RunningView from '../components/RunningView';
import ReportView from '../components/ReportView';
import StageOutputViewer from '../components/StageOutputViewer';
import RunHistoryView from '../components/RunHistoryView';
import ProjectOverview from '../components/ProjectOverview';
import ClaimsTab from '../components/ClaimsTab';
import ComplianceTab from '../components/ComplianceTab';
import ApplicationTab from '../components/ApplicationTab';
import PriorArtPanel from '../components/PriorArtPanel';
import PatentDetailDrawer from '../components/PatentDetailDrawer';
import Toast from '../components/Toast';
import { statusColors } from '../utils/statusColors';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // UI mode
  const [viewMode, setViewMode] = useState<ViewMode>('overview');

  // Project data
  const {
    project,
    setProject,
    loading,
    error,
    setError,
    loadProject,
    getLatestRun,
    priorArtSearch,
    setPriorArtSearch,
    claimDraftStatus,
    complianceStatus,
    applicationStatus,
  } = useProjectDetail(id, viewMode);

  // Selected stage for detail viewer
  const [selectedStage, setSelectedStage] = useState<FeasibilityStage | null>(null);

  // Toast notification
  const [toast, setToast] = useState<{ message: string; detail?: string; type?: 'success' | 'error' | 'info' } | null>(
    null,
  );

  // Patent detail drawer
  const [drawerPatent, setDrawerPatent] = useState<string | null>(null);

  // Run history
  const {
    runHistory,
    selectedRunVersion,
    historicalReport,
    setSelectedRunVersion,
    setHistoricalReport,
    handleShowHistory,
    handleLoadHistoricalRun,
  } = useRunHistory(id, setViewMode, setToast);

  // Derived state
  const latestRun = getLatestRun(project);

  // Feasibility run orchestration
  const {
    stages,
    setStages,
    activeStageNum,
    currentStageName,
    streamText,
    isStreamComplete,
    runError,
    setRunError,
    cancelling,
    isPipelineStreaming,
    runIdRef,
    abortRef,
    handleRunFeasibility,
    handleResume,
    handleCancel,
    displayStages,
    descriptionError,
    proceedWithRun,
  } = useFeasibilityRun({
    projectId: id,
    project,
    setProject,
    getLatestRun,
    setViewMode,
    setToast,
    setError,
    loadProject,
    setPriorArtSearch,
    setSelectedRunVersion,
    setHistoricalReport,
    viewMode,
    latestRun,
  });

  // Abort SSE stream on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, [abortRef]);

  // Active provider — read once when this page mounts so child components can
  // render LOCAL ("Free") vs CLOUD ($N.NN) cost displays per decision #12.
  // null until settings load; child components default to CLOUD-like formatting
  // when no provider is passed.
  const [currentProvider, setCurrentProvider] = useState<Provider | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.settings
      .get()
      .then((s: any) => {
        if (!cancelled && isProvider(s.provider)) setCurrentProvider(s.provider);
      })
      .catch(() => {
        /* non-fatal — components fall back to default dollar formatting */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Cost confirm modal — gates CLOUD-mode feasibility runs ──
  // LOCAL mode bypasses the modal (no per-token cost). CLOUD mode shows the
  // estimated USD cost before kicking off the run. Wraps both fresh-run
  // (handleRunFeasibility) and resume (handleResume) actions; both incur cost.
  const [costModal, setCostModal] = useState<{
    open: boolean;
    estimatedCostUsd: number;
    action: (() => Promise<void>) | null;
  }>({ open: false, estimatedCostUsd: 0, action: null });

  const runWithCostCheck = useCallback(
    async (action: () => Promise<void>) => {
      try {
        const appSettings = await api.settings.get();
        if (appSettings.provider !== 'CLOUD') {
          // LOCAL mode — free, no confirmation needed.
          await action();
          return;
        }
        // CLOUD mode — fetch a per-stage cost estimate (if history exists)
        // and open the modal. Without history, fall back to a typical 6-stage
        // Haiku run estimate (~$0.50) — the modal text already calls out that
        // the figure is approximate.
        let estimatedCostUsd = 0.5;
        if (id) {
          try {
            const est = await api.feasibility.costEstimate(id);
            if (est.hasHistory && est.avgCostPerStage > 0) {
              estimatedCostUsd = est.avgCostPerStage * 6;
            }
          } catch {
            /* non-fatal — fall through with the default estimate */
          }
        }
        setCostModal({ open: true, estimatedCostUsd, action });
      } catch (e: any) {
        setToast({
          message: 'Could not load settings',
          detail: e?.message ?? String(e),
          type: 'error',
        });
      }
    },
    [id],
  );

  const handleCostApprove = useCallback(async () => {
    const action = costModal.action;
    setCostModal({ open: false, estimatedCostUsd: 0, action: null });
    if (action) await action();
  }, [costModal.action]);

  const handleCostCancel = useCallback(() => {
    setCostModal({ open: false, estimatedCostUsd: 0, action: null });
  }, []);

  const runFeasibilityWithCheck = useCallback(
    (invention?: InventionInput) => runWithCostCheck(() => handleRunFeasibility(invention)),
    [runWithCostCheck, handleRunFeasibility],
  );
  const resumeWithCheck = useCallback(
    () => runWithCostCheck(() => handleResume()),
    [runWithCostCheck, handleResume],
  );

  // View mode initialization (runs once per project load)
  useViewInit({ project, loading, getLatestRun, setStages, setRunError, setViewMode, runIdRef });

  // Lazy report content loading
  const { reportContent, reportHtml } = useReportContent(viewMode, id, historicalReport);

  // ── Loading and error states ──

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <span
          className="w-6 h-6 rounded-full border-2 border-gray-600 border-t-blue-500 animate-spin mr-3"
          aria-label="Loading"
        />
        Loading project...
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <div className="p-4 bg-red-900/40 border border-red-800 rounded-lg text-red-300">{error}</div>
        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={() => loadProject()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
          >
            Retry
          </button>
          <button onClick={() => navigate('/')} className="text-sm text-blue-400 hover:text-blue-300">
            &larr; Back to Projects
          </button>
        </div>
      </div>
    );
  }

  if (!project) return null;

  const feasibilityCost = displayStages.reduce((sum, s) => sum + (s.estimatedCostUsd ?? 0), 0);
  const totalRunCost = feasibilityCost
    + ((claimDraftStatus as any)?.estimatedCostUsd ?? 0)
    + ((complianceStatus as any)?.estimatedCostUsd ?? 0)
    + ((applicationStatus as any)?.estimatedCostUsd ?? 0);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link to="/" className="hover:text-gray-300 transition-colors">
          Projects
        </Link>
        <span>/</span>
        <span className="text-gray-300 truncate max-w-xs">{project.title}</span>
        <span
          className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[project.status] || 'bg-gray-700 text-gray-300'}`}
        >
          {project.status}
        </span>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* ── Sidebar ── */}
        <ProjectSidebar
          project={project}
          viewMode={viewMode}
          displayStages={displayStages}
          activeStageNum={activeStageNum}
          latestRun={latestRun}
          totalRunCost={totalRunCost}
          cancelling={cancelling}
          isRunning={viewMode === 'running'}
          priorArtSearch={priorArtSearch}
          claimDraftStatus={claimDraftStatus}
          complianceStatus={complianceStatus}
          applicationStatus={applicationStatus}
          descriptionError={descriptionError}
          provider={currentProvider ?? undefined}
          onViewModeChange={setViewMode}
          onRunFeasibility={() => runFeasibilityWithCheck()}
          onResume={() => resumeWithCheck()}
          onCancel={handleCancel}
          onShowHistory={handleShowHistory}
          onStageClick={(stage) => {
            setSelectedStage(stage);
            setViewMode('stage-output');
          }}
          onRerunFromStage={async (fromStage) => {
            if (!id || !project?.invention) return;
            try {
              const newRun = await api.feasibility.rerunFromStage(id, fromStage);
              runIdRef.current = newRun.id;
              const copiedOutputs: Record<number, string> = {};
              for (const s of newRun.stages) {
                if (s.status === 'COMPLETE' && s.outputText) {
                  copiedOutputs[s.stageNumber] = s.outputText;
                }
              }
              setStages(newRun.stages);
              const appSettings = await api.settings.get();
              await proceedWithRun(appSettings, project.invention!, fromStage, copiedOutputs);
            } catch (err: any) {
              setToast({ message: 'Re-run failed', detail: err.message, type: 'error' });
            }
          }}
        />

        {/* ── Main content ── */}
        <main className="flex-1 min-w-0">
          {viewMode === 'invention-form' && (
            <ContentPanel title="Invention Disclosure" isPipelineStreaming={isPipelineStreaming} onBack={setViewMode}>
              <InventionForm
                projectId={project.id}
                initialData={project.invention}
                onSaved={(inv) => {
                  setProject((prev) => (prev ? { ...prev, invention: inv } : prev));
                  setViewMode('overview');
                }}
                onRunFeasibility={(inv) => {
                  setProject((prev) => (prev ? { ...prev, invention: inv } : prev));
                  void runFeasibilityWithCheck(inv);
                }}
              />
            </ContentPanel>
          )}

          {viewMode === 'overview' && (
            <ProjectOverview
              project={project}
              latestRun={latestRun}
              descriptionError={descriptionError}
              onEditInvention={() => setViewMode('invention-form')}
              onRunFeasibility={() => runFeasibilityWithCheck()}
              onViewReport={() => setViewMode('report')}
            />
          )}

          {viewMode === 'running' && (
            <RunningView
              runError={runError}
              streamText={streamText}
              currentStageName={currentStageName}
              isStreamComplete={isStreamComplete}
              activeStageNum={activeStageNum}
              cancelling={cancelling}
              onCancel={handleCancel}
              onBack={() => setViewMode('overview')}
            />
          )}

          {viewMode === 'report' && (
            <ReportView
              reportContent={reportContent}
              reportHtml={reportHtml}
              projectTitle={project.title}
              projectId={project.id}
              runError={runError}
              selectedRunVersion={selectedRunVersion}
              onClearVersion={() => {
                setSelectedRunVersion(null);
                setHistoricalReport(null);
              }}
              onBack={() => setViewMode('overview')}
            />
          )}

          {viewMode === 'history' && (
            <RunHistoryView
              runHistory={runHistory}
              onLoadHistoricalRun={handleLoadHistoricalRun}
              onRunFeasibility={() => runFeasibilityWithCheck()}
              onBack={() => setViewMode('overview')}
              provider={currentProvider ?? undefined}
            />
          )}

          {viewMode === 'prior-art' && (
            <ContentPanel title="Prior Art Search" isPipelineStreaming={isPipelineStreaming} onBack={setViewMode}>
              <PriorArtPanel
                projectId={id!}
                search={priorArtSearch}
                onUpdate={setPriorArtSearch}
                onPatentClick={(pn) => setDrawerPatent(pn)}
              />
            </ContentPanel>
          )}

          {viewMode === 'claims' && (
            <ContentPanel title="Claim Drafts" isPipelineStreaming={isPipelineStreaming} onBack={setViewMode}>
              <ClaimsTab
                projectId={id!}
                hasFeasibility={!!latestRun && latestRun.status === 'COMPLETE'}
                priorArtTitles={priorArtSearch?.results?.map((r) => ({ patentNumber: r.patentNumber, title: r.title }))}
              />
            </ContentPanel>
          )}

          {viewMode === 'compliance' && (
            <ContentPanel title="Compliance Check" isPipelineStreaming={isPipelineStreaming} onBack={setViewMode}>
              <ComplianceTab
                projectId={id!}
                hasClaims={
                  !!claimDraftStatus &&
                  claimDraftStatus.status === 'COMPLETE' &&
                  Array.isArray(claimDraftStatus.claims) &&
                  claimDraftStatus.claims.length > 0
                }
                provider={currentProvider ?? undefined}
              />
            </ContentPanel>
          )}

          {viewMode === 'application' && (
            <ContentPanel title="Patent Application" isPipelineStreaming={isPipelineStreaming} onBack={setViewMode}>
              <ApplicationTab
                projectId={id!}
                hasClaims={
                  !!claimDraftStatus &&
                  claimDraftStatus.status === 'COMPLETE' &&
                  Array.isArray(claimDraftStatus.claims) &&
                  claimDraftStatus.claims.length > 0
                }
                provider={currentProvider ?? undefined}
              />
            </ContentPanel>
          )}

          {viewMode === 'stage-output' && selectedStage && (
            <StageOutputViewer
              stage={selectedStage}
              projectTitle={project.title}
              onBack={() => setViewMode('report')}
              provider={currentProvider ?? undefined}
            />
          )}
        </main>
      </div>

      {/* Toast */}
      {toast && (
        <Toast message={toast.message} detail={toast.detail} type={toast.type} onClose={() => setToast(null)} />
      )}

      {/* Patent Detail Drawer */}
      <PatentDetailDrawer patentNumber={drawerPatent} onClose={() => setDrawerPatent(null)} />

      {/* CLOUD-mode cost confirmation — LOCAL runs bypass this modal entirely */}
      <CostConfirmModal
        open={costModal.open}
        estimatedCostUsd={costModal.estimatedCostUsd}
        provider="CLOUD"
        onApprove={handleCostApprove}
        onCancel={handleCostCancel}
      />
    </div>
  );
}
