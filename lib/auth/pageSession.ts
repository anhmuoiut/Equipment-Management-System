import 'server-only';

/**
 * The page-side counterpart of `withAuth`: the same session checks, but a
 * failure redirects instead of answering 401/403. Used by every server
 * layout/page that needs "who is looking at this page", and memoized per
 * request (React `cache`) so a nested layout doesn't repeat the lookups.
 *
 * An invalid session (deactivated account, or a session issued before a
 * password reset) goes to /api/auth/session-ended rather than straight to
 * /login: middleware only checks that the cookie is well-formed, so it
 * would bounce /login straight back to / and loop until the cookie is
 * actually cleared.
 */
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentSession, isSessionRevoked } from '@/lib/auth/session';
import { getProfileIdentity, getProfilePermissions } from '@/lib/services/profile';
import {
  canAccessAdminSection, roleHasPermission, type AdminSection, type PermissionCode, type Role,
} from '@/lib/permissions';

export type PageViewer = {
  userId: string;
  username: string;
  fullName: string;
  role: Role;
  /** Empty for admins — they bypass every permission check anyway. */
  permissions: string[];
  mustChangePassword: boolean;
};

export const SESSION_ENDED_PATH = '/api/auth/session-ended';

export const requirePageViewer = cache(async (): Promise<PageViewer> => {
  const session = await getCurrentSession();
  if (!session) redirect('/login');
  const profile = await getProfileIdentity(session.userId);
  if (!profile || !profile.is_active || isSessionRevoked(session, profile)) redirect(SESSION_ENDED_PATH);

  const permissions = profile.role === 'admin' ? [] : await getProfilePermissions(session.userId);
  return {
    userId: session.userId,
    username: profile.username,
    fullName: profile.full_name,
    role: profile.role,
    permissions,
    mustChangePassword: profile.must_change_password,
  };
});

/** For an /admin/<section> layout: anyone without access goes back to /admin,
 *  which forwards them to the first section they do have (or home). */
export async function requireAdminSection(section: AdminSection): Promise<PageViewer> {
  const viewer = await requirePageViewer();
  if (!canAccessAdminSection(viewer.role, viewer.permissions, section)) redirect('/admin');
  return viewer;
}

/** For a workspace page whose API is gated by a permission code: without
 *  the grant it would only get 403s (and the sidebar hides its link), so
 *  the page sends the viewer home instead. */
export async function requirePagePermission(code: PermissionCode): Promise<PageViewer> {
  const viewer = await requirePageViewer();
  if (!roleHasPermission(viewer.role, viewer.permissions, code)) redirect('/');
  return viewer;
}
