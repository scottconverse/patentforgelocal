import { FeasibilityRunSummary } from '../types';
import { formatCost } from '../utils/format';

interface RunHistoryViewProps {
  runHistory: FeasibilityRunSummary[];
  onLoadHistoricalRun: (version: number) => void;
  onRunFeasibility: () => void;
  onBack: () => void;
}

export default function RunHistoryView({
  runHistory,
  onLoadHistoricalRun,
  onRunFeasibility,
  onBack,
}: RunHistoryViewProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-100">Run History</h2>
        <button
          onClick={onBack}
          className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          ← Back
        </button>
      </div>
      {runHistory.length === 0 && <p className="text-gray-500 text-sm">No runs found.</p>}
      {runHistory.map((run) => (
        <div
          key={run.id}
          className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center justify-between"
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-100">Version {run.version}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  run.status === 'COMPLETE'
                    ? 'bg-green-900 text-green-300'
                    : run.status === 'ERROR'
                      ? 'bg-red-900 text-red-300'
                      : 'bg-gray-700 text-gray-400'
                }`}
              >
                {run.status}
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-1 space-x-3">
              {run.completedAt && <span>{new Date(run.completedAt).toLocaleString()}</span>}
              {run.totalCostUsd > 0 && <span className="text-amber-500">{formatCost(run.totalCostUsd)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {run.status === 'COMPLETE' && (
              <button
                onClick={() => onLoadHistoricalRun(run.version)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
              >
                View Report
              </button>
            )}
            {(run.status === 'ERROR' || run.status === 'CANCELLED') && (
              <>
                <span className="text-xs text-gray-500">No report available</span>
                <button
                  onClick={onRunFeasibility}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
                >
                  Re-run
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
