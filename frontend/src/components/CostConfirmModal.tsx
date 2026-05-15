/**
 * Cost confirmation modal — shown before a CLOUD-mode feasibility run.
 *
 * Added in PatentForge merge plan Run 5. Renders only when the user has
 * provider=CLOUD; in LOCAL mode the modal is skipped entirely (inference
 * is free locally, so there's nothing to confirm).
 *
 * Accessibility: focus-trapped via `inert` + `aria-modal`; primary button
 * (Approve) is the default focus on open; Escape cancels; backdrop click
 * cancels.
 */

import { useEffect, useRef } from 'react';
import { formatCostDisplay } from '../utils/modelPricing';

interface CostConfirmModalProps {
  /** True when the modal should be rendered. */
  open: boolean;
  /** Estimated USD cost (computed via `estimateCostUsd` at the call site). */
  estimatedCostUsd: number;
  /** Provider — used for display formatting. Always 'CLOUD' in practice. */
  provider?: 'LOCAL' | 'CLOUD';
  /** Number of stages the user is approving. */
  stageCount?: number;
  /** Approve button handler. */
  onApprove: () => void;
  /** Cancel / dismiss handler (also called on Escape + backdrop click). */
  onCancel: () => void;
}

export default function CostConfirmModal({
  open,
  estimatedCostUsd,
  provider = 'CLOUD',
  stageCount = 6,
  onApprove,
  onCancel,
}: CostConfirmModalProps) {
  const approveBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Auto-focus the Approve button so keyboard users can confirm with Enter.
    approveBtnRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  const display = formatCostDisplay(provider, estimatedCostUsd);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cost-confirm-title"
      aria-describedby="cost-confirm-desc"
      data-testid="cost-confirm-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="max-w-md w-full mx-4 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-700">
          <h2 id="cost-confirm-title" className="text-lg font-semibold text-gray-100">
            Confirm cloud run
          </h2>
        </div>

        <div id="cost-confirm-desc" className="p-5 space-y-3 text-sm text-gray-300">
          <p>
            You're about to run a {stageCount}-stage feasibility analysis in <strong>cloud mode</strong>.
            This will call the Anthropic API and incur a cost.
          </p>
          <div className="bg-gray-800 border border-gray-700 rounded p-3 flex items-center justify-between">
            <span className="text-gray-400 text-xs uppercase tracking-wider">Estimated cost</span>
            <span className="text-2xl font-mono font-semibold text-gray-100" data-testid="cost-amount">
              {display}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Estimates use the model's published per-token pricing. Actual cost depends on the
            tokens your invention narrative + prior art context generate. Final cost appears in
            the run summary.
          </p>
        </div>

        <div className="p-5 border-t border-gray-700 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-sm transition-colors"
            aria-label="Cancel run"
          >
            Cancel
          </button>
          <button
            ref={approveBtnRef}
            type="button"
            onClick={onApprove}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
            aria-label={`Approve run for ${display}`}
            data-testid="cost-confirm-approve"
          >
            Approve &amp; Run
          </button>
        </div>
      </div>
    </div>
  );
}
