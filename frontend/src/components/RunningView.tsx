import StreamingOutput from './StreamingOutput';
import { ViewMode } from '../hooks/useProjectDetail';

/**
 * The feasibility pipeline streaming view — shown while analysis is running.
 * Displays the active stage's streaming output with a cancel button.
 */
export default function RunningView({
  runError,
  streamText,
  currentStageName,
  isStreamComplete,
  activeStageNum,
  cancelling,
  onCancel,
  onBack,
}: {
  runError: string | null;
  streamText: string;
  currentStageName: string;
  isStreamComplete: boolean;
  activeStageNum: number | undefined;
  cancelling: boolean;
  onCancel: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin"
            aria-label="Loading"
          />
          <h2 className="text-lg font-semibold text-gray-100">Running Feasibility Analysis</h2>
        </div>
        <button
          onClick={onCancel}
          disabled={cancelling}
          className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded text-sm font-medium transition-colors"
        >
          {cancelling ? 'Cancelling...' : 'Cancel'}
        </button>
      </div>

      {runError && (
        <div className="p-3 bg-red-900/40 border border-red-800 rounded text-red-300 text-sm">
          {runError}
          <button onClick={onBack} className="ml-3 text-red-400 underline hover:text-red-300">
            Go back
          </button>
        </div>
      )}

      {!runError && streamText && (
        <StreamingOutput text={streamText} stageName={currentStageName} isComplete={isStreamComplete} />
      )}

      {!runError && !streamText && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center text-gray-500 text-sm">
          {activeStageNum
            ? `Stage ${activeStageNum} — waiting for first token\u2026 (large inputs may take 30\u201360s)`
            : 'Starting analysis\u2026'}
        </div>
      )}
    </div>
  );
}
