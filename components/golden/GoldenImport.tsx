'use client';

/** Import Excel cho Golden sample — giao diện dùng chung ở ImportPanel. */
import { useTranslation } from 'react-i18next';
import { ImportPanel } from '@/components/ui/ImportPanel';
import { GOLDEN_IMPORT_COLUMNS } from '@/lib/goldenImport';

export function GoldenImport({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { t } = useTranslation();
  return (
    <ImportPanel
      endpoint="/api/golden/import" columns={GOLDEN_IMPORT_COLUMNS}
      title={t('gimp.title')} templateDesc={t('gimp.step1Desc')}
      importLabel={(count) => t('gimp.import', { count })} doneLabel={(count) => t('gimp.done', { count })}
      onClose={onClose} onImported={onImported}
    />
  );
}
