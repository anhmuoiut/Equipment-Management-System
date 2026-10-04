'use client';

/**
 * Extension point (docs/DETAIL_MODEL.md 3.10): nhóm "Hiệu chuẩn" chỉ đọc
 * trong chi tiết thiết bị. Module Calibration cung cấp; trang Equipment gắn
 * vào qua prop `extensions` — Equipment không đọc bảng hiệu chuẩn, nâng cấp
 * Calibration không phải sửa Equipment.
 */
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/client/api';
import { useFetch } from '@/lib/client/useFetch';
import { ErrorState, Spinner } from '@/components/ui';
import { DetailValue } from '@/components/ui/detail/DetailPanel';
import { DueDate, StatusTag } from '@/components/ui/tags';
import type { SectionDef } from '@/components/ui/detail/RecordDetail';
import type { CalibrationRow, EquipmentRow } from '@/lib/types';

function EquipmentCalibrationGroup({ equipment }: { equipment: EquipmentRow }) {
  const { t } = useTranslation();
  const { data: row, loading, error, reload } = useFetch<CalibrationRow | null>(`/api/calibration/by-equipment/${equipment.id}`);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <Spinner label={t('common.loadingEllipsis')} size="sm" />;
  if (!row) {
    // Thiết bị tự lên Dashboard khi part number có trong Configuration › Hiệu chuẩn › Setup.
    return (
      <DetailValue label={t('cal.tracking')} wide hint={equipment.part_number_id ? t('cal.needsSetup') : t('cal.needsPartNumber')}>
        {t('cal.notTracked')}
      </DetailValue>
    );
  }
  return (
    <>
      <DetailValue label={t('fields.status')}><StatusTag name={row.status} color={row.status_color} /></DetailValue>
      <DetailValue label={t('fields.calibration_date')}>{row.calibration_date ? formatDate(row.calibration_date) : null}</DetailValue>
      <DetailValue label={t('fields.due_date')}><DueDate date={row.due_date} state={row.due_state} /></DetailValue>
      <DetailValue label={t('fields.vendor')}>{row.vendor}</DetailValue>
      <DetailValue label={t('fields.interval_months')}>{row.interval_months ? t('cal.months', { count: row.interval_months }) : null}</DetailValue>
      <DetailValue label={t('cal.calibrationRecord')}>
        <Link className="link" href={`/calibration?id=${row.id}`}>{t('cal.openCalibration')}</Link>
      </DetailValue>
    </>
  );
}

/** Nhóm gắn vào chi tiết thiết bị. */
export function useEquipmentCalibrationSection(): SectionDef<EquipmentRow> {
  const { t } = useTranslation();
  return {
    key: 'calibration', title: t('cal.groupCalibration'), hideInCreate: true,
    // key theo id + part number: đổi thiết bị hoặc đổi part number thì nhóm này tải lại.
    render: (r) => <EquipmentCalibrationGroup key={`${r.id}:${r.part_number_id ?? ''}`} equipment={r} />,
  };
}
