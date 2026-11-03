import { PASSWORD_MIN_LENGTH } from '@meridian/shared';
import common from './common-passwords.json' with { type: 'json' };

const COMMON = new Set((common as string[]).map((p) => p.toLowerCase()));

/** Returns a reason code if the password is too weak, otherwise null. */
export function passwordWeakness(password: string, context: string[] = []): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return 'too_short';
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return 'common';
  if (/^(.)\1+$/.test(password)) return 'repetitive';
  for (const c of context) {
    const part = c.toLowerCase().split('@')[0];
    if (part && part.length >= 4 && lower.includes(part)) return 'contains_personal_data';
  }
  return null;
}

export const hashPassword = (password: string) =>
  Bun.password.hash(password, { algorithm: 'argon2id', memoryCost: 19456, timeCost: 2 });

export const verifyPassword = (password: string, hash: string) =>
  Bun.password.verify(password, hash);
