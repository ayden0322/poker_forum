import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      '[crypto] ENCRYPTION_KEY 環境變數未設定。請用 `openssl rand -hex 32` 產生 64 字元 hex 金鑰',
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      '[crypto] ENCRYPTION_KEY 必須是 64 字元的 hex 字串（32 bytes），請用 `openssl rand -hex 32` 重新產生',
    );
  }

  cachedKey = Buffer.from(raw, 'hex');
  return cachedKey;
}

export function assertEncryptionKey(): void {
  getKey();
}

export function encrypt(plaintext: string): string {
  if (plaintext == null) return plaintext as unknown as string;
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decrypt(payload: string): string {
  if (payload == null) return payload as unknown as string;
  const key = getKey();
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function maskSecret(value: string | null | undefined, visible = 4): string {
  if (!value) return '';
  if (value.length <= visible) return '*'.repeat(value.length);
  return '*'.repeat(Math.max(8, value.length - visible)) + value.slice(-visible);
}

export function hashOtp(code: string, userId: string): string {
  const salt = scryptSync(userId, 'phone-otp-salt', 16);
  return scryptSync(code, salt, 32).toString('hex');
}

export function verifyOtp(code: string, hash: string, userId: string): boolean {
  return hashOtp(code, userId) === hash;
}
