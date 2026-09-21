import { withAuth, ok } from '@/lib/auth/withAuth';
import { supabaseAuthClient } from '@/lib/supabase/server';
import { clearLocalSessionCookie } from '@/lib/auth/session';

/** Clears whichever session the caller actually has — Supabase Auth, local, or (rarely) both. */
export const POST = withAuth(async (_req, { requestId }) => {
  const auth = await supabaseAuthClient();
  await auth.auth.signOut();
  await clearLocalSessionCookie();
  const response = ok({ signed_out: true }, requestId);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}, { allowAnonymous: true });
