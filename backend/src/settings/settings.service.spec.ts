/**
 * Tests for SettingsService — Run 4 provider routing + encryption coverage.
 *
 * Mocks PrismaService at the appSettings.upsert/update boundary so the
 * service logic is exercised without needing a real SQLite database.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { encrypt, decrypt } from './encryption';
import { DEFAULT_PROVIDER } from './provider.types';

// Fixed test salt — deterministic encryption round-trips across tests.
const TEST_SALT = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

function buildAppSettingsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'singleton',
    provider: 'LOCAL',
    cloudApiKey: '',
    cloudDefaultModel: 'claude-haiku-4-5-20251001',
    localDefaultModel: 'gemma4:e4b',
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
    };
    odpApiUsage: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prismaMock = {
      appSettings: {
        upsert: jest.fn(),
        update: jest.fn(),
      },
      odpApiUsage: { findMany: jest.fn().mockResolvedValue([]) },
    };

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
});
