'use client';

/**
 * Extension point (docs/DETAIL_MODEL.md 3.10): nhóm "Hiệu chuẩn" chỉ đọc
 * trong chi tiết thiết bị. Module Calibration cung cấp; trang Equipment gắn
 * vào qua prop `extensions` — Equipment không đọc bảng hiệu chuẩn, nâng cấp
 * Calibration không phải sửa Equipment.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { api, ApiError, formatDate } from '@/lib/client/api';
import { useCan } from '@/components/ViewerContext';
import { Button, Spinner, toast } from '@/components/ui';
import { DetailValue } from '@/components/ui/detail/DetailPanel';
import { DueDate, StatusTag } from '@/components/ui/tags';
import { translateError } from '@/lib/i18n/errors';
import type { SectionDef } from '@/components/ui/detail/RecordDetail';
import type { CalibrationRow, EquipmentRow } from '@/lib/types';

function EquipmentCalibrationGroup({ equipmentId }: { equipmentId: string }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const can = useCan();
  const [row, setRow] = useState<CalibrationRow | null | undefined>(undefined);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setRow(undefined);
    void api.get<CalibrationRow | null>(`/api/calibration/by-equipment/${equipmentId}`).then((r) => setRow(r.data)).catch(() => setRow(null));
  }, [equipmentId]);

  async function add() {
    setAdding(true);
    try {
      const r = await api.post<CalibrationRow>('/api/calibration', { equipment_id: equipmentId });
      setRow(r.data);
      toast.success(t('cal.added'));
    } catch (e) {
      if (e instanceof ApiError) toast.error(translateError(e.code, language, e.message));
    } finally {
      setAdding(false);
    }
  }

  if (row === undefined) return <Spinner label={t('common.loadingEllipsis')} size="sm" />;
  if (row === null) {
    return (
      <DetailValue label={t('cal.tracking')} wide>
        <span className="dp-inline">
          {t('cal.notTracked')}
          {can.edit && <Button size="sm" loading={adding} onClick={add}>{t('cal.addToDashboard')}</Button>}
        </span>
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
  return { key: 'calibration', title: t('cal.groupCalibration'), hideInCreate: true, render: (r) => <EquipmentCalibrationGroup equipmentId={r.id} /> };
}
