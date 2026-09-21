import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { AppError } from '@/lib/errors';

/** Call only with the ID returned by verified server-side authentication. */
export async function getProfileIdentity(userId: string) {
  const { data, error } = await supabaseAdmin().from('user_profiles')
    .select('username,full_name,is_active,role,token_version').eq('id', userId).maybeSingle();
  if (error) throw new AppError('SERVER_ERROR');
  return data as {
    username: string; full_name: string; is_active: boolean;
    role: 'admin' | 'user' | 'viewer'; token_version: number;
  } | null;
}

/** Just the granted permission codes — used by server layouts deciding
 *  whether a non-admin (e.g. a master_data.manage or field.manage holder)
 *  may land on an /admin/* page at all. The actual enforcement always
 *  happens again at the API layer (withAuth); this is UX-only. */
export async function getProfilePermissions(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin().from('user_permissions')
    .select('permission_code').eq('user_id', userId);
  if (error) throw new AppError('SERVER_ERROR');
  return (data ?? []).map((r) => (r as { permission_code: string }).permission_code);
}
