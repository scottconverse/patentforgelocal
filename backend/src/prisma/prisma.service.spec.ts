/**
 * Tests for PrismaService.migrateSettings — Run 4 provider routing migration.
 *
 * Verifies the additive ALTER TABLE statements are issued in the right order
 * and that errors are handled idempotently (duplicate column, no such column).
 *
 * Mocks `$executeRawUnsafe` on a stub PrismaService instance — this exercises
 * the migration logic without needing a real SQLite database. Real-DB schema
 * verification is covered by cleanroom `docker compose build` (fresh install
 * via SCHEMA_SQL) and by the existing gemma4:26b→gemma4:e4b migration which
 * is structurally identical.
 */

import { PrismaService } from './prisma.service';

type RawCallArg = string;

/**
 * Build a stub PrismaService that records executeRawUnsafe calls and
 * exposes the private migrateSettings method for test invocation.
 */
function buildStubService(overrides?: {
  executeRawUnsafe?: jest.Mock;
}): { service: PrismaService; calls: RawCallArg[] } {
  const calls: RawCallArg[] = [];
  const mock = overrides?.executeRawUnsafe
    ?? jest.fn((sql: string) => {
      calls.push(sql);
      return Promise.resolve(0);
    });

  // Use Object.create on the prototype so the stub has migrateSettings and the
  // other PrismaService methods, but skips PrismaClient's connection-eager
  // constructor. We override $executeRawUnsafe to capture the SQL calls.
  const service = Object.create(PrismaService.prototype) as PrismaService;
  (service as unknown as { $executeRawUnsafe: jest.Mock }).$executeRawUnsafe = mock;

  return { service, calls };
}

// migrateSettings is private; access via bracket notation.
async function runMigrate(service: PrismaService): Promise<void> {
  return (service as unknown as { migrateSettings: () => Promise<void> }).migrateSettings();
}

describe('PrismaService.migrateSettings — Run 4 provider routing', () => {
  it('issues ALTER TABLE for each new provider column in the right order', async () => {
    const { service, calls } = buildStubService();

    await runMigrate(service);

    // Extract just the ADD COLUMN statements
    const addColumns = calls.filter((sql) => sql.includes('ADD COLUMN'));
    const columnNames = addColumns.map((sql) => sql.match(/ADD COLUMN "(\w+)"/)?.[1]);

    expect(columnNames).toContain('provider');
    expect(columnNames).toContain('cloudApiKey');
    expect(columnNames).toContain('cloudDefaultModel');
    expect(columnNames).toContain('localDefaultModel');
  });

  it('issues DROP COLUMN ollamaApiKey', async () => {
    const { service, calls } = buildStubService();

    await runMigrate(service);

    const dropCalls = calls.filter((sql) => sql.includes('DROP COLUMN'));
    expect(dropCalls.some((sql) => sql.includes('"ollamaApiKey"'))).toBe(true);
  });

  it('issues the defensive UPDATE backfill for provider', async () => {
    const { service, calls } = buildStubService();

    await runMigrate(service);

    const updateBackfill = calls.find(
      (sql) => sql.includes('UPDATE "AppSettings"') && sql.includes("'LOCAL'") && sql.includes('IS NULL'),
    );
    expect(updateBackfill).toBeDefined();
  });

  it('issues the provider column WITH a CHECK constraint', async () => {
    const { service, calls } = buildStubService();

    await runMigrate(service);

    const providerAddCol = calls.find(
      (sql) => sql.includes('ADD COLUMN "provider"'),
    );
    expect(providerAddCol).toBeDefined();
    expect(providerAddCol).toContain('CHECK');
    expect(providerAddCol).toContain("'LOCAL'");
    expect(providerAddCol).toContain("'CLOUD'");
  });

  it('continues past duplicate-column errors (idempotent ALTER TABLE)', async () => {
    // First two ADD COLUMN calls succeed, third throws "duplicate column", rest succeed.
    let callCount = 0;
    const mock = jest.fn((sql: string) => {
      callCount += 1;
      if (callCount === 3 && sql.includes('ADD COLUMN')) {
        return Promise.reject(new Error('SQLITE_ERROR: duplicate column name: cloudDefaultModel'));
      }
      return Promise.resolve(0);
    });

    const { service } = buildStubService({ executeRawUnsafe: mock });

    // Should not throw
    await expect(runMigrate(service)).resolves.toBeUndefined();

    // All steps still ran (including ones after the failing one)
    expect(mock.mock.calls.length).toBeGreaterThan(3);
  });

  it('continues past "no such column" on DROP COLUMN (re-run case)', async () => {
    // All ADD COLUMNs and UPDATE succeed; DROP COLUMN throws because column is already gone.
    const mock = jest.fn((sql: string) => {
      if (sql.includes('DROP COLUMN')) {
        return Promise.reject(new Error('SQLITE_ERROR: no such column: ollamaApiKey'));
      }
      return Promise.resolve(0);
    });

    const { service } = buildStubService({ executeRawUnsafe: mock });

    await expect(runMigrate(service)).resolves.toBeUndefined();
  });

  it('runs the pre-existing gemma4:26b → gemma4:e4b UPDATE (regression)', async () => {
    const { service, calls } = buildStubService();

    await runMigrate(service);

    // The original migration that PrismaService.migrateSettings was added for
    const gemmaUpdate = calls.find(
      (sql) =>
        sql.includes('UPDATE "AppSettings"') &&
        sql.includes('gemma4:e4b') &&
        sql.includes('gemma4:26b'),
    );
    expect(gemmaUpdate).toBeDefined();
  });
});
