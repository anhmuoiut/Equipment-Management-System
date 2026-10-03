'use client';

/** Chi tiết hiệu chuẩn (docs/DETAIL_MODEL.md 4.2) + màn hình "Ghi nhận hiệu chuẩn". */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck, Gauge } from 'lucide-react';
import { addMonths, api, ApiError, formatDate, todayVN } from '@/lib/client/api';
import { translateError } from '@/lib/i18n/errors';
import { statusRequiresRemark, statusSelect, toSelect, useOptions } from '@/lib/client/options';
import { useCan } from '@/components/ViewerContext';
import { DueDate, StatusTag } from '@/components/ui/tags';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { ActionField, ActionScreen, RecordDetail, type ActionCtx, type SectionDef } from '@/components/ui/detail/RecordDetail';
import type { PanelLayout } from '@/components/ui/detail/DetailPanel';
import type { DetailCtx } from '@/components/ui/workspace/ModuleWorkspace';
import type { CalibrationCandidate, CalibrationRow } from '@/lib/types';

export function CalibrationDetail({ ctx, layout }: { ctx: DetailCtx<CalibrationRow>; layout: PanelLayout }) {
  const { t } = useTranslation();
  const options = useOptions();
  const can = useCan();
  const [candidates, setCandidates] = useState<CalibrationCandidate[] | null>(null);
  const hidden = ` (${t('cfg.hidden')})`;

  useEffect(() => {
    if (!ctx.creating) return;
    setCandidates(null);
    void api.get<CalibrationCandidate[]>('/api/calibration/candidates').then((r) => setCandidates(r.data)).catch(() => setCandidates([]));
  }, [ctx.creating]);

  const sections: SectionDef<CalibrationRow>[] = ctx.creating ? [{
    key: 'add', title: t('cal.groupEquipment'), fields: [{
      key: 'equipment_id', label: t('cal.pickEquipment'), kind: 'select', required: true, wide: true,
      hint: candidates && candidates.length === 0 ? t('cal.noCandidates') : t('cal.pickEquipmentHint'),
      options: () => (candidates ?? []).map((c) => ({
        value: c.id, label: `${c.serial_number} · ${c.part_number ?? '—'} · ${t('cal.months', { count: c.interval_months })}`,
      })),
    }],
  }] : [
    {
      key: 'equipment', title: t('cal.groupEquipment'), fields: [
        { key: 'serial_number', label: t('fields.serial_number'), readOnly: true },
        { key: 'part_number', label: t('fields.part_number'), readOnly: true },
        { key: 'type', label: t('fields.type'), readOnly: true },
        { key: 'location', label: t('fields.location'), readOnly: true },
        { key: 'equipment_link', label: t('cal.equipmentRecord'), readOnly: true,
          view: (r) => <Link className="link" href={`/equipment?id=${r.equipment_id}`}>{t('cal.openEquipment')}</Link> },
      ],
    },
    {
      key: 'calibration', title: t('cal.groupCalibration'), fields: [
        { key: 'status_id', label: t('fields.status'), kind: 'select', view: (r) => <StatusTag name={r.status} color={r.status_color} />,
          options: () => statusSelect(options?.statuses, 'calibration') },
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
        { key: 'remark', label: t('fields.remark'), kind: 'textarea', wide: true, maxLength: 1000,
          required: (d) => statusRequiresRemark(options?.statuses, d.status_id) },
      ],
    },
  ];

  return (
    <RecordDetail<CalibrationRow>
      layout={layout}
      record={ctx.row}
      creating={ctx.creating}
      loading={ctx.loading}
      error={ctx.error}
      icon={<Gauge size={18} />}
      createTitle={t('cal.addTitle')}
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
        if (!record) {
          const res = await api.post<CalibrationRow>('/api/calibration', { equipment_id: payload.equipment_id });
          return { row: res.data, message: t('cal.added') };
        }
        const res = await api.put<CalibrationRow>(`/api/calibration/${record.id}`, payload);
        return { row: res.data };
      }}
      actions={[{
        key: 'record', label: t('cal.record'), primary: true, icon: <ClipboardCheck size={14} aria-hidden="true" />,
        screen: (a) => <RecordCalibrationScreen ctx={a} />,
      }]}
      canDelete={can.remove}
      deleteLabel={t('cal.remove')}
      onDelete={async (r) => { await api.delete(`/api/calibration/${r.id}`); }}
      deleteWarning={(r) => t('cal.removeConfirm', { serial: r.serial_number })}
      nav={ctx.nav}
      onClose={ctx.onClose}
      onExpand={ctx.onExpand}
      onSaved={ctx.onSaved}
      onDeleted={ctx.onDeleted}
      leaveRef={ctx.leaveRef}
    />
  );
}

/** Vừa hiệu chuẩn xong: ngày, trạng thái, vendor, ghi chú → xem trước hạn mới. Ghi lịch sử CALIBRATE. */
function RecordCalibrationScreen({ ctx }: { ctx: ActionCtx<CalibrationRow> }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const options = useOptions();
  const r = ctx.record;
  const [date, setDate] = useState(todayVN());
  const [status, setStatus] = useState(r.status_id ?? '');
  const [vendor, setVendor] = useState(r.vendor_id ?? '');
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remarkRequired = statusRequiresRemark(options?.statuses, status);
  const preview = date && r.interval_months ? addMonths(date, r.interval_months) : null;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.put<CalibrationRow>(`/api/calibration/${r.id}`, {
        calibration_date: date, status_id: status || null, vendor_id: vendor || null, remark: remark.trim() || null,
      });
      ctx.done(res.data, t('cal.recorded'));
    } catch (e) {
      if (e instanceof ApiError) setError(translateError(e.code, language, e.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ActionScreen title={t('cal.record')} description={t('cal.recordDesc', { serial: r.serial_number })}
      onCancel={ctx.cancel} onConfirm={confirm} busy={busy} error={error}
      confirmDisabled={!date || !status || (remarkRequired && !remark.trim())}>
      <ActionField label={t('fields.calibration_date')} required>
        <input type="date" value={date} max={todayVN()} onChange={(e) => setDate(e.target.value)} />
      </ActionField>
      <ActionField label={t('fields.status')} required>
        <SearchableSelect value={status} onChange={setStatus} options={statusSelect(options?.statuses, 'calibration')}
          placeholder={t('dp.selectPlaceholder')} ariaLabel={t('fields.status')} />
      </ActionField>
      <ActionField label={t('fields.vendor')}>
        <SearchableSelect value={vendor} onChange={setVendor} options={toSelect(options?.calibration_vendors)} clearable
          placeholder={t('dp.selectPlaceholder')} ariaLabel={t('fields.vendor')} />
      </ActionField>
      <ActionField label={t('fields.remark')} required={remarkRequired}>
        <textarea rows={3} maxLength={1000} value={remark} onChange={(e) => setRemark(e.target.value)} />
      </ActionField>
      <ActionField label={t('cal.newDueDate')}>
        <strong>{preview ? formatDate(preview) : t('cal.noInterval')}</strong>
      </ActionField>
    </ActionScreen>
  );
}
