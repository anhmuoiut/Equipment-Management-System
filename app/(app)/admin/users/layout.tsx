import { requireAdminSection } from '@/lib/auth/pageSession';

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAdminSection('users');
  return <>{children}</>;
}
