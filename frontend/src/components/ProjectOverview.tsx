import { Project, FeasibilityRun } from '../types';

interface ProjectOverviewProps {
  project: Project;
  latestRun: FeasibilityRun | null;
  /** Inline validation error shown near the Run Feasibility button */
  descriptionError?: string | null;
  onEditInvention: () => void;
  onRunFeasibility: () => void;
  onViewReport: () => void;
}

export default function ProjectOverview({
  project,
  latestRun,
  descriptionError,
  onEditInvention,
  onRunFeasibility,
  onViewReport,
}: ProjectOverviewProps) {
  if (!project.invention) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center">
        <div className="text-4xl mb-4">📄</div>
        <h2 className="text-xl font-semibold text-gray-200 mb-2">No Invention Details Yet</h2>
        <p className="text-gray-400 text-sm mb-6">
          Fill in your invention disclosure to begin the feasibility analysis.
        </p>
        <button
          onClick={onEditInvention}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors"
        >
          Fill in Invention Details
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-100">Invention Summary</h2>
          <button
            onClick={onEditInvention}
            className="text-sm px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
          >
            Edit
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Title</p>
            <p className="text-gray-100 font-medium mt-0.5">{project.invention.title}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Description</p>
            <p className="text-gray-300 text-sm mt-0.5 whitespace-pre-wrap">{project.invention.description}</p>
          </div>
          {project.invention.whatIsNovel && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">What Is Novel</p>
              <p className="text-gray-300 text-sm mt-0.5">{project.invention.whatIsNovel}</p>
            </div>
          )}
        </div>
      </div>

      {!latestRun && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center">
          <p className="text-gray-400 text-sm mb-4">Ready to analyze patent feasibility for this invention.</p>
          <button
            onClick={onRunFeasibility}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors"
          >
            Run Feasibility Analysis
          </button>
          {descriptionError && (
            <p className="text-xs text-red-400 mt-3 leading-snug max-w-md mx-auto" role="alert">
              {descriptionError}
            </p>
          )}
        </div>
      )}

      {latestRun && latestRun.status === 'COMPLETE' && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-400">Feasibility analysis complete</p>
              <p className="text-xs text-gray-500 mt-0.5">Version {latestRun.version}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onViewReport}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
              >
                View Report
              </button>
              <button
                onClick={onRunFeasibility}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-sm transition-colors"
              >
                Re-run
              </button>
            </div>
          </div>
          {descriptionError && (
            <p className="text-xs text-red-400 mt-3 leading-snug" role="alert">
              {descriptionError}
            </p>
          )}
        </div>
      )}

      {latestRun && (latestRun.status === 'ERROR' || latestRun.status === 'CANCELLED') && (
        <div className="bg-gray-900 border border-red-900 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-400">
                {latestRun.status === 'CANCELLED' ? 'Analysis was cancelled' : 'Analysis failed'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Version {latestRun.version}</p>
            </div>
            <button
              onClick={onRunFeasibility}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
            >
              Re-run
            </button>
          </div>
          {descriptionError && (
            <p className="text-xs text-red-400 mt-3 leading-snug" role="alert">
              {descriptionError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
