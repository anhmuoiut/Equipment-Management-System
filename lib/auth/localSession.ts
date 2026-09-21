import 'server-only';

/**
 * Session token for `auth_provider = 'local'` accounts.
 *
 * Supabase Auth users get a session cookie from Supabase itself. Local
 * accounts have no Supabase Auth row at all, so this signs an equivalent
 * cookie by hand: `base64url(payload).base64url(HMAC-SHA256 signature)`.
 *
 * Built on Web Crypto (`crypto.subtle`) rather than Node's `crypto` module
 * because this needs to verify in `middleware.ts`, which runs on the Edge
 * runtime — Web Crypto is the one crypto API available in both Edge and
 * Node. Password hashing (which only ever runs in a normal Node route
 * handler) lives separately in `lib/auth/password.ts` and can use Node's
 * `crypto` freely.
 *
 * The token only proves *who* the cookie belongs to. Whether that account is
 * still active, and whether its password has changed since (via
 * `token_version`), is always re-checked against `user_profiles` on every
 * request — the same trust model the app already uses for Supabase Auth
 * sessions (see `lib/auth/withAuth.ts`).
 */

export const LOCAL_SESSION_COOKIE = 'eq_local_session';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export type LocalSessionPayload = { uid: string; tv: number; exp: number };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = process.env.LOCAL_AUTH_SECRET;
  if (!secret) throw new Error('LOCAL_AUTH_SECRET is not set — required for local-account sessions.');
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signLocalSession(uid: string, tokenVersion: number): Promise<string> {
  const payload: LocalSessionPayload = {
    uid, tv: tokenVersion, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payloadB64 = bytesToBase64url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(), encoder.encode(payloadB64));
  return `${payloadB64}.${bytesToBase64url(new Uint8Array(signature))}`;
}

export async function verifyLocalSession(token: string | undefined | null): Promise<LocalSessionPayload | null> {
  if (!token) return null;
  const [payloadB64, sigB64] = token.split('.');
  if (!payloadB64 || !sigB64) return null;

  try {
    const valid = await crypto.subtle.verify(
      'HMAC', await hmacKey(), base64urlToBytes(sigB64) as BufferSource, encoder.encode(payloadB64),
    );
    if (!valid) return null;

    const payload = JSON.parse(decoder.decode(base64urlToBytes(payloadB64))) as Partial<LocalSessionPayload>;
    if (typeof payload.uid !== 'string' || typeof payload.tv !== 'number' || typeof payload.exp !== 'number') {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload as LocalSessionPayload;
  } catch {
    return null;
  }
}

export const LOCAL_SESSION_MAX_AGE = SESSION_TTL_SECONDS;
