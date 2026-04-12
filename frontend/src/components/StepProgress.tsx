/**
 * StepProgress — displays real-time SSE step progress during generation.
 *
 * Shows a vertical list of steps with status indicators:
 *   ✓ (green)  — completed step
 *   ⟳ (blue spinner) — currently running step
 *   ○ (gray)   — pending step
 *
 * Used by ClaimsTab, ComplianceTab, and ApplicationTab for SSE streaming.
 */

export type StepStatus = 'pending' | 'running' | 'complete' | 'error';

export interface StepDef {
  /** Unique key for the step (e.g., "plan", "draft", "examine") */
  key: string;
  /** Human-readable label shown while pending (e.g., "Plan claim strategy") */
  label: string;
  /** Human-readable label shown while running (e.g., "Planning claim strategy...") */
  activeLabel: string;
  /** Human-readable label shown when complete (e.g., "Claim strategy planned") */
  completeLabel: string;
}

export interface StepState {
  key: string;
  status: StepStatus;
  detail?: string;
}

interface StepProgressProps {
  steps: StepDef[];
  stepStates: StepState[];
  /** Optional elapsed time string to show below the steps */
  elapsed?: string;
  /** Optional description shown above the step list */
  description?: string;
  /** Optional error message */
  error?: string | null;
}

export default function StepProgress({ steps, stepStates, elapsed, description, error }: StepProgressProps) {
  function getState(key: string): StepState {
    return stepStates.find((s) => s.key === key) || { key, status: 'pending' };
  }

  function getStepDef(key: string): StepDef | undefined {
    return steps.find((s) => s.key === key);
  }

  return (
    <div className="text-center py-8" data-testid="step-progress">
      {description && <p className="text-xs text-gray-500 mb-4">{description}</p>}

      <div className="inline-block text-left space-y-2 min-w-[260px]">
        {steps.map((step) => {
          const state = getState(step.key);
          return (
            <div key={step.key} className="flex items-center gap-3" data-testid={`step-${step.key}`}>
              {/* Status icon */}
              {state.status === 'complete' && (
                <span className="text-green-400 text-sm font-bold w-5 text-center" aria-label="Complete">
                  {'\u2713'}
                </span>
              )}
              {state.status === 'running' && (
                <div
                  className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin ml-0.5"
                  aria-label="Running"
                />
              )}
              {state.status === 'pending' && (
                <span className="text-gray-600 text-sm w-5 text-center" aria-label="Pending">
                  {'\u25CB'}
                </span>
              )}
              {state.status === 'error' && (
                <span className="text-red-400 text-sm font-bold w-5 text-center" aria-label="Error">
                  {'\u2717'}
                </span>
              )}

              {/* Label */}
              <span
                className={`text-sm ${
                  state.status === 'complete'
                    ? 'text-green-300'
                    : state.status === 'running'
                      ? 'text-blue-300'
                      : state.status === 'error'
                        ? 'text-red-300'
                        : 'text-gray-500'
                }`}
              >
                {state.status === 'complete'
                  ? step.completeLabel
                  : state.status === 'running'
                    ? step.activeLabel
                    : state.status === 'error'
                      ? state.detail || step.label
                      : step.label}
              </span>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="text-red-400 text-sm mt-4">{error}</p>
      )}

      {elapsed && (
        <p className="text-xs text-gray-600 mt-4 font-mono">{elapsed} elapsed</p>
      )}
    </div>
  );
}

// ----- Step definitions for each tab -----

export const CLAIMS_STEPS: StepDef[] = [
  { key: 'plan', label: 'Plan claim strategy', activeLabel: 'Planning claim strategy...', completeLabel: 'Claim strategy planned' },
  { key: 'draft', label: 'Draft claims', activeLabel: 'Drafting claims...', completeLabel: 'Claims drafted' },
  { key: 'examine', label: 'Review claims', activeLabel: 'Reviewing claims...', completeLabel: 'Claims reviewed' },
];

export const COMPLIANCE_STEPS: StepDef[] = [
  { key: 'eligibility', label: 'Check eligibility (101)', activeLabel: 'Running eligibility check...', completeLabel: 'Eligibility checked' },
  { key: 'definiteness', label: 'Check definiteness (112b)', activeLabel: 'Running definiteness check...', completeLabel: 'Definiteness checked' },
  { key: 'written_description', label: 'Check written description (112a)', activeLabel: 'Running written description check...', completeLabel: 'Written description checked' },
  { key: 'formalities', label: 'Check formalities (MPEP 608)', activeLabel: 'Running formalities check...', completeLabel: 'Formalities checked' },
];

export const APPLICATION_STEPS: StepDef[] = [
  { key: 'background', label: 'Generate background', activeLabel: 'Generating background...', completeLabel: 'Background generated' },
  { key: 'summary', label: 'Generate summary', activeLabel: 'Generating summary...', completeLabel: 'Summary generated' },
  { key: 'detailed_description', label: 'Generate detailed description', activeLabel: 'Generating detailed description...', completeLabel: 'Detailed description generated' },
  { key: 'abstract', label: 'Generate abstract', activeLabel: 'Generating abstract...', completeLabel: 'Abstract generated' },
  { key: 'figures', label: 'Generate figure descriptions', activeLabel: 'Generating figure descriptions...', completeLabel: 'Figure descriptions generated' },
];
