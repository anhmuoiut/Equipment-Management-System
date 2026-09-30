import 'server-only';

/**
 * One place that answers "who is making this request", regardless of which
 * of the two account kinds they are: a Supabase Auth session (cookies
 * managed by @supabase/ssr) or a local-account session (our own signed
 * cookie, see `lib/auth/localSession.ts`). Used by `withAuth` for API routes
 * and directly by the server layouts for page-level redirects, so the
 * two never drift apart.
 */
import { cookies } from 'next/headers';
import { supabaseAuthClient } from '@/lib/supabase/server';
import { LOCAL_SESSION_COOKIE, LOCAL_SESSION_MAX_AGE, signLocalSession, verifyLocalSession } from '@/lib/auth/localSession';

export type CurrentSession = {
  userId: string;
  /** Present only for local-account sessions — checked against user_profiles.token_version. */
  tokenVersion: number | null;
  /** Present only for Supabase Auth sessions — when this session signed in
   *  (Supabase's last_sign_in_at is only updated by a real sign-in, never by
   *  a token refresh). Checked against user_profiles.sessions_revoked_at. */
  signedInAt: string | null;
};

export async function getCurrentSession(): Promise<CurrentSession | null> {
  const auth = await supabaseAuthClient();
  const { data } = await auth.auth.getUser();
  if (data.user) return { userId: data.user.id, tokenVersion: null, signedInAt: data.user.last_sign_in_at ?? null };

  const store = await cookies();
  const payload = await verifyLocalSession(store.get(LOCAL_SESSION_COOKIE)?.value);
  return payload ? { userId: payload.uid, tokenVersion: payload.tv, signedInAt: null } : null;
}

/**
 * True when a session was issued before the account's password was reset:
 * a local cookie signed with an older token_version, or a Supabase session
 * that signed in before an admin revoked it (sessions_revoked_at).
 */
export function isSessionRevoked(
  session: CurrentSession,
  profile: { token_version: number; sessions_revoked_at: string | null },
): boolean {
  if (session.tokenVersion !== null && session.tokenVersion !== profile.token_version) return true;
  if (profile.sessions_revoked_at && session.tokenVersion === null) {
    const signedIn = session.signedInAt ? Date.parse(session.signedInAt) : NaN;
    if (!(signedIn > Date.parse(profile.sessions_revoked_at))) return true;
  }
  return false;
}

export async function setLocalSessionCookie(userId: string, tokenVersion: number): Promise<void> {
  const token = await signLocalSession(userId, tokenVersion);
  const store = await cookies();
  store.set(LOCAL_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: LOCAL_SESSION_MAX_AGE,
  });
}

export async function clearLocalSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(LOCAL_SESSION_COOKIE);
}
