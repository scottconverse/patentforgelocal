/**
 * Count words in a string. Splits on whitespace and filters empty tokens.
 */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Minimum word count required for an invention description before running feasibility. */
export const MIN_DESCRIPTION_WORDS = 50;

/**
 * Validate that an invention description meets the minimum word count
 * for feasibility analysis.
 *
 * Returns an error message string if invalid, or null if valid.
 */
export function validateDescriptionWordCount(description: string | undefined): string | null {
  if (!description) {
    return 'Invention description is required before running feasibility analysis.';
  }
  const words = countWords(description);
  if (words < MIN_DESCRIPTION_WORDS) {
    return `Invention description must be at least ${MIN_DESCRIPTION_WORDS} words (currently ${words}). Please provide more detail about what problem it solves, how it works technically, and what makes it different from existing approaches.`;
  }
  return null;
}
