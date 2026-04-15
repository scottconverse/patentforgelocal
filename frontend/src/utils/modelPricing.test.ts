import { describe, it, expect } from 'vitest';
import { LOCAL_MODELS, getModelLabel } from './modelPricing';

describe('modelPricing (local models)', () => {
  it('exports metadata for default local models', () => {
    expect(LOCAL_MODELS['gemma4:e4b']).toBeDefined();
    expect(LOCAL_MODELS['gemma4:e4b'].label).toBe('Gemma 4 (4B)');
  });

  it('each model has a label and parameterSize', () => {
    for (const [, info] of Object.entries(LOCAL_MODELS)) {
      expect(info.label).toBeTruthy();
      expect(info.parameterSize).toBeTruthy();
    }
  });

  it('getModelLabel returns known model label', () => {
    expect(getModelLabel('gemma4:e4b')).toBe('Gemma 4 (4B)');
  });

  it('getModelLabel returns raw model name for unknown models', () => {
    expect(getModelLabel('unknown-model-xyz')).toBe('unknown-model-xyz');
  });
});
