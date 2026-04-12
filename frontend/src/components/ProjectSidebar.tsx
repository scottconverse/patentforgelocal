import { useState } from 'react';
import { Project, FeasibilityStage, FeasibilityRun, PriorArtSearch } from '../types';
import { ViewMode } from '../hooks/useProjectDetail';
import StageProgress from './StageProgress';
import { formatCost } from '../utils/format';

// --- Inline StatusBadge ---
function StatusBadge({ status, count, active }: { status?: string; count?: number; active?: boolean }) {
  if (!status || status === 'NONE') return null;
  if (status === 'RUNNING') {
    return (
      <span
        className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin inline-block"
        role="status"
        aria-label="Running"
      />
    );
  }
  if (status === 'COMPLETE') {
    return (
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 bg-green-500 rounded-full" data-testid="badge-complete" />
        {count != null && count > 0 && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded-full ${
              active ? 'bg-white/25 text-white' : 'bg-green-900 text-green-300'
            }`}
          >
            {count}
          </span>
        )}
      </span>
    );
  }
  if (status === 'ERROR') {
    return <span className="w-2 h-2 bg-red-500 rounded-full inline-block" data-testid="badge-error" />;
  }
  return null;
}

// --- Props ---
interface ProjectSidebarProps {
  project: Project;
  viewMode: ViewMode;
  displayStages: FeasibilityStage[];
  activeStageNum: number | undefined;
  latestRun: FeasibilityRun | null;
  totalRunCost: number;
  cancelling: boolean;
  isRunning: boolean;
  // Status data for badges
  priorArtSearch: PriorArtSearch | null;
  claimDraftStatus: { status: string; claims?: any[] } | null;
  complianceStatus: { status: string } | null;
  applicationStatus: { status: string } | null;
  /** Inline validation error shown near the Run Feasibility button */
  descriptionError?: string | null;
  // Handlers
  onViewModeChange: (vm: ViewMode) => void;
  onRunFeasibility: () => void;
  onResume: () => void;
  onCancel: () => void;
  onShowHistory: () => void;
  onStageClick: (stage: FeasibilityStage) => void;
  onRerunFromStage: (fromStage: number) => void;
}

export default function ProjectSidebar({
  project,
  viewMode,
  displayStages,
  activeStageNum,
  latestRun,
  totalRunCost,
  cancelling,
  isRunning,
  priorArtSearch,
  claimDraftStatus,
  complianceStatus,
  applicationStatus,
  descriptionError,
  onViewModeChange,
  onRunFeasibility,
  onResume,
  onCancel,
  onShowHistory,
  onStageClick,
  onRerunFromStage,
}: ProjectSidebarProps) {
  // Mobile accordion state
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  return (
    <aside className="w-full md:w-64 md:min-w-[240px] shrink-0 space-y-4">
      {/* Pipeline nav */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        {/* Mobile toggle */}
        <button
          className="md:hidden w-full flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider"
          onClick={() => setPipelineOpen(!pipelineOpen)}
        >
          Pipeline
          <span className={`transition-transform ${pipelineOpen ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {/* Desktop always-visible heading */}
        <h3 className="hidden md:block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Pipeline</h3>
        {/* Content: visible on desktop always, toggled on mobile */}
        <div className={`md:block ${pipelineOpen ? 'block' : 'hidden'} mt-3 md:mt-0`}>
          {/* Intake */}
          <button
            onClick={() => onViewModeChange(viewMode === 'invention-form' ? 'overview' : 'invention-form')}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors mb-2 ${
              viewMode === 'invention-form'
                ? 'bg-blue-900 text-blue-300 border border-blue-700'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs font-bold ${project.invention ? 'border-green-500 bg-green-900 text-green-400' : 'border-gray-600 text-gray-500'}`}
            >
              {project.invention ? '✓' : '1'}
            </span>
            <span>Invention Intake</span>
          </button>

          {/* Feasibility */}
          <div
            className={`px-3 py-2 rounded text-sm mb-2 ${
              viewMode === 'running' || viewMode === 'report' ? 'bg-blue-950 border border-blue-800' : 'text-gray-400'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                  latestRun?.status === 'COMPLETE'
                    ? 'border-green-500 bg-green-900 text-green-400'
                    : latestRun?.status === 'RUNNING'
                      ? 'border-blue-500'
                      : 'border-gray-600 text-gray-500'
                }`}
              >
                {latestRun?.status === 'COMPLETE' ? (
                  '✓'
                ) : latestRun?.status === 'RUNNING' ? (
                  <span
                    className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin"
                    aria-label="Loading"
                  />
                ) : (
                  '2'
                )}
              </span>
              <span
                className={
                  latestRun?.status === 'COMPLETE'
                    ? 'text-green-400'
                    : latestRun?.status === 'RUNNING'
                      ? 'text-blue-300'
                      : 'text-gray-400'
                }
              >
                Feasibility
              </span>
            </div>
            <StageProgress
              stages={displayStages}
              activeStage={activeStageNum}
              pipelineIdle={viewMode !== 'running'}
              onStageClick={onStageClick}
              onRerunFromStage={onRerunFromStage}
            />
            {totalRunCost > 0 && (
              <div className="flex justify-between text-xs text-gray-500 pt-2 px-1 border-t border-gray-800 mt-1">
                <span>Total API cost</span>
                <span className="text-amber-400 font-mono">{formatCost(totalRunCost)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
        {/* Mobile toggle */}
        <button
          className="md:hidden w-full flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider"
          onClick={() => setActionsOpen(!actionsOpen)}
        >
          Actions
          <span className={`transition-transform ${actionsOpen ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {/* Desktop always-visible heading */}
        <h3 className="hidden md:block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Actions</h3>
        {/* Content: visible on desktop always, toggled on mobile */}
        <div className={`md:block ${actionsOpen ? 'block' : 'hidden'} mt-3 md:mt-0 space-y-2`}>
          {project.invention &&
            !isRunning &&
            (() => {
              const hasPartial =
                displayStages.some((s) => s.status === 'COMPLETE' && s.outputText) &&
                displayStages.some((s) => s.status === 'ERROR' || s.status === 'PENDING');
              return hasPartial ? (
                <div className="space-y-2">
                  <button
                    onClick={() => onResume()}
                    className="w-full px-3 py-2 bg-green-700 hover:bg-green-600 text-white rounded text-sm font-medium transition-colors"
                  >
                    ▶ Resume (from Stage{' '}
                    {displayStages.find((s) => s.status === 'ERROR' || s.status === 'PENDING')?.stageNumber ?? '?'})
                  </button>
                  <button
                    onClick={() => onRunFeasibility()}
                    className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-sm transition-colors"
                  >
                    Run from Start
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onRunFeasibility()}
                  className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
                >
                  Run Feasibility
                </button>
              );
            })()}
          {descriptionError && !isRunning && (
            <p className="text-xs text-red-400 leading-snug" role="alert">
              {descriptionError}
            </p>
          )}
          {isRunning && (
            <button
              onClick={onCancel}
              disabled={cancelling}
              className="w-full px-3 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded text-sm font-medium transition-colors"
            >
              {cancelling ? 'Cancelling...' : 'Cancel Analysis'}
            </button>
          )}
          {latestRun?.status === 'COMPLETE' && !isRunning && (
            <button
              onClick={() => onViewModeChange('report')}
              className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-sm transition-colors"
            >
              View Report
            </button>
          )}
          {latestRun && !isRunning && (
            <button
              onClick={onShowHistory}
              className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm transition-colors"
            >
              History
            </button>
          )}
          <button
            onClick={() => onViewModeChange('prior-art')}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center justify-between ${
              viewMode === 'prior-art' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
            }`}
          >
            <span>Prior Art</span>
            <StatusBadge
              status={priorArtSearch?.status}
              count={priorArtSearch?.results?.length}
              active={viewMode === 'prior-art'}
            />
          </button>
          <button
            onClick={() => onViewModeChange('claims')}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center justify-between ${
              viewMode === 'claims' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
            }`}
          >
            <span>Claims</span>
            <StatusBadge
              status={claimDraftStatus?.status}
              count={claimDraftStatus?.claims?.length}
              active={viewMode === 'claims'}
            />
          </button>
          <button
            onClick={() => onViewModeChange('compliance')}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center justify-between ${
              viewMode === 'compliance' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
            }`}
          >
            <span>Compliance</span>
            <StatusBadge status={complianceStatus?.status} active={viewMode === 'compliance'} />
          </button>
          <button
            onClick={() => onViewModeChange('application')}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center justify-between ${
              viewMode === 'application' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
            }`}
          >
            <span>Application</span>
            <StatusBadge status={applicationStatus?.status} active={viewMode === 'application'} />
          </button>
        </div>
      </div>
    </aside>
  );
}

// Export StatusBadge for testing
export { StatusBadge };
