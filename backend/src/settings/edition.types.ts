/**
 * Installer edition routing — TypeScript-level safety for AppSettings.installEdition.
 *
 * Lean ships without an Ollama runtime bundle (cloud-only); Full bundles Ollama
 * + Gemma 4 so the user can run locally or in the cloud. The edition is chosen
 * at install time and written to `<baseDir>/config/edition.txt` by the
 * installer. Backend mirrors that value into AppSettings.installEdition so the
 * frontend can read it via the existing settings API.
 *
 * The default for missing markers AND for in-place upgrades from a v0.4
 * single-edition install is `Full` — those installs already have Ollama on
 * disk, which is what Full means.
 *
 * Introduced in PatentForge merge plan Run 6.
 */

export type InstallEdition = 'Lean' | 'Full';

export const INSTALL_EDITIONS: readonly InstallEdition[] = ['Lean', 'Full'] as const;

/** Type guard: narrow `unknown` to a valid InstallEdition. */
export function isInstallEdition(value: unknown): value is InstallEdition {
  return typeof value === 'string' && (INSTALL_EDITIONS as readonly string[]).includes(value);
}

/** Default for fresh installs without a marker AND for migrations of pre-Run-6 rows. */
export const DEFAULT_INSTALL_EDITION: InstallEdition = 'Full';
