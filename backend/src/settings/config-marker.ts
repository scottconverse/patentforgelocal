/**
 * Cross-process marker files in <baseDir>/config/.
 *
 * The tray (Go, no DB driver) needs to know the active provider and install
 * edition before it can decide whether to start the Ollama child process.
 * Backend mirrors AppSettings.provider into `<configDir>/provider.txt` on
 * every Settings save; the installer writes `<configDir>/edition.txt` once
 * at install time. Both files are plain UTF-8 text, single line.
 *
 * The tray reads these same files; see `tray/internal/config/edition.go`.
 *
 * Introduced in PatentForge merge plan Run 6.
 */

import { promises as fs } from 'fs';
import * as path from 'path';

import type { InstallEdition } from './edition.types';
import { DEFAULT_INSTALL_EDITION, isInstallEdition } from './edition.types';
import type { Provider } from './provider.types';

export const EDITION_MARKER_FILE = 'edition.txt';
export const PROVIDER_MARKER_FILE = 'provider.txt';

/**
 * Resolve the config dir the tray expects markers in.
 *
 * Priority:
 *   1. `PATENTFORGE_CONFIG_DIR` env (preferred — tray sets this when
 *      spawning the backend).
 *   2. Derived from `DATABASE_URL` (`file:<dataDir>/patentforgelocal.db`):
 *      dirname of dataDir → join("config").
 *   3. `null` when nothing reasonable can be resolved (in tests, in dev,
 *      or when running outside the tray harness). Callers should treat
 *      `null` as "no config dir; skip marker work" rather than throwing.
 */
export function resolveConfigDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.PATENTFORGE_CONFIG_DIR;
  if (explicit && explicit.trim().length > 0) {
    return explicit;
  }

  const dbUrl = env.DATABASE_URL;
  if (dbUrl && dbUrl.startsWith('file:')) {
    const dbPath = dbUrl.slice('file:'.length);
    const dataDir = path.dirname(dbPath);
    if (dataDir && dataDir !== '.' && dataDir !== '/') {
      return path.join(path.dirname(dataDir), 'config');
    }
  }

  return null;
}

/**
 * Read `<configDir>/edition.txt` and return the parsed InstallEdition.
 * Missing file / unreadable / invalid contents all return DEFAULT_INSTALL_EDITION
 * — preserving v0.4 single-edition upgrade behavior.
 */
export async function readEditionMarker(configDir: string | null): Promise<InstallEdition> {
  if (!configDir) return DEFAULT_INSTALL_EDITION;
  const markerPath = path.join(configDir, EDITION_MARKER_FILE);
  let raw: string;
  try {
    raw = await fs.readFile(markerPath, 'utf-8');
  } catch {
    return DEFAULT_INSTALL_EDITION;
  }

  const v = raw.trim().toLowerCase();
  if (v === 'lean') return 'Lean';
  if (v === 'full') return 'Full';

  // Final defense: in case a hand-edit slipped through with the right
  // capitalization but odd whitespace, run the type guard on the trimmed
  // raw value too.
  const trimmed = raw.trim();
  if (isInstallEdition(trimmed)) return trimmed;
  return DEFAULT_INSTALL_EDITION;
}

/**
 * Write `<configDir>/provider.txt` containing the uppercased provider.
 * Fail-soft: returns the file path on success, `null` on any error (e.g.
 * configDir missing, no write permission). Logging is the caller's
 * responsibility — this helper is intentionally side-effect-only and
 * test-friendly.
 */
export async function writeProviderMarker(
  provider: Provider,
  configDir: string | null,
): Promise<string | null> {
  if (!configDir) return null;
  const markerPath = path.join(configDir, PROVIDER_MARKER_FILE);
  try {
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(markerPath, provider, 'utf-8');
    return markerPath;
  } catch {
    return null;
  }
}
