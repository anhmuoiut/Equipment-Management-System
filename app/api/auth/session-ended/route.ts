import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getCurrentSession, isSessionRevoked, clearLocalSessionCookie } from '@/lib/auth/session';
import { getProfileIdentity } from '@/lib/services/profile';
import { supabaseAuthClient } from '@/lib/supabase/server';

/**
 * Where server layouts send a session that is well-formed but no longer
 * valid (account disabled, or signed in before a password reset). It
 * clears the cookies and continues to /login — without this, middleware
 * (which only checks the cookie) would send /login straight back to /.
 *
 * A GET because it is reached by redirect. It only signs out a session that
 * really is invalid, so a cross-site link can't sign anyone out.
 */
export const GET = withAuth(async (req) => {
  const home = new URL('/', req.url);
  const login = new URL('/login', req.url);

  const session = await getCurrentSession();
  if (!session) return NextResponse.redirect(login);

  const profile = await getProfileIdentity(session.userId);
  if (profile && profile.account_status === 'active' && !isSessionRevoked(session, profile)) {
    return NextResponse.redirect(home);
  }

  const auth = await supabaseAuthClient();
  await auth.auth.signOut({ scope: 'local' });
  await clearLocalSessionCookie();
  const response = NextResponse.redirect(login);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}, { allowAnonymous: true });
