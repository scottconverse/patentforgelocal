/**
 * Hardcoded model pricing — updated manually each release.
 * Source: https://docs.anthropic.com/en/docs/about-claude/pricing
 *
 * This replaces the previous live fetch to raw.githubusercontent.com/BerriAI/litellm.
 * For a self-hosted privacy tool, no outbound requests should be made from the frontend.
 */
export const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'claude-haiku-4-5-20251001': { inputPer1M: 0.8, outputPer1M: 4.0 },
  'claude-sonnet-4-20250514': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-opus-4-20250514': { inputPer1M: 15.0, outputPer1M: 75.0 },
};

/** Default fallback when model is not in the pricing table */
const DEFAULT_PRICING = { inputPer1M: 3.0, outputPer1M: 15.0 };

/** Get pricing for a model, falling back to Sonnet pricing for unknown models */
export function getModelPricing(model: string): { inputPer1M: number; outputPer1M: number } {
  return MODEL_PRICING[model] ?? DEFAULT_PRICING;
}
