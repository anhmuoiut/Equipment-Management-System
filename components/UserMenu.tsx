'use client';

/**
 * The header's user chip and the standalone logout button used to sit side
 * by side — two separate controls for what is really one concept ("acting
 * as this person"). This combines them into a single trigger (avatar + full
 * name) that opens a small menu: account settings, then sign out.
 *
 * Account settings itself is two independent forms — updating your own
 * name/employee ID/department, and changing your own password — each with
 * its own Save button, not one shared submit, since they're unrelated
 * actions a person might do only one of.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Eye, EyeOff, LogOut, UserRound } from 'lucide-react';
import { api, ApiError, type MasterDataRef } from '@/lib/client/api';
import { Button, Modal, Notice, RequiredMark, Spinner, toast } from '@/components/ui';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { translateError } from '@/lib/i18n/errors';

type OwnAccount = {
  full_name: string;
  email: string | null;
  username: string;
  employee_id: string | null;
  department_id: string | null;
  auth_provider: 'supabase' | 'local';
};

export function UserMenu({ username, fullName }: { username: string; fullName: string }) {
  const router = useRouter();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.push('/login');
    router.refresh();
  }

  const displayName = fullName || username;
  const initials = displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button" className="user-menu-trigger" onClick={() => setOpen((o) => !o)}
        aria-haspopup="true" aria-expanded={open}
      >
        <span className="user-avatar" aria-hidden="true">{initials}</span>
        <span className="user-menu-name">{displayName}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <ul className="user-menu-list" role="menu">
          <li role="none">
            <button type="button" role="menuitem" onClick={() => { setOpen(false); setShowSettings(true); }}>
              <UserRound size={15} aria-hidden="true" />{t('userMenu.accountSettings')}
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" data-danger onClick={() => void signOut()}>
              <LogOut size={15} aria-hidden="true" />{t('nav.signOut')}
            </button>
          </li>
        </ul>
      )}
      <AccountSettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}

function AccountSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';

  const [account, setAccount] = useState<OwnAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [departments, setDepartments] = useState<MasterDataRef[]>([]);

  const [profileForm, setProfileForm] = useState({ full_name: '', employee_id: '', department_id: '' });
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<ApiError | null>(null);

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwVisible, setPwVisible] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwApiError, setPwApiError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!open) return;
    setProfileError(null);
    setPwForm({ current: '', next: '', confirm: '' });
    setPwVisible(false); setPwError(null); setPwApiError(null);
    setLoading(true);
    setLoadError(null);
    void Promise.all([
      api.get<OwnAccount>('/api/me'),
      api.get<{ departments: MasterDataRef[] }>('/api/master-data'),
    ])
      .then(([me, masterData]) => {
        setAccount(me.data);
        setDepartments(masterData.data.departments);
        setProfileForm({
          full_name: me.data.full_name,
          employee_id: me.data.employee_id ?? '',
          department_id: me.data.department_id ?? '',
        });
      })
      .catch((e) => { if (e instanceof ApiError) setLoadError(e); })
      .finally(() => setLoading(false));
  }, [open]);

  async function saveProfile() {
    setProfileBusy(true);
    setProfileError(null);
    try {
      await api.put('/api/me', {
        full_name: profileForm.full_name.trim(),
        employee_id: profileForm.employee_id.trim() || null,
        department_id: profileForm.department_id || null,
      });
      toast.success(t('userMenu.profileSaved'));
    } catch (e) {
      if (e instanceof ApiError) setProfileError(e);
    } finally {
      setProfileBusy(false);
    }
  }

  async function submitPassword() {
    setPwError(null); setPwApiError(null);
    if (pwForm.next !== pwForm.confirm) { setPwError(t('adminUsers.errorPasswordMismatch')); return; }
    if (pwForm.next.length < 10) { setPwError(t('adminUsers.errorPasswordTooShort')); return; }
    setPwBusy(true);
    try {
      await api.put('/api/me/password', { current_password: pwForm.current, new_password: pwForm.next });
      toast.success(t('adminUsers.passwordChanged'));
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (e) {
      if (e instanceof ApiError) setPwApiError(e);
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <Modal open={open} wide title={t('userMenu.accountSettings')} onClose={onClose}>
      {loading ? (
        <Spinner label={t('common.loadingEllipsis')} />
      ) : loadError ? (
        <Notice tone="alert">{translateError(loadError.code, language, loadError.message)}</Notice>
      ) : account && (
        <div className="grid gap-6">
          <section className="grid gap-3">
            <div>
              <h3 className="text-[14px] font-semibold">{t('userMenu.yourInformation')}</h3>
              <p className="ident mt-0.5 text-[12px]" style={{ color: 'var(--ink-3)' }}>
                {account.username}{account.email ? ` · ${account.email}` : ''}
              </p>
            </div>

            {profileError && <Notice tone="alert">{translateError(profileError.code, language, profileError.message)}</Notice>}

            <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
              {t('adminUsers.fullName')}<RequiredMark />
              <input required value={profileForm.full_name}
                onChange={(e) => setProfileForm((f) => ({ ...f, full_name: e.target.value }))}
                className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
                {t('adminUsers.employeeId')}
                <input value={profileForm.employee_id}
                  onChange={(e) => setProfileForm((f) => ({ ...f, employee_id: e.target.value }))}
                  className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
              </label>
              <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
                {t('adminUsers.department')}
                <SearchableSelect
                  value={profileForm.department_id} clearable placeholder={t('dynamicForm.selectPlaceholder')}
                  ariaLabel={t('adminUsers.department')}
                  onChange={(v) => setProfileForm((f) => ({ ...f, department_id: v }))}
                  options={departments.map((d) => ({ value: d.id, label: d.display_name, disabled: !d.is_active }))}
                  className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }}
                />
              </label>
            </div>
            <div className="flex items-center justify-end gap-3">
              <Button variant="primary" disabled={!profileForm.full_name.trim()} loading={profileBusy} onClick={() => void saveProfile()}>
                {t('common.save')}
              </Button>
            </div>
          </section>

          <section className="grid gap-3 border-t pt-4" style={{ borderColor: 'var(--rule-soft)' }}>
            <h3 className="text-[14px] font-semibold">{t('userMenu.changePassword')}</h3>

            {pwError && <Notice tone="alert">{pwError}</Notice>}
            {pwApiError && <Notice tone="alert">{translateError(pwApiError.code, language, pwApiError.message)}</Notice>}

            <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
              {t('userMenu.currentPassword')}<RequiredMark />
              <div className="login-input mt-1">
                <input required minLength={1} maxLength={256} type={pwVisible ? 'text' : 'password'}
                  autoComplete="current-password" value={pwForm.current}
                  onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))}
                  className="w-full border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }} />
              </div>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
                {t('adminUsers.newPassword')}<RequiredMark />
                <div className="login-input mt-1">
                  <input required minLength={10} maxLength={256} type={pwVisible ? 'text' : 'password'}
                    autoComplete="new-password" value={pwForm.next}
                    onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))}
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
            </div>
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="primary" disabled={!pwForm.current || !pwForm.next || !pwForm.confirm} loading={pwBusy}
                onClick={() => void submitPassword()}
              >
                {t('userMenu.updatePassword')}
              </Button>
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}
