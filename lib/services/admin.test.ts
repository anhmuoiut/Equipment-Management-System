import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  emailLookup: vi.fn(), usernameLookup: vi.fn(), usernameMatch: vi.fn(),
  insertProfile: vi.fn(), createAuth: vi.fn(), deleteAuth: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    auth: { admin: { createUser: mocks.createAuth, deleteUser: mocks.deleteAuth } },
    from: (table: string) => {
      if (table === 'user_profiles') return {
        select: () => ({
          ilike: () => ({ maybeSingle: mocks.emailLookup }),
          eq: (...args: unknown[]) => { mocks.usernameMatch(...args); return { limit: mocks.usernameLookup }; },
        }),
        insert: mocks.insertProfile,
        update: () => ({ eq: async () => ({ error: null }) }),
      };
      if (table === 'field_definitions') return {
        select: () => ({ data: [], error: null, eq: async () => ({ data: [] }) }),
      };
      if (table === 'field_permissions') return {
        delete: () => ({ eq: async () => ({ error: null }) }),
        insert: async () => ({ error: null }),
      };
      if (table === 'permissions') return {
        select: () => ({ data: [], error: null }),
      };
      if (table === 'user_permissions') return {
        delete: () => ({ eq: async () => ({ error: null }) }),
        insert: async () => ({ error: null }),
      };
      if (table === 'audit_log') return { insert: async () => ({ error: null }) };
      throw new Error('Unexpected table: ' + table);
    },
  }),
}));
import { createUser } from './admin';
const input = {
  full_name: 'Test User', username: ' Man_Tran ', email: 'different@company.test',
  password: 'a-strong-password', role: 'viewer' as const,
  permissions: [] as string[],
  editable_fields: [] as string[],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.emailLookup.mockResolvedValue({ data: null, error: null });
  mocks.usernameLookup.mockResolvedValue({ data: [], error: null });
  mocks.createAuth.mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null });
  mocks.insertProfile.mockResolvedValue({ error: null });
  mocks.deleteAuth.mockResolvedValue({ error: null });
});
describe('independent usernames during account creation', () => {
  it('stores a normalized username independently of the authentication email', async () => {
    const result = await createUser(input, 'admin', 'request');
    expect(result).toMatchObject({ username: 'man_tran', email: 'different@company.test' });
    expect(mocks.usernameMatch).toHaveBeenCalledWith('username', 'man_tran');
    expect(mocks.insertProfile).toHaveBeenCalledWith(expect.objectContaining({ username: 'man_tran', email: 'different@company.test' }));
    expect(mocks.createAuth).toHaveBeenCalledWith(expect.objectContaining({ email: 'different@company.test' }));
  });
  it('rejects duplicate usernames before creating an Auth account', async () => {
    mocks.usernameLookup.mockResolvedValue({ data: [{ id: 'existing' }], error: null });
    await expect(createUser(input, 'admin', 'request')).rejects.toMatchObject({ code: 'USERNAME_ALREADY_EXISTS' });
    expect(mocks.createAuth).not.toHaveBeenCalled();
  });
  it('rejects an invalid username before creating an Auth account', async () => {
    await expect(createUser({ ...input, username: 'user@example.com' }, 'admin', 'request')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(mocks.createAuth).not.toHaveBeenCalled();
  });
  it('fails closed on a username lookup error', async () => {
    mocks.usernameLookup.mockResolvedValue({ data: null, error: { code: '42703' } });
    await expect(createUser(input, 'admin', 'request')).rejects.toMatchObject({ code: 'SERVER_ERROR' });
    expect(mocks.createAuth).not.toHaveBeenCalled();
  });
  it('cleans up the Auth account when a concurrent creation takes the username', async () => {
    mocks.insertProfile.mockResolvedValue({ error: { code: '23505', message: 'duplicate key violates unique constraint "uq_user_profiles_username"' } });
    await expect(createUser(input, 'admin', 'request')).rejects.toMatchObject({ code: 'USERNAME_ALREADY_EXISTS' });
    expect(mocks.deleteAuth).toHaveBeenCalledWith('new-user');
  });
});
