/**
 * Silent DB-file rename hook for the PatentForgeLocal → PatentForge merge.
 *
 * Pre-merge installs created `<dataDir>/patentforgelocal.db`. The merged
 * product uses `<dataDir>/patentforge.db`. This module renames the old
 * file in place on first boot post-upgrade and updates `process.env.DATABASE_URL`
 * to point at the new name BEFORE PrismaClient is constructed, so Prisma
 * sees the migrated state on its first connect.
 *
 * Fail-soft: any rename error logs a warning and proceeds. In the worst
 * case, Prisma creates a fresh `patentforge.db` and the operator can
 * manually restore the old file or re-import projects.
 *
 * Introduced in PatentForge merge plan Run 8 (v0.5.0 release).
 */

import { existsSync, renameSync } from 'fs';
import { dirname, basename, join } from 'path';

const OLD_DB_NAME = 'patentforgelocal.db';
const NEW_DB_NAME = 'patentforge.db';
const FILE_URL_PREFIX = 'file:';

interface MigrateResult {
  /** True if a rename actually happened this call. */
  renamed: boolean;
  /** The DATABASE_URL value that should be active after the call. */
  url: string;
  /** Human-readable explanation of what was done (or why nothing was). */
  note: string;
}

/**
 * Inspects the given DATABASE_URL + filesystem and decides whether to
 * rename `patentforgelocal.db` → `patentforge.db`. Returns the URL that
 * should be set as `process.env.DATABASE_URL` afterward.
 *
 * Exported for testing; production callers use `migrateDbFileIfNeeded()`.
 */
export function planDbMigration(
  databaseUrl: string | undefined,
  fsExists: (path: string) => boolean = existsSync,
): MigrateResult {
  // Non-file URLs (Postgres etc.) skip the rename entirely.
  if (!databaseUrl || !databaseUrl.startsWith(FILE_URL_PREFIX)) {
    return { renamed: false, url: databaseUrl ?? '', note: 'non-file DATABASE_URL; skip' };
  }

  const dbPath = databaseUrl.slice(FILE_URL_PREFIX.length);
  const filename = basename(dbPath);

  // If the URL already points at the new name, nothing to do.
  if (filename === NEW_DB_NAME) {
    return { renamed: false, url: databaseUrl, note: 'already on patentforge.db' };
  }

  // If the URL points at something other than patentforgelocal.db, leave it.
  if (filename !== OLD_DB_NAME) {
    return { renamed: false, url: databaseUrl, note: `unrecognized db filename ${filename}; skip` };
  }

  const dir = dirname(dbPath);
  const oldPath = dbPath;
  const newPath = join(dir, NEW_DB_NAME);
  const newUrl = `${FILE_URL_PREFIX}${newPath}`;

  const oldExists = fsExists(oldPath);
  const newExists = fsExists(newPath);

  if (newExists) {
    // New file already in place — prefer it, leave old alone. This covers
    // the edge case where a prior boot already migrated and someone
    // restored the .env to the old name.
    return {
      renamed: false,
      url: newUrl,
      note: 'patentforge.db already present; using it (patentforgelocal.db left in place)',
    };
  }

  if (!oldExists) {
    // Neither file exists — fresh install, future-named URL.
    return { renamed: false, url: newUrl, note: 'no existing db file; pointing at new name for fresh install' };
  }

  // Old exists, new doesn't — this is the rename case.
  return {
    renamed: true,
    url: newUrl,
    note: `will rename ${OLD_DB_NAME} → ${NEW_DB_NAME}`,
  };
}

/**
 * Production entry point. Mutates `process.env.DATABASE_URL` in place and
 * renames the file on disk if needed. Logs to stdout/stderr.
 */
export function migrateDbFileIfNeeded(): MigrateResult {
  const plan = planDbMigration(process.env.DATABASE_URL);
  process.env.DATABASE_URL = plan.url;

  if (!plan.renamed) {
    // Quiet info; the only "boot-relevant" cases are the rename itself.
    if (plan.note !== 'non-file DATABASE_URL; skip') {
      console.log(`[db-migrate] ${plan.note}`);
    }
    return plan;
  }

  // Execute the rename.
  const oldPath = process.env.DATABASE_URL?.replace(FILE_URL_PREFIX, '').replace(NEW_DB_NAME, OLD_DB_NAME) ?? '';
  const newPath = process.env.DATABASE_URL?.replace(FILE_URL_PREFIX, '') ?? '';

  try {
    renameSync(oldPath, newPath);
    console.log(`[db-migrate] Migrated DB file: ${OLD_DB_NAME} → ${NEW_DB_NAME} (in ${dirname(newPath)})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[db-migrate] Could not rename ${OLD_DB_NAME} → ${NEW_DB_NAME}: ${msg}. ` +
        `Prisma will create a fresh ${NEW_DB_NAME}; restore the old file manually if needed.`,
    );
  }

  return plan;
}
