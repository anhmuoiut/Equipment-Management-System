import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { AppError } from '@/lib/errors';
import type { AccountStatus, Role } from '@/lib/permissions';

export type ProfileIdentity = {
  username: string; full_name: string; role: Role; account_status: AccountStatus;
  token_version: number; sessions_revoked_at: string | null; must_change_password: boolean;
};

/** Gọi chỉ với id lấy từ phiên đăng nhập đã xác thực ở server. */
export async function getProfileIdentity(userId: string): Promise<ProfileIdentity | null> {
  const { data, error } = await supabaseAdmin().from('user_profiles')
    .select('username, full_name, role, account_status, token_version, sessions_revoked_at, must_change_password')
    .eq('id', userId).maybeSingle();
  if (error) throw new AppError('SERVER_ERROR');
  return data as ProfileIdentity | null;
}
