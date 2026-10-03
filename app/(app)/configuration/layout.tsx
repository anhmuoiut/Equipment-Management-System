import { requireAdminPage } from '@/lib/auth/pageSession';
import { ConfigNav } from '@/components/configuration/ConfigNav';

/** Configuration — chỉ Admin; danh sách con bên trái, nội dung bên phải. */
export default async function ConfigurationLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return (
    <div className="cfg">
      <ConfigNav />
      <div className="cfg-content">{children}</div>
    </div>
  );
}
