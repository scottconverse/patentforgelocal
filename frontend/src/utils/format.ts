import type { Provider } from '../types';

/**
 * Format a per-stage / per-run USD cost for display.
 *
 * When `provider === 'LOCAL'`, returns the string literal `'Free'` — local
 * inference has no per-token cost (decision #12 of the merge plan).
 * When `provider === 'CLOUD'` or unspecified, falls back to the historical
 * dollar formatting (empty when 0, `<$0.001` for sub-tenth-cent, otherwise
 * `$N.NNN` / `$N.NNNN`).
 *
 * Run 6 fold-in of the Run 5.5 cost-display migration.
 */
export function formatCost(usd?: number, provider?: Provider): string {
  if (provider === 'LOCAL') return 'Free';
  if (usd == null || usd === 0) return '';
  if (usd < 0.001) return '<$0.001';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

export function formatDuration(start?: string, end?: string): string {
  if (!start || !end) return '';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}
