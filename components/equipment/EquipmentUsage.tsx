'use client';

/**
 * Check-out / Check-in (docs/DATABASE_MODIFIED.md › Equipment › Usage).
 * - UsageTool: nút trên thanh công cụ — tick nhiều thiết bị rồi Check-out (Not in use → In use)
 *   hoặc Check-in (In use → Not in use) một lần.
 * - UsageScreen: mục trong [Thao tác ▾] của một thiết bị.
 * Cả hai: thiết bị con cháu đổi theo (database); có ô ghi chú, lưu vào lịch sử.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '@/lib/client/api';
import { useOptions } from '@/lib/client/options';
import { Button, Notice, toast } from '@/components/ui';
import { DetailPanel } from '@/components/ui/detail/DetailPanel';
import { ActionField, ActionScreen, type ActionCtx } from '@/components/ui/detail/RecordDetail';
import type { EquipmentRow, Options, Usage } from '@/lib/types';

export type UsageMode = 'checkout' | 'checkin';

const targetOf = (mode: UsageMode): Usage => (mode === 'checkout' ? 'in_use' : 'not_in_use');

/** Số thiết bị sẽ đổi Usage khi chọn `ids`: chính chúng + con cháu, chỉ tính những cái đang khác `target`. */
export function usageAffected(rows: EquipmentRow[], ids: Iterable<string>, target: Usage): number {
  const children = new Map<string, EquipmentRow[]>();
  rows.forEach((r) => { if (r.parent_id) children.set(r.parent_id, [...(children.get(r.parent_id) ?? []), r]); });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const stack = [...ids];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(children.get(id) ?? []).map((c) => c.id));
  }
  return [...seen].filter((id) => byId.get(id) && byId.get(id)!.usage !== target).length;
}

/** Part number "chỉ In use khi có cha" mà thiết bị chưa gắn vào cha → chưa Check-out được. */
export function usageBlocked(row: EquipmentRow, options: Options | null | undefined): boolean {
  return !row.parent_id && !!row.part_number_id && !!options?.part_numbers.find((p) => p.id === row.part_number_id)?.usage_needs_parent;
}

const MAX_NOTE = 500;

function NoteField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <ActionField label={t('eq.usageNote')} htmlFor={id} hint={t('eq.usageNoteHint')}>
      <textarea id={id} rows={3} maxLength={MAX_NOTE} value={value} onChange={(e) => onChange(e.target.value)} />
    </ActionField>
  );
}

async function send(ids: string[], mode: UsageMode, note: string): Promise<number> {
  const res = await api.post<{ changed: number }>('/api/equipment/usage', { ids, usage: targetOf(mode), note: note.trim() || null });
  return res.data.changed;
}

/** Mục [Thao tác ▾] của một thiết bị: Check-out / Check-in thiết bị này và con cháu. */
export function UsageScreen({ ctx, rows, mode }: { ctx: ActionCtx<EquipmentRow>; rows: EquipmentRow[] | null; mode: UsageMode }) {
  const { t } = useTranslation();
  const options = useOptions();
  const [note, setNote] = useState('');
  const record = ctx.record;
  const count = usageAffected(rows ?? [record], [record.id], targetOf(mode));
  const label = mode === 'checkout' ? t('eq.checkOut') : t('eq.checkIn');
  const blocked = mode === 'checkout' && usageBlocked(record, options);
  async function confirm() {
    const changed = await send([record.id], mode, note);
    const updated = (await api.get<EquipmentRow>(`/api/equipment/${record.id}`)).data;
    ctx.done(updated, t(mode === 'checkout' ? 'eq.checkedOut' : 'eq.checkedIn', { count: changed }));
  }
  return (
    <ActionScreen title={label} description={t(mode === 'checkout' ? 'eq.checkOutDesc' : 'eq.checkInDesc')}
      onCancel={ctx.cancel} onConfirm={confirm} confirmLabel={label} confirmDisabled={blocked}>
      {blocked && <Notice tone="warn">{t('eq.usageNeedsParent')}</Notice>}
      <ActionField label={t('eq.usageAffects')}>
        <span>{t('eq.usageAffectsValue', { serial: record.serial_number, count })}</span>
      </ActionField>
      <NoteField id="usage-note" value={note} onChange={setNote} />
    </ActionScreen>
  );
}

