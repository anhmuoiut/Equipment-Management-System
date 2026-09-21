'use client';

/**
 * Admin — Users & Permissions. Spec v0.9 mục 27, 29a, 30.
 *
 * Two kinds of account show up in this one list. "Supabase" accounts are
 * created here with the New user button — the admin sets the account's
 * real password directly in the form; it is never generated or shown back.
 * "Local" accounts are self-requested from the login page and land
 * inactive; there's no separate approval queue — the existing Reactivate
 * button *is* the approval step, same as un-deactivating anyone else.
 *
 * Permission is assigned one-by-one per user (mục 30): four independent
 * action toggles (Create / Move / Detach / Archive) plus an explicit list
 * of which fields the user may edit — no fixed presets. Admin is a single
 * "Administrator" toggle that bypasses every check below it regardless of
 * what's stored, so it disables the rest of the form when checked rather
 * than showing two redundant controls.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Eye, EyeOff, Plus, Search, KeyRound, UserCheck, UserX } from 'lucide-react';
import { api, ApiError, type FieldDefinition, type MasterDataRef } from '@/lib/client/api';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Button, EmptyState, ErrorState, Modal, Notice, RequiredMark, Tag, TableSkeleton, toast } from '@/components/ui';
import { AdminNav } from '@/components/admin/AdminNav';
import { PageHeading } from '@/components/layout/PageHeading';
import { translateError } from '@/lib/i18n/errors';
import { fieldLabel, type EquipmentLanguage } from '@/lib/i18n/equipment';

type Role = 'admin' | 'user' | 'viewer';

type AdminUserRow = {
  id: string;
  full_name: string;
  email: string | null;
  username: string;
  role: Role;
  is_active: boolean;
  auth_provider: 'supabase' | 'local';
  permissions: string[];
  editable_fields: string[];
};

type PermissionCatalogEntry = { code: string; display_label: string; category: string; description: string | null; display_order: number };

type PermissionForm = {
  is_admin: boolean;
  permissions: string[];
  editable_fields: string[];
};

function permissionFormFrom(row: AdminUserRow): PermissionForm {
  return { is_admin: row.role === 'admin', permissions: row.permissions, editable_fields: row.editable_fields };
}

const EMPTY_CREATE = {
  full_name: '', email: '', username: '', password: '', employee_id: '', department_id: '',
  permissions: { is_admin: false, permissions: ['equipment.create'], editable_fields: [] as string[] } as PermissionForm,
};

function issuesText(e: ApiError): string {
  const issues = e.details.issues;
  if (!Array.isArray(issues) || issues.length === 0) return e.message;
  return issues.map((i) => (i as { message?: string }).message).filter(Boolean).join(' ');
}

function permissionsSummary(row: AdminUserRow, t: TFunction): string {
  if (row.role === 'admin') return t('adminUsers.allAdmin');
  if (row.permissions.length === 0 && row.editable_fields.length === 0) return t('adminUsers.noPermissions');
  return `${t('adminUsers.actionsCount', { count: row.permissions.length })} · ${t('adminUsers.fieldsCount', { count: row.editable_fields.length })}`;
}

/** Grouped by category, driven entirely by the permission catalog — a new
 *  catalog row (a new capability application code starts checking) shows up
 *  here automatically, never a frontend code change. */
