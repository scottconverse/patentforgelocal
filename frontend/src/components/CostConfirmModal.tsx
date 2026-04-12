interface CostConfirmModalProps {
  model: string;
  stageCount?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function CostConfirmModal({
  model,
  stageCount = 6,
  onConfirm,
  onCancel,
}: CostConfirmModalProps) {
  const modelName = model.includes('gemma')
    ? 'Gemma 4 (27B)'
    : model.includes('llama')
      ? 'Llama 4'
      : model;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4 space-y-4">
        <h2 className="text-lg font-semibold text-gray-100">Confirm Analysis Run</h2>
        <div className="bg-gray-800 rounded-lg p-4 space-y-2 text-sm">
          <div className="flex justify-between text-gray-300">
            <span>Model</span>
            <span className="font-mono text-gray-100">{modelName}</span>
          </div>
          <div className="border-t border-gray-700 pt-2 mt-2 space-y-1.5">
            <div className="flex justify-between text-gray-300">
              <span>Pipeline</span>
              <span className="font-mono text-gray-100">
                {stageCount}-stage analysis
              </span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Estimated time</span>
              <span className="font-mono text-gray-100">~5-10 minutes</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Tokens (approx)</span>
              <span className="font-mono">~50,000 in / ~15,000 out</span>
            </div>
          </div>
        </div>
        <div className="p-3 bg-green-900/20 border border-green-800/50 rounded text-xs text-green-300/80 leading-relaxed">
          All processing happens locally on this machine. No data is sent to external servers.
        </div>
        <div className="p-3 bg-amber-900/20 border border-amber-800/50 rounded text-xs text-amber-200/80 leading-relaxed">
          <strong className="text-amber-200">Research tool — not legal advice.</strong> The AI-generated analysis may contain errors, miss relevant prior art, or mischaracterize legal requirements. Always consult a registered patent attorney before making filing decisions.
        </div>
        <div className="flex gap-3 justify-end pt-1">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-400 hover:text-gray-200 text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
          >
            Start Analysis
          </button>
        </div>
      </div>
    </div>
  );
}
