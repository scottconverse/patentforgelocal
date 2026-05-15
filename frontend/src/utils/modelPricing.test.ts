import { describe, it, expect } from 'vitest';
import {
  LOCAL_MODELS,
  CLOUD_MODELS,
  getModelLabel,
  getModelPricing,
  getModelsForProvider,
  estimateCostUsd,
  formatCostDisplay,
} from './modelPricing';

describe('LOCAL_MODELS', () => {
  it('contains gemma4:e4b with a label and size', () => {
    expect(LOCAL_MODELS['gemma4:e4b']).toBeDefined();
    expect(LOCAL_MODELS['gemma4:e4b'].label).toContain('Gemma');
    expect(LOCAL_MODELS['gemma4:e4b'].parameterSize).toBeTruthy();
  });
});

describe('CLOUD_MODELS', () => {
  it('contains the default cloud model from Run 4 schema (claude-haiku-4-5-...)', () => {
    expect(CLOUD_MODELS['claude-haiku-4-5-20251001']).toBeDefined();
    expect(CLOUD_MODELS['claude-haiku-4-5-20251001'].inputPer1M).toBeGreaterThan(0);
    expect(CLOUD_MODELS['claude-haiku-4-5-20251001'].outputPer1M).toBeGreaterThan(
      CLOUD_MODELS['claude-haiku-4-5-20251001'].inputPer1M,
    );
  });

  it('Opus is more expensive than Haiku (per-1M output)', () => {
    expect(CLOUD_MODELS['claude-opus-4-7'].outputPer1M).toBeGreaterThan(
      CLOUD_MODELS['claude-haiku-4-5-20251001'].outputPer1M,
    );
  });
});

describe('getModelLabel', () => {
  it('returns the Gemma label for a local model', () => {
    expect(getModelLabel('gemma4:e4b')).toBe('Gemma 4 (4B)');
  });

  it('returns the Anthropic label for a cloud model', () => {
    expect(getModelLabel('claude-haiku-4-5-20251001')).toContain('Haiku');
  });

  it('falls back to the raw model id for unknown models', () => {
    expect(getModelLabel('some-future-model-xyz')).toBe('some-future-model-xyz');
  });
});

describe('getModelPricing', () => {
  it('returns null for LOCAL provider (Ollama is free)', () => {
    expect(getModelPricing('LOCAL', 'gemma4:e4b')).toBeNull();
  });

  it('returns null for LOCAL even when given a cloud model id', () => {
    // Provider trumps model identity — LOCAL never has a cost.
    expect(getModelPricing('LOCAL', 'claude-haiku-4-5-20251001')).toBeNull();
  });

  it('returns pricing for a known CLOUD model', () => {
    const pricing = getModelPricing('CLOUD', 'claude-haiku-4-5-20251001');
    expect(pricing).not.toBeNull();
    expect(pricing!.inputPer1M).toBeGreaterThan(0);
    expect(pricing!.outputPer1M).toBeGreaterThan(0);
  });

  it('returns null for unknown CLOUD model (defensive)', () => {
    expect(getModelPricing('CLOUD', 'claude-future-9000')).toBeNull();
  });
});

describe('getModelsForProvider', () => {
  it('returns LOCAL_MODELS as dropdown options for LOCAL', () => {
    const options = getModelsForProvider('LOCAL');
    expect(options.length).toBe(Object.keys(LOCAL_MODELS).length);
    expect(options.find((o) => o.id === 'gemma4:e4b')).toBeDefined();
  });

  it('returns CLOUD_MODELS as dropdown options for CLOUD', () => {
    const options = getModelsForProvider('CLOUD');
    expect(options.length).toBe(Object.keys(CLOUD_MODELS).length);
    expect(options.find((o) => o.id === 'claude-haiku-4-5-20251001')).toBeDefined();
  });
});

describe('estimateCostUsd', () => {
  it('returns 0 for LOCAL', () => {
    expect(estimateCostUsd('LOCAL', 'gemma4:e4b', 100_000, 50_000)).toBe(0);
  });

  it('computes correctly for CLOUD known model', () => {
    // Haiku 4.5: $1.00/M input, $5.00/M output
    // 100K input, 50K output → 0.1 * 1.00 + 0.05 * 5.00 = 0.10 + 0.25 = 0.35
    const cost = estimateCostUsd('CLOUD', 'claude-haiku-4-5-20251001', 100_000, 50_000);
    expect(cost).toBeCloseTo(0.35, 2);
  });

  it('returns 0 for unknown CLOUD model (defensive)', () => {
    expect(estimateCostUsd('CLOUD', 'claude-future-9000', 100_000, 50_000)).toBe(0);
  });
});

describe('formatCostDisplay', () => {
  it('returns "Free" for LOCAL regardless of cost value', () => {
    expect(formatCostDisplay('LOCAL', 0)).toBe('Free');
    expect(formatCostDisplay('LOCAL', 12.34)).toBe('Free'); // defensive
  });

  it('returns "< $0.01" for sub-cent CLOUD costs', () => {
    expect(formatCostDisplay('CLOUD', 0.003)).toBe('< $0.01');
  });

  it('returns formatted dollar amount for CLOUD ≥ $0.01', () => {
    expect(formatCostDisplay('CLOUD', 0.35)).toBe('$0.35');
    expect(formatCostDisplay('CLOUD', 12.5)).toBe('$12.50');
  });
});