function PermissionEditor({
  value, onChange, fields, catalog, language, t,
}: {
  value: PermissionForm;
  onChange: (next: PermissionForm) => void;
  fields: FieldDefinition[];
  catalog: PermissionCatalogEntry[];
  language: EquipmentLanguage;
  t: TFunction;
}) {
  const byCategory = new Map<string, PermissionCatalogEntry[]>();
  for (const entry of [...catalog].sort((a, b) => a.display_order - b.display_order)) {
    byCategory.set(entry.category, [...(byCategory.get(entry.category) ?? []), entry]);
  }

  return (
    <div className="grid gap-3">
      <label className="flex items-center gap-2 text-[13px] font-medium">
        <input type="checkbox" checked={value.is_admin}
          onChange={(e) => onChange({ ...value, is_admin: e.target.checked })} />
        {t('adminUsers.administrator')}
      </label>
      <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>{t('adminUsers.administratorHint')}</p>

      {!value.is_admin && (
        <>
          <div>
            <p className="text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>{t('adminUsers.actionPermissions')}</p>
            <div className="mt-2 grid gap-3">
              {[...byCategory.entries()].map(([category, entries]) => (
                <div key={category}>
                  <p className="text-[11px] font-semibold uppercase" style={{ color: 'var(--ink-3)', letterSpacing: '.04em' }}>{category}</p>
                  <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {entries.map((entry) => (
                      <label key={entry.code} className="flex items-center gap-1.5 text-[12px]" title={entry.description ?? undefined}>
                        <input type="checkbox" checked={value.permissions.includes(entry.code)}
                          onChange={(e) => onChange({
                            ...value,
                            permissions: e.target.checked
                              ? [...value.permissions, entry.code]
                              : value.permissions.filter((c) => c !== entry.code),
                          })} />
                        {entry.display_label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>{t('adminUsers.fieldPermissions')}</p>
              <div className="flex gap-2 text-[11px]">
                <button type="button" className="underline" style={{ color: 'var(--ink-2)' }}
                  onClick={() => onChange({ ...value, editable_fields: fields.map((f) => f.field_key) })}>
                  {t('adminUsers.selectAllFields')}
                </button>
                <button type="button" className="underline" style={{ color: 'var(--ink-2)' }}
                  onClick={() => onChange({ ...value, editable_fields: [] })}>
                  {t('adminUsers.clearAllFields')}
                </button>
              </div>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>{t('adminUsers.fieldPermissionsHint')}</p>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {fields.map((f) => (
                <label key={f.field_key} className="flex items-center gap-1.5 text-[12px]">
                  <input type="checkbox" checked={value.editable_fields.includes(f.field_key)}
                    onChange={(e) => onChange({
                      ...value,
                      editable_fields: e.target.checked
                        ? [...value.editable_fields, f.field_key]
                        : value.editable_fields.filter((k) => k !== f.field_key),
                    })} />
                  {fieldLabel(f, language)}
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminUsersPage() {
  const { t, i18n } = useTranslation();
  const language = (i18n.language === 'vi' ? 'vi' : 'en') as EquipmentLanguage;

  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [catalog, setCatalog] = useState<PermissionCatalogEntry[]>([]);
  const [departments, setDepartments] = useState<MasterDataRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [createPasswordVisible, setCreatePasswordVisible] = useState(false);
  const [createError, setCreateError] = useState<ApiError | null>(null);

  const [permTarget, setPermTarget] = useState<AdminUserRow | null>(null);
  const [permForm, setPermForm] = useState<PermissionForm | null>(null);
  const [permError, setPermError] = useState<ApiError | null>(null);

  const [pwTarget, setPwTarget] = useState<AdminUserRow | null>(null);
  const [pwForm, setPwForm] = useState({ password: '', confirm: '' });
  const [pwVisible, setPwVisible] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwApiError, setPwApiError] = useState<ApiError | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ users: AdminUserRow[] }>('/api/admin/permissions');
      setUsers(res.data.users);
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshFields = useCallback(async () => {
    try {
      const res = await api.get<FieldDefinition[]>('/api/admin/fields');
      setFields(res.data);
    } catch {
      // Informational only — the field checklist just stays empty.
    }
  }, []);

  const refreshCatalog = useCallback(async () => {
    try {
      const res = await api.get<PermissionCatalogEntry[]>('/api/admin/permissions/catalog');
      setCatalog(res.data);
    } catch {
      // Informational only — the permission checklist just stays empty.
    }
  }, []);

  const refreshDepartments = useCallback(async () => {
    try {
      const res = await api.get<{ departments: MasterDataRef[] }>('/api/master-data');
      setDepartments(res.data.departments);
    } catch {
      // Informational only — the Department picker on the create form just stays empty.
    }
  }, []);

  useEffect(() => {
    void refresh(); void refreshFields(); void refreshCatalog(); void refreshDepartments();
  }, [refresh, refreshFields, refreshCatalog, refreshDepartments]);

  const visibleUsers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return users.filter((user) => [user.full_name, user.username, user.email ?? ''].some((value) => value.toLocaleLowerCase().includes(query)));
  }, [users, search]);

  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => a.display_order - b.display_order),
    [fields],
  );

  async function createUser() {
    setCreateError(null);
    setBusy(true);
    try {
      const p = createForm.permissions;
      await api.post('/api/admin/users', {
        full_name: createForm.full_name.trim(),
        email: createForm.email.trim(),
        username: createForm.username.trim(),
        password: createForm.password,
        employee_id: createForm.employee_id.trim() || null,
        department_id: createForm.department_id || null,
        role: p.is_admin ? 'admin' : 'user',
        permissions: p.is_admin ? [] : p.permissions,
        editable_fields: p.is_admin ? [] : p.editable_fields,
      });
      setShowCreate(false);
      setCreateForm(EMPTY_CREATE);
      setCreatePasswordVisible(false);
      toast.success(t('adminUsers.userCreated'));
      void refresh();
    } catch (e) {
      if (e instanceof ApiError) setCreateError(e);
    } finally {
      setBusy(false);
    }
  }

  async function setActive(userId: string, active: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/admin/users/${userId}/${active ? 'reactivate' : 'deactivate'}`);
      toast.success(active ? t('adminUsers.userReactivated') : t('adminUsers.userDeactivated'));
      void refresh();
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setBusy(false);
    }
  }

  function openPermissions(row: AdminUserRow) {
    setPermTarget(row);
    setPermForm(permissionFormFrom(row));
    setPermError(null);
    setNotice(null);
  }

  async function savePermissions() {
    if (!permTarget || !permForm) return;
    setBusy(true);
    setPermError(null);
    setNotice(null);
    try {
      if (permForm.is_admin !== (permTarget.role === 'admin')) {
        await api.put(`/api/admin/users/${permTarget.id}/role`, { role: permForm.is_admin ? 'admin' : 'user' });
      }
      if (!permForm.is_admin) {
        const res = await api.put<{ warning: string | null }>(`/api/admin/users/${permTarget.id}/permissions`, {
          permissions: permForm.permissions,
          editable_fields: permForm.editable_fields,
        });
        if (res.data.warning) setNotice(res.data.warning);
        else toast.success(t('adminUsers.permissionsSaved'));
      } else {
        toast.success(t('adminUsers.permissionsSaved'));
      }
      setPermTarget(null);
      setPermForm(null);
      void refresh();
    } catch (e) {
      if (e instanceof ApiError) setPermError(e);
    } finally {
      setBusy(false);
    }
  }

  function openChangePassword(row: AdminUserRow) {
    setPwTarget(row);
    setPwForm({ password: '', confirm: '' });
    setPwVisible(false);
    setPwError(null);
    setPwApiError(null);
  }

  async function submitChangePassword() {
    if (!pwTarget) return;
    setPwError(null);
    setPwApiError(null);
    if (pwForm.password !== pwForm.confirm) {
      setPwError(t('adminUsers.errorPasswordMismatch'));
      return;
    }
    if (pwForm.password.length < 10) {
      setPwError(t('adminUsers.errorPasswordTooShort'));
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/admin/users/${pwTarget.id}/change-password`, { new_password: pwForm.password });
      toast.success(t('adminUsers.passwordChanged'));
      setPwTarget(null);
    } catch (e) {
      if (e instanceof ApiError) setPwApiError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-page">
      <PageHeading
        title={t('adminUsers.title')} subtitle={t('adminUsers.subtitle')}
        actions={<Button variant="primary" onClick={() => setShowCreate(true)}><Plus size={16} aria-hidden="true" />{t('adminUsers.newUser')}</Button>}
      />

      <AdminNav />

      {notice && <div className="mb-3"><Notice tone="warn" onDismiss={() => setNotice(null)}>{notice}</Notice></div>}
      {error && users.length > 0 && (
        <div className="mb-3"><Notice tone="alert" onDismiss={() => setError(null)}>{translateError(error.code, language, error.message)}</Notice></div>
      )}

      <div className="equipment-panel">
        <div className="list-toolbar">
          <span className="list-count" role="status">{t('adminUsers.userCount', { count: visibleUsers.length })}</span>
          <label className="search-control"><Search size={17} aria-hidden="true" /><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('adminUsers.searchUsers')} aria-label={t('adminUsers.searchUsers')} /></label>
        </div>
        <div className="equipment-scroll" aria-busy={loading || undefined}>
          {error && users.length === 0 ? (
            <ErrorState message={translateError(error.code, language, error.message)} onRetry={() => void refresh()} />
          ) : loading && users.length === 0 ? (
            <table className="grid-table users-table">
              <thead>
                <tr>
                  <th>{t('adminUsers.name')}</th>
                  <th>Email</th>
                  <th>{t('adminUsers.account')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('adminUsers.permissionsTitle')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody><TableSkeleton columns={6} /></tbody>
            </table>
          ) : visibleUsers.length === 0 ? (
            <EmptyState
              title={t(search.trim() ? 'adminUsers.noMatchingUsers' : 'adminUsers.noUsersYet')}
              subtitle={t(search.trim() ? 'adminUsers.tryDifferentSearch' : 'adminUsers.usersWillAppear')}
            />
          ) : (
            <table className="grid-table users-table" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 150ms' }}>
              <thead>
                <tr>
                  <th>{t('adminUsers.name')}</th>
                  <th>Email</th>
                  <th>{t('adminUsers.account')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('adminUsers.permissionsTitle')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((row) => (
                  <tr key={row.id}>
                    <td><div className="user-identity"><span className="user-avatar" aria-hidden="true">{row.full_name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span><span>{row.full_name}<span className="user-identity-secondary ident">{row.username}</span></span></div></td>
                    <td style={{ color: 'var(--ink-2)' }}>{row.email ?? '—'}</td>
                    <td>
                      {row.auth_provider === 'local'
                        ? (row.is_active
                          ? <Tag text={t('adminUsers.local')} />
                          : <Tag text={t('adminUsers.localPending')} tone="warn" />)
                        : <Tag text="Supabase" />}
                    </td>
                    <td>
                      {row.is_active
                        ? <Tag text={t('adminUsers.active')} tone="ok" />
                        : <Tag text={t('adminUsers.inactive')} tone="warn" />}
                    </td>
                    <td>
                      <div className="table-actions">
                        <span style={{ color: 'var(--ink-2)' }}>{permissionsSummary(row, t)}</span>
                        <Button size="sm" disabled={busy} onClick={() => openPermissions(row)}>
                          {t('adminUsers.editPermissions')}
                        </Button>
                      </div>
                    </td>
                    <td>
                      <div className="table-actions user-row-actions">
                        <Button size="sm" disabled={busy} onClick={() => openChangePassword(row)} aria-label={`${t('adminUsers.changePassword')}: ${row.full_name}`} title={t('adminUsers.changePassword')}>
                          <KeyRound size={16} aria-hidden="true" />
                        </Button>
                        {row.is_active ? (
                          <Button size="sm" variant="danger" loading={busy} onClick={() => void setActive(row.id, false)} aria-label={`${t('adminUsers.deactivate')}: ${row.full_name}`} title={t('adminUsers.deactivate')}>
                            <UserX size={16} aria-hidden="true" />
                          </Button>
                        ) : (
                          <Button size="sm" loading={busy} onClick={() => void setActive(row.id, true)} aria-label={`${t('adminUsers.reactivate')}: ${row.full_name}`} title={t('adminUsers.reactivate')}>
                            <UserCheck size={16} aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal open={showCreate} wide title={t('adminUsers.newUser')} onClose={() => { setShowCreate(false); setCreateError(null); }}
        footer={
          <>
            <Button type="button" onClick={() => { setShowCreate(false); setCreateError(null); }}>{t('common.cancel')}</Button>
            <Button type="submit" form="user-create-form" variant="primary" loading={busy}>{t('common.create')}</Button>
          </>
        }
      >
        <form
          id="user-create-form"
          className="grid gap-3"
          onSubmit={(e) => { e.preventDefault(); void createUser(); }}
        >
          {createError && <Notice tone="alert">{issuesText(createError)}</Notice>}
          <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
            {t('adminUsers.fullName')}<RequiredMark />
            <input required value={createForm.full_name}
              onChange={(e) => setCreateForm((f) => ({ ...f, full_name: e.target.value }))}
              className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
          </label>
          <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
            Email<RequiredMark />
            <input required type="email" value={createForm.email}
              onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
          </label>
          <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
            {t('adminUsers.username')}<RequiredMark />
            <input required value={createForm.username}
              onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
              className="mt-1 w-full border px-2 py-1.5 text-[13px] ident" style={{ borderColor: 'var(--rule)' }} />
          </label>
          <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
            {t('adminUsers.password')}<RequiredMark />
            <div className="login-input mt-1">
              <input required minLength={10} maxLength={256} type={createPasswordVisible ? 'text' : 'password'}
                autoComplete="new-password" value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
              <button type="button" onClick={() => setCreatePasswordVisible((v) => !v)}
                aria-label={createPasswordVisible ? t('login.hidePassword') : t('login.showPassword')}>
                {createPasswordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
              {t('adminUsers.employeeId')}
              <input value={createForm.employee_id}
                onChange={(e) => setCreateForm((f) => ({ ...f, employee_id: e.target.value }))}
                className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
            </label>
            <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
              {t('adminUsers.department')}
              <SearchableSelect
                value={createForm.department_id} clearable placeholder={t('dynamicForm.selectPlaceholder')}
                ariaLabel={t('adminUsers.department')}
                onChange={(v) => setCreateForm((f) => ({ ...f, department_id: v }))}
                options={departments.map((d) => ({ value: d.id, label: d.display_name, disabled: !d.is_active }))}
                className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }}
              />
            </label>
          </div>

          <div className="border-t pt-3" style={{ borderColor: 'var(--rule-soft)' }}>
            <PermissionEditor
              value={createForm.permissions}
              onChange={(next) => setCreateForm((f) => ({ ...f, permissions: next }))}
              fields={sortedFields}
              catalog={catalog}
              language={language}
              t={t}
            />
          </div>
        </form>
      </Modal>

      <Modal open={!!permTarget} wide
        title={permTarget ? `${t('adminUsers.permissionsFor')} ${permTarget.full_name}` : ''}
        onClose={() => { setPermTarget(null); setPermForm(null); }}
        footer={permTarget && permForm && (
          <>
            <Button type="button" disabled={busy} onClick={() => { setPermTarget(null); setPermForm(null); }}>{t('common.cancel')}</Button>
            <Button type="submit" form="user-permissions-form" variant="primary" loading={busy}>{t('common.save')}</Button>
          </>
        )}
      >
        {permTarget && permForm && (
          <form id="user-permissions-form" className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void savePermissions(); }}>
            {permError && <Notice tone="alert">{translateError(permError.code, language, permError.message)}</Notice>}
            <PermissionEditor
              value={permForm}
              onChange={setPermForm}
              fields={sortedFields}
              catalog={catalog}
              language={language}
              t={t}
            />
          </form>
        )}
      </Modal>

      <Modal open={!!pwTarget} title={t('adminUsers.changePasswordTitle')} onClose={() => setPwTarget(null)}
        footer={pwTarget && (
          <>
            <Button type="button" disabled={busy} onClick={() => setPwTarget(null)}>{t('common.cancel')}</Button>
            <Button type="submit" form="user-change-password-form" variant="primary" loading={busy}>{t('common.save')}</Button>
          </>
        )}
      >
        {pwTarget && (
          <form id="user-change-password-form" className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void submitChangePassword(); }}>
            <p className="text-[12px]" style={{ color: 'var(--ink-2)' }}>
              {t('adminUsers.changePasswordFor')} <span className="ident font-medium">{pwTarget.username}</span>
            </p>
            {pwError && <Notice tone="alert">{pwError}</Notice>}
            {pwApiError && <Notice tone="alert">{translateError(pwApiError.code, language, pwApiError.message)}</Notice>}
            <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
              {t('adminUsers.newPassword')}<RequiredMark />
              <div className="login-input mt-1">
                <input required minLength={10} maxLength={256} type={pwVisible ? 'text' : 'password'}
                  autoComplete="new-password" value={pwForm.password}
                  onChange={(e) => setPwForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
                <button type="button" onClick={() => setPwVisible((v) => !v)}
                  aria-label={pwVisible ? t('login.hidePassword') : t('login.showPassword')}>
                  {pwVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
            <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
              {t('adminUsers.confirmNewPassword')}<RequiredMark />
              <input required minLength={10} maxLength={256} type={pwVisible ? 'text' : 'password'}
                autoComplete="new-password" value={pwForm.confirm}
                onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
                className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
            </label>
          </form>
        )}
      </Modal>
    </div>
  );
}
