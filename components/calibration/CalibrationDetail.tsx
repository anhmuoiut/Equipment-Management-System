'use client';

/** Chi tiết hiệu chuẩn (docs/DETAIL_MODEL.md 4.2) + màn hình "Ghi nhận hiệu chuẩn". */
import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck } from 'lucide-react';
import { addMonths, api, formatDate, todayVN } from '@/lib/client/api';
import { toSelect, useOptions } from '@/lib/client/options';
import { useCan } from '@/components/ViewerContext';
import { DueDate, StatusTag } from '@/components/ui/tags';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { ActionField, ActionScreen, RecordDetail, type ActionCtx, type SectionDef } from '@/components/ui/detail/RecordDetail';
import type { PanelLayout } from '@/components/ui/detail/DetailPanel';
import type { DetailCtx } from '@/components/ui/workspace/ModuleWorkspace';
import type { CalibrationRow } from '@/lib/types';

export function CalibrationDetail({ ctx, layout }: { ctx: DetailCtx<CalibrationRow>; layout: PanelLayout }) {
  const { t } = useTranslation();
  const options = useOptions();
  const can = useCan();
  const hidden = ` (${t('cfg.hidden')})`;

  // Thiết bị lên / rời Dashboard tự động theo Configuration › Hiệu chuẩn › Setup — không có form thêm.
  const sections: SectionDef<CalibrationRow>[] = [
    {
      key: 'equipment', title: t('cal.groupEquipment'), fields: [
        { key: 'serial_number', label: t('fields.serial_number'), readOnly: true },
        { key: 'part_number', label: t('fields.part_number'), readOnly: true },
        { key: 'type', label: t('fields.type'), readOnly: true },
        { key: 'location', label: t('fields.location'), readOnly: true },
        // Trạng thái là của thiết bị (một nguồn) — sửa ở Equipment.
        { key: 'status', label: t('fields.status'), readOnly: true, hint: t('cal.statusFromEquipment'),
          view: (r) => <StatusTag name={r.status} color={r.status_color} /> },
        { key: 'equipment_link', label: t('cal.equipmentRecord'), readOnly: true,
          view: (r) => <Link className="link" href={`/equipment?id=${r.equipment_id}`}>{t('cal.openEquipment')}</Link> },
      ],
    },
    {
      key: 'calibration', title: t('cal.groupCalibration'), fields: [
        { key: 'vendor_id', label: t('fields.vendor'), kind: 'select', view: (r) => r.vendor,
          options: (_d, r) => toSelect(options?.calibration_vendors, r?.vendor_id, hidden) },
        { key: 'calibration_date', label: t('fields.calibration_date'), kind: 'date', view: (r) => (r.calibration_date ? formatDate(r.calibration_date) : null) },
        { key: 'due_date', label: t('fields.due_date'), readOnly: true, hint: t('cal.autoComputed'),
          view: (r) => <DueDate date={r.due_date} state={r.due_state} /> },
      ],
    },
    {
      key: 'interval', title: t('cal.groupInterval'), fields: [
        { key: 'interval_months', label: t('fields.interval_months'), readOnly: true,
          view: (r) => (r.interval_months ? t('cal.months', { count: r.interval_months }) : t('cal.noInterval')) },
        { key: 'warning_days', label: t('fields.warning_days'), readOnly: true,
          view: (r) => (r.warning_days ? t('cal.days', { count: r.warning_days }) : null) },
      ],
    },
    {
      key: 'notes', title: t('eq.groupNotes'), fields: [
        { key: 'remark', label: t('fields.remark'), kind: 'textarea', wide: true, maxLength: 1000 },
      ],
    },
  ];

  return (
    <RecordDetail<CalibrationRow>
      layout={layout}
      record={ctx.row}
      loading={ctx.loading}
      error={ctx.error}
      onRetry={ctx.onRetry}
      heading={(r) => ({
        title: r.serial_number,
        tags: <StatusTag name={r.status} color={r.status_color} />,
        subtitle: [r.part_number, r.type].filter(Boolean).join(' · ') || undefined,
        meta: (
          <>
            <span>{t('fields.due_date')}: <DueDate date={r.due_date} state={r.due_state} /></span>
            {r.interval_months && <span>{t('cal.everyMonths', { count: r.interval_months })}</span>}
          </>
        ),
      })}
      sections={sections}
      historyUrl={(r) => `/api/calibration/${r.id}/history`}
      historyFilter={{ label: t('cal.onlyCalibrations'), param: 'only=calibrate' }}
      historyLabels={{ status: t('fields.status'), vendor: t('fields.vendor'), part_number: t('fields.part_number') }}
      canEdit={can.edit}
      onSave={async (payload, record) => {
        const res = await api.put<CalibrationRow>(`/api/calibration/${record!.id}`, payload);
        return { row: res.data };
      }}
      actions={[{
        key: 'record', label: t('cal.record'), primary: true, icon: <ClipboardCheck size={14} aria-hidden="true" />,
        screen: (a) => <RecordCalibrationScreen ctx={a} />,
      }]}
      nav={ctx.nav}
      onClose={ctx.onClose}
      onExpand={ctx.onExpand}
      onSaved={ctx.onSaved}
      onDeleted={ctx.onDeleted}
      leaveRef={ctx.leaveRef}
    />
  );
}

/** Vừa hiệu chuẩn xong: ngày, vendor, ghi chú → xem trước hạn mới. Ghi lịch sử CALIBRATE. */
function RecordCalibrationScreen({ ctx }: { ctx: ActionCtx<CalibrationRow> }) {
  const { t } = useTranslation();
  const options = useOptions();
  const r = ctx.record;
  const [date, setDate] = useState(todayVN());
  const [vendor, setVendor] = useState(r.vendor_id ?? '');
  const [remark, setRemark] = useState('');
  const preview = date && r.interval_months ? addMonths(date, r.interval_months) : null;

  async function confirm() {
    const res = await api.put<CalibrationRow>(`/api/calibration/${r.id}`, {
      calibration_date: date, vendor_id: vendor || null, remark: remark.trim() || null,
    });
    ctx.done(res.data, t('cal.recorded'));
  }

  return (
    <ActionScreen title={t('cal.record')} description={t('cal.recordDesc', { serial: r.serial_number })}
      onCancel={ctx.cancel} onConfirm={confirm} confirmLabel={t('cal.record')}
      confirmDisabled={!date}>
      <ActionField label={t('fields.calibration_date')} required>
        <input type="date" value={date} max={todayVN()} onChange={(e) => setDate(e.target.value)} />
      </ActionField>
      <ActionField label={t('fields.vendor')}>
        <SearchableSelect value={vendor} onChange={setVendor} options={toSelect(options?.calibration_vendors)} clearable
          placeholder={t('dp.selectPlaceholder')} ariaLabel={t('fields.vendor')} />
      </ActionField>
      <ActionField label={t('fields.remark')}>
        <textarea rows={3} maxLength={1000} value={remark} onChange={(e) => setRemark(e.target.value)} />
      </ActionField>
      <ActionField label={t('cal.newDueDate')}>
        <strong>{preview ? formatDate(preview) : t('cal.noInterval')}</strong>
      </ActionField>
    </ActionScreen>
  );
}
