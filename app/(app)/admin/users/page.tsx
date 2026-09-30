'use client';

/**
 * Admin — Users & Permissions. Spec v0.9 mục 27, 29a, 30.
 *
 * Two kinds of account show up in this one list. "Supabase" accounts are
 * created here with the New user button — the admin sets the account's
 * real password directly in the form; it is never generated or shown back,
 * and the user must replace it at first sign-in. "Local" accounts are
 * self-requested from the login page and land inactive as Viewer; there's
 * no separate approval queue — the Reactivate button *is* the approval
 * step, and switching the role to User is what lets them do more than view.
 *
 * Access is one role (Administrator / User / Viewer) plus, for User only,
 * permissions assigned one-by-one (mục 30): action permissions from the
 * catalog and an explicit list of fields the user may edit — no presets.
 * Role and permissions are saved together in one request (one transaction
 * server-side). The server refuses to let an admin deactivate/demote
 * themselves or remove the last active admin; the UI just doesn't offer it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Eye, EyeOff, Plus, Search, KeyRound, Pencil, UserCheck, UserX } from 'lucide-react';
import { api, ApiError, type FieldDefinition, type MasterDataRef } from '@/lib/client/api';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Button, ConfirmDialog, EmptyState, ErrorState, Modal, Notice, RequiredMark, Tag, TableSkeleton, toast } from '@/components/ui';
import { AdminNav } from '@/components/admin/AdminNav';
import { useAdminAccess } from '@/components/admin/AdminAccessContext';
import { PageHeading } from '@/components/layout/PageHeading';
import { translateError } from '@/lib/i18n/errors';
import { fieldLabel, type EquipmentLanguage } from '@/lib/i18n/equipment';

type Role = 'admin' | 'user' | 'viewer';
const ROLES: Role[] = ['admin', 'user', 'viewer'];
const ROLE_LABEL: Record<Role, string> = { admin: 'adminUsers.roleAdmin', user: 'adminUsers.roleUser', viewer: 'adminUsers.roleViewer' };
const ROLE_HINT: Record<Role, string> = { admin: 'adminUsers.administratorHint', user: 'adminUsers.roleUserHint', viewer: 'adminUsers.roleViewerHint' };

type AdminUserRow = {
  id: string;
  full_name: string;
  email: string | null;
  username: string;
  employee_id: string | null;
  department_id: string | null;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  auth_provider: 'supabase' | 'local';
  permissions: string[];
  editable_fields: string[];
};

type PermissionCatalogEntry = { code: string; display_label: string; category: string; description: string | null; display_order: number };

type AccessForm = {
  role: Role;
  permissions: string[];
  editable_fields: string[];
};

type AccessResult = { blocking_required_fields: string[] };

function accessFormFrom(row: AdminUserRow): AccessForm {
  return { role: row.role, permissions: row.permissions, editable_fields: row.editable_fields };
}

const EMPTY_CREATE = {
  full_name: '', email: '', username: '', password: '', employee_id: '', department_id: '',
  access: { role: 'user', permissions: ['equipment.create'], editable_fields: [] as string[] } as AccessForm,
};

const EMPTY_DETAILS = { full_name: '', email: '', employee_id: '', department_id: '' };

function issuesText(e: ApiError, language: EquipmentLanguage): string {
  const issues = e.details.issues;
  if (!Array.isArray(issues) || issues.length === 0) return translateError(e.code, language, e.message);
  return issues.map((i) => (i as { message?: string }).message).filter(Boolean).join(' ');
}

function permissionsSummary(row: AdminUserRow, t: TFunction): string {
  if (row.role === 'admin') return t('adminUsers.allAdmin');
  if (row.role === 'viewer') return t('adminUsers.viewOnly');
  if (row.permissions.length === 0 && row.editable_fields.length === 0) return t('adminUsers.noPermissions');
  return `${t('adminUsers.actionsCount', { count: row.permissions.length })} · ${t('adminUsers.fieldsCount', { count: row.editable_fields.length })}`;
}

/** Required fields a User with equipment.create couldn't fill — creating
 *  equipment needs every Required field, and the server rejects any field
 *  the user can't edit. Same rule the server's warning uses. */
function missingRequiredFields(value: AccessForm, fields: FieldDefinition[]): FieldDefinition[] {
  if (value.role !== 'user' || !value.permissions.includes('equipment.create')) return [];
  return fields.filter((f) => f.is_required && !value.editable_fields.includes(f.field_key));
}

