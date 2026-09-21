import 'server-only';

/**
 * Password hashing for `auth_provider = 'local'` accounts, using Node's
 * built-in `crypto.scrypt` — no extra dependency, and scrypt is a
 * memory-hard KDF (a reasonable default cost, same as Node's own docs
 * example). Supabase accounts never touch this file; Supabase hashes and
 * stores their password itself.
 *
 * Stored format: "scrypt:<saltHex>:<hashHex>".
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(plain, salt, KEY_LENGTH)) as Buffer;
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [scheme, salt, hashHex] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !hashHex) return false;

  const expected = Buffer.from(hashHex, 'hex');
  const derived = (await scryptAsync(plain, salt, expected.length)) as Buffer;
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
