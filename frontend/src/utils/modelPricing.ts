/**
 * Model metadata + provider-aware cost helpers.
 *
 * LOCAL_MODELS — Ollama models. Inference cost is $0 (local hardware).
 * CLOUD_MODELS — Anthropic models. Inference cost = (in/1M)*inputTokens + (out/1M)*outputTokens.
 *
 * `getModelPricing(provider, model)` is the single dispatch helper:
 *   - provider='LOCAL' → null   (UI renders "Free")
 *   - provider='CLOUD' → { inputPer1M, outputPer1M } | null if unknown model
 *
 * Anthropic pricing is approximate (last updated 2026-05; verify against
 * https://www.anthropic.com/pricing for production cost-reporting accuracy).
 * Falling back to null on unknown models is intentional — defensive against
 * a model release outpacing our table; UI displays "Free" or "—" rather than
 * crashing the cost calculation.
 */

import type { Provider } from '../types';

export interface ModelPricing {
  /** USD per 1 million input tokens. */
  inputPer1M: number;
  /** USD per 1 million output tokens. */
  outputPer1M: number;
}

export interface ModelInfo {
  label: string;
  /** Human-readable size or context hint (e.g. "9.6 GB", "200K context"). */
  parameterSize: string;
}

// ── Local (Ollama) models ───────────────────────────────────────────────────

export const LOCAL_MODELS: Record<string, ModelInfo> = {
  'gemma4:e4b': { label: 'Gemma 4 (4B)', parameterSize: '9.6 GB' },
  'gemma4:26b': { label: 'Gemma 4 (27B MoE)', parameterSize: '18 GB' },
  'gemma3:27b': { label: 'Gemma 3 (27B)', parameterSize: '16 GB' },
  'llama4:scout': { label: 'Llama 4 Scout', parameterSize: '17 GB' },
};

// ── Cloud (Anthropic) models ────────────────────────────────────────────────

export const CLOUD_MODELS: Record<string, ModelInfo & ModelPricing> = {
  'claude-haiku-4-5-20251001': {
    label: 'Claude Haiku 4.5',
    parameterSize: '200K context',
    inputPer1M: 1.00,
    outputPer1M: 5.00,
  },
  'claude-sonnet-4-6': {
    label: 'Claude Sonnet 4.6',
    parameterSize: '200K context',
    inputPer1M: 3.00,
    outputPer1M: 15.00,
  },
  'claude-opus-4-7': {
    label: 'Claude Opus 4.7',
    parameterSize: '200K context',
    inputPer1M: 15.00,
    outputPer1M: 75.00,
  },
  'claude-opus-4-7-1m': {
    label: 'Claude Opus 4.7 (1M context)',
    parameterSize: '1M context',
    inputPer1M: 15.00,
    outputPer1M: 75.00,
  },
};

// ── Dispatch + helpers ──────────────────────────────────────────────────────

/**
 * Get pricing for a given (provider, model) pair.
 *
 * Returns `null` for LOCAL (Ollama is free), or for CLOUD models not in the
 * pricing table (defensive — keeps cost-reporting code paths alive when a
 * new Anthropic model drops before our table is updated).
 */
export function getModelPricing(provider: Provider, model: string): ModelPricing | null {
  if (provider === 'LOCAL') return null;
  const info = CLOUD_MODELS[model];
  if (!info) return null;
  return { inputPer1M: info.inputPer1M, outputPer1M: info.outputPer1M };
}

/** Human-readable label for a model. Looks in both tables; falls back to the raw id. */
export function getModelLabel(model: string): string {
  return LOCAL_MODELS[model]?.label ?? CLOUD_MODELS[model]?.label ?? model;
}

/** List of available models for a given provider, suitable for a dropdown. */
export function getModelsForProvider(provider: Provider): Array<{ id: string; label: string }> {
  const table = provider === 'LOCAL' ? LOCAL_MODELS : CLOUD_MODELS;
  return Object.entries(table).map(([id, info]) => ({ id, label: info.label }));
}

/**
 * Compute estimated USD cost for an LLM call.
 * Returns 0 for LOCAL or unknown CLOUD models.
 */
export function estimateCostUsd(
  provider: Provider,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = getModelPricing(provider, model);
  if (!pricing) return 0;
  return (
    (inputTokens / 1_000_000) * pricing.inputPer1M +
    (outputTokens / 1_000_000) * pricing.outputPer1M
  );
}

/** Display label for cost — `"Free"` when provider=LOCAL, formatted `$N.NN` otherwise. */
export function formatCostDisplay(provider: Provider, costUsd: number): string {
  if (provider === 'LOCAL') return 'Free';
  if (costUsd < 0.005) return '< $0.01';
  return `$${costUsd.toFixed(2)}`;
}
