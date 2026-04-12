/**
 * Count the number of words in a string.
 * Trims whitespace and splits on whitespace boundaries.
 * Returns 0 for empty/whitespace-only strings.
 */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
