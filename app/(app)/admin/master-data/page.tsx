'use client';

/**
 * Admin — Master data. Equipment Types / Statuses / Levels / Locations are
 * all admin-managed reference tables with the identical shape (code/display
 * name/description/order/active, statuses additionally carrying
 * requires_remark) — one page, one table pattern (MasterDataTable), four
 * instances instead of four bespoke screens. App-wide settings (the
 * calibration Due Soon window) are the Configuration category's other tab,
 * /admin/calibration-settings.
 */
import { useTranslation } from 'react-i18next';
import { AdminNav } from '@/components/admin/AdminNav';
import { useAdminAccess } from '@/components/admin/AdminAccessContext';
import { canAccessAdminSection } from '@/lib/permissions';
import { MasterDataTable } from '@/components/admin/MasterDataTable';
import { PageHeading } from '@/components/layout/PageHeading';

export default function AdminMasterDataPage() {
  const { t } = useTranslation();
  const { role, permissions } = useAdminAccess();
  const canManage = canAccessAdminSection(role, permissions, 'masterData');

  return (
    <div className="admin-page">
      <PageHeading title={t('adminMasterData.title')} subtitle={t('adminMasterData.subtitle')} />

      <AdminNav />

      <div className="equipment-panel" style={{ padding: 20, display: 'grid', gap: 24 }}>
        <MasterDataTable
          title={t('dashboard.type')} hint={t('adminMasterData.typesHint')}
          endpoint="/api/admin/master-data/types" showRequiresRemark={false} canManage={canManage}
        />
        <MasterDataTable
          title={t('dashboard.status')} hint={t('adminMasterData.statusesHint')}
          endpoint="/api/admin/master-data/statuses" showRequiresRemark canManage={canManage}
        />
        <MasterDataTable
          title={t('dashboard.level')} hint={t('adminMasterData.levelsHint')}
          endpoint="/api/admin/master-data/levels" showRequiresRemark={false} canManage={canManage}
        />
        <MasterDataTable
          title={t('dashboard.location')} hint={t('adminMasterData.locationsHint')}
          endpoint="/api/admin/locations" showRequiresRemark={false} canManage={canManage} variant="locations"
        />
        <MasterDataTable
          title={t('adminUsers.department')} hint={t('adminMasterData.departmentsHint')}
          endpoint="/api/admin/master-data/departments" showRequiresRemark={false} canManage={canManage}
        />
      </div>
    </div>
  );
}
