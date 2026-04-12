/**
 * Symmetric encryption for API keys stored in the local database.
 *
 * Uses AES-256-GCM with a machine-derived key. The PBKDF2 salt is stored
 * in the AppSettings table so it travels with the database — backup/restore
 * and machine migration preserve the ability to decrypt.
 *
 * NOT a substitute for a real secrets manager in production.
 * Appropriate for a self-hosted single-user tool.
 */

import * as crypto from 'crypto';
import * as os from 'os';

/** Thrown when decryption fails on data that IS encrypted (not plaintext migration). */
export class DecryptionError extends Error {
  constructor(message = 'Decryption failed — the encryption key has changed (e.g. database moved to a different machine).') {
    super(message);
    this.name = 'DecryptionError';
  }
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/** Derive a 256-bit encryption key from machine-specific values + salt. */
function deriveKey(salt: string): Buffer {
  const material = `${os.hostname()}:${os.platform()}:${os.userInfo().username}`;
  return crypto.pbkdf2Sync(material, salt, 100_000, 32, 'sha256');
}

/** Generate a new random salt (64 hex chars = 32 bytes). */
export function generateSalt(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Encrypt a plaintext string with the given salt.
 * Returns a hex-encoded string: iv(24) + tag(32) + ciphertext(variable).
 * Returns empty string for empty/null input.
 */
export function encrypt(plaintext: string, salt: string): string {
  if (!plaintext) return '';

  const key = deriveKey(salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return iv.toString('hex') + tag.toString('hex') + encrypted.toString('hex');
}

/**
 * Decrypt a hex-encoded ciphertext with the given salt.
 * Returns the original plaintext string.
 * Returns empty string for empty input.
 * Returns the input unchanged if it doesn't look encrypted (migration support).
 */
export function decrypt(ciphertext: string, salt: string): string {
  if (!ciphertext) return '';

  const minLen = (IV_LENGTH + TAG_LENGTH) * 2 + 2;
  if (ciphertext.length < minLen || !/^[0-9a-f]+$/i.test(ciphertext)) {
    // Not encrypted — return as-is (supports migration from plaintext)
    return ciphertext;
  }

  try {
    const key = deriveKey(salt);
    const iv = Buffer.from(ciphertext.slice(0, IV_LENGTH * 2), 'hex');
    const tag = Buffer.from(ciphertext.slice(IV_LENGTH * 2, (IV_LENGTH + TAG_LENGTH) * 2), 'hex');
    const data = Buffer.from(ciphertext.slice((IV_LENGTH + TAG_LENGTH) * 2), 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data) + decipher.final('utf-8');
  } catch {
    // The value passed the hex/length check (so it IS encrypted), but decryption
    // failed. This means the machine-derived key changed — e.g. the database was
    // moved to a different machine. Throw a specific error so callers can handle
    // this gracefully instead of silently returning ciphertext as the "API key."
    throw new DecryptionError();
  }
}

/**
 * Check if a string appears to be an encrypted value.
 */
export function isEncrypted(value: string): boolean {
  const minLen = (IV_LENGTH + TAG_LENGTH) * 2 + 2;
  return value.length >= minLen && /^[0-9a-f]+$/i.test(value);
}
