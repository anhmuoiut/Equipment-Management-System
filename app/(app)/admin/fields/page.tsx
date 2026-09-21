'use client';

/**
 * Admin — Field configuration.
 *
 * V2 draws a hard line between SYSTEM FIELDS (Serial Number, Type, Status,
 * Level, Location, Parent, Remark, Calibration Required, …) and CUSTOM
 * FIELDS an admin creates. System fields are protected: their field_key,
 * input_type and data_type never change — admin edits are limited to
 * presentation metadata (label/required/visible/order/help/placeholder).
 * *_ref system fields (Type/Level/Status/Location) don't even show an
 * options editor here; their values live in Admin → Master data instead.
 *
 * A custom field can be created, edited (same metadata set), reordered,
 * shown/hidden, and deleted — deleting one also strips its key out of every
 * equipment.custom_fields row so nothing orphaned lingers. A custom
 * dropdown field's options live in field_options, managed the same
 * directly-editable-row pattern the rest of this app's admin tables use.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { api, ApiError, type FieldDefinition } from '@/lib/client/api';
import { Button, ConfirmDialog, Modal, Notice, RequiredMark, Spinner, Tag, toast } from '@/components/ui';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { AdminNav } from '@/components/admin/AdminNav';
import { PageHeading } from '@/components/layout/PageHeading';
import { translateError } from '@/lib/i18n/errors';

type OptionRow = { id: string; value: string; label: string; display_order: number; is_active: boolean };

type EditForm = {
  display_label: string;
  is_required: boolean;
  is_visible: boolean;
  display_order: string;
  max_length: string;
  help_text: string;
  placeholder: string;
};

const CUSTOM_INPUT_TYPES = ['text', 'textarea', 'number', 'date', 'boolean', 'dropdown'] as const;
type CustomInputType = typeof CUSTOM_INPUT_TYPES[number];
const INPUT_TYPE_KEYS: Record<CustomInputType, string> = {
  text: 'adminFields.inputTypeText', textarea: 'adminFields.inputTypeTextarea',
  number: 'adminFields.inputTypeNumber', date: 'adminFields.inputTypeDate',
  boolean: 'adminFields.inputTypeBoolean', dropdown: 'adminFields.inputTypeDropdown',
};

const EMPTY_CREATE = {
  field_key: '', display_label: '', input_type: 'text' as CustomInputType,
  is_required: false, is_visible: true, display_order: '100', help_text: '', placeholder: '',
};

export default function AdminFieldsPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [missingCount, setMissingCount] = useState<number | null>(null);
  const [missingLoading, setMissingLoading] = useState(false);
  const [editError, setEditError] = useState<ApiError | null>(null);

  const [options, setOptions] = useState<OptionRow[] | null>(null);
  const [optionDraft, setOptionDraft] = useState({ value: '', label: '' });
  // Staged, not autosaved — same "edit then Save" model MasterDataTable uses
  // for the identical concept (an Active checkbox on an admin-managed
  // reference row), instead of writing on every click with no confirmation.
  const [optionActiveDrafts, setOptionActiveDrafts] = useState<Record<string, boolean>>({});
  const [optionSavingId, setOptionSavingId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [createError, setCreateError] = useState<ApiError | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<FieldDefinition | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<FieldDefinition[]>('/api/admin/fields');
      setFields(res.data);
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function refreshOptions(fieldKey: string) {
    try {
      const res = await api.get<OptionRow[]>(`/api/admin/fields/${fieldKey}/options`);
      setOptions(res.data);
      setOptionActiveDrafts(Object.fromEntries(res.data.map((o) => [o.id, o.is_active])));
    } catch {
      setOptions([]);
    }
  }

  function openEdit(def: FieldDefinition) {
    setEditingKey(def.field_key);
    setForm({
      display_label: def.display_label,
      is_required: def.is_required,
      is_visible: def.is_visible,
      display_order: String(def.display_order),
      max_length: def.max_length != null ? String(def.max_length) : '',
      help_text: def.help_text ?? '',
      placeholder: def.placeholder ?? '',
    });
    setEditError(null);
    setMissingCount(null);
    setMissingLoading(true);
    setOptions(null);
    if (def.input_type === 'dropdown' && !def.is_system) void refreshOptions(def.field_key);
    void (async () => {
      try {
        const res = await api.get<{ missing_count: number }>(`/api/admin/fields/${def.field_key}`);
        setMissingCount(res.data.missing_count);
      } catch {
        // Informational only — a failed lookup doesn't block editing.
      } finally {
        setMissingLoading(false);
      }
    })();
  }

  async function saveEdit() {
    if (!editingKey || !form || busy) return;
    setEditError(null);
    setBusy(true);
    try {
      await api.put(`/api/admin/fields/${editingKey}`, {
        display_label: form.display_label.trim(),
        is_required: form.is_required,
        is_visible: form.is_visible,
        display_order: Number(form.display_order) || 0,
        max_length: form.max_length.trim() ? Number(form.max_length) : null,
        help_text: form.help_text.trim() || null,
        placeholder: form.placeholder.trim() || null,
      });
      toast.success(t('adminFields.settingsSaved', { label: form.display_label }));
      setEditingKey(null);
      setForm(null);
      void refresh();
    } catch (e) {
      if (e instanceof ApiError) setEditError(e);
    } finally {
      setBusy(false);
    }
  }

  async function addOption() {
    if (!editingKey || !optionDraft.value.trim() || !optionDraft.label.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/admin/fields/${editingKey}/options`, optionDraft);
      setOptionDraft({ value: '', label: '' });
      void refreshOptions(editingKey);
    } catch (e) {
      if (e instanceof ApiError) setEditError(e);
    } finally {
      setBusy(false);
    }
  }

  async function saveOptionActive(option: OptionRow) {
    if (!editingKey) return;
    const nextActive = optionActiveDrafts[option.id] ?? option.is_active;
    setOptionSavingId(option.id);
    try {
      await api.put(`/api/admin/fields/${editingKey}/options/${option.id}`, { is_active: nextActive });
      void refreshOptions(editingKey);
    } catch (e) {
      if (e instanceof ApiError) setEditError(e);
    } finally {
      setOptionSavingId(null);
    }
  }

  async function createCustomField() {
    setCreateError(null);
    setBusy(true);
    try {
      await api.post('/api/admin/fields', {
        field_key: createForm.field_key.trim(),
        display_label: createForm.display_label.trim(),
        input_type: createForm.input_type,
        is_required: createForm.is_required,
        is_visible: createForm.is_visible,
        display_order: Number(createForm.display_order) || 0,
        help_text: createForm.help_text.trim() || null,
        placeholder: createForm.placeholder.trim() || null,
      });
      setShowCreate(false);
      setCreateForm(EMPTY_CREATE);
      toast.success(t('adminFields.customFieldCreated'));
      void refresh();
    } catch (e) {
      if (e instanceof ApiError) setCreateError(e);
    } finally {
      setBusy(false);
    }
  }

  async function deleteCustomField() {
    if (!deleteTarget) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/api/admin/fields/${deleteTarget.field_key}`);
      toast.success(t('adminFields.customFieldDeleted'));
      setDeleteTarget(null);
      void refresh();
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setBusy(false);
    }
  }

  const systemFields = [...fields].filter((f) => f.is_system).sort((a, b) => a.display_order - b.display_order);
  const customFields = [...fields].filter((f) => !f.is_system).sort((a, b) => a.display_order - b.display_order);
  const editingDef = fields.find((f) => f.field_key === editingKey);

  function fieldTable(rows: FieldDefinition[], allowDelete: boolean) {
    return (
      <table className="grid-table">
        <thead>
          <tr>
            <th>{t('adminFields.field')}</th>
            <th>{t('adminFields.label')}</th>
            <th>{t('adminFields.inputType')}</th>
            <th>{t('adminFields.required')}</th>
            <th>{t('adminFields.visible')}</th>
            <th>{t('adminFields.order')}</th>
            <th>{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((def) => (
            <tr key={def.field_key}>
              <td className="ident font-medium">{def.field_key}</td>
              <td>{def.display_label}</td>
              <td className="ident" style={{ color: 'var(--ink-2)' }}>{def.input_type}</td>
              <td>{def.is_required ? <Tag text={t('adminFields.required')} tone="warn" /> : <span style={{ color: 'var(--ink-3)' }}>—</span>}</td>
              <td>{def.is_visible ? <Tag text={t('adminFields.visible')} tone="ok" /> : <Tag text={t('adminFields.hidden')} />}</td>
              <td>{def.display_order}</td>
              <td>
                <div className="table-actions">
                  <Button size="sm" onClick={() => openEdit(def)}>{t('adminFields.edit')}</Button>
                  {allowDelete && (
                    <Button size="sm" variant="danger" disabled={busy} onClick={() => setDeleteTarget(def)}
                      aria-label={`${t('adminFields.deleteField')}: ${def.display_label}`} title={t('adminFields.deleteField')}>
                      <Trash2 size={14} aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="admin-page">
      <PageHeading
        title={t('adminFields.title')} subtitle={t('adminFields.subtitle')}
        actions={<Button variant="primary" onClick={() => setShowCreate(true)}><Plus size={16} aria-hidden="true" />{t('adminFields.newCustomField')}</Button>}
      />

      <AdminNav />
      {error && <div className="mb-3"><Notice tone="alert" onDismiss={() => setError(null)}>{translateError(error.code, language, error.message)}</Notice></div>}

      <div className="equipment-panel" style={{ padding: 20, display: 'grid', gap: 24 }}>
        {loading ? <Spinner label={t('adminFields.loadingFields')} /> : (
          <>
            <section>
              <h3 className="detail-section-title">{t('adminFields.systemFields')}</h3>
              <p className="text-[11px] mb-2" style={{ color: 'var(--ink-3)' }}>{t('adminFields.systemFieldsHint')}</p>
              {fieldTable(systemFields, false)}
            </section>
            <section>
              <h3 className="detail-section-title">{t('adminFields.customFields')}</h3>
              <p className="text-[11px] mb-2" style={{ color: 'var(--ink-3)' }}>{t('adminFields.customFieldsHint')}</p>
              {customFields.length === 0
                ? (
                  <div className="px-4 py-16 text-center">
                    <p className="text-[14px]">{t('adminFields.noCustomFieldsYet')}</p>
                    <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-3)' }}>{t('adminFields.customFieldsWillAppear')}</p>
                  </div>
                )
                : fieldTable(customFields, true)}
            </section>
          </>
        )}
      </div>

      <Modal
        open={!!editingKey}
        wide
        title={form?.display_label || editingKey || ''}
        onClose={() => { setEditingKey(null); setForm(null); }}
        footer={form && (
          <>
            <Button type="button" disabled={busy} onClick={() => { setEditingKey(null); setForm(null); }}>{t('common.cancel')}</Button>
            <Button type="submit" form="field-edit-form" variant="primary" loading={busy}>{t('common.save')}</Button>
          </>
        )}
      >
        {form && (
          <form id="field-edit-form" className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void saveEdit(); }}>
            {editError && <Notice tone="alert">{translateError(editError.code, language, editError.message)}</Notice>}

            <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>{t('adminFields.usageNote')}</p>

            <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
              {t('adminFields.displayLabel')}<RequiredMark />
              <input required value={form.display_label}
                onChange={(e) => setForm((f) => f && { ...f, display_label: e.target.value })}
                className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-[12px]">
                <input type="checkbox" checked={form.is_required}
                  onChange={(e) => setForm((f) => f && { ...f, is_required: e.target.checked })} />
                {t('adminFields.required')}
              </label>
              <label className="flex items-center gap-2 text-[12px]">
                <input type="checkbox" checked={form.is_visible}
                  onChange={(e) => setForm((f) => f && { ...f, is_visible: e.target.checked })} />
                {t('adminFields.visible')}
              </label>
            </div>

            {missingLoading ? (
              <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>{t('adminFields.checkingRecords')}</p>
            ) : missingCount !== null && missingCount > 0 ? (
              <Notice tone="warn">{t('adminFields.missingValueCount', { count: missingCount })}</Notice>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
                {t('adminFields.displayOrder')}
                <input type="number" value={form.display_order}
                  onChange={(e) => setForm((f) => f && { ...f, display_order: e.target.value })}
                  className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
              </label>
              <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
                {t('adminFields.maxLength')}
                <input type="number" value={form.max_length}
                  onChange={(e) => setForm((f) => f && { ...f, max_length: e.target.value })}
                  className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
              </label>
            </div>

            <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
              {t('adminFields.helpText')}
              <textarea rows={2} value={form.help_text}
                onChange={(e) => setForm((f) => f && { ...f, help_text: e.target.value })}
                className="mt-1 w-full resize-y border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
            </label>

            <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
              {t('adminFields.placeholder')}
              <input value={form.placeholder}
                onChange={(e) => setForm((f) => f && { ...f, placeholder: e.target.value })}
                className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
            </label>

            {editingDef?.input_type === 'dropdown' && !editingDef.is_system && (
              <div className="grid gap-2 border-t pt-3" style={{ borderColor: 'var(--rule)' }}>
                <p className="text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>{t('adminFields.dropdownOptions')}</p>
                {options === null ? <Spinner label={t('common.loadingEllipsis')} /> : (
                  <table className="grid-table">
                    <thead>
                      <tr>
                        <th>{t('adminFields.storedValue')}</th>
                        <th>{t('adminFields.displayLabel')}</th>
                        <th style={{ width: 80 }} className="text-center">{t('adminFields.optionActive')}</th>
                        <th style={{ width: 72 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {options.map((opt) => {
                        const draftActive = optionActiveDrafts[opt.id] ?? opt.is_active;
                        const dirty = draftActive !== opt.is_active;
                        return (
                          <tr key={opt.id}>
                            <td className="ident">{opt.value}</td>
                            <td>{opt.label}</td>
                            <td className="text-center">
                              <input type="checkbox" checked={draftActive} disabled={optionSavingId === opt.id}
                                onChange={(e) => setOptionActiveDrafts((d) => ({ ...d, [opt.id]: e.target.checked }))} />
                            </td>
                            <td className="text-center">
                              {dirty && (
                                <Button size="sm" disabled={optionSavingId === opt.id} onClick={() => void saveOptionActive(opt)}>
                                  {t('common.save')}
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                <div className="flex gap-2">
                  <input value={optionDraft.value} placeholder={t('adminFields.storedValue')}
                    onChange={(e) => setOptionDraft((d) => ({ ...d, value: e.target.value }))}
                    className="border px-2 py-1 text-[12px] ident" style={{ borderColor: 'var(--rule)' }} />
                  <input value={optionDraft.label} placeholder={t('adminFields.displayLabel')}
                    onChange={(e) => setOptionDraft((d) => ({ ...d, label: e.target.value }))}
                    className="border px-2 py-1 text-[12px]" style={{ borderColor: 'var(--rule)' }} />
                  <Button type="button" size="sm" loading={busy} onClick={() => void addOption()}>{t('adminFields.addOption')}</Button>
                </div>
              </div>
            )}
          </form>
        )}
      </Modal>

      <Modal
        open={showCreate}
        title={t('adminFields.newCustomField')}
        onClose={() => { setShowCreate(false); setCreateError(null); }}
        footer={
          <>
            <Button type="button" disabled={busy} onClick={() => { setShowCreate(false); setCreateError(null); }}>{t('common.cancel')}</Button>
            <Button type="submit" form="field-create-form" variant="primary" loading={busy}>{t('common.create')}</Button>
          </>
        }
      >
        <form id="field-create-form" className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void createCustomField(); }}>
          {createError && <Notice tone="alert">{translateError(createError.code, language, createError.message)}
            {!!createError.details.fields && <ul className="mt-1 list-disc pl-4">{Object.entries(createError.details.fields as Record<string, string>).map(([k, m]) => <li key={k}>{m}</li>)}</ul>}
          </Notice>}
          <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
            {t('adminFields.fieldKey')}<RequiredMark />
            <input required value={createForm.field_key} placeholder="warranty_months"
              onChange={(e) => setCreateForm((f) => ({ ...f, field_key: e.target.value }))}
              className="mt-1 w-full border px-2 py-1.5 text-[13px] ident" style={{ borderColor: 'var(--rule)' }} />
            <span className="mt-1 block text-[11px]" style={{ color: 'var(--ink-3)' }}>{t('adminFields.fieldKeyHint')}</span>
          </label>
          <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
            {t('adminFields.displayLabel')}<RequiredMark />
            <input required value={createForm.display_label}
              onChange={(e) => setCreateForm((f) => ({ ...f, display_label: e.target.value }))}
              className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
          </label>
          <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
            {t('adminFields.fieldType')}
            <SearchableSelect
              value={createForm.input_type} ariaLabel={t('adminFields.fieldType')}
              onChange={(v) => setCreateForm((f) => ({ ...f, input_type: v as CustomInputType }))}
              options={CUSTOM_INPUT_TYPES.map((key) => ({ value: key, label: t(INPUT_TYPE_KEYS[key]) }))}
              className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={createForm.is_required}
                onChange={(e) => setCreateForm((f) => ({ ...f, is_required: e.target.checked }))} />
              {t('adminFields.required')}
            </label>
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={createForm.is_visible}
                onChange={(e) => setCreateForm((f) => ({ ...f, is_visible: e.target.checked }))} />
              {t('adminFields.visible')}
            </label>
          </div>
          <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
            {t('adminFields.displayOrder')}
            <input type="number" value={createForm.display_order}
              onChange={(e) => setCreateForm((f) => ({ ...f, display_order: e.target.value }))}
              className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
          </label>
          <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
            {t('adminFields.helpText')}
            <textarea rows={2} value={createForm.help_text}
              onChange={(e) => setCreateForm((f) => ({ ...f, help_text: e.target.value }))}
              className="mt-1 w-full resize-y border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
          </label>
          <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>{t('adminFields.dropdownOptionsAfterCreateHint')}</p>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('adminFields.deleteField')}
        description={t('adminFields.confirmDeleteCustomField')}
        confirmLabel={t('adminFields.deleteField')}
        busy={busy}
        onConfirm={() => void deleteCustomField()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
