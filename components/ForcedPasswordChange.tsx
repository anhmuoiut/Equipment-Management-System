'use client';

/**
 * The forced "choose your own password" screen (app/change-password). Same
 * look as the sign-in form it follows — it reuses login.css — and the same
 * /api/me/password call the Account settings dialog makes.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, LogOut } from 'lucide-react';
import { api, errorMessage } from '@/lib/client/api';
import { PreferenceControls } from '@/components/Preferences';
import '@/app/login/login.css';

export function ForcedPasswordChange({ username }: { username: string }) {
  const router = useRouter();
  const { t } = useTranslation();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'signout' | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.next !== form.confirm) { setError(t('adminUsers.errorPasswordMismatch')); return; }
    if (form.next.length < 10) { setError(t('adminUsers.errorPasswordTooShort')); return; }
    if (form.next === form.current) { setError(t('forcedPassword.errorSameAsCurrent')); return; }
    setBusy('save');
    try {
      await api.put('/api/me/password', { current_password: form.current, new_password: form.next });
      // Giữ trạng thái đang lưu tới khi rời trang.
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, t));
      setBusy(null);
    }
  }

  async function signOut() {
    setError(null);
    setBusy('signout');
    try {
      await api.post('/api/auth/logout');
      router.replace('/login');
      router.refresh();
    } catch (err) {
      // Phiên chưa xóa được thì /login sẽ đưa về lại đây — báo lỗi thay vì chuyển trang im lặng.
      setError(errorMessage(err, t));
      setBusy(null);
    }
  }

  const input = (key: 'current' | 'next' | 'confirm', label: string, autoComplete: string, withToggle = false) => (
    <>
      <label htmlFor={`pw-${key}`}>{label}</label>
      <div className="login-input">
        <LockKeyhole size={18} aria-hidden="true" />
        <input id={`pw-${key}`} type={visible ? 'text' : 'password'} required maxLength={256}
          minLength={key === 'current' ? 1 : 10} autoComplete={autoComplete}
          value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          aria-describedby={error ? 'pw-error' : undefined} />
        {withToggle && (
          <button type="button" className="password-toggle" aria-pressed={visible}
            aria-label={visible ? t('login.hidePassword') : t('login.showPassword')} onClick={() => setVisible((v) => !v)}>
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
    </>
  );

  return (
    <main className="login-page solar-login solar-login--single">
      <div className="solar-grid" aria-hidden="true" />
      <section className="login-main" aria-label={t('forcedPassword.title')}>
        <div className="login-form-area">
          <form onSubmit={submit} className="login-form" aria-busy={busy !== null}>
            <div className="login-intro">
              <p className="solar-overline">{t('forcedPassword.overline')}</p>
              <h1>{t('forcedPassword.title')}</h1>
              <p>{t('forcedPassword.description')}</p>
              <p className="ident mt-2 text-[12px]" style={{ color: 'var(--ink-3)' }}>{username}</p>
            </div>
            {input('current', t('userMenu.currentPassword'), 'current-password', true)}
            {input('next', t('adminUsers.newPassword'), 'new-password')}
            {input('confirm', t('adminUsers.confirmNewPassword'), 'new-password')}
            {error && <p id="pw-error" className="login-error" role="alert">{error}</p>}
            <button className="sign-in-button" type="submit" disabled={busy !== null}>
              {busy === 'save' ? t('forcedPassword.saving') : t('forcedPassword.submit')}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            <button type="button" className="request-account-link" disabled={busy !== null} onClick={() => void signOut()}>
              {busy === 'signout' ? <Loader2 size={15} aria-hidden="true" className="ui-spin" /> : <LogOut size={15} aria-hidden="true" />}
              {t('nav.signOut')}
            </button>
          </form>
        </div>
        <div className="solar-preferences"><PreferenceControls /></div>
      </section>
    </main>
  );
}
