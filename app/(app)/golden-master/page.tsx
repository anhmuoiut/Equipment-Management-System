'use client';

/**
 * Golden master list — placeholder. Reserved for managing the golden units
 * used on the production line to verify testers and equipment; the module
 * itself is still to be built, so this page only names it and says so
 * (no sample data).
 */
import { useTranslation } from 'react-i18next';
import { EmptyState, Tag } from '@/components/ui';
import { PageHeading } from '@/components/layout/PageHeading';

export default function GoldenMasterPage() {
  const { t } = useTranslation();
  return (
    <div className="admin-page">
      <PageHeading
        title={t('goldenMaster.title')}
        subtitle={t('goldenMaster.subtitle')}
        actions={<Tag text={t('goldenMaster.inDevelopment')} />}
      />
      <div className="equipment-panel">
        <EmptyState title={t('goldenMaster.comingSoonTitle')} subtitle={t('goldenMaster.comingSoonBody')} />
      </div>
    </div>
  );
}
