import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { encrypt, decrypt, generateSalt, DecryptionError } from './encryption';

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
   */
  async getSettings() {
    const raw = await this.prisma.appSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {},
    });

    let anthropicApiKey = '';
    let usptoApiKey = '';
    try {
      anthropicApiKey = decrypt(raw.anthropicApiKey, this.salt);
      usptoApiKey = decrypt(raw.usptoApiKey, this.salt);
    } catch (err) {
      if (err instanceof DecryptionError) {
        this.encryptionHealthy = false;
        this.logger.warn('Could not decrypt API keys — re-enter them in Settings.');
      } else {
        throw err;
      }
    }

    return {
      ...raw,
      anthropicApiKey,
      usptoApiKey,
      encryptionHealthy: this.encryptionHealthy,
    };
  }

  /**
   * Update settings, encrypting API keys before storage.
   */
  async updateSettings(dto: UpdateSettingsDto) {
    const data: Record<string, unknown> = {};
    if (dto.anthropicApiKey !== undefined) data.anthropicApiKey = encrypt(dto.anthropicApiKey, this.salt);
    if (dto.defaultModel !== undefined) data.defaultModel = dto.defaultModel;
    if (dto.researchModel !== undefined) data.researchModel = dto.researchModel;
    if (dto.maxTokens !== undefined) data.maxTokens = dto.maxTokens;
    if (dto.interStageDelaySeconds !== undefined) data.interStageDelaySeconds = dto.interStageDelaySeconds;
    if (dto.exportPath !== undefined) data.exportPath = dto.exportPath;
    if (dto.autoExport !== undefined) data.autoExport = dto.autoExport;
    if (dto.costCapUsd !== undefined) data.costCapUsd = dto.costCapUsd;
    if (dto.usptoApiKey !== undefined) data.usptoApiKey = encrypt(dto.usptoApiKey, this.salt);

    const raw = await this.prisma.appSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: data,
    });

    // After a successful update, encryption should be healthy (new keys just encrypted)
    this.encryptionHealthy = true;

    let anthropicApiKey = '';
    let usptoApiKey = '';
    try {
      anthropicApiKey = decrypt(raw.anthropicApiKey, this.salt);
      usptoApiKey = decrypt(raw.usptoApiKey, this.salt);
    } catch (err) {
      if (err instanceof DecryptionError) {
        this.encryptionHealthy = false;
      } else {
        throw err;
      }
    }

    return {
      ...raw,
      anthropicApiKey,
      usptoApiKey,
      encryptionHealthy: this.encryptionHealthy,
    };
  }

  /**
   * Validate an Anthropic API key by making a minimal request server-side.
   * This keeps the key out of the browser — it only travels from browser to
   * our backend, never directly to Anthropic from the client.
   */
  async validateApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });

      if (response.ok) {
        return { valid: true };
      } else if (response.status === 401) {
        return { valid: false, error: 'Invalid API key. Please check the key and try again.' };
      } else if (response.status === 403) {
        return { valid: false, error: 'API key does not have permission. Check your Anthropic account.' };
      } else {
        // Parse the Anthropic error body for actionable messages (billing, rate limit, etc.)
        try {
          const body = await response.json() as { error?: { message?: string } };
          const msg = body?.error?.message ?? '';
          if (msg.includes('credit balance')) {
            return { valid: false, error: 'API key is valid but your Anthropic account has no credits. Add credits at console.anthropic.com.' };
          }
          if (msg.includes('rate limit') || response.status === 429) {
            return { valid: false, error: 'Rate limited by Anthropic. Wait a moment and try again.' };
          }
          if (msg) {
            return { valid: false, error: `Anthropic error: ${msg}` };
          }
        } catch {
          // Response body wasn't JSON — fall through to generic
        }
        return { valid: false, error: `Unexpected error (${response.status}). Try again later.` };
      }
    } catch {
      return { valid: false, error: 'Could not reach the Anthropic API. Check your internet connection.' };
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
