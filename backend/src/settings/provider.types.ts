/**
 * LLM provider routing — TypeScript-level safety for AppSettings.provider.
 *
 * Prisma can't emit an enum on SQLite (Prisma P1012), so the type-safety
 * lives across three layers:
 *
 *   1. **Compile-time** — this `Provider` union catches typos in TS code.
 *   2. **HTTP boundary** — the DTO validator (`update-settings.dto.ts`)
 *      rejects requests with unrecognized values.
 *   3. **Runtime DB** — the SQLite CHECK constraint in the AppSettings table
 *      (see `SCHEMA_SQL` in `src/prisma/prisma.service.ts`) rejects writes
 *      with bad values even if a path skipped the DTO.
 *
 * Introduced in PatentForge merge plan Run 4.
 */

export type Provider = 'LOCAL' | 'CLOUD';

export const PROVIDERS: readonly Provider[] = ['LOCAL', 'CLOUD'] as const;

/** Type guard: narrow `unknown` (e.g. an inbound JSON value) to a valid Provider. */
export function isProvider(value: unknown): value is Provider {
  return typeof value === 'string' && (PROVIDERS as readonly string[]).includes(value);
}

/** Default provider for fresh installs and for migrations of pre-Run-4 rows. */
export const DEFAULT_PROVIDER: Provider = 'LOCAL';
