import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { encrypt, decrypt, generateSalt, DecryptionError } from './encryption';
import { DEFAULT_PROVIDER, isProvider, type Provider } from './provider.types';

const SINGLETON_ID = 'singleton';

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  private salt: string = '';
  private encryptionHealthy = true;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * On startup, ensure the encryption salt exists in the database.
   * Generate one if this is a fresh installation.
   */
  async onModuleInit() {
    const settings = await this.prisma.appSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {},
    });

    if (!settings.encryptionSalt) {
      // First run — generate and store a random salt
      this.salt = generateSalt();
      await this.prisma.appSettings.update({
        where: { id: SINGLETON_ID },
        data: { encryptionSalt: this.salt },
      });
      this.logger.log('Generated new encryption salt');
    } else {
      this.salt = settings.encryptionSalt;
    }

    // Self-test: verify encryption round-trip works on this machine.
    // If the database was copied from another machine, the machine-derived
    // key will differ and decrypt() will throw DecryptionError.
    try {
      const probe = '__patentforge_encryption_probe__';
      const encrypted = encrypt(probe, this.salt);
      const decrypted = decrypt(encrypted, this.salt);
      if (decrypted !== probe) {
        this.encryptionHealthy = false;
        this.logger.error(
          'ENCRYPTION SELF-TEST FAILED — round-trip returned wrong value. ' +
            'Re-enter your API keys in Settings.',
        );
      } else {
        this.logger.log('Encryption self-test passed');
      }
    } catch (err) {
      this.encryptionHealthy = false;
      if (err instanceof DecryptionError) {
        this.logger.error(
          'ENCRYPTION SELF-TEST FAILED — ' + err.message + ' Re-enter your API keys in Settings.',
        );
      } else {
        this.logger.error('ENCRYPTION SELF-TEST FAILED — unexpected error: ' + String(err));
      }
    }
  }

  /**
   * Get settings with API keys decrypted for use.
   *
   * Returns plaintext API keys (cloudApiKey, usptoApiKey) — same pattern used
   * pre-Run-4 for usptoApiKey. The frontend Settings page renders them masked
   * for display; the unmasked value flows back on save to support edit-in-place.
   */
  async getSettings() {
    const raw = await this.prisma.appSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {},
    });

    let cloudApiKey = '';
    let usptoApiKey = '';
    try {
      cloudApiKey = decrypt(raw.cloudApiKey, this.salt);
      usptoApiKey = decrypt(raw.usptoApiKey, this.salt);
    } catch (err) {
      if (err instanceof DecryptionError) {
        this.encryptionHealthy = false;
        this.logger.warn('Could not decrypt API keys — re-enter them in Settings.');
      } else {
        throw err;
      }
    }

    // Defensive: provider in DB should already be 'LOCAL' or 'CLOUD' thanks to
    // the CHECK constraint and the migration backfill, but if a hand-edited
    // row sneaks through, fall back to the default rather than expose garbage.
    const provider: Provider = isProvider(raw.provider) ? raw.provider : DEFAULT_PROVIDER;

    return {
      ...raw,
      provider,
      cloudApiKey,
      usptoApiKey,
      encryptionHealthy: this.encryptionHealthy,
    };
  }

  /**
   * Update settings, encrypting API keys before storage.
   */
  async updateSettings(dto: UpdateSettingsDto) {
    const data: Record<string, unknown> = {};

    // ── Provider routing fields ────────────────────────────────────────────
    if (dto.provider !== undefined) {
      // The DTO validator (@IsIn(PROVIDERS)) already rejected bad values,
      // but defense-in-depth — the runtime type guard catches a path that
      // somehow skipped class-validator (e.g. a direct service call).
      if (!isProvider(dto.provider)) {
        throw new Error(`Invalid provider: ${String(dto.provider)}`);
      }
      data.provider = dto.provider;
    }
    if (dto.cloudApiKey !== undefined) data.cloudApiKey = encrypt(dto.cloudApiKey, this.salt);
    if (dto.cloudDefaultModel !== undefined) data.cloudDefaultModel = dto.cloudDefaultModel;
    if (dto.localDefaultModel !== undefined) data.localDefaultModel = dto.localDefaultModel;

    // ── Legacy / general fields ────────────────────────────────────────────
    if (dto.ollamaApiKey !== undefined) {
      // Deprecated in Run 4 — Ollama doesn't authenticate; the column was
      // dropped from AppSettings. Older clients may still send this; log
      // and ignore. Removing the field entirely from the DTO would break
      // those clients with a 400 instead of letting them through.
      this.logger.warn(
        'updateSettings received deprecated `ollamaApiKey` field — Ollama does not authenticate; value ignored. Update your client to drop this field.',
      );
    }
    if (dto.defaultModel !== undefined) data.defaultModel = dto.defaultModel;
    if (dto.researchModel !== undefined) data.researchModel = dto.researchModel;
    if (dto.maxTokens !== undefined) data.maxTokens = dto.maxTokens;
    if (dto.interStageDelaySeconds !== undefined) data.interStageDelaySeconds = dto.interStageDelaySeconds;
    if (dto.exportPath !== undefined) data.exportPath = dto.exportPath;
    if (dto.autoExport !== undefined) data.autoExport = dto.autoExport;
    if (dto.ollamaModel !== undefined) data.ollamaModel = dto.ollamaModel;
    if (dto.ollamaUrl !== undefined) data.ollamaUrl = dto.ollamaUrl;
    if (dto.modelReady !== undefined) data.modelReady = dto.modelReady;
    if (dto.usptoApiKey !== undefined) data.usptoApiKey = encrypt(dto.usptoApiKey, this.salt);

    const raw = await this.prisma.appSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: data,
    });

    // After a successful update, encryption should be healthy (new keys just encrypted)
    this.encryptionHealthy = true;

    let cloudApiKey = '';
    let usptoApiKey = '';
    try {
      cloudApiKey = decrypt(raw.cloudApiKey, this.salt);
      usptoApiKey = decrypt(raw.usptoApiKey, this.salt);
    } catch (err) {
      if (err instanceof DecryptionError) {
        this.encryptionHealthy = false;
      } else {
        throw err;
      }
    }

    const provider: Provider = isProvider(raw.provider) ? raw.provider : DEFAULT_PROVIDER;

    return {
      ...raw,
      provider,
      cloudApiKey,
      usptoApiKey,
      encryptionHealthy: this.encryptionHealthy,
    };
  }

  /**
   * Validate Ollama connectivity by checking the /api/tags endpoint.
   * Returns valid: true if Ollama is reachable and has at least one model.
   */
  async validateOllamaConnection(ollamaUrl: string): Promise<{ valid: boolean; error?: string; models?: string[] }> {
    const baseUrl = ollamaUrl || 'http://127.0.0.1:11434';
    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        return { valid: false, error: `Ollama returned HTTP ${response.status}. Is Ollama running at ${baseUrl}?` };
      }

      const data = (await response.json()) as { models?: Array<{ name: string }> };
      const models = data.models?.map((m) => m.name) ?? [];
      if (models.length === 0) {
        return { valid: false, error: 'Ollama is running but has no models installed. Run: ollama pull gemma4:e4b', models: [] };
      }
      return { valid: true, models };
    } catch {
      return { valid: false, error: `Could not reach Ollama at ${baseUrl}. Make sure Ollama is running.` };
    }
  }

  /**
   * Get ODP API usage summary for the last 7 days.
   */
  async getOdpUsageSummary() {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const usage = await this.prisma.odpApiUsage.findMany({
      where: { calledAt: { gte: weekAgo } },
      orderBy: { calledAt: 'desc' },
    });

    const totalQueries = usage.reduce((s, u) => s + u.queriesAttempted, 0);
    const totalResults = usage.reduce((s, u) => s + u.resultsFound, 0);
    const rateLimitHits = usage.filter((u) => u.hadRateLimit).length;
    const errorCount = usage.filter((u) => u.hadError).length;
    const lastUsed = usage.length > 0 ? usage[0].calledAt : null;

    return {
      thisWeek: {
        totalQueries,
        totalResults,
        rateLimitHits,
        errorCount,
        callCount: usage.length,
      },
      lastUsed,
      weeklyLimits: {
        patentFileWrapperDocs: 1_200_000,
        metadataRetrievals: 5_000_000,
      },
    };
  }
}
