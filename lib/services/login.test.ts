import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  lookup: vi.fn(), match: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), setCookie: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({ from: () => ({ select: () => ({
    eq: (...args: unknown[]) => { mocks.match(...args); return { limit: mocks.lookup }; },
  }) }) }),
}));
vi.mock('@/lib/supabase/server', () => ({
  supabaseAuthClient: async () => ({ auth: { signInWithPassword: mocks.signIn, signOut: mocks.signOut } }),
}));
vi.mock('@/lib/auth/session', () => ({ setLocalSessionCookie: mocks.setCookie }));
import { loginWithUsername } from './login';
import { hashPassword } from '@/lib/auth/password';

const supabaseAccount = (account_status = 'active') =>
  ({ id: 'user-1', email: 'example@company.test', account_status, auth_provider: 'supabase', password_hash: null, token_version: 1 });

let sequence = 0;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.lookup.mockResolvedValue({ data: [supabaseAccount()], error: null });
  mocks.signIn.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});
function input(password = 'local-test-password') { return { username: 'test' + (++sequence), password }; }

describe('username sign-in', () => {
  it('verifies the password through Supabase without returning email or tokens', async () => {
    expect(await loginWithUsername(input())).toBeUndefined();
    expect(mocks.signIn).toHaveBeenCalledWith({ email: 'example@company.test', password: 'local-test-password' });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
  it('normalizes username case and safely handles underscores', async () => {
    await loginWithUsername({ username: ' Man_Tran ', password: 'test' });
    expect(mocks.match).toHaveBeenCalledWith('username', 'man_tran');
  });
  it('rejects an unknown username without attempting a sign-in', async () => {
    mocks.lookup.mockResolvedValue({ data: [], error: null });
    await expect(loginWithUsername(input())).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it('rejects a disabled account only after the password is verified, and signs it out', async () => {
    mocks.lookup.mockResolvedValue({ data: [supabaseAccount('disabled')], error: null });
    await expect(loginWithUsername(input())).rejects.toMatchObject({ code: 'USER_INACTIVE' });
    expect(mocks.signOut).toHaveBeenCalled();
  });
  it('does not reveal the account status when the password is wrong', async () => {
    mocks.lookup.mockResolvedValue({ data: [supabaseAccount('disabled')], error: null });
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: { status: 400 } });
    await expect(loginWithUsername(input())).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
  it('tells a pending local account it is waiting for approval (correct password only)', async () => {
    const password_hash = await hashPassword('local-test-password');
    mocks.lookup.mockResolvedValue({
      data: [{ id: 'user-2', email: null, account_status: 'pending', auth_provider: 'local', password_hash, token_version: 1 }], error: null,
    });
    await expect(loginWithUsername(input())).rejects.toMatchObject({ code: 'ACCOUNT_PENDING' });
    await expect(loginWithUsername(input('wrong-password'))).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
  it('signs an active local account in with its own session cookie', async () => {
    const password_hash = await hashPassword('local-test-password');
    mocks.lookup.mockResolvedValue({
      data: [{ id: 'user-3', email: null, account_status: 'active', auth_provider: 'local', password_hash, token_version: 4 }], error: null,
    });
    await loginWithUsername(input());
    expect(mocks.setCookie).toHaveBeenCalledWith('user-3', 4);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it('fails closed if a lookup unexpectedly returns duplicate usernames', async () => {
    mocks.lookup.mockResolvedValue({ data: [supabaseAccount(), supabaseAccount()], error: null });
    await expect(loginWithUsername(input())).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it('rejects incorrect passwords with the same generic error', async () => {
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: { status: 400 } });
    await expect(loginWithUsername(input())).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
  it('clears a session if the verified user does not match the profile', async () => {
    mocks.signIn.mockResolvedValue({ data: { user: { id: 'other-user' } }, error: null });
    await expect(loginWithUsername(input())).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(mocks.signOut).toHaveBeenCalled();
  });
  it('rejects malformed input before a database lookup', async () => {
    await expect(loginWithUsername({ username: '%', password: 'test' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it('limits repeated failed attempts', async () => {
    const credentials = input();
    mocks.lookup.mockResolvedValue({ data: [], error: null });
    for (let i = 0; i < 10; i++) {
      await expect(loginWithUsername(credentials)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }
    await expect(loginWithUsername(credentials)).rejects.toMatchObject({ code: 'LOGIN_RATE_LIMITED' });
  });
});
