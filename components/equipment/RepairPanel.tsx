'use client';

/**
 * Repair tab — Equipment Detail. A permanent lifecycle history distinct
 * from the generic Audit Log: it answers "what failed, who worked on it,
 * what did it cost", not "who changed which field to what value". Internal
 * and Vendor repair share this one table; Location during a repair is
 * whatever `equipment.current_location_id` already is (a vendor's site is
 * a Location row like any other) — never duplicated here.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wrench, Building2, Plus, Pencil } from 'lucide-react';
import { api, ApiError, formatDate, type RepairRecord } from '@/lib/client/api';
import { Button, Modal, Notice, Spinner, Tag, toast } from '@/components/ui';
import { translateError } from '@/lib/i18n/errors';
import { hasPermission, type Me } from './EquipmentDetailModal';

type FormState = {
  repair_type: 'internal' | 'vendor';
  problem: string; repair_start_date: string; repair_end_date: string;
  vendor_name: string; repair_action: string; repair_result: string;
  quotation_ref: string; repair_cost: string; remark: string;
};
const EMPTY_FORM: FormState = {
  repair_type: 'internal', problem: '', repair_start_date: '', repair_end_date: '',
  vendor_name: '', repair_action: '', repair_result: '', quotation_ref: '', repair_cost: '', remark: '',
};

function toForm(r: RepairRecord): FormState {
  return {
    repair_type: r.repair_type, problem: r.problem ?? '',
    repair_start_date: r.repair_start_date ?? '', repair_end_date: r.repair_end_date ?? '',
    vendor_name: r.vendor_name ?? '', repair_action: r.repair_action ?? '', repair_result: r.repair_result ?? '',
    quotation_ref: r.quotation_ref ?? '', repair_cost: r.repair_cost != null ? String(r.repair_cost) : '',
    remark: r.remark ?? '',
  };
}

function toPayload(f: FormState): Record<string, unknown> {
  return {
    repair_type: f.repair_type,
    problem: f.problem.trim() || null,
    repair_start_date: f.repair_start_date || null,
    repair_end_date: f.repair_end_date || null,
    vendor_name: f.repair_type === 'vendor' ? (f.vendor_name.trim() || null) : null,
    repair_action: f.repair_action.trim() || null,
    repair_result: f.repair_result.trim() || null,
    quotation_ref: f.quotation_ref.trim() || null,
    repair_cost: f.repair_cost.trim() ? Number(f.repair_cost) : null,
    remark: f.remark.trim() || null,
  };
}

export function RepairPanel({ equipmentId, me, disabled }: { equipmentId: string; me: Me; disabled: boolean }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const [records, setRecords] = useState<RepairRecord[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [dialog, setDialog] = useState<'add' | RepairRecord | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<ApiError | null>(null);

  const load = () => {
    setError(null);
    void api.get<RepairRecord[]>(`/api/equipment/${equipmentId}/repair`)
      .then((r) => setRecords(r.data))
      .catch((e) => { if (e instanceof ApiError) setError(e); });
  };
  useEffect(load, [equipmentId]);

  function openAdd() { setForm(EMPTY_FORM); setDialogError(null); setDialog('add'); }
  function openEdit(record: RepairRecord) { setForm(toForm(record)); setDialogError(null); setDialog(record); }

  async function submit() {
    setBusy(true);
    setDialogError(null);
    try {
      const payload = toPayload(form);
      if (dialog === 'add') { await api.post(`/api/equipment/${equipmentId}/repair`, payload); toast.success(t('repair.recordAdded')); }
      else if (dialog) { await api.put(`/api/equipment/${equipmentId}/repair/${dialog.id}`, payload); toast.success(t('repair.recordUpdated')); }
      setDialog(null);
      load();
    } catch (e) {
      if (e instanceof ApiError) setDialogError(e);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Notice tone="alert">{translateError(error.code, language, error.message)}</Notice>;
  if (!records) return <Spinner label={t('common.loadingEllipsis')} />;

  const canCreate = !disabled && hasPermission(me, 'repair.create');
  const canUpdate = !disabled && hasPermission(me, 'repair.update');
  const open = records.filter((r) => !r.repair_end_date);

  return (
    <div className="grid gap-4">
      <section className="detail-section">
        <div className="flex items-center justify-between gap-3">
          <h3 className="detail-section-title">{t('repair.title')}</h3>
          {canCreate && (
            <Button size="sm" variant="primary" onClick={openAdd}>
              <Plus size={13} aria-hidden="true" />{t('repair.addRepair')}
            </Button>
          )}
        </div>
        {open.length > 0 && (
          <Notice tone="warn">{t('repair.currentlyUnderRepair', { count: open.length })}</Notice>
        )}

        {records.length === 0 ? (
          <p className="py-4 text-[13px]" style={{ color: 'var(--ink-3)' }}>{t('repair.noHistory')}</p>
        ) : (
          <ol className="detail-history-list">
            {records.map((r) => (
              <li key={r.id} className="detail-history-entry">
                <span className="detail-history-icon">{r.repair_type === 'vendor' ? <Building2 size={13} aria-hidden="true" /> : <Wrench size={13} aria-hidden="true" />}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-medium">
                      {r.repair_type === 'vendor' ? t('repair.vendorRepair') : t('repair.internalRepair')}
                      {!r.repair_end_date && <Tag text={t('repair.open')} tone="warn" />}
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                      {formatDate(r.repair_start_date)} — {r.repair_end_date ? formatDate(r.repair_end_date) : t('repair.ongoing')}
                    </span>
                  </div>
                  {r.problem && <p className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-2)' }}>{r.problem}</p>}
                  {r.vendor_name && <p className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-3)' }}>{t('repair.vendor')}: {r.vendor_name}</p>}
                  {r.repair_action && <p className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-3)' }}>{t('repair.action')}: {r.repair_action}</p>}
                  {r.repair_result && <p className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-3)' }}>{t('repair.result')}: {r.repair_result}</p>}
                  {r.repair_cost != null && <p className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-3)' }}>{t('repair.cost')}: {r.repair_cost}</p>}
                  <p className="detail-history-byline">
                    {r.created_by_name ? t('equipmentDetail.historyBy', { name: r.created_by_name }) : null}
                  </p>
                  {canUpdate && <Button size="sm" onClick={() => openEdit(r)}><Pencil size={12} aria-hidden="true" />{t('adminFields.edit')}</Button>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <Modal
        open={dialog !== null}
        wide
        title={dialog === 'add' ? t('repair.addRepair') : t('repair.editRepair')}
        onClose={() => setDialog(null)}
        footer={
          <>
            <Button type="button" disabled={busy} onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
            <Button type="submit" form="repair-form" variant="primary" loading={busy}>{t('common.save')}</Button>
          </>
        }
      >
        <form id="repair-form" className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          {dialogError && <Notice tone="alert">{translateError(dialogError.code, language, dialogError.message)}</Notice>}
          <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
            {t('repair.repairType')}
            <select value={form.repair_type} onChange={(e) => setForm((f) => ({ ...f, repair_type: e.target.value as 'internal' | 'vendor' }))}
              className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }}>
              <option value="internal">{t('repair.internalRepair')}</option>
              <option value="vendor">{t('repair.vendorRepair')}</option>
            </select>
          </label>
          {form.repair_type === 'vendor' && (
            <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
              {t('repair.vendor')}
              <input value={form.vendor_name} onChange={(e) => setForm((f) => ({ ...f, vendor_name: e.target.value }))}
                className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
            </label>
          )}
          <label className="block text-[12px] sm:col-span-2">
            {t('repair.problem')}
            <textarea rows={2} value={form.problem} onChange={(e) => setForm((f) => ({ ...f, problem: e.target.value }))}
              className="mt-1 w-full resize-y border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
          </label>
          <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
            {t('repair.startDate')}
            <input type="date" value={form.repair_start_date} onChange={(e) => setForm((f) => ({ ...f, repair_start_date: e.target.value }))}
              className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
          </label>
          <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
            {t('repair.endDate')}
            <input type="date" value={form.repair_end_date} onChange={(e) => setForm((f) => ({ ...f, repair_end_date: e.target.value }))}
              className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
          </label>
          <label className="block text-[12px] sm:col-span-2">
            {t('repair.action')}
            <textarea rows={2} value={form.repair_action} onChange={(e) => setForm((f) => ({ ...f, repair_action: e.target.value }))}
              className="mt-1 w-full resize-y border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
          </label>
          <label className="block text-[12px] sm:col-span-2">
            {t('repair.result')}
            <textarea rows={2} value={form.repair_result} onChange={(e) => setForm((f) => ({ ...f, repair_result: e.target.value }))}
              className="mt-1 w-full resize-y border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
          </label>
          <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
            {t('repair.quotationRef')}
            <input value={form.quotation_ref} onChange={(e) => setForm((f) => ({ ...f, quotation_ref: e.target.value }))}
              className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
          </label>
          <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
            {t('repair.cost')}
            <input type="number" min="0" step="0.01" value={form.repair_cost} onChange={(e) => setForm((f) => ({ ...f, repair_cost: e.target.value }))}
              className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
          </label>
          <label className="block text-[12px] sm:col-span-2">
            {t('equipmentDetail.sectionAdditional')} — {t('dashboard.remark')}
            <textarea rows={2} value={form.remark} onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
              className="mt-1 w-full resize-y border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
          </label>
        </form>
      </Modal>
    </div>
  );
}
