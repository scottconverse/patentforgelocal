interface CostConfirmModalProps {
  tokenCost: number;
  webSearchCost: number;
  cap: number;
  model: string;
  source: 'history' | 'static';
  runsUsed: number;
  stageCount?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function CostConfirmModal({
  tokenCost,
  webSearchCost,
  cap,
  model,
  source,
  runsUsed,
  stageCount = 6,
  onConfirm,
  onCancel,
}: CostConfirmModalProps) {
  const totalCost = tokenCost + webSearchCost;
  const exceedsCap = cap > 0 && totalCost > cap;
  const modelName = model.includes('haiku')
    ? 'Claude Haiku 4.5'
    : model.includes('opus')
      ? 'Claude Opus 4'
      : 'Claude Sonnet 4';

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
              <span>
                Token cost ({stageCount} {stageCount === 1 ? 'stage' : 'stages'})
              </span>
              <span className="font-mono">~${tokenCost.toFixed(3)}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span className="flex items-center gap-1">
                Web search
                <span className="text-xs text-gray-600">(~15 searches · $0.01 each)</span>
              </span>
              <span className="font-mono">~${webSearchCost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-200 border-t border-gray-700 pt-1.5 font-medium">
              <span>Estimated total</span>
              <span className={`font-mono ${exceedsCap ? 'text-amber-400' : 'text-green-400'}`}>
                ~${totalCost.toFixed(2)}
              </span>
            </div>
          </div>
          {cap > 0 && (
            <div className="flex justify-between text-gray-500 text-xs pt-1">
              <span>
                {source === 'history'
                  ? `Based on ${runsUsed} previous run${runsUsed === 1 ? '' : 's'} (+25% buffer)`
                  : 'Estimated (no run history)'}
              </span>
              <span>Cap: ${cap.toFixed(2)}</span>
            </div>
          )}
        </div>
        {exceedsCap && (
          <div className="p-3 bg-amber-900/40 border border-amber-700 rounded text-amber-300 text-sm">
            Estimated cost exceeds your cap of ${cap.toFixed(2)}. You can still proceed.
          </div>
        )}
        <div className="p-3 bg-amber-900/20 border border-amber-800/50 rounded text-xs text-amber-200/80 leading-relaxed">
          <strong className="text-amber-200">Research tool — not legal advice.</strong> The AI-generated analysis may contain errors, miss relevant prior art, or mischaracterize legal requirements. Always consult a registered patent attorney before making filing decisions.
        </div>
        <div className="flex gap-3 justify-end pt-1">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
          >
            {exceedsCap ? 'Proceed Anyway' : 'Start Analysis'}
          </button>
        </div>
      </div>
    </div>
  );
}
