import 'server-only';

/**
 * Self-service account requests for `auth_provider = 'local'` accounts.
 *
 * V1's original design deliberately had no public signup endpoint (spec
 * mục 27) — the reasoning was that a request queue, rate limiting and
 * enumeration protection were more machinery than a 10–20 person pilot
 * warranted. This reopens exactly that surface, so the mitigations that
 * decision skipped are back in scope here: a per-IP rate limit, and every
 * request lands `is_active = false` — indistinguishable from an account an
 * admin deactivated, and useless to log in with until an admin flips it on
 * from the Users screen (the same Reactivate button used for anyone else).
 *
 * New requests land role='viewer' with every action permission off (view
 * only, mục 30) until an admin grants more — no field_permissions rows are
 * needed for that, since a viewer can't edit any field regardless.
 */
import { supabaseAdmin } from '@/lib/supabase/admin';
import { AppError, mapRpcError } from '@/lib/errors';
import { normalizeUsername } from '@/lib/auth/username';
import { hashPassword } from '@/lib/auth/password';

const attempts = new Map<string, { count: number; expires: number }>();
function limitAttempts(key: string) {
  const now = Date.now();
  const previous = attempts.get(key);
  if (!previous || previous.expires <= now) {
    if (attempts.size >= 2000) attempts.delete(attempts.keys().next().value!);
    attempts.set(key, { count: 1, expires: now + 3_600_000 });
  } else {
    previous.count++;
    if (previous.count > 5) throw new AppError('LOGIN_RATE_LIMITED');
  }
}

export type RequestAccountInput = {
  full_name?: unknown;
  username?: unknown;
  password?: unknown;
  email?: unknown;
  employee_id?: unknown;
};

/** Loose format check — this is a contact address, not a login identity, so it's never verified. */
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestAccount(input: RequestAccountInput, ip: string, requestId: string) {
  limitAttempts(ip);

  const full_name = typeof input.full_name === 'string' ? input.full_name.trim() : '';
  const username = normalizeUsername(input.username);
  const password = typeof input.password === 'string' ? input.password : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() || null : null;
  const employee_id = typeof input.employee_id === 'string' ? input.employee_id.trim() || null : null;

  if (!full_name || full_name.length > 200) throw new AppError('VALIDATION_ERROR', { fields: { full_name: 'required' } });
  if (!username) throw new AppError('VALIDATION_ERROR', { fields: { username: 'invalid format' } });
  if (password.length < 10 || password.length > 256) {
    throw new AppError('VALIDATION_ERROR', { fields: { password: 'must be 10-256 characters' } });
  }
  // Optional — a Local account never signs in with it, so a bad value just means no contact address on file.
  if (email && (email.length > 200 || !EMAIL_FORMAT.test(email))) {
    throw new AppError('VALIDATION_ERROR', { fields: { email: 'invalid format' } });
  }

  const db = supabaseAdmin();
  const { data: conflicts, error: lookupError } = await db.from('user_profiles')
    .select('id').eq('username', username).limit(1);
  if (lookupError) throw new AppError('SERVER_ERROR');
  if (conflicts?.length) throw new AppError('USERNAME_ALREADY_EXISTS');

  if (email) {
    const { data: emailConflicts, error: emailLookupError } = await db.from('user_profiles')
      .select('id').ilike('email', email.replace(/[%_\\]/g, (char) => '\\' + char)).limit(1);
    if (emailLookupError) throw new AppError('SERVER_ERROR');
    if (emailConflicts?.length) throw new AppError('EMAIL_ALREADY_EXISTS');
  }

  const password_hash = await hashPassword(password);

  const { data: created, error } = await db.from('user_profiles').insert({
    full_name, username, email, employee_id,
    role: 'viewer', is_active: false, must_change_password: false,
    auth_provider: 'local', password_hash,
  }).select('id').maybeSingle();
  if (error) {
    if (error.code === '23505') throw new AppError('USERNAME_ALREADY_EXISTS');
    throw mapRpcError(error);
  }
  const userId = (created as { id: string }).id;

  await db.from('audit_log').insert({
    entity_type: 'user', entity_id: userId, action: 'USER_CREATE',
    changes: { role: { old: null, new: 'viewer' }, auth_provider: { old: null, new: 'local' } },
    changed_by: userId, request_id: requestId,
    note: 'Self-service account request — pending admin approval.',
  });

  return { user_id: userId };
}
