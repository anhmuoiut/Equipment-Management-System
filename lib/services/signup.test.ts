import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), appWrite: vi.fn(), notifyAdmins: vi.fn() }));
vi.mock('./core/db', () => ({
  db: () => ({ from: () => ({ select: () => ({ eq: () => ({ limit: mocks.lookup }), ilike: () => ({ limit: mocks.lookup }) }) }) }),
  appWrite: mocks.appWrite,
}));
vi.mock('./notifications', () => ({ notifyAdmins: mocks.notifyAdmins }));
vi.mock('@/lib/auth/password', () => ({ hashPassword: async () => 'scrypt:aa:bb' }));

import { requestAccount } from './signup';

const valid = { full_name: 'Tran Van Man', username: 'Man.Tran', password: 'long-enough-password' };
let ip = 0;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.lookup.mockResolvedValue({ data: [], error: null });
  mocks.appWrite.mockResolvedValue({ id: 'new-user' });
});

describe('requestAccount — tự đăng ký (docs/DATABASE_MODIFIED.md mục 6)', () => {
  it('creates a pending Readonly local account and notifies the admins', async () => {
    await expect(requestAccount(valid, `ip-${++ip}`)).resolves.toEqual({ user_id: 'new-user' });
    expect(mocks.appWrite).toHaveBeenCalledWith('user_profiles', 'insert', null, expect.objectContaining({
      username: 'man.tran', role: 'readonly', account_status: 'pending', auth_provider: 'local', password_hash: 'scrypt:aa:bb',
    }), null);
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ type: 'USER_APPROVAL_REQUEST', entity_id: 'new-user' }));
  });

  it.each([
    ['username', { username: 'Man Tran' }],
    ['username', { username: 'mân.trần' }],
    ['username', { username: 'man@jabil.com' }],
    ['email', { email: 'not-an-email' }],
    ['full_name', { full_name: '   ' }],
    ['password', { password: 'short' }],
  ])('rejects an invalid %s with a field error', async (field, override) => {
    await expect(requestAccount({ ...valid, ...override }, `ip-${++ip}`))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR', details: { fields: { [field]: expect.any(String) } } });
    expect(mocks.appWrite).not.toHaveBeenCalled();
  });

  it('does not count invalid input toward the hourly limit', async () => {
    const key = `ip-${++ip}`;
    for (let i = 0; i < 10; i++) {
      await expect(requestAccount({ ...valid, username: 'bad name' }, key)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    await expect(requestAccount(valid, key)).resolves.toEqual({ user_id: 'new-user' });
  });

  it('limits valid submissions to 5 per hour per IP', async () => {
    const key = `ip-${++ip}`;
    for (let i = 0; i < 5; i++) await requestAccount({ ...valid, username: `user${i}` }, key);
    await expect(requestAccount({ ...valid, username: 'user6' }, key)).rejects.toMatchObject({ code: 'LOGIN_RATE_LIMITED' });
  });

  it('reports a taken username', async () => {
    mocks.lookup.mockResolvedValueOnce({ data: [{ id: 'x' }], error: null });
    await expect(requestAccount(valid, `ip-${++ip}`)).rejects.toMatchObject({ code: 'USERNAME_ALREADY_EXISTS' });
  });
});
