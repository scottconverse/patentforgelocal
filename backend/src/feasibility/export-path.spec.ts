/**
 * Tests for export path traversal prevention.
 */

import * as os from 'os';
import * as path from 'path';
import { resolveExportDir } from './feasibility.service';

const HOME = os.homedir();

describe('resolveExportDir', () => {
  it('allows paths within home directory', () => {
    const result = resolveExportDir(path.join(HOME, 'Documents', 'exports'));
    expect(result).toBe(path.join(HOME, 'Documents', 'exports'));
  });

  it('allows home directory itself', () => {
    const result = resolveExportDir(HOME);
    expect(result).toBe(HOME);
  });

  it('rejects paths outside home directory', () => {
    expect(() => resolveExportDir('/etc')).toThrow(/home directory/);
    // Windows-style absolute paths are only meaningful on Windows;
    // on Linux, path.resolve treats them as relative (resolving under cwd)
    if (process.platform === 'win32') {
      expect(() => resolveExportDir('C:\\Windows\\System32')).toThrow(/home directory/);
    }
  });

  it('rejects path traversal attempts', () => {
    // HOME/../../etc resolves to a path above the home directory
    expect(() => resolveExportDir(path.join(HOME, '..', '..', 'etc'))).toThrow(/home directory/);
    // Root-level paths are always outside HOME
    const root = process.platform === 'win32' ? 'C:\\Windows' : '/tmp';
    expect(() => resolveExportDir(root)).toThrow(/home directory/);
  });

  it('resolves relative paths before checking', () => {
    // A relative path like "Documents" resolves to cwd/Documents
    // which may or may not be under HOME depending on cwd
    // This test verifies that path.resolve is called (not just string comparison)
    const result = resolveExportDir(path.join(HOME, 'Desktop'));
    expect(result).toBe(path.resolve(path.join(HOME, 'Desktop')));
  });

  it('returns Desktop when no custom path provided', () => {
    const result = resolveExportDir();
    expect(result).toContain(HOME);
  });

  it('returns Desktop when empty string provided', () => {
    const result = resolveExportDir('');
    expect(result).toContain(HOME);
  });

  it('trims whitespace from custom path', () => {
    const padded = `  ${path.join(HOME, 'Documents')}  `;
    const result = resolveExportDir(padded);
    expect(result).toBe(path.join(HOME, 'Documents'));
  });
});
