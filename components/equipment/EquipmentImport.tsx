'use client';

/** Import Excel cho Equipment (docs/DETAIL_MODEL.md mục 2) — giao diện dùng chung ở ImportPanel. */
import { useTranslation } from 'react-i18next';
import { ImportPanel } from '@/components/ui/ImportPanel';
import { IMPORT_COLUMNS } from '@/lib/equipmentImport';

export function EquipmentImport({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { t } = useTranslation();
  return (
    <ImportPanel
      endpoint="/api/equipment/import" columns={IMPORT_COLUMNS}
      title={t('imp.title')} templateDesc={t('imp.step1Desc')}
      importLabel={(count) => t('imp.import', { count })} doneLabel={(count) => t('imp.done', { count })}
      onClose={onClose} onImported={onImported}
    />
  );
}
