import 'server-only';

/**
 * Bản cho trang của withAuth: cùng các bước kiểm tra phiên, nhưng không đạt
 * thì chuyển trang thay vì trả 401/403. Nhớ theo từng request (React cache).
 *
 * Phiên không còn hợp lệ (tài khoản bị khóa, đăng nhập trước khi đặt lại mật
 * khẩu) đi qua /api/auth/session-ended để xóa cookie rồi mới về /login.
 */
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentSession, isSessionRevoked } from '@/lib/auth/session';
import { getProfileIdentity } from '@/lib/services/profile';
import type { Role } from '@/lib/permissions';

export type PageViewer = {
  userId: string;
  username: string;
  fullName: string;
  role: Role;
  mustChangePassword: boolean;
};

export const SESSION_ENDED_PATH = '/api/auth/session-ended';

export const requirePageViewer = cache(async (): Promise<PageViewer> => {
  const session = await getCurrentSession();
  if (!session) redirect('/login');
  const profile = await getProfileIdentity(session.userId);
  if (!profile || profile.account_status !== 'active' || isSessionRevoked(session, profile)) redirect(SESSION_ENDED_PATH);
  return {
    userId: session.userId,
    username: profile.username,
    fullName: profile.full_name,
    role: profile.role,
    mustChangePassword: profile.must_change_password,
  };
});

/** Trang chỉ Admin (Configuration, User Management): nhóm khác về Dashboard. */
export async function requireAdminPage(): Promise<PageViewer> {
  const viewer = await requirePageViewer();
  if (viewer.role !== 'admin') redirect('/?denied=1');
  return viewer;
}
