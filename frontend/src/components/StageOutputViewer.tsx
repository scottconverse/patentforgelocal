import { FeasibilityStage } from '../types';
import { formatCost } from '../utils/format';

/**
 * Stage detail view — shows the full output of a single feasibility stage
 * with metadata (model, tokens, cost) and a download button.
 */
export default function StageOutputViewer({
  stage,
  projectTitle,
  onBack,
}: {
  stage: FeasibilityStage;
  projectTitle: string;
  onBack: () => void;
}) {
  const handleDownload = () => {
    const slug = projectTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const stageName = stage.stageName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const blob = new Blob([stage.outputText || ''], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}-${stage.stageNumber}-${stageName}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">
            Stage {stage.stageNumber}: {stage.stageName}
          </h2>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
            {stage.model && <span className="font-mono">{stage.model}</span>}
            {stage.webSearchUsed && <span className="text-blue-400">&#128269; Web search used</span>}
            {stage.inputTokens != null && (
              <span>
                {stage.inputTokens.toLocaleString()} in / {stage.outputTokens?.toLocaleString()} out tokens
              </span>
            )}
            {stage.estimatedCostUsd != null && stage.estimatedCostUsd > 0 && (
              <span className="text-amber-500">{formatCost(stage.estimatedCostUsd)}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            className="text-sm px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded transition-colors"
          >
            Download
          </button>
          <button
            onClick={onBack}
            className="text-sm px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
          >
            &larr; Back to Report
          </button>
        </div>
      </div>
      <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
        <div className="p-4 max-h-[600px] overflow-y-auto">
          <pre className="text-gray-300 text-sm whitespace-pre-wrap font-mono leading-relaxed">
            {stage.outputText || 'No output.'}
          </pre>
        </div>
      </div>
    </div>
  );
}
