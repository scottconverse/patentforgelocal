/**
 * Tests for SettingsService — Run 4 provider routing + encryption coverage.
 *
 * Mocks PrismaService at the appSettings.upsert/update boundary so the
 * service logic is exercised without needing a real SQLite database.
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { encrypt, decrypt } from './encryption';
import { DEFAULT_PROVIDER } from './provider.types';
import { EDITION_MARKER_FILE, PROVIDER_MARKER_FILE } from './config-marker';

// Fixed test salt — deterministic encryption round-trips across tests.
const TEST_SALT = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

function buildAppSettingsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'singleton',
    provider: 'LOCAL',
    cloudApiKey: '',
    cloudDefaultModel: 'claude-haiku-4-5-20251001',
    localDefaultModel: 'gemma4:e4b',
    installEdition: 'Full',
    ollamaModel: 'gemma4:e4b',
    ollamaUrl: 'http://localhost:11434',
    modelReady: false,
    defaultModel: 'gemma4:e4b',
    researchModel: '',
    maxTokens: 32000,
    interStageDelaySeconds: 5,
    exportPath: '',
    autoExport: true,
    usptoApiKey: '',
    encryptionSalt: TEST_SALT,
    ...overrides,
  };
}

describe('SettingsService — Run 4 provider routing', () => {
  let service: SettingsService;
  let prismaMock: {
    appSettings: {
      upsert: jest.Mock;
      update: jest.Mock;
      findUnique: jest.Mock;
    };
    odpApiUsage: { findMany: jest.Mock };
  };
  const originalConfigDir = process.env.PATENTFORGE_CONFIG_DIR;

  beforeEach(async () => {
    prismaMock = {
      appSettings: {
        upsert: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      odpApiUsage: { findMany: jest.fn().mockResolvedValue([]) },
    };

    // Default: no PATENTFORGE_CONFIG_DIR. Tests that need marker writes set it.
    delete process.env.PATENTFORGE_CONFIG_DIR;
    delete process.env.DATABASE_URL;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);

    // Stub the salt so encryption works without invoking onModuleInit's DB calls.
    (service as unknown as { salt: string }).salt = TEST_SALT;
  });

  afterEach(() => {
    if (originalConfigDir === undefined) {
      delete process.env.PATENTFORGE_CONFIG_DIR;
    } else {
      process.env.PATENTFORGE_CONFIG_DIR = originalConfigDir;
    }
  });

  // ── getSettings ───────────────────────────────────────────────────────────

  describe('getSettings', () => {
    it('returns provider=LOCAL and decrypted empty api keys on fresh install', async () => {
      prismaMock.appSettings.upsert.mockResolvedValue(buildAppSettingsRow());

      const result = await service.getSettings();

      expect(result.provider).toBe('LOCAL');
      expect(result.cloudApiKey).toBe('');
      expect(result.cloudDefaultModel).toBe('claude-haiku-4-5-20251001');
      expect(result.localDefaultModel).toBe('gemma4:e4b');
      expect(result.encryptionHealthy).toBe(true);
    });

    it('decrypts cloudApiKey from ciphertext at rest', async () => {
      const plaintext = 'sk-ant-test-key-abc123';
      const ciphertext = encrypt(plaintext, TEST_SALT);
      prismaMock.appSettings.upsert.mockResolvedValue(
        buildAppSettingsRow({ provider: 'CLOUD', cloudApiKey: ciphertext }),
      );

      const result = await service.getSettings();

      expect(result.provider).toBe('CLOUD');
      expect(result.cloudApiKey).toBe(plaintext);
    });

    it('defends against garbage provider values from a hand-edited DB row', async () => {
      prismaMock.appSettings.upsert.mockResolvedValue(
        buildAppSettingsRow({ provider: 'XYZ_BOGUS' }),
      );

      const result = await service.getSettings();

      expect(result.provider).toBe(DEFAULT_PROVIDER);
      expect(result.provider).toBe('LOCAL');
    });
  });

  // ── updateSettings ────────────────────────────────────────────────────────

  describe('updateSettings', () => {
    it('encrypts cloudApiKey before persistence', async () => {
      const plaintext = 'sk-ant-secret-xyz789';

      // Capture the data passed to upsert
      let capturedData: Record<string, unknown> | undefined;
      prismaMock.appSettings.upsert.mockImplementation((args: any) => {
        capturedData = args.update;
        const stored = capturedData?.cloudApiKey as string;
        return Promise.resolve(
          buildAppSettingsRow({ provider: 'CLOUD', cloudApiKey: stored ?? '' }),
        );
      });

      await service.updateSettings({ provider: 'CLOUD', cloudApiKey: plaintext });

      expect(capturedData).toBeDefined();
      // Ciphertext is NOT the plaintext value
      expect(capturedData!.cloudApiKey).not.toBe(plaintext);
      // Ciphertext round-trips via decrypt
      expect(decrypt(capturedData!.cloudApiKey as string, TEST_SALT)).toBe(plaintext);
    });

    it('returns the decrypted cloudApiKey in the response after writing', async () => {
      const plaintext = 'sk-ant-roundtrip-test';

      prismaMock.appSettings.upsert.mockImplementation((args: any) => {
        const stored = args.update.cloudApiKey;
        return Promise.resolve(
          buildAppSettingsRow({ provider: 'CLOUD', cloudApiKey: stored }),
        );
      });

      const result = await service.updateSettings({
        provider: 'CLOUD',
        cloudApiKey: plaintext,
      });

      expect(result.cloudApiKey).toBe(plaintext);
      expect(result.provider).toBe('CLOUD');
    });

    it('persists provider value', async () => {
      let capturedData: Record<string, unknown> | undefined;
      prismaMock.appSettings.upsert.mockImplementation((args: any) => {
        capturedData = args.update;
        return Promise.resolve(buildAppSettingsRow({ provider: 'CLOUD' }));
      });

      await service.updateSettings({ provider: 'CLOUD' });

      expect(capturedData!.provider).toBe('CLOUD');
    });

    it('persists cloudDefaultModel and localDefaultModel independently', async () => {
      let capturedData: Record<string, unknown> | undefined;
      prismaMock.appSettings.upsert.mockImplementation((args: any) => {
        capturedData = args.update;
        return Promise.resolve(buildAppSettingsRow({
          cloudDefaultModel: 'claude-opus-4-5-test',
          localDefaultModel: 'gemma4:custom',
        }));
      });

      await service.updateSettings({
        cloudDefaultModel: 'claude-opus-4-5-test',
        localDefaultModel: 'gemma4:custom',
      });

      expect(capturedData!.cloudDefaultModel).toBe('claude-opus-4-5-test');
      expect(capturedData!.localDefaultModel).toBe('gemma4:custom');
    });

    it('rejects unknown provider via runtime isProvider() guard', async () => {
      // The DTO @IsIn validator would normally reject this at the HTTP boundary,
      // but a non-HTTP call path (e.g. another service calling updateSettings
      // directly) bypasses that. The runtime guard catches it.
      await expect(
        service.updateSettings({ provider: 'GARBAGE' as unknown as 'LOCAL' | 'CLOUD' }),
      ).rejects.toThrow(/Invalid provider/);
    });

    it('silently ignores deprecated ollamaApiKey field (back-compat for one cycle)', async () => {
      let capturedData: Record<string, unknown> | undefined;
      prismaMock.appSettings.upsert.mockImplementation((args: any) => {
        capturedData = args.update;
        return Promise.resolve(buildAppSettingsRow());
      });

      const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();

      await service.updateSettings({ ollamaApiKey: 'should-be-ignored' });

      // Persistence layer never sees ollamaApiKey (it was dropped in Run 4 migration)
      expect(capturedData).not.toHaveProperty('ollamaApiKey');
      // Deprecation warning was logged
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/deprecated `ollamaApiKey`/),
      );

      warnSpy.mockRestore();
    });

    it('persists usptoApiKey encrypted (existing behavior preserved)', async () => {
      const plaintext = 'uspto-key-test-456';
      let capturedData: Record<string, unknown> | undefined;
      prismaMock.appSettings.upsert.mockImplementation((args: any) => {
        capturedData = args.update;
        return Promise.resolve(
          buildAppSettingsRow({ usptoApiKey: capturedData?.usptoApiKey as string }),
        );
      });

      await service.updateSettings({ usptoApiKey: plaintext });

      expect(capturedData!.usptoApiKey).not.toBe(plaintext);
      expect(decrypt(capturedData!.usptoApiKey as string, TEST_SALT)).toBe(plaintext);
    });
  });

  // ── Run 6: installEdition + cross-process marker file mirroring ────────────

  describe('installEdition exposure (Run 6)', () => {
    it('returns installEdition=Full by default from getSettings', async () => {
      prismaMock.appSettings.upsert.mockResolvedValue(buildAppSettingsRow());

      const result = await service.getSettings();

      expect(result.installEdition).toBe('Full');
    });

    it('returns installEdition=Lean when the DB row says Lean', async () => {
      prismaMock.appSettings.upsert.mockResolvedValue(buildAppSettingsRow({ installEdition: 'Lean' }));

      const result = await service.getSettings();

      expect(result.installEdition).toBe('Lean');
    });

    it('defends against garbage installEdition values from a hand-edited DB row', async () => {
      prismaMock.appSettings.upsert.mockResolvedValue(
        buildAppSettingsRow({ installEdition: 'Maximal' }),
      );

      const result = await service.getSettings();

      expect(result.installEdition).toBe('Full');
    });
  });

  describe('updateSettings writes provider marker file (Run 6)', () => {
    let tmpConfig: string;

    beforeEach(async () => {
      tmpConfig = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-settings-svc-'));
      process.env.PATENTFORGE_CONFIG_DIR = tmpConfig;
    });

    afterEach(async () => {
      await fs.rm(tmpConfig, { recursive: true, force: true });
    });

    it('writes provider.txt = CLOUD when dto.provider=CLOUD', async () => {
      prismaMock.appSettings.upsert.mockResolvedValue(
        buildAppSettingsRow({ provider: 'CLOUD' }),
      );

      await service.updateSettings({ provider: 'CLOUD' });

      const written = await fs.readFile(path.join(tmpConfig, PROVIDER_MARKER_FILE), 'utf-8');
      expect(written).toBe('CLOUD');
    });

    it('writes provider.txt = LOCAL when dto.provider=LOCAL', async () => {
      prismaMock.appSettings.upsert.mockResolvedValue(buildAppSettingsRow());

      await service.updateSettings({ provider: 'LOCAL' });

      const written = await fs.readFile(path.join(tmpConfig, PROVIDER_MARKER_FILE), 'utf-8');
      expect(written).toBe('LOCAL');
    });

    it('does NOT write marker when provider is not in the DTO', async () => {
      prismaMock.appSettings.upsert.mockResolvedValue(buildAppSettingsRow());

      await service.updateSettings({ maxTokens: 12000 });

      await expect(fs.access(path.join(tmpConfig, PROVIDER_MARKER_FILE))).rejects.toThrow();
    });
  });

  describe('syncInstallEdition (Run 6)', () => {
    let tmpConfig: string;

    beforeEach(async () => {
      tmpConfig = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-sync-edition-'));
      process.env.PATENTFORGE_CONFIG_DIR = tmpConfig;
    });

    afterEach(async () => {
      await fs.rm(tmpConfig, { recursive: true, force: true });
    });

    async function callSync() {
      const fn = (service as unknown as { syncInstallEdition: () => Promise<void> }).syncInstallEdition.bind(service);
      await fn();
    }

    it('updates AppSettings.installEdition when marker disagrees with DB', async () => {
      await fs.writeFile(path.join(tmpConfig, EDITION_MARKER_FILE), 'Lean', 'utf-8');
      prismaMock.appSettings.findUnique.mockResolvedValue(
        buildAppSettingsRow({ installEdition: 'Full' }),
      );

      await callSync();

      expect(prismaMock.appSettings.update).toHaveBeenCalledWith({
        where: { id: 'singleton' },
        data: { installEdition: 'Lean' },
      });
    });

    it('does NOT update when marker matches DB (idempotent)', async () => {
      await fs.writeFile(path.join(tmpConfig, EDITION_MARKER_FILE), 'Full', 'utf-8');
      prismaMock.appSettings.findUnique.mockResolvedValue(
        buildAppSettingsRow({ installEdition: 'Full' }),
      );

      await callSync();

      expect(prismaMock.appSettings.update).not.toHaveBeenCalled();
    });

    it('defaults to Full when marker is missing AND updates only if DB disagrees', async () => {
      // No edition.txt written
      prismaMock.appSettings.findUnique.mockResolvedValue(
        buildAppSettingsRow({ installEdition: 'Lean' }),
      );

      await callSync();

      // Marker says default Full; DB says Lean → DB updated to Full
      expect(prismaMock.appSettings.update).toHaveBeenCalledWith({
        where: { id: 'singleton' },
        data: { installEdition: 'Full' },
      });
    });

    it('treats hand-edited garbage installEdition as the default', async () => {
      await fs.writeFile(path.join(tmpConfig, EDITION_MARKER_FILE), 'Full', 'utf-8');
      prismaMock.appSettings.findUnique.mockResolvedValue(
        buildAppSettingsRow({ installEdition: 'Maximal' }),
      );

      await callSync();

      // DB had garbage → treated as Full → marker also Full → no update needed
      expect(prismaMock.appSettings.update).not.toHaveBeenCalled();
    });
  });
});
