import 'server-only';

/**
 * One place that answers "who is making this request", regardless of which
 * of the two account kinds they are: a Supabase Auth session (cookies
 * managed by @supabase/ssr) or a local-account session (our own signed
 * cookie, see `lib/auth/localSession.ts`). Used by `withAuth` for API routes
 * and directly by the two server layouts for page-level redirects, so the
 * two never drift apart.
 */
import { cookies } from 'next/headers';
import { supabaseAuthClient } from '@/lib/supabase/server';
import { LOCAL_SESSION_COOKIE, LOCAL_SESSION_MAX_AGE, signLocalSession, verifyLocalSession } from '@/lib/auth/localSession';

export type CurrentSession = {
  userId: string;
  /** Present only for local-account sessions — checked against user_profiles.token_version. */
  tokenVersion: number | null;
};

export async function getCurrentSession(): Promise<CurrentSession | null> {
  const auth = await supabaseAuthClient();
  const { data } = await auth.auth.getUser();
  if (data.user) return { userId: data.user.id, tokenVersion: null };

  const store = await cookies();
  const payload = await verifyLocalSession(store.get(LOCAL_SESSION_COOKIE)?.value);
  return payload ? { userId: payload.uid, tokenVersion: payload.tv } : null;
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
