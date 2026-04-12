import { describe, it, expect } from 'vitest';
import { countWords, validateDescriptionWordCount, MIN_DESCRIPTION_WORDS } from './validation';

describe('countWords', () => {
  it('counts words separated by single spaces', () => {
    expect(countWords('one two three four five')).toBe(5);
  });

  it('handles multiple whitespace characters between words', () => {
    expect(countWords('one   two\tthree\nfour')).toBe(4);
  });

  it('trims leading and trailing whitespace', () => {
    expect(countWords('  hello world  ')).toBe(2);
  });

  it('returns 0 for an empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('returns 0 for whitespace-only string', () => {
    expect(countWords('   \t\n  ')).toBe(0);
  });

  it('counts a single word', () => {
    expect(countWords('hello')).toBe(1);
  });

  it('counts exactly 50 words', () => {
    const fiftyWords = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ');
    expect(countWords(fiftyWords)).toBe(50);
  });

  it('counts 49 words correctly', () => {
    const fortyNineWords = Array.from({ length: 49 }, (_, i) => `word${i}`).join(' ');
    expect(countWords(fortyNineWords)).toBe(49);
  });
});

describe('MIN_DESCRIPTION_WORDS', () => {
  it('is 50', () => {
    expect(MIN_DESCRIPTION_WORDS).toBe(50);
  });
});

describe('validateDescriptionWordCount', () => {
  it('returns error for undefined description', () => {
    const result = validateDescriptionWordCount(undefined);
    expect(result).not.toBeNull();
    expect(result).toContain('required');
  });

  it('returns error for empty string', () => {
    const result = validateDescriptionWordCount('');
    expect(result).not.toBeNull();
    expect(result).toContain('required');
  });

  it('returns error for description under 50 words', () => {
    const shortDescription = 'This is a short description with only ten words in it.';
    const result = validateDescriptionWordCount(shortDescription);
    expect(result).not.toBeNull();
    expect(result).toContain('at least 50 words');
    expect(result).toContain('currently');
  });

  it('includes the actual word count in the error message', () => {
    const description = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
    const result = validateDescriptionWordCount(description);
    expect(result).toContain('currently 30');
  });

  it('returns error for exactly 49 words', () => {
    const description = Array.from({ length: 49 }, (_, i) => `word${i}`).join(' ');
    const result = validateDescriptionWordCount(description);
    expect(result).not.toBeNull();
    expect(result).toContain('at least 50 words');
  });

  it('returns null for exactly 50 words', () => {
    const description = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ');
    const result = validateDescriptionWordCount(description);
    expect(result).toBeNull();
  });

  it('returns null for more than 50 words', () => {
    const description = Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ');
    const result = validateDescriptionWordCount(description);
    expect(result).toBeNull();
  });

  it('handles description with extra whitespace correctly', () => {
    // 50 words separated by multiple spaces should still pass
    const description = Array.from({ length: 50 }, (_, i) => `word${i}`).join('   ');
    const result = validateDescriptionWordCount(description);
    expect(result).toBeNull();
  });

  it('includes guidance about what to add when validation fails', () => {
    const result = validateDescriptionWordCount('short description');
    expect(result).toContain('what problem it solves');
    expect(result).toContain('how it works technically');
    expect(result).toContain('different from existing approaches');
  });
});
