import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  emailLookup: vi.fn(), usernameMatch: vi.fn(), usernameLookup: vi.fn(), providerLookup: vi.fn(),
  createAuth: vi.fn(), deleteAuth: vi.fn(), updateAuth: vi.fn(), rpc: vi.fn(),
  matrix: { users: vi.fn(), fieldPerms: vi.fn(), userPerms: vi.fn() },
}));
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    auth: { admin: { createUser: mocks.createAuth, deleteUser: mocks.deleteAuth, updateUserById: mocks.updateAuth } },
    rpc: mocks.rpc,
    from: (table: string) => {
      if (table === 'user_profiles') return {
        select: (columns: string) => {
          if (columns === 'auth_provider') return { eq: () => ({ maybeSingle: mocks.providerLookup }) };
          if (columns.includes('must_change_password') && columns.includes('auth_provider')) {
            return { order: mocks.matrix.users };
          }
          return {
            // emailTaken(): select → ilike → (neq) → limit
            ilike: () => ({ limit: mocks.emailLookup, neq: () => ({ limit: mocks.emailLookup }) }),
            eq: (...args: unknown[]) => { mocks.usernameMatch(...args); return { limit: mocks.usernameLookup }; },
          };
        },
      };
      if (table === 'field_permissions') return { select: () => ({ eq: mocks.matrix.fieldPerms }) };
      if (table === 'user_permissions') return { select: mocks.matrix.userPerms };
      throw new Error('Unexpected table: ' + table);
    },
  }),
}));
import { createUser, getPermissionMatrix, setUserAccess, setUserPassword } from './admin';

const input = {
  full_name: 'Test User', username: ' Man_Tran ', email: 'different@company.test',
  password: 'a-strong-password', role: 'user' as const,
  permissions: ['equipment.create'] as string[],
  editable_fields: ['serial_number'] as string[],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.emailLookup.mockResolvedValue({ data: [], error: null });
  mocks.usernameLookup.mockResolvedValue({ data: [], error: null });
  mocks.createAuth.mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null });
  mocks.deleteAuth.mockResolvedValue({ error: null });
  mocks.updateAuth.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ data: { blocking_required_fields: [] }, error: null });
});

describe('createUser', () => {
  it('stores a normalized username independently of the authentication email', async () => {
    const result = await createUser(input, 'admin', 'request');
    expect(result).toMatchObject({ username: 'man_tran', email: 'different@company.test' });
    expect(mocks.usernameMatch).toHaveBeenCalledWith('username', 'man_tran');
    expect(mocks.createAuth).toHaveBeenCalledWith(expect.objectContaining({ email: 'different@company.test' }));
  });

  it('writes profile, grants and audit through one RPC', async () => {
    await createUser(input, 'admin', 'request');
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('admin_create_user', expect.objectContaining({
      p_actor: 'admin', p_id: 'new-user', p_username: 'man_tran', p_role: 'user',
      p_permissions: ['equipment.create'], p_field_keys: ['serial_number'], p_request_id: 'request',
    }));
  });

  it('passes the Required-field warning back to the caller', async () => {
    mocks.rpc.mockResolvedValue({ data: { blocking_required_fields: ['Location'] }, error: null });
    await expect(createUser(input, 'admin', 'request')).resolves.toMatchObject({ blocking_required_fields: ['Location'] });
  });

  it('rejects a duplicate email before creating an Auth account', async () => {
    mocks.emailLookup.mockResolvedValue({ data: [{ id: 'existing' }], error: null });
    await expect(createUser(input, 'admin', 'request')).rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS' });
    expect(mocks.createAuth).not.toHaveBeenCalled();
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
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "uq_user_profiles_username"' } });
    await expect(createUser(input, 'admin', 'request')).rejects.toMatchObject({ code: 'USERNAME_ALREADY_EXISTS' });
    expect(mocks.deleteAuth).toHaveBeenCalledWith('new-user');
  });

  it('cleans up the Auth account when saving the profile fails for any other reason', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } });
    await expect(createUser(input, 'admin', 'request')).rejects.toMatchObject({ code: 'SERVER_ERROR' });
    expect(mocks.deleteAuth).toHaveBeenCalledWith('new-user');
  });
});

