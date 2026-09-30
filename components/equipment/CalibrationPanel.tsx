'use client';

/**
 * Calibration tab — Equipment Detail. Shows the current DERIVED state (never
 * persisted: computed server-side from calibration_required + the latest
 * record's due date + today + the configurable Due Soon window), the last
 * record's summary, full history, and an Add/Edit flow gated by the
 * calibration.create / calibration.update permission codes. No delete —
 * normal users can never remove a historical calibration record.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, XCircle, Clock, ShieldQuestion, Plus, Pencil } from 'lucide-react';
import { api, ApiError, formatDate, type CalibrationStatus, type CalibrationRecord } from '@/lib/client/api';
import { Button, Modal, Notice, Spinner, toast } from '@/components/ui';
import { translateError } from '@/lib/i18n/errors';
import { hasPermission, type Me } from './EquipmentDetailModal';

const STATE_ICON: Record<string, typeof CheckCircle2> = {
  NOT_REQUIRED: ShieldQuestion, NOT_CALIBRATED: XCircle, OVERDUE: XCircle, DUE_SOON: Clock, VALID: CheckCircle2,
};
const STATE_TONE: Record<string, 'neutral' | 'warn' | 'alert' | 'ok'> = {
  NOT_REQUIRED: 'neutral', NOT_CALIBRATED: 'alert', OVERDUE: 'alert', DUE_SOON: 'warn', VALID: 'ok',
};

type FormState = { calibration_date: string; calibration_due_date: string; calibrated_by: string };
const EMPTY_FORM: FormState = { calibration_date: '', calibration_due_date: '', calibrated_by: '' };

export function CalibrationPanel({ equipmentId, me, disabled, onChanged }: {
  equipmentId: string; me: Me; disabled: boolean;
  /** A record was added or edited — lets a list showing calibration state
   *  (the Calibration page) refresh behind the dialog. */
  onChanged?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const [status, setStatus] = useState<CalibrationStatus | null>(null);
  const [records, setRecords] = useState<CalibrationRecord[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [dialog, setDialog] = useState<'add' | CalibrationRecord | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<ApiError | null>(null);

  const load = () => {
    setError(null);
    void api.get<{ status: CalibrationStatus; records: CalibrationRecord[] }>(`/api/equipment/${equipmentId}/calibration`)
      .then((r) => { setStatus(r.data.status); setRecords(r.data.records); })
      .catch((e) => { if (e instanceof ApiError) setError(e); });
  };
  useEffect(load, [equipmentId]);

  function openAdd() {
    setForm(EMPTY_FORM);
    setDialogError(null);
    setDialog('add');
  }
  function openEdit(record: CalibrationRecord) {
    setForm({ calibration_date: record.calibration_date, calibration_due_date: record.calibration_due_date, calibrated_by: record.calibrated_by });
    setDialogError(null);
    setDialog(record);
  }

  async function submit() {
    setBusy(true);
    setDialogError(null);
    try {
      if (dialog === 'add') {
        await api.post(`/api/equipment/${equipmentId}/calibration`, form);
        toast.success(t('calibration.recordAdded'));
      } else if (dialog) {
        await api.put(`/api/equipment/${equipmentId}/calibration/${dialog.id}`, form);
        toast.success(t('calibration.recordUpdated'));
      }
      setDialog(null);
      load();
      onChanged?.();
    } catch (e) {
      if (e instanceof ApiError) setDialogError(e);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Notice tone="alert">{translateError(error.code, language, error.message)}</Notice>;
  if (!status || !records) return <Spinner label={t('common.loadingEllipsis')} />;

  const Icon = STATE_ICON[status.calibration_status] ?? ShieldQuestion;
  const tone = STATE_TONE[status.calibration_status] ?? 'neutral';
  const canCreate = !disabled && hasPermission(me, 'calibration.create');
  const canUpdate = !disabled && hasPermission(me, 'calibration.update');

  return (
    <div className="grid gap-4">
      <section className="detail-section">
        <div className="flex items-center justify-between gap-3">
          <h3 className="detail-section-title">{t('calibration.title')}</h3>
          {canCreate && (
            <Button size="sm" variant="primary" onClick={openAdd}>
              <Plus size={13} aria-hidden="true" />{t('calibration.addCalibration')}
            </Button>
          )}
        </div>
        <div className="calibration-status-card" data-tone={tone}>
          <Icon size={20} aria-hidden="true" />
          <div>
            <p className="calibration-status-label">{t(`calibration.state.${status.calibration_status}`)}</p>
            {status.calibration_status !== 'NOT_REQUIRED' && status.calibration_status !== 'NOT_CALIBRATED' && (
              <p className="calibration-status-meta">
                {t('calibration.dueOn', { date: formatDate(status.calibration_due_date) })}
              </p>
            )}
          </div>
        </div>
        {status.calibration_required && (
          <div className="calibration-summary-grid">
            <div><p className="field-display-label">{t('calibration.lastCalibrationDate')}</p><p className="field-display-value">{formatDate(status.last_calibration_date)}</p></div>
            <div><p className="field-display-label">{t('calibration.dueDate')}</p><p className="field-display-value">{formatDate(status.calibration_due_date)}</p></div>
            <div><p className="field-display-label">{t('calibration.calibratedBy')}</p><p className="field-display-value">{status.last_calibrated_by ?? '—'}</p></div>
          </div>
        )}
      </section>

      <section className="detail-section">
        <h3 className="detail-section-title">{t('calibration.history')}</h3>
        {records.length === 0 ? (
          <p className="py-4 text-[13px]" style={{ color: 'var(--ink-3)' }}>{t('calibration.noHistory')}</p>
        ) : (
          <table className="grid-table">
            <thead>
              <tr>
                <th>{t('calibration.calibrationDate')}</th>
                <th>{t('calibration.dueDate')}</th>
                <th>{t('calibration.calibratedBy')}</th>
                <th>{t('adminUsers.name')}</th>
                {canUpdate && <th style={{ width: 60 }} />}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="ident">{formatDate(r.calibration_date)}</td>
                  <td className="ident">{formatDate(r.calibration_due_date)}</td>
                  <td>{r.calibrated_by}</td>
                  <td style={{ color: 'var(--ink-2)' }}>{r.created_by_name ?? '—'}</td>
                  {canUpdate && <td><Button size="sm" onClick={() => openEdit(r)}><Pencil size={12} aria-hidden="true" /></Button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <Modal
        open={dialog !== null}
        title={dialog === 'add' ? t('calibration.addCalibration') : t('calibration.editCalibration')}
        onClose={() => setDialog(null)}
        footer={
          <>
            <Button type="button" disabled={busy} onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
            <Button type="submit" form="calibration-form" variant="primary" loading={busy}>{t('common.save')}</Button>
          </>
        }
      >
        <form id="calibration-form" className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          {dialogError && <Notice tone="alert">{translateError(dialogError.code, language, dialogError.message)}
            {!!dialogError.details.fields && <ul className="mt-1 list-disc pl-4">{Object.entries(dialogError.details.fields as Record<string, string>).map(([k, m]) => <li key={k}>{m}</li>)}</ul>}
          </Notice>}
          <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
            {t('calibration.calibrationDate')}
            <input required type="date" value={form.calibration_date}
              onChange={(e) => setForm((f) => ({ ...f, calibration_date: e.target.value }))}
              className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
          </label>
          <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
            {t('calibration.dueDate')}
            <input required type="date" value={form.calibration_due_date}
              onChange={(e) => setForm((f) => ({ ...f, calibration_due_date: e.target.value }))}
              className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
          </label>
          <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
            {t('calibration.calibratedBy')}
            <input required maxLength={200} value={form.calibrated_by}
              onChange={(e) => setForm((f) => ({ ...f, calibrated_by: e.target.value }))}
              placeholder={t('calibration.calibratedByPlaceholder')}
              className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
          </label>
        </form>
      </Modal>
    </div>
  );
}
