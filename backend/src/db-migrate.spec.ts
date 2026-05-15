/**
 * Tests for the silent DB-file rename hook.
 * Pure-function tests against `planDbMigration` (the testable core) plus
 * a small set of `migrateDbFileIfNeeded` integration tests against a temp dir.
 */

import { promises as fs, existsSync } from 'fs';
import * as os from 'os';
import * as path from 'path';

import { planDbMigration, migrateDbFileIfNeeded } from './db-migrate';

describe('planDbMigration', () => {
  it('returns skip for missing DATABASE_URL', () => {
    const got = planDbMigration(undefined);
    expect(got.renamed).toBe(false);
    expect(got.note).toContain('non-file');
  });

  it('returns skip for Postgres-style DATABASE_URL', () => {
    const got = planDbMigration('postgresql://user:pass@host/db');
    expect(got.renamed).toBe(false);
    expect(got.note).toContain('non-file');
    expect(got.url).toBe('postgresql://user:pass@host/db');
  });

  it('returns no-op when URL already points at patentforge.db', () => {
    const got = planDbMigration('file:/srv/pf/data/patentforge.db');
    expect(got.renamed).toBe(false);
    expect(got.url).toBe('file:/srv/pf/data/patentforge.db');
    expect(got.note).toContain('already');
  });

  it('returns no-op for an unrecognized filename', () => {
    const got = planDbMigration('file:/srv/pf/data/custom.db');
    expect(got.renamed).toBe(false);
    expect(got.url).toBe('file:/srv/pf/data/custom.db');
    expect(got.note).toContain('unrecognized');
  });

  it('plans a rename when old exists and new does not', () => {
    const got = planDbMigration('file:/srv/pf/data/patentforgelocal.db', (p) => p === '/srv/pf/data/patentforgelocal.db');
    expect(got.renamed).toBe(true);
    expect(got.url).toBe('file:' + path.join('/srv/pf/data', 'patentforge.db'));
    expect(got.note).toContain('rename');
  });

  it('skips rename when new file already exists (prefer the new one)', () => {
    const got = planDbMigration(
      'file:/srv/pf/data/patentforgelocal.db',
      (p) => p === '/srv/pf/data/patentforgelocal.db' || p === path.join('/srv/pf/data', 'patentforge.db'),
    );
    expect(got.renamed).toBe(false);
    expect(got.url).toBe('file:' + path.join('/srv/pf/data', 'patentforge.db'));
    expect(got.note).toContain('already present');
  });

  it('points at the new name for a fresh install (neither file exists)', () => {
    const got = planDbMigration('file:/srv/pf/data/patentforgelocal.db', () => false);
    expect(got.renamed).toBe(false);
    expect(got.url).toBe('file:' + path.join('/srv/pf/data', 'patentforge.db'));
    expect(got.note).toContain('fresh install');
  });
});

describe('migrateDbFileIfNeeded (integration)', () => {
  let tmpRoot: string;
  const originalUrl = process.env.DATABASE_URL;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-db-migrate-'));
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
    if (originalUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalUrl;
    }
  });

  it('renames patentforgelocal.db → patentforge.db and updates DATABASE_URL', async () => {
    const oldPath = path.join(tmpRoot, 'patentforgelocal.db');
    await fs.writeFile(oldPath, 'pretend SQLite bytes');
    process.env.DATABASE_URL = `file:${oldPath}`;

    const plan = migrateDbFileIfNeeded();

    expect(plan.renamed).toBe(true);
    expect(existsSync(oldPath)).toBe(false);
    expect(existsSync(path.join(tmpRoot, 'patentforge.db'))).toBe(true);
    expect(process.env.DATABASE_URL).toBe(`file:${path.join(tmpRoot, 'patentforge.db')}`);
  });

  it('leaves things alone when patentforge.db already exists', async () => {
    const oldPath = path.join(tmpRoot, 'patentforgelocal.db');
    const newPath = path.join(tmpRoot, 'patentforge.db');
    await fs.writeFile(oldPath, 'old');
    await fs.writeFile(newPath, 'new');
    process.env.DATABASE_URL = `file:${oldPath}`;

    const plan = migrateDbFileIfNeeded();

    expect(plan.renamed).toBe(false);
    expect(existsSync(oldPath)).toBe(true);
    expect(existsSync(newPath)).toBe(true);
    // Both still exist; old retained as a safety net. DATABASE_URL points at new.
    expect(process.env.DATABASE_URL).toBe(`file:${newPath}`);
  });

  it('updates DATABASE_URL to new name even on a fresh install', () => {
    const oldPath = path.join(tmpRoot, 'patentforgelocal.db');
    process.env.DATABASE_URL = `file:${oldPath}`;

    const plan = migrateDbFileIfNeeded();

    expect(plan.renamed).toBe(false);
    expect(plan.note).toContain('fresh install');
    expect(process.env.DATABASE_URL).toBe(`file:${path.join(tmpRoot, 'patentforge.db')}`);
  });

  it('is a no-op for non-file DATABASE_URL', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/pf';
    const plan = migrateDbFileIfNeeded();
    expect(plan.renamed).toBe(false);
    expect(process.env.DATABASE_URL).toBe('postgresql://localhost/pf');
  });
});
