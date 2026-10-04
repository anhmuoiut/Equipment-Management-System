'use client';

/** Trang Calibration (Dashboard hiệu chuẩn): Masterlist + Detail Panel. */
import { useTranslation } from 'react-i18next';
import { CalendarClock, MapPin } from 'lucide-react';
import { formatDate } from '@/lib/client/api';
import { DueDate, StatusTag } from '@/components/ui/tags';
import { ModuleWorkspace, useList } from '@/components/ui/workspace/ModuleWorkspace';
import { RowCard, type Column } from '@/components/ui/masterlist/Masterlist';
import { CalibrationDetail } from './CalibrationDetail';
import type { CalibrationRow } from '@/lib/types';

export function CalibrationWorkspace() {
  const { t } = useTranslation();
  const list = useList<CalibrationRow>('/api/calibration');

  const columns: Column<CalibrationRow>[] = [
    { key: 'status', label: t('fields.status'), value: (r) => r.status, render: (r) => <StatusTag name={r.status} color={r.status_color} />, filter: true },
    { key: 'serial_number', label: t('fields.serial_number'), value: (r) => r.serial_number, render: (r) => <strong>{r.serial_number}</strong> },
    { key: 'part_number', label: t('fields.part_number'), value: (r) => r.part_number, filter: true },
    { key: 'type', label: t('fields.type'), value: (r) => r.type, filter: true },
    { key: 'location', label: t('fields.location'), value: (r) => r.location, filter: true },
    { key: 'vendor', label: t('fields.vendor'), value: (r) => r.vendor, filter: true },
    { key: 'calibration_date', label: t('fields.calibration_date'), value: (r) => r.calibration_date,
      render: (r) => (r.calibration_date ? formatDate(r.calibration_date) : null) },
    { key: 'due_date', label: t('fields.due_date'), value: (r) => r.due_date, render: (r) => <DueDate date={r.due_date} state={r.due_state} /> },
    { key: 'interval_months', label: t('fields.interval_months'), value: (r) => r.interval_months,
      render: (r) => (r.interval_months ? t('cal.months', { count: r.interval_months }) : null) },
    { key: 'remark', label: t('fields.remark'), value: (r) => r.remark, wrap: true, width: 180 },
  ];

  return (
    <ModuleWorkspace<CalibrationRow>
      title={t('nav.calibration')}
      list={list}
      columns={columns}
      mobileCard={(r) => (
        <RowCard
          title={r.serial_number}
          tag={<StatusTag name={r.status} color={r.status_color} />}
          lines={[
            <><MapPin size={13} aria-hidden="true" /><span className="rc-place">{r.location ?? '—'}</span>{[r.part_number, r.type].filter(Boolean).map((x) => ` · ${x}`)}</>,
            <><CalendarClock size={13} aria-hidden="true" />{r.due_state === 'none' ? t('cal.due.none') : <DueDate date={r.due_date} state={r.due_state} />}</>,
          ]}
        />
      )}
      storageKey="calibration"
      exportName="calibration"
      // Thiết bị lên Dashboard tự động theo Configuration › Hiệu chuẩn › Setup — không thêm bằng tay.
      canAdd={false}
      detailPath={(id) => `/calibration/${id}`}
      quickFilters={[
        { key: 'overdue', label: t('cal.due.overdue'), test: (r) => r.due_state === 'overdue' },
        { key: 'due_soon', label: t('cal.due.due_soon'), test: (r) => r.due_state === 'due_soon' },
      ]}
      rowTone={(r) => (r.due_state === 'overdue' ? 'alert' : r.due_state === 'due_soon' ? 'warn' : undefined)}
      renderDetail={(ctx) => <CalibrationDetail ctx={ctx} layout="panel" />}
    />
  );
}