/** Role, then — for role User only — the permission catalog grouped by
 *  category and the editable-field checklist. Driven entirely by the
 *  catalog, so a new catalog row shows up here without a frontend change. */
function AccessEditor({
  value, onChange, fields, catalog, language, t, roleLocked,
}: {
  value: AccessForm;
  onChange: (next: AccessForm) => void;
  fields: FieldDefinition[];
  catalog: PermissionCatalogEntry[];
  language: EquipmentLanguage;
  t: TFunction;
  /** Your own account: the server refuses a self role change. */
  roleLocked?: boolean;
}) {
  const byCategory = new Map<string, PermissionCatalogEntry[]>();
  for (const entry of [...catalog].sort((a, b) => a.display_order - b.display_order)) {
    byCategory.set(entry.category, [...(byCategory.get(entry.category) ?? []), entry]);
  }
  const missing = missingRequiredFields(value, fields);

  return (
    <div className="grid gap-3">
      <fieldset className="grid gap-1.5" disabled={roleLocked}>
        <legend className="text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>{t('adminUsers.role')}</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {ROLES.map((role) => (
            <label key={role} className="flex items-center gap-2 text-[13px]">
              <input type="radio" name="access-role" value={role} checked={value.role === role}
                onChange={() => onChange({ ...value, role })} />
              {t(ROLE_LABEL[role])}
            </label>
          ))}
        </div>
        <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
          {roleLocked ? t('adminUsers.cannotChangeOwnRole') : t(ROLE_HINT[value.role])}
        </p>
      </fieldset>

      {value.role === 'user' && (
        <>
          {missing.length > 0 && (
            <Notice tone="warn">
              {t('adminUsers.requiredFieldsWarning', { count: missing.length, fields: missing.map((f) => fieldLabel(f, language)).join(', ') })}
              {' '}
              <button type="button" className="underline" style={{ color: 'inherit' }}
                onClick={() => onChange({ ...value, editable_fields: [...new Set([...value.editable_fields, ...missing.map((f) => f.field_key)])] })}>
                {t('adminUsers.addRequiredFields')}
              </button>
            </Notice>
          )}

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
                  {fieldLabel(f, language)}{f.is_required && <RequiredMark />}
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
  const { userId: myId } = useAdminAccess();

  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [catalog, setCatalog] = useState<PermissionCatalogEntry[]>([]);
  const [departments, setDepartments] = useState<MasterDataRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The one row whose Deactivate/Reactivate is in flight. */
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [createPasswordVisible, setCreatePasswordVisible] = useState(false);
  const [createError, setCreateError] = useState<ApiError | null>(null);

  const [permTarget, setPermTarget] = useState<AdminUserRow | null>(null);
  const [permForm, setPermForm] = useState<AccessForm | null>(null);
  const [permError, setPermError] = useState<ApiError | null>(null);

  const [detailsTarget, setDetailsTarget] = useState<AdminUserRow | null>(null);
  const [detailsForm, setDetailsForm] = useState(EMPTY_DETAILS);
  const [detailsError, setDetailsError] = useState<ApiError | null>(null);

  const [deactivateTarget, setDeactivateTarget] = useState<AdminUserRow | null>(null);

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
      // Informational only — the Department pickers just stay empty.
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

  function warnIfBlocked(name: string, result: AccessResult) {
    const blocking = result.blocking_required_fields ?? [];
    if (blocking.length === 0) return false;
    setNotice(`${name}: ${t('adminUsers.requiredFieldsWarning', { count: blocking.length, fields: blocking.join(', ') })}`);
    return true;
  }

  async function createUser() {
    setCreateError(null);
    setNotice(null);
    setBusy(true);
    try {
      const a = createForm.access;
      const res = await api.post<AccessResult>('/api/admin/users', {
        full_name: createForm.full_name.trim(),
        email: createForm.email.trim(),
        username: createForm.username.trim(),
        password: createForm.password,
        employee_id: createForm.employee_id.trim() || null,
        department_id: createForm.department_id || null,
        role: a.role,
        permissions: a.role === 'user' ? a.permissions : [],
        editable_fields: a.role === 'user' ? a.editable_fields : [],
      });
      if (!warnIfBlocked(createForm.full_name.trim(), res.data)) toast.success(t('adminUsers.userCreated'));
      setShowCreate(false);
      setCreateForm(EMPTY_CREATE);
      setCreatePasswordVisible(false);
      void refresh();
    } catch (e) {
      if (e instanceof ApiError) setCreateError(e);
    } finally {
      setBusy(false);
    }
  }

  async function setActive(row: AdminUserRow, active: boolean) {
    setRowBusyId(row.id);
    setError(null);
    try {
      await api.post(`/api/admin/users/${row.id}/${active ? 'reactivate' : 'deactivate'}`);
      toast.success(active ? t('adminUsers.userReactivated') : t('adminUsers.userDeactivated'));
      setDeactivateTarget(null);
      void refresh();
    } catch (e) {
      if (e instanceof ApiError) setError(e);
      setDeactivateTarget(null);
    } finally {
      setRowBusyId(null);
    }
  }

  function openPermissions(row: AdminUserRow) {
    setPermTarget(row);
    setPermForm(accessFormFrom(row));
    setPermError(null);
    setNotice(null);
  }

  async function savePermissions() {
    if (!permTarget || !permForm) return;
    setBusy(true);
    setPermError(null);
    setNotice(null);
    try {
      const res = await api.put<AccessResult>(`/api/admin/users/${permTarget.id}/permissions`, {
        role: permForm.role,
        permissions: permForm.permissions,
        editable_fields: permForm.editable_fields,
      });
      if (!warnIfBlocked(permTarget.full_name, res.data)) toast.success(t('adminUsers.permissionsSaved'));
      setPermTarget(null);
      setPermForm(null);
      void refresh();
    } catch (e) {
      if (e instanceof ApiError) setPermError(e);
    } finally {
      setBusy(false);
    }
  }

  function openDetails(row: AdminUserRow) {
    setDetailsTarget(row);
    setDetailsForm({
      full_name: row.full_name, email: row.email ?? '',
      employee_id: row.employee_id ?? '', department_id: row.department_id ?? '',
    });
    setDetailsError(null);
  }

  async function saveDetails() {
    if (!detailsTarget) return;
    setBusy(true);
    setDetailsError(null);
    try {
      await api.put(`/api/admin/users/${detailsTarget.id}`, {
        full_name: detailsForm.full_name.trim(),
        email: detailsForm.email.trim() || null,
        employee_id: detailsForm.employee_id.trim() || null,
        department_id: detailsForm.department_id || null,
      });
      toast.success(t('adminUsers.userUpdated'));
      setDetailsTarget(null);
      void refresh();
    } catch (e) {
      if (e instanceof ApiError) setDetailsError(e);
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
      void refresh();
    } catch (e) {
      if (e instanceof ApiError) setPwApiError(e);
    } finally {
      setBusy(false);
    }
  }

  const departmentOptions = departments.map((d) => ({ value: d.id, label: d.display_name, disabled: !d.is_active }));

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
                {visibleUsers.map((row) => {
                  const isSelf = row.id === myId;
                  return (
                    <tr key={row.id}>
                      <td><div className="user-identity"><span className="user-avatar" aria-hidden="true">{row.full_name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span><span>{row.full_name}{isSelf && <> <Tag text={t('adminUsers.you')} /></>}<span className="user-identity-secondary ident">{row.username}</span></span></div></td>
                      <td style={{ color: 'var(--ink-2)' }}>{row.email ?? '—'}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {row.auth_provider === 'local'
                            ? (row.is_active
                              ? <Tag text={t('adminUsers.local')} />
                              : <Tag text={t('adminUsers.localPending')} tone="warn" />)
                            : <Tag text="Supabase" />}
                          {row.must_change_password && <Tag text={t('adminUsers.mustChangePassword')} tone="warn" />}
                        </div>
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
                          <Button size="sm" disabled={busy} onClick={() => openDetails(row)} aria-label={`${t('adminUsers.editUser')}: ${row.full_name}`} title={t('adminUsers.editUser')}>
                            <Pencil size={16} aria-hidden="true" />
                          </Button>
                          <Button size="sm" disabled={busy || isSelf} onClick={() => openChangePassword(row)} aria-label={`${t('adminUsers.changePassword')}: ${row.full_name}`}
                            title={isSelf ? t('adminUsers.cannotResetOwnPassword') : t('adminUsers.changePassword')}>
                            <KeyRound size={16} aria-hidden="true" />
                          </Button>
                          {row.is_active ? (
                            <Button size="sm" variant="danger" disabled={isSelf || (rowBusyId !== null && rowBusyId !== row.id)} loading={rowBusyId === row.id}
                              onClick={() => setDeactivateTarget(row)} aria-label={`${t('adminUsers.deactivate')}: ${row.full_name}`}
                              title={isSelf ? t('adminUsers.cannotDeactivateSelf') : t('adminUsers.deactivate')}>
                              <UserX size={16} aria-hidden="true" />
                            </Button>
                          ) : (
                            <Button size="sm" disabled={rowBusyId !== null && rowBusyId !== row.id} loading={rowBusyId === row.id}
                              onClick={() => void setActive(row, true)} aria-label={`${t('adminUsers.reactivate')}: ${row.full_name}`} title={t('adminUsers.reactivate')}>
                              <UserCheck size={16} aria-hidden="true" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
          {createError && <Notice tone="alert">{issuesText(createError, language)}</Notice>}
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
                options={departmentOptions}
                className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }}
              />
            </label>
          </div>

          <div className="border-t pt-3" style={{ borderColor: 'var(--rule-soft)' }}>
            <AccessEditor
              value={createForm.access}
              onChange={(next) => setCreateForm((f) => ({ ...f, access: next }))}
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
            <AccessEditor
              value={permForm}
              onChange={setPermForm}
              fields={sortedFields}
              catalog={catalog}
              language={language}
              t={t}
              roleLocked={permTarget.id === myId}
            />
          </form>
        )}
      </Modal>

      <Modal open={!!detailsTarget} title={t('adminUsers.editUserTitle')} onClose={() => setDetailsTarget(null)}
        footer={detailsTarget && (
          <>
            <Button type="button" disabled={busy} onClick={() => setDetailsTarget(null)}>{t('common.cancel')}</Button>
            <Button type="submit" form="user-details-form" variant="primary" loading={busy}>{t('common.save')}</Button>
          </>
        )}
      >
        {detailsTarget && (
          <form id="user-details-form" className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void saveDetails(); }}>
            {detailsError && <Notice tone="alert">{issuesText(detailsError, language)}</Notice>}
            <p className="text-[12px]" style={{ color: 'var(--ink-2)' }}>
              {t('adminUsers.username')}: <span className="ident font-medium">{detailsTarget.username}</span>
              <span className="block text-[11px]" style={{ color: 'var(--ink-3)' }}>{t('adminUsers.usernameFixed')}</span>
            </p>
            <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
              {t('adminUsers.fullName')}<RequiredMark />
              <input required maxLength={200} value={detailsForm.full_name}
                onChange={(e) => setDetailsForm((f) => ({ ...f, full_name: e.target.value }))}
                className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
            </label>
            <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
              Email{detailsTarget.auth_provider === 'supabase' && <RequiredMark />}
              <input type="email" maxLength={200} required={detailsTarget.auth_provider === 'supabase'} value={detailsForm.email}
                onChange={(e) => setDetailsForm((f) => ({ ...f, email: e.target.value }))}
                className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
              {detailsTarget.auth_provider === 'supabase' && (
                <span className="mt-1 block text-[11px] font-normal" style={{ color: 'var(--ink-3)' }}>{t('adminUsers.emailLoginHint')}</span>
              )}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
                {t('adminUsers.employeeId')}
                <input maxLength={50} value={detailsForm.employee_id}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, employee_id: e.target.value }))}
                  className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
              </label>
              <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
                {t('adminUsers.department')}
                <SearchableSelect
                  value={detailsForm.department_id} clearable placeholder={t('dynamicForm.selectPlaceholder')}
                  ariaLabel={t('adminUsers.department')}
                  onChange={(v) => setDetailsForm((f) => ({ ...f, department_id: v }))}
                  options={departmentOptions}
                  className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }}
                />
              </label>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deactivateTarget}
        title={t('adminUsers.confirmDeactivateTitle')}
        description={deactivateTarget ? t('adminUsers.confirmDeactivate', { name: deactivateTarget.full_name }) : ''}
        confirmLabel={t('adminUsers.deactivate')}
        busy={!!deactivateTarget && rowBusyId === deactivateTarget.id}
        onConfirm={() => { if (deactivateTarget) void setActive(deactivateTarget, false); }}
        onCancel={() => setDeactivateTarget(null)}
      />

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
            <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>{t('adminUsers.passwordResetHint')}</p>
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
