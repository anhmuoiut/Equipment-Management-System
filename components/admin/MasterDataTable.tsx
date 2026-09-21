'use client';

/**
 * One reusable editable-table pattern for every master-data list (Equipment
 * Types, Statuses, Levels, Locations) — matches the row-is-directly-editable
 * format Field Configuration already uses for dropdown options: no separate
 * "click Edit to unlock" step, a trailing "+ Add" row appends a new one.
 * `code` is permanent once saved (an internal stable identifier other rows
 * reference by id, not by code, but a human still relies on it as a
 * recognizable key) — only display name/description/order/active status
 * stay editable afterward. Deactivating (never deleting) is how a value
 * stops being offered for NEW equipment while old equipment referencing it
 * keeps displaying normally.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '@/lib/client/api';
import { Button, Notice, Spinner } from '@/components/ui';
import { translateError } from '@/lib/i18n/errors';

export type MasterDataRow = {
  id: string; code: string; display_name: string; description: string | null;
  display_order: number; is_active: boolean; requires_remark?: boolean;
};
type Draft = { display_name: string; description: string; display_order: string; is_active: boolean; requires_remark: boolean };
type NewDraft = Draft & { code: string };

const EMPTY_NEW: NewDraft = { code: '', display_name: '', description: '', display_order: '0', is_active: true, requires_remark: false };

function draftFrom(row: MasterDataRow): Draft {
  return {
    display_name: row.display_name, description: row.description ?? '',
    display_order: String(row.display_order), is_active: row.is_active,
    requires_remark: row.requires_remark ?? false,
  };
}

/** The `locations` table predates the master-data pattern and uses
 *  name/sort_order instead of display_name/display_order, with no
 *  description column — normalized here rather than changing its schema. */
type ApiRow = { id: string; code: string; is_active: boolean; requires_remark?: boolean } & Record<string, unknown>;

function fromApi(row: ApiRow, variant?: 'locations'): MasterDataRow {
  return variant === 'locations'
    ? { id: row.id, code: row.code, display_name: (row.name as string | null) ?? '', description: null, display_order: (row.sort_order as number) ?? 0, is_active: row.is_active }
    : { id: row.id, code: row.code, display_name: row.display_name as string, description: (row.description as string | null) ?? null, display_order: row.display_order as number, is_active: row.is_active, requires_remark: row.requires_remark };
}

function toApiPayload(draft: Draft, showRequiresRemark: boolean, variant?: 'locations'): Record<string, unknown> {
  return variant === 'locations'
    ? { name: draft.display_name.trim() || null, sort_order: Number(draft.display_order) || 0, is_active: draft.is_active }
    : {
      display_name: draft.display_name.trim(),
      description: draft.description.trim() || null,
      display_order: Number(draft.display_order) || 0,
      is_active: draft.is_active,
      ...(showRequiresRemark ? { requires_remark: draft.requires_remark } : {}),
    };
}

function toApiCreatePayload(form: NewDraft, showRequiresRemark: boolean, variant?: 'locations'): Record<string, unknown> {
  return variant === 'locations'
    ? { code: form.code.trim(), name: form.display_name.trim() || null, sort_order: Number(form.display_order) || 0 }
    : {
      code: form.code.trim(),
      display_name: form.display_name.trim(),
      description: form.description.trim() || null,
      display_order: Number(form.display_order) || 0,
      ...(showRequiresRemark ? { requires_remark: form.requires_remark } : {}),
    };
}

