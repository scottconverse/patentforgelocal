/**
 * Tests for the cross-process marker-file helpers used by SettingsService
 * to communicate provider + install-edition state to the Go tray.
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  EDITION_MARKER_FILE,
  PROVIDER_MARKER_FILE,
  readEditionMarker,
  resolveConfigDir,
  writeProviderMarker,
} from './config-marker';

describe('config-marker', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-config-marker-'));
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  describe('resolveConfigDir', () => {
    it('prefers PATENTFORGE_CONFIG_DIR when set', () => {
      const got = resolveConfigDir({ PATENTFORGE_CONFIG_DIR: '/explicit/config' });
      expect(got).toBe('/explicit/config');
    });

    it('falls back to deriving from DATABASE_URL (file:<dataDir>/<db>.db)', () => {
      const got = resolveConfigDir({ DATABASE_URL: 'file:/srv/pf/data/patentforgelocal.db' });
      // dataDir = /srv/pf/data; up one = /srv/pf; + config = /srv/pf/config
      expect(got).toBe(path.join('/srv/pf', 'config'));
    });

    it('returns null when neither env var is set', () => {
      const got = resolveConfigDir({});
      expect(got).toBeNull();
    });

    it('returns null when DATABASE_URL is a non-file URL (Postgres etc.)', () => {
      const got = resolveConfigDir({ DATABASE_URL: 'postgresql://localhost/pf' });
      expect(got).toBeNull();
    });

    it('ignores empty PATENTFORGE_CONFIG_DIR', () => {
      const got = resolveConfigDir({
        PATENTFORGE_CONFIG_DIR: '   ',
        DATABASE_URL: 'file:/srv/pf/data/patentforgelocal.db',
      });
      expect(got).toBe(path.join('/srv/pf', 'config'));
    });
  });

  describe('readEditionMarker', () => {
    it('returns Full when configDir is null', async () => {
      const got = await readEditionMarker(null);
      expect(got).toBe('Full');
    });

    it('returns Full when edition.txt is missing', async () => {
      const got = await readEditionMarker(tmpRoot);
      expect(got).toBe('Full');
    });

    it('reads Lean content', async () => {
      await fs.writeFile(path.join(tmpRoot, EDITION_MARKER_FILE), 'Lean', 'utf-8');
      const got = await readEditionMarker(tmpRoot);
      expect(got).toBe('Lean');
    });

    it('reads Full content', async () => {
      await fs.writeFile(path.join(tmpRoot, EDITION_MARKER_FILE), 'Full', 'utf-8');
      const got = await readEditionMarker(tmpRoot);
      expect(got).toBe('Full');
    });

    it('trims whitespace and is case-insensitive', async () => {
      await fs.writeFile(path.join(tmpRoot, EDITION_MARKER_FILE), '  lean\n', 'utf-8');
      const got = await readEditionMarker(tmpRoot);
      expect(got).toBe('Lean');
    });

    it('defaults Full on invalid content', async () => {
      await fs.writeFile(path.join(tmpRoot, EDITION_MARKER_FILE), 'Maximal', 'utf-8');
      const got = await readEditionMarker(tmpRoot);
      expect(got).toBe('Full');
    });

    it('defaults Full on empty file', async () => {
      await fs.writeFile(path.join(tmpRoot, EDITION_MARKER_FILE), '', 'utf-8');
      const got = await readEditionMarker(tmpRoot);
      expect(got).toBe('Full');
    });
  });

  describe('writeProviderMarker', () => {
    it('writes LOCAL', async () => {
      const got = await writeProviderMarker('LOCAL', tmpRoot);
      expect(got).toBe(path.join(tmpRoot, PROVIDER_MARKER_FILE));
      const contents = await fs.readFile(path.join(tmpRoot, PROVIDER_MARKER_FILE), 'utf-8');
      expect(contents).toBe('LOCAL');
    });

    it('writes CLOUD', async () => {
      const got = await writeProviderMarker('CLOUD', tmpRoot);
      expect(got).toBe(path.join(tmpRoot, PROVIDER_MARKER_FILE));
      const contents = await fs.readFile(path.join(tmpRoot, PROVIDER_MARKER_FILE), 'utf-8');
      expect(contents).toBe('CLOUD');
    });

    it('returns null when configDir is null', async () => {
      const got = await writeProviderMarker('LOCAL', null);
      expect(got).toBeNull();
    });

    it('creates the configDir if missing', async () => {
      const fresh = path.join(tmpRoot, 'fresh-config');
      const got = await writeProviderMarker('LOCAL', fresh);
      expect(got).toBe(path.join(fresh, PROVIDER_MARKER_FILE));
      const contents = await fs.readFile(path.join(fresh, PROVIDER_MARKER_FILE), 'utf-8');
      expect(contents).toBe('LOCAL');
    });
  });
});
