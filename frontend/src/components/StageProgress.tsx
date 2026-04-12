import { FeasibilityStage, RunStatus } from '../types';
import { formatCost, formatDuration } from '../utils/format';

interface StageProgressProps {
  stages: FeasibilityStage[];
  activeStage?: number;
  onStageClick?: (stage: FeasibilityStage) => void;
  onRerunFromStage?: (stageNumber: number) => void;
  pipelineIdle?: boolean; // true when no pipeline is currently running
}

function StatusIcon({ status }: { status: RunStatus }) {
  if (status === 'COMPLETE') {
    return (
      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-green-900 text-green-400 text-xs font-bold">
        ✓
      </span>
    );
  }
  if (status === 'RUNNING') {
    return (
      <span className="flex items-center justify-center w-6 h-6">
        <span
          className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"
          aria-label="Loading"
        />
      </span>
    );
  }
  if (status === 'ERROR') {
    return (
      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-red-900 text-red-400 text-xs font-bold">
        ✗
      </span>
    );
  }
  if (status === 'CANCELLED') {
    return (
      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-700 text-gray-400 text-xs font-bold">
        ✗
      </span>
    );
  }
  // PENDING / STALE
  return (
    <span className="flex items-center justify-center w-6 h-6 rounded-full border-2 border-gray-700 bg-gray-900" />
  );
}

export default function StageProgress({
  stages,
  activeStage,
  onStageClick,
  onRerunFromStage,
  pipelineIdle,
}: StageProgressProps) {
  if (!stages || stages.length === 0) {
    return <div className="text-gray-500 text-sm italic">No stages yet.</div>;
  }

  return (
    <div className="space-y-2">
      {stages.map((stage) => {
        const isActive = activeStage === stage.stageNumber;
        const isClickable = stage.status === 'COMPLETE' && !!stage.outputText && !!onStageClick;
        const duration = formatDuration(stage.startedAt, stage.completedAt);
        const cost = formatCost(stage.estimatedCostUsd);

        return (
          <div
            key={stage.stageNumber}
            onClick={() => isClickable && onStageClick?.(stage)}
            className={`flex items-start gap-3 px-3 py-2 rounded-lg transition-colors ${
              isActive ? 'bg-blue-950 border border-blue-800' : 'bg-gray-900 border border-gray-800'
            } ${isClickable ? 'cursor-pointer hover:border-blue-700 hover:bg-blue-950/40' : ''}`}
          >
            <StatusIcon status={stage.status} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-mono">#{stage.stageNumber}</span>
                <span className={`text-sm ${isActive ? 'text-blue-300' : 'text-gray-300'}`}>
                  {stage.stageName}
                </span>
              </div>
              {stage.errorMessage && <div className="text-xs text-red-400 mt-0.5 truncate">{stage.errorMessage}</div>}
              {cost && <div className="text-xs text-amber-600 mt-0.5">{cost}</div>}
            </div>
            <div className="flex flex-col items-end gap-0.5 shrink-0">
              {duration && <span className="text-xs text-gray-500 font-mono">{duration}</span>}
              <div className="flex items-center gap-1.5">
                {isClickable && <span className="text-xs text-blue-600">view</span>}
                {stage.status === 'COMPLETE' && pipelineIdle && onRerunFromStage && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRerunFromStage(stage.stageNumber);
                    }}
                    className="text-xs text-amber-600 hover:text-amber-400 transition-colors"
                    title={`Re-run from Stage ${stage.stageNumber}`}
                  >
                    Re-run
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
