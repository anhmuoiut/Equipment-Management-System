import { redirect } from 'next/navigation';
import { requirePageViewer } from '@/lib/auth/pageSession';
import { ForcedPasswordChange } from '@/components/ForcedPasswordChange';

/**
 * Where an account lands while must_change_password is set (a new account,
 * or right after an admin reset its password): the admin knows that
 * password, so the user replaces it before reaching anything else. Outside
 * the (app) group on purpose — that layout is what redirects here.
 */
export default async function ChangePasswordPage() {
  const viewer = await requirePageViewer();
  if (!viewer.mustChangePassword) redirect('/');
  return <ForcedPasswordChange username={viewer.username} />;
}
