/**
 * Jest manual mock for sanitize-html.
 *
 * Sanitization behavior is tested in the frontend unit tests. The backend
 * tests that import feasibility.service.ts only need the module to be
 * present — they do not assert on sanitization behavior, so a
 * pass-through mock is sufficient.
 */
const sanitizeHtml = (input: string): string => input;

export default sanitizeHtml;
