import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import { FeasibilityStage } from '../types';
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
import CostConfirmModal from '../components/CostConfirmModal';
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

  // Cost confirmation modal
  const [costModal, setCostModal] = useState<{
    tokenCost: number;
    webSearchCost: number;
    cap: number;
    model: string;
    source: 'history' | 'static';
    runsUsed: number;
    stageCount?: number;
  } | null>(null);

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
    pendingRunRef,
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
    setCostModal,
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
          onViewModeChange={setViewMode}
          onRunFeasibility={() => handleRunFeasibility()}
          onResume={() => handleResume()}
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
                  handleRunFeasibility(inv);
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
              onRunFeasibility={() => handleRunFeasibility()}
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
              onRunFeasibility={() => handleRunFeasibility()}
              onBack={() => setViewMode('overview')}
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
              />
            </ContentPanel>
          )}

          {viewMode === 'stage-output' && selectedStage && (
            <StageOutputViewer
              stage={selectedStage}
              projectTitle={project.title}
              onBack={() => setViewMode('report')}
            />
          )}
        </main>
      </div>

      {/* Toast */}
      {toast && (
        <Toast message={toast.message} detail={toast.detail} type={toast.type} onClose={() => setToast(null)} />
      )}

      {/* Cost Confirmation Modal */}
      {costModal && (
        <CostConfirmModal
          tokenCost={costModal.tokenCost}
          webSearchCost={costModal.webSearchCost}
          cap={costModal.cap}
          model={costModal.model}
          source={costModal.source}
          runsUsed={costModal.runsUsed}
          stageCount={costModal.stageCount}
          onConfirm={() => {
            pendingRunRef.current?.();
          }}
          onCancel={() => setCostModal(null)}
        />
      )}

      {/* Patent Detail Drawer */}
      <PatentDetailDrawer patentNumber={drawerPatent} onClose={() => setDrawerPatent(null)} />
    </div>
  );
}
