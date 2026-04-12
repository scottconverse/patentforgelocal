import { describe, it, expect } from 'vitest';
import { MODEL_PRICING, getModelPricing } from './modelPricing';

describe('modelPricing', () => {
  it('exports pricing for all supported Claude models', () => {
    expect(MODEL_PRICING['claude-haiku-4-5-20251001']).toBeDefined();
    expect(MODEL_PRICING['claude-sonnet-4-20250514']).toBeDefined();
    expect(MODEL_PRICING['claude-opus-4-20250514']).toBeDefined();
  });

  it('each model has inputPer1M and outputPer1M as positive numbers', () => {
    for (const [, price] of Object.entries(MODEL_PRICING)) {
      expect(price.inputPer1M).toBeGreaterThan(0);
      expect(price.outputPer1M).toBeGreaterThan(0);
    }
  });

  it('getModelPricing returns known model pricing', () => {
    const p = getModelPricing('claude-sonnet-4-20250514');
    expect(p.inputPer1M).toBe(3.0);
    expect(p.outputPer1M).toBe(15.0);
  });

  it('getModelPricing returns Sonnet fallback for unknown models', () => {
    const p = getModelPricing('unknown-model-xyz');
    expect(p.inputPer1M).toBe(3.0);
    expect(p.outputPer1M).toBe(15.0);
  });
});
