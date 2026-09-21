'use client';

/**
 * Admin — Master data. Equipment Types / Statuses / Levels / Locations are
 * all admin-managed reference tables with the identical shape (code/display
 * name/description/order/active, statuses additionally carrying
 * requires_remark) — one page, one table pattern (MasterDataTable), four
 * instances instead of four bespoke screens.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/client/api';
import { AdminNav } from '@/components/admin/AdminNav';
import { MasterDataTable } from '@/components/admin/MasterDataTable';
import { CalibrationSettingsCard } from '@/components/admin/CalibrationSettingsCard';
import { PageHeading } from '@/components/layout/PageHeading';

type Me = { role: 'admin' | 'user' | 'viewer'; permissions: string[] };

export default function AdminMasterDataPage() {
  const { t } = useTranslation();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => { void api.get<Me>('/api/me').then((r) => setMe(r.data)); }, []);

  const canManage = !!me && (me.role === 'admin' || me.permissions.includes('master_data.manage'));

  return (
    <div className="admin-page">
      <PageHeading title={t('adminMasterData.title')} subtitle={t('adminMasterData.subtitle')} />

      <AdminNav />

      <div className="equipment-panel" style={{ padding: 20, display: 'grid', gap: 24 }}>
        <div style={{ paddingBottom: 20, borderBottom: '1px solid var(--rule-soft)' }}>
          <CalibrationSettingsCard canManage={canManage} />
        </div>
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