/** Khung bên phải mở từ thanh công cụ: tick nhiều thiết bị rồi Check-out / Check-in. */
export function UsageTool({ mode, rows, onClose, onDone }: {
  mode: UsageMode; rows: EquipmentRow[]; onClose: () => void; onDone: () => void;
}) {
  const { t } = useTranslation();
  const options = useOptions();
  const target = targetOf(mode);
  const label = mode === 'checkout' ? t('eq.checkOut') : t('eq.checkIn');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const blockedOf = (r: EquipmentRow) => mode === 'checkout' && usageBlocked(r, options);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check-out: chỉ thiết bị đang Not in use; Check-in: chỉ thiết bị đang In use.
  const candidates = useMemo(() => rows.filter((r) => r.usage !== target)
    .sort((a, b) => a.serial_number.localeCompare(b.serial_number, undefined, { numeric: true })), [rows, target]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? candidates.filter((r) => [r.serial_number, r.part_number, r.location, r.type, r.asset, r.jabil_id]
      .some((v) => v?.toLowerCase().includes(q))) : candidates;
  }, [candidates, query]);
  const total = usageAffected(rows, picked, target);

  const toggle = (id: string) => setPicked((prev) => { const next = new Set(prev); if (!next.delete(id)) next.add(id); return next; });
  const selectable = shown.filter((r) => !blockedOf(r));
  const allShown = selectable.length > 0 && selectable.every((r) => picked.has(r.id));
  const toggleAll = () => setPicked((prev) => {
    const next = new Set(prev);
    selectable.forEach((r) => (allShown ? next.delete(r.id) : next.add(r.id)));
    return next;
  });

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const changed = await send([...picked], mode, note);
      toast.success(t(mode === 'checkout' ? 'eq.checkedOut' : 'eq.checkedIn', { count: changed }));
      onDone();
      onClose();
    } catch (e) {
      setError(errorMessage(e, t));
      setBusy(false);
    }
  }

  return (
    <DetailPanel
      layout="panel" title={label} onClose={busy ? undefined : onClose}
      footer={(
        <div className="dp-footer-row">
          <Button onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={picked.size === 0} onClick={() => void confirm()}>
            {label}{picked.size > 0 ? ` (${picked.size})` : ''}
          </Button>
        </div>
      )}
    >
      <div className="dp-body-inner">
        <section className="dp-section">
          <p className="imp-desc">{t(mode === 'checkout' ? 'eq.checkOutDesc' : 'eq.checkInDesc')}</p>
          <input className="use-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t('eq.usageSearch')} aria-label={t('eq.usageSearch')} />
          {candidates.length === 0 ? (
            <p className="imp-desc">{t(mode === 'checkout' ? 'eq.usageNoneOut' : 'eq.usageNoneIn')}</p>
          ) : (
            <>
              <label className="use-all">
                <input type="checkbox" checked={allShown} onChange={toggleAll} />
                {t('eq.usageSelectAll', { count: selectable.length })}
              </label>
              <ul className="use-list" role="group" aria-label={t('eq.usagePick')}>
                {shown.map((r) => (
                  <li key={r.id}>
                    <label>
                      <input type="checkbox" checked={picked.has(r.id)} disabled={blockedOf(r)} onChange={() => toggle(r.id)} />
                      <strong>{r.serial_number}</strong>
                      <span className="use-meta">{[r.part_number, r.location].filter(Boolean).join(' · ')}</span>
                      {blockedOf(r) && <span className="use-meta use-blocked">{t('eq.usageNeedsParentShort')}</span>}
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
          {picked.size > 0 && <p className="imp-desc" role="status">{t('eq.usageSelected', { count: picked.size, total })}</p>}
        </section>
        <section className="dp-section">
          <NoteField id="usage-tool-note" value={note} onChange={setNote} />
          {error && <p className="dp-error" role="alert">{error}</p>}
        </section>
      </div>
    </DetailPanel>
  );
}
