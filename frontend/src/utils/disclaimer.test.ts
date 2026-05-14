/**
 * Unit tests for the per-project acknowledgment helpers in disclaimer.ts.
 * Verifies localStorage interaction and graceful degradation when localStorage
 * is unavailable.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  hasAcknowledgedClaims,
  acknowledgeClaims,
  clearAcknowledgedClaims,
} from './disclaimer';

describe('per-project claim acknowledgment helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('hasAcknowledgedClaims returns false when no entry exists', () => {
    expect(hasAcknowledgedClaims('project-1')).toBe(false);
  });

  it('acknowledgeClaims persists a timestamp under patentforge_ack_<projectId>', () => {
    acknowledgeClaims('project-1');
    const stored = localStorage.getItem('patentforge_ack_project-1');
    expect(stored).not.toBeNull();
    // ISO-8601 timestamp format check
    expect(stored).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('hasAcknowledgedClaims returns true after acknowledgeClaims', () => {
    acknowledgeClaims('project-2');
    expect(hasAcknowledgedClaims('project-2')).toBe(true);
  });

  it('isolates acknowledgments per project', () => {
    acknowledgeClaims('project-a');
    expect(hasAcknowledgedClaims('project-a')).toBe(true);
    expect(hasAcknowledgedClaims('project-b')).toBe(false);
  });

  it('clearAcknowledgedClaims removes the entry', () => {
    acknowledgeClaims('project-3');
    expect(hasAcknowledgedClaims('project-3')).toBe(true);
    clearAcknowledgedClaims('project-3');
    expect(hasAcknowledgedClaims('project-3')).toBe(false);
  });

  it('rejects empty projectId in hasAcknowledgedClaims', () => {
    expect(hasAcknowledgedClaims('')).toBe(false);
  });

  it('rejects empty projectId in acknowledgeClaims (no-op)', () => {
    acknowledgeClaims('');
    // No key written because empty projectId
    expect(localStorage.length).toBe(0);
  });

  it('degrades silently when localStorage throws (private mode simulation)', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    // Must not throw
    expect(() => acknowledgeClaims('project-4')).not.toThrow();
    setItem.mockRestore();
  });

  it('degrades silently when localStorage getItem throws', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    expect(() => hasAcknowledgedClaims('project-5')).not.toThrow();
    expect(hasAcknowledgedClaims('project-5')).toBe(false);
    getItem.mockRestore();
  });
});
