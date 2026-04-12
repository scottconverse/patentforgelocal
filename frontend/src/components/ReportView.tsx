import ReportViewer from './ReportViewer';
import { ViewMode } from '../hooks/useProjectDetail';

/**
 * Report display view — shows the final feasibility report with optional
 * version selector for historical runs.
 */
export default function ReportView({
  reportContent,
  reportHtml,
  projectTitle,
  projectId,
  runError,
  selectedRunVersion,
  onClearVersion,
  onBack,
}: {
  reportContent: string | null;
  reportHtml: string | null;
  projectTitle: string;
  projectId: string;
  runError: string | null;
  selectedRunVersion: number | null;
  onClearVersion: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      {runError && (
        <div className="p-3 bg-red-900/40 border border-red-800 rounded text-red-300 text-sm">{runError}</div>
      )}
      {selectedRunVersion && (
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
          <span>Viewing</span>
          <span className="px-2 py-0.5 bg-gray-800 rounded font-mono text-gray-300">v{selectedRunVersion}</span>
          <button onClick={onClearVersion} className="text-blue-400 hover:text-blue-300 ml-2 transition-colors">
            View latest &rarr;
          </button>
        </div>
      )}
      {reportContent ? (
        <ReportViewer
          report={reportContent}
          preRenderedHtml={reportHtml ?? undefined}
          projectTitle={projectTitle}
          projectId={projectId}
        />
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center">
          <div className="inline-flex items-center gap-3 text-gray-400">
            <div
              className="w-5 h-5 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin"
              aria-label="Loading"
            />
            Loading report...
          </div>
          <button onClick={onBack} className="mt-3 block mx-auto text-sm text-blue-400 hover:text-blue-300">
            Back to overview
          </button>
        </div>
      )}
    </div>
  );
}
