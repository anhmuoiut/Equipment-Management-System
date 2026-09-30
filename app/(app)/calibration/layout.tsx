import { requirePagePermission } from '@/lib/auth/pageSession';

/** Same gate as /api/calibration (calibration.view) — the sidebar hides the
 *  link from anyone without it, and a direct visit goes home instead of
 *  showing a page of 403s. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePagePermission('calibration.view');
  return <>{children}</>;
}
