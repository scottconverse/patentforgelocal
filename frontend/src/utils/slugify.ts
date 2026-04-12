/**
 * Convert a string to a URL-safe slug.
 * Used for filenames, download attributes, and export paths.
 */
export function slugify(text: string, fallback = 'untitled'): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || fallback
  );
}
