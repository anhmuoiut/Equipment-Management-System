'use client';

/**
 * Admin — Calibration settings (Configuration category, next to Master
 * data). App-wide values that decide how calibration status is derived —
 * today only the Due Soon window.
 */
import { useTranslation } from 'react-i18next';
import { AdminNav } from '@/components/admin/AdminNav';
import { useAdminAccess } from '@/components/admin/AdminAccessContext';
import { canAccessAdminSection } from '@/lib/permissions';
import { CalibrationSettingsCard } from '@/components/admin/CalibrationSettingsCard';
import { PageHeading } from '@/components/layout/PageHeading';

export default function AdminCalibrationSettingsPage() {
  const { t } = useTranslation();
  const { role, permissions } = useAdminAccess();

  return (
    <div className="admin-page">
      <PageHeading title={t('adminCalibrationSettings.title')} subtitle={t('adminCalibrationSettings.subtitle')} />

      <AdminNav />

      <div className="equipment-panel" style={{ padding: 20 }}>
        <CalibrationSettingsCard canManage={canAccessAdminSection(role, permissions, 'calibrationSettings')} />
      </div>
    </div>
  );
}