describe('setUserAccess', () => {
  it('sends NULL for every part the caller left out, so the RPC keeps it', async () => {
    mocks.rpc.mockResolvedValue({ data: { role: 'viewer' }, error: null });
    await setUserAccess('u1', { role: 'viewer' }, 'admin', 'request');
    expect(mocks.rpc).toHaveBeenCalledWith('admin_set_user_access', {
      p_actor: 'admin', p_user: 'u1', p_role: 'viewer', p_permissions: null, p_field_keys: null, p_request_id: 'request',
    });
  });

  it('surfaces the guard errors raised by the database', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'LAST_ADMIN' } });
    await expect(setUserAccess('u1', { role: 'user' }, 'admin', 'r')).rejects.toMatchObject({ code: 'LAST_ADMIN' });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'CANNOT_MODIFY_SELF' } });
    await expect(setUserAccess('admin', { role: 'user' }, 'admin', 'r')).rejects.toMatchObject({ code: 'CANNOT_MODIFY_SELF' });
  });
});

describe('setUserPassword', () => {
  it('refuses an admin resetting their own password before touching Supabase Auth', async () => {
    await expect(setUserPassword('admin', 'a-new-password', 'admin', 'r')).rejects.toMatchObject({ code: 'CANNOT_MODIFY_SELF' });
    expect(mocks.updateAuth).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('updates a Supabase account through Auth, then records the reset (no hash)', async () => {
    mocks.providerLookup.mockResolvedValue({ data: { auth_provider: 'supabase' }, error: null });
    await setUserPassword('u1', 'a-new-password', 'admin', 'r');
    expect(mocks.updateAuth).toHaveBeenCalledWith('u1', { password: 'a-new-password' });
    expect(mocks.rpc).toHaveBeenCalledWith('admin_record_password_reset', expect.objectContaining({ p_user: 'u1', p_password_hash: null }));
  });

  it('hashes a local account password and never sends it to Supabase Auth', async () => {
    mocks.providerLookup.mockResolvedValue({ data: { auth_provider: 'local' }, error: null });
    await setUserPassword('u1', 'a-new-password', 'admin', 'r');
    expect(mocks.updateAuth).not.toHaveBeenCalled();
    const args = mocks.rpc.mock.calls[0]![1] as { p_password_hash: string };
    expect(args.p_password_hash).toEqual(expect.any(String));
    expect(args.p_password_hash).not.toContain('a-new-password');
  });

  it('reports an unknown account as USER_NOT_FOUND', async () => {
    mocks.providerLookup.mockResolvedValue({ data: null, error: null });
    await expect(setUserPassword('ghost', 'a-new-password', 'admin', 'r')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });
});

describe('getPermissionMatrix', () => {
  it('fails instead of showing "no permissions" when a grants query fails', async () => {
    mocks.matrix.users.mockResolvedValue({ data: [{ id: 'u1' }], error: null });
    mocks.matrix.fieldPerms.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } });
    mocks.matrix.userPerms.mockResolvedValue({ data: [], error: null });
    await expect(getPermissionMatrix()).rejects.toMatchObject({ code: 'SERVER_ERROR' });
  });

  it('attaches each user their grants', async () => {
    mocks.matrix.users.mockResolvedValue({ data: [{ id: 'u1' }, { id: 'u2' }], error: null });
    mocks.matrix.fieldPerms.mockResolvedValue({ data: [{ user_id: 'u1', field_definitions: { field_key: 'remark' } }], error: null });
    mocks.matrix.userPerms.mockResolvedValue({ data: [{ user_id: 'u1', permission_code: 'equipment.create' }], error: null });
    await expect(getPermissionMatrix()).resolves.toEqual([
      { id: 'u1', editable_fields: ['remark'], permissions: ['equipment.create'] },
      { id: 'u2', editable_fields: [], permissions: [] },
    ]);
  });
});
