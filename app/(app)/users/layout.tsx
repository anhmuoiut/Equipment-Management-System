import { requireAdminPage } from '@/lib/auth/pageSession';

/** User Management — chỉ Admin. */
export default async function UsersLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}
