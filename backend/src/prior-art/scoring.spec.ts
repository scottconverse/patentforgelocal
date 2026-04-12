/**
 * Tests for the patent relevance scoring function.
 * Verifies stop-word filtering, title weighting, and recency boost.
 */

import { scoreRelevance } from './prior-art.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- flexible test overrides
function makePatent(overrides: Record<string, any> = {}) {
  return {
    patent_id: 'US12345678',
    patent_title: overrides.title ?? overrides.patent_title ?? 'Machine Learning Image Classification System',
    patent_abstract:
      overrides.abstract ??
      overrides.patent_abstract ??
      'A system for classifying images using convolutional neural networks with transfer learning capabilities.',
    patent_date: overrides.date ?? overrides.patent_date ?? '2024-06-15',
    patent_type: overrides.patent_type ?? 'utility',
    ...overrides,
  };
}

describe('scoreRelevance', () => {
  it('returns very low score for no matching terms (recency boost only)', () => {
    const patent = makePatent({ date: '2024-06-15' });
    const score = scoreRelevance(patent, ['quantum', 'blockchain', 'cryptocurrency']);
    // No term matches → termScore = 0, only recency boost applies
    expect(score).toBeLessThan(0.15);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('returns higher score for title matches vs abstract-only matches', () => {
    const patent = makePatent({
      title: 'Neural Network Optimizer',
      abstract: 'Improves training speed for deep learning models.',
    });
    // "neural" appears in title — should score higher
    const scoreTitle = scoreRelevance(patent, ['neural']);
    // "training" appears only in abstract
    const scoreAbstract = scoreRelevance(patent, ['training']);
    expect(scoreTitle).toBeGreaterThan(scoreAbstract);
  });

  it('filters out stop-words', () => {
    const patent = makePatent({
      title: 'Method for Processing Data',
      abstract: 'A system comprising means for processing.',
    });
    // "method", "system", "comprising", "means" are all stop-words
    // Only "processing" and "data" should count
    const score = scoreRelevance(patent, ['method', 'system', 'comprising', 'means', 'processing', 'data']);
    // Without stop-word filtering, all 6 terms would match.
    // With filtering, only "processing" and "data" should be scored.
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('filters out short terms (< 4 chars)', () => {
    const patent = makePatent();
    const score = scoreRelevance(patent, ['ai', 'ml', 'cnn', 'the']);
    expect(score).toBe(0); // All too short
  });

  it('applies recency boost for recent patents', () => {
    const recentPatent = makePatent({ date: '2025-01-01' });
    const oldPatent = makePatent({ date: '2005-01-01' });
    const terms = ['machine', 'learning', 'classification'];

    const recentScore = scoreRelevance(recentPatent, terms);
    const oldScore = scoreRelevance(oldPatent, terms);

    expect(recentScore).toBeGreaterThan(oldScore);
  });

  it('handles missing title gracefully', () => {
    const patent = makePatent({ patent_title: null, title: undefined });
    const score = scoreRelevance(patent, ['classifying', 'images']);
    expect(score).toBeGreaterThan(0);
  });

  it('handles missing abstract gracefully', () => {
    const patent = makePatent({ patent_abstract: null, abstract: undefined });
    const score = scoreRelevance(patent, ['machine', 'learning']);
    expect(score).toBeGreaterThan(0);
  });

  it('applies bias correction for title-only scoring (no abstract)', () => {
    const withAbstract = makePatent({
      title: 'Neural Network Optimizer',
      abstract: 'Something unrelated to the query terms.',
    });
    const withoutAbstract = makePatent({
      title: 'Neural Network Optimizer',
      patent_abstract: null,
      abstract: undefined,
    });
    // Both match "neural" in title. Without bias correction, the no-abstract
    // version would score lower because it can't match on abstract.
    // With 1.5x correction, the title-only score should be boosted.
    const scoreWith = scoreRelevance(withAbstract, ['neural']);
    const scoreWithout = scoreRelevance(withoutAbstract, ['neural']);
    // The corrected title-only score should be close to or higher than the
    // abstract version (which doesn't match "neural" in abstract either)
    expect(scoreWithout).toBeGreaterThanOrEqual(scoreWith * 0.9);
  });

  it('deduplicates query terms', () => {
    const patent = makePatent();
    const score1 = scoreRelevance(patent, ['machine', 'learning']);
    const score2 = scoreRelevance(patent, ['machine', 'machine', 'learning', 'learning']);
    expect(score1).toBe(score2);
  });

  it('caps score at 1.0', () => {
    const patent = makePatent({
      title: 'Alpha Beta Gamma Delta Epsilon',
      abstract: 'Alpha beta gamma delta epsilon zeta eta theta.',
      date: '2026-01-01',
    });
    const score = scoreRelevance(patent, ['alpha', 'beta', 'gamma', 'delta', 'epsilon']);
    expect(score).toBeLessThanOrEqual(1.0);
  });
});
