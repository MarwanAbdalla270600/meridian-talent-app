import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/** URL-safe random token with `bytes` of entropy. */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/** SHA-256 hash of a high-entropy token (session/reset tokens are stored hashed only). */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export const hmac = (key: string, value: string): string =>
  createHmac('sha256', key).update(value).digest('base64url');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** AES-256-GCM encryption for small secrets at rest (e.g. TOTP secrets). */
export function encryptSecret(plain: string, keyB64: string): string {
  const key = Buffer.from(keyB64, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    enc.toString('base64url'),
  ].join('.');
}

export function decryptSecret(payload: string, keyB64: string): string {
  const [v, iv, tag, enc] = payload.split('.');
  if (v !== 'v1' || !iv || !tag || !enc) throw new Error('Unsupported ciphertext');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(keyB64, 'base64'),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(enc, 'base64url')), decipher.final()]).toString(
    'utf8',
  );
}