export function MasterDataTable({
  title, hint, endpoint, showRequiresRemark, canManage, variant,
}: { title: string; hint: string; endpoint: string; showRequiresRemark: boolean; canManage: boolean; variant?: 'locations' }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const [rows, setRows] = useState<MasterDataRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newRows, setNewRows] = useState<{ tempId: string; form: NewDraft }[]>([]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ApiRow[]>(endpoint);
      const mapped = res.data.map((row) => fromApi(row, variant));
      setRows(mapped);
      setDrafts(Object.fromEntries(mapped.map((row) => [row.id, draftFrom(row)])));
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void refresh(); }, [endpoint]);

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? EMPTY_NEW), ...patch } }));
  }
  function isDirty(row: MasterDataRow): boolean {
    const draft = drafts[row.id];
    if (!draft) return false;
    return draft.display_name !== row.display_name || draft.description !== (row.description ?? '')
      || draft.display_order !== String(row.display_order) || draft.is_active !== row.is_active
      || draft.requires_remark !== (row.requires_remark ?? false);
  }
  async function saveDraft(row: MasterDataRow) {
    const draft = drafts[row.id];
    if (!draft) return;
    setBusyId(row.id);
    setError(null);
    try {
      await api.put(`${endpoint}/${row.id}`, toApiPayload(draft, showRequiresRemark, variant));
      setNotice(t('adminMasterData.saved'));
      void refresh();
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setBusyId(null);
    }
  }

  function addNewRow() {
    setNewRows((rs) => [...rs, { tempId: crypto.randomUUID(), form: EMPTY_NEW }]);
  }
  function updateNewRow(tempId: string, patch: Partial<NewDraft>) {
    setNewRows((rs) => rs.map((r) => (r.tempId === tempId ? { ...r, form: { ...r.form, ...patch } } : r)));
  }
  function removeNewRow(tempId: string) {
    setNewRows((rs) => rs.filter((r) => r.tempId !== tempId));
  }
  async function saveNewRow(tempId: string) {
    const row = newRows.find((r) => r.tempId === tempId);
    if (!row || !row.form.code.trim() || !row.form.display_name.trim()) return;
    setBusyId(tempId);
    setError(null);
    try {
      await api.post(endpoint, toApiCreatePayload(row.form, showRequiresRemark, variant));
      setNotice(t('adminMasterData.added'));
      removeNewRow(tempId);
      void refresh();
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setBusyId(null);
    }
  }

  // API validation may use named fields or Zod issues. Keep the reason
  // visible so a rejected row can be corrected without guessing.
  const fieldLabels: Record<string, string> = {
    code: t('common.code'), display_name: t('common.name'), name: t('common.name'),
    display_order: t('adminFields.sortOrder'), sort_order: t('adminFields.sortOrder'),
  };
  const validationMessages: string[] = [];
  if (error?.code === 'VALIDATION_ERROR') {
    for (const [field, message] of Object.entries(error.fieldErrors)) {
      if (typeof message === 'string') validationMessages.push((fieldLabels[field] ?? field) + ': ' + message);
    }
    const issues = error.details.issues;
    if (Array.isArray(issues)) {
      for (const issue of issues) {
        if (!issue || typeof issue.message !== 'string') continue;
        const field = Array.isArray(issue.path) ? String(issue.path[0] ?? '') : '';
        validationMessages.push((fieldLabels[field] ?? field) + ': ' + issue.message);
      }
    }
  }

  return (
    <section className="detail-section">
      <div>
        <h3 className="detail-section-title">{title}</h3>
        <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>{hint}</p>
      </div>
      {notice && <div className="my-2"><Notice tone="info" onDismiss={() => setNotice(null)}>{notice}</Notice></div>}
      {error && <div className="my-2"><Notice tone="alert" onDismiss={() => setError(null)}>
        <p>{translateError(error.code, language, error.message)}</p>
        {validationMessages.length > 0 && <ul className="mt-1 list-disc pl-4">
          {validationMessages.map((message, index) => <li key={index}>{message}</li>)}
        </ul>}
      </Notice></div>}
      {loading ? <Spinner label={t('common.loadingEllipsis')} /> : (
        <div className="max-h-80 overflow-auto">
          <table className="grid-table">
            <thead>
              <tr>
                <th>{t('common.code')}</th>
                <th>{t('common.name')}</th>
                <th>{t('adminFields.sortOrder')}</th>
                {showRequiresRemark && <th style={{ width: 110 }} className="text-center">{t('adminMasterData.requiresRemark')}</th>}
                <th style={{ width: 80 }} className="text-center">{t('adminFields.optionActive')}</th>
                {canManage && <th style={{ width: 72 }} />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const draft = drafts[row.id] ?? draftFrom(row);
                const dirty = isDirty(row);
                return (
                  <tr key={row.id} data-archived={!row.is_active}>
                    <td><span className="ident" style={{ color: 'var(--ink-2)' }}>{row.code}</span></td>
                    <td>
                      <input value={draft.display_name} disabled={!canManage}
                        onChange={(e) => updateDraft(row.id, { display_name: e.target.value })}
                        className="w-full min-w-[140px] border px-1.5 py-1 text-[12px]" style={{ borderColor: 'var(--rule)' }} />
                    </td>
                    <td>
                      <input type="number" value={draft.display_order} disabled={!canManage}
                        onChange={(e) => updateDraft(row.id, { display_order: e.target.value })}
                        className="w-full border px-1.5 py-1 text-[12px]" style={{ borderColor: 'var(--rule)' }} />
                    </td>
                    {showRequiresRemark && (
                      <td className="text-center">
                        <input type="checkbox" checked={draft.requires_remark} disabled={!canManage}
                          onChange={(e) => updateDraft(row.id, { requires_remark: e.target.checked })} />
                      </td>
                    )}
                    <td className="text-center">
                      <input type="checkbox" checked={draft.is_active} disabled={!canManage}
                        onChange={(e) => updateDraft(row.id, { is_active: e.target.checked })} />
                    </td>
                    {canManage && (
                      <td className="text-center">
                        {dirty && <Button size="sm" loading={busyId === row.id} onClick={() => void saveDraft(row)}>{t('common.save')}</Button>}
                      </td>
                    )}
                  </tr>
                );
              })}
              {newRows.map((r) => (
                <tr key={r.tempId}>
                  <td>
                    <input aria-label={t('common.code')} value={r.form.code} maxLength={50} placeholder={t('adminMasterData.codePlaceholder')}
                      onChange={(e) => updateNewRow(r.tempId, { code: e.target.value })}
                      className="w-full min-w-[100px] border px-1.5 py-1 text-[12px] ident" style={{ borderColor: 'var(--rule)' }} />
                  </td>
                  <td>
                    <input aria-label={t('common.name')} value={r.form.display_name} maxLength={200} placeholder={t('common.name')}
                      onChange={(e) => updateNewRow(r.tempId, { display_name: e.target.value })}
                      className="w-full min-w-[140px] border px-1.5 py-1 text-[12px]" style={{ borderColor: 'var(--rule)' }} />
                  </td>
                  <td>
                    <input aria-label={t('adminFields.sortOrder')} type="number" value={r.form.display_order}
                      onChange={(e) => updateNewRow(r.tempId, { display_order: e.target.value })}
                      className="w-full border px-1.5 py-1 text-[12px]" style={{ borderColor: 'var(--rule)' }} />
                  </td>
                  {showRequiresRemark && (
                    <td className="text-center">
                      <input type="checkbox" checked={r.form.requires_remark}
                        onChange={(e) => updateNewRow(r.tempId, { requires_remark: e.target.checked })} />
                    </td>
                  )}
                  <td className="text-center">
                    <input type="checkbox" checked={r.form.is_active} disabled />
                  </td>
                  <td className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button size="sm" disabled={!r.form.code.trim() || !r.form.display_name.trim()} loading={busyId === r.tempId}
                        onClick={() => void saveNewRow(r.tempId)}>{t('common.save')}</Button>
                      <button type="button" onClick={() => removeNewRow(r.tempId)} title={t('adminFields.removeOption')}
                        style={{ color: 'var(--alert)' }} className="px-1 text-[16px] leading-none">×</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canManage && <div className="mt-2"><Button size="sm" onClick={addNewRow}>{t('adminMasterData.newEntry')}</Button></div>}
    </section>
  );
}
