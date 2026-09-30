import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ supabaseAuthClient: vi.fn() }));
import { isSessionRevoked } from './session';

const profile = { token_version: 3, sessions_revoked_at: null as string | null };

describe('isSessionRevoked', () => {
  it('rejects a local cookie signed before the last password change', () => {
    expect(isSessionRevoked({ userId: 'u', tokenVersion: 2, signedInAt: null }, profile)).toBe(true);
    expect(isSessionRevoked({ userId: 'u', tokenVersion: 3, signedInAt: null }, profile)).toBe(false);
  });

  it('accepts a Supabase session when no reset ever happened', () => {
    expect(isSessionRevoked({ userId: 'u', tokenVersion: null, signedInAt: '2026-01-01T00:00:00Z' }, profile)).toBe(false);
  });

  it('rejects a Supabase session that signed in before an admin reset', () => {
    const reset = { ...profile, sessions_revoked_at: '2026-09-24T10:00:00Z' };
    expect(isSessionRevoked({ userId: 'u', tokenVersion: null, signedInAt: '2026-09-24T09:59:59Z' }, reset)).toBe(true);
    expect(isSessionRevoked({ userId: 'u', tokenVersion: null, signedInAt: '2026-09-24T10:00:01Z' }, reset)).toBe(false);
  });

  it('treats an unknown sign-in time as revoked once a reset exists', () => {
    const reset = { ...profile, sessions_revoked_at: '2026-09-24T10:00:00Z' };
    expect(isSessionRevoked({ userId: 'u', tokenVersion: null, signedInAt: null }, reset)).toBe(true);
  });

  it('ignores sessions_revoked_at for local sessions (token_version covers those)', () => {
    const reset = { ...profile, sessions_revoked_at: '2026-09-24T10:00:00Z' };
    expect(isSessionRevoked({ userId: 'u', tokenVersion: 3, signedInAt: null }, reset)).toBe(false);
  });
});
