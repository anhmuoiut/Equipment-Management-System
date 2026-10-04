'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ArrowRight, BarChart3, Cpu, Eye, EyeOff, LockKeyhole, Mail, Package, UserPlus, UserRound, Wrench } from 'lucide-react';
import { PreferenceControls } from '@/components/Preferences';
import { JabilLogo } from '@/components/JabilLogo';
import Image from 'next/image';
import './login.css';
import { api, ApiError, errorMessage } from '@/lib/client/api';
import { normalizeUsername, safeLoginDestination } from '@/lib/auth/username';
import { SUPPORT_EMAIL } from '@/lib/support';

function SupportEmail() {
  return <a className="support-email" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;
}

function LoginForm({ onRequestAccount }: { onRequestAccount: () => void }) {
  const router = useRouter();
  const destination = safeLoginDestination(useSearchParams().get('next'));
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError(t(!username.trim() ? 'login.errorUsernameRequired' : 'login.errorPasswordRequired'));
      const field = e.currentTarget as HTMLFormElement;
      field.querySelector<HTMLInputElement>(!username.trim() ? '#username' : '#password')?.focus();
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/auth/login', { username, password });
      // Giữ trạng thái đang đăng nhập tới khi rời trang (không bấm lặp).
      router.replace(destination);
      router.refresh();
    } catch (err) {
      // Sai mật khẩu, chờ duyệt, bị khóa, quá số lần, lỗi server, mất mạng — mỗi lỗi một câu riêng.
      setError(errorMessage(err, t));
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="login-form" aria-label={t('login.signIn')} aria-busy={busy}>
      <div className="login-intro">
        <h1>{t('login.welcomeBack')}</h1>
        <p>{t('login.description')}</p>
      </div>

      <label htmlFor="username">{t('login.username')}</label>
      <div className="login-input">
        <UserRound size={18} aria-hidden="true" />
        <input id="username" name="username" type="text" required autoComplete="username" autoCapitalize="none"
          spellCheck={false} maxLength={64} value={username} onChange={e => setUsername(e.target.value)}
          placeholder={t('login.enterUsername')} aria-describedby={error ? 'login-error' : undefined} />
      </div>
      <label htmlFor="password">{t('login.password')}</label>
      <div className="login-input">
        <LockKeyhole size={18} aria-hidden="true" />
        <input id="password" name="password" type={visible ? 'text' : 'password'} required autoComplete="current-password"
          maxLength={256} value={password} onChange={e => setPassword(e.target.value)}
          placeholder={t('login.enterPassword')} aria-describedby={error ? 'login-error' : undefined} />
        <button type="button" className="password-toggle" aria-label={visible ? t('login.hidePassword') : t('login.showPassword')}
          aria-pressed={visible} onClick={() => setVisible(!visible)}>
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && <p id="login-error" className="login-error" role="alert">{error}</p>}
      <details className="login-recovery">
        <summary>{t('login.forgotPassword')}</summary>
        <div className="login-recovery-body">
          <p>{t('login.contactAdmin')}</p>
          <p><SupportEmail /></p>
        </div>
      </details>
      <button className="sign-in-button" type="submit" disabled={busy}>
        {busy ? t('login.signingIn') : t('login.signIn')}
        <ArrowRight size={18} aria-hidden="true" />
      </button>
      <div className="auth-divider"><span>{t('login.or')}</span></div>
      <button type="button" className="sso-button" disabled aria-describedby="sso-availability">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
          <path fill="#0078d4" d="M2 4.5 11 3.3v8.2H2zm10-1.3L22 2v9.5H12zM2 12.5h9v8.2l-9-1.2zm10 0h10V22l-10-1.3z" />
        </svg>
        <span>{t('login.signInWithSso')}</span>
        <ArrowRight size={18} aria-hidden="true" />
      </button>
      <p id="sso-availability" className="sso-availability">{t('login.ssoComingSoon')}</p>
      <div className="auth-switch">
        <span>{t('login.noAccount')}</span>
        <button type="button" onClick={onRequestAccount}>{t('login.signUp')}</button>
      </div>
    </form>
  );
}

type SignupField = 'full_name' | 'username' | 'password' | 'confirm' | 'email' | 'employee_id';
const SIGNUP_EMPTY: Record<SignupField, string> = {
  full_name: '', username: '', password: '', confirm: '', email: '', employee_id: '',
};

function SignupForm({ onBackToSignIn }: { onBackToSignIn: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(SIGNUP_EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function set(field: SignupField, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.full_name.trim()) {
      setError(t('signup.errorFullName'));
      return;
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError(t('signup.errorEmailFormat'));
      return;
    }
    if (form.password !== form.confirm) {
      setError(t('signup.errorPasswordMismatch'));
      return;
    }
    if (form.password.length < 10) {
      setError(t('signup.errorPasswordTooShort'));
      return;
    }
    // Cùng quy tắc với server (lib/auth/username.ts) — báo ngay thay vì để server từ chối.
    const username = normalizeUsername(form.username);
    if (!username) {
      setError(t('signup.errorUsernameFormat'));
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/auth/signup', {
        full_name: form.full_name,
        username,
        password: form.password,
        email: form.email || undefined,
        employee_id: form.employee_id || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      // Lỗi theo trường → câu hướng dẫn cụ thể của form; còn lại (trùng username / email, quá số lần, server, mạng) theo mã lỗi.
      const fields = err instanceof ApiError ? err.fieldErrors : {};
      setError(
        fields.username ? t('signup.errorUsernameFormat')
          : fields.email ? t('signup.errorEmailFormat')
            : fields.full_name ? t('signup.errorFullName')
              : fields.password ? t('signup.errorPasswordTooShort')
                : errorMessage(err, t),
      );
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="login-form signup-success" role="status">
        <div className="login-icon"><UserPlus size={24} aria-hidden="true" /></div>
        <p className="eyebrow">{t('signup.requestSubmitted')}</p>
        <h1>{t('signup.almostThere')}</h1>
        <p className="login-description">{t('signup.submittedDescription')}</p>
        <p className="login-description">{t('signup.needHelp')} <SupportEmail /></p>
        <button type="button" className="sign-in-button" onClick={onBackToSignIn}>
          {t('signup.backToSignIn')}
        </button>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={submit} className="login-form signup-form" aria-label={t('signup.requestAnAccount')} aria-busy={busy}>
      <div className="login-intro">
        <h1>{t('signup.requestAnAccount')}</h1>
        <p>{t('signup.description')}</p>
      </div>

      <div className="signup-fields">
        <div className="signup-field">
          <label htmlFor="full_name">{t('signup.fullName')}</label>
          <div className="login-input">
            <UserRound size={18} aria-hidden="true" />
            <input id="full_name" autoComplete="name" required maxLength={200} value={form.full_name}
              onChange={(e) => set('full_name', e.target.value)}
              placeholder={t('signup.yourFullName')} />
          </div>
        </div>

        <div className="signup-field">
          <label htmlFor="signup-username">{t('signup.desiredUsername')}</label>
          <div className="login-input">
            <UserRound size={18} aria-hidden="true" />
            <input id="signup-username" autoComplete="username" required maxLength={64} autoCapitalize="none" spellCheck={false}
              value={form.username} onChange={(e) => set('username', e.target.value)}
              placeholder={t('signup.usernameHint')} />
          </div>
        </div>

        <div className="signup-field">
          <label htmlFor="signup-password">{t('login.password')}</label>
          <div className="login-input">
            <LockKeyhole size={18} aria-hidden="true" />
            <input id="signup-password" type="password" required minLength={10} maxLength={256}
              autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)}
              placeholder={t('signup.passwordHint')} />
          </div>
        </div>

        <div className="signup-field">
          <label htmlFor="signup-confirm">{t('signup.confirmPassword')}</label>
          <div className="login-input">
            <LockKeyhole size={18} aria-hidden="true" />
            <input id="signup-confirm" type="password" required maxLength={256}
              autoComplete="new-password" value={form.confirm} onChange={(e) => set('confirm', e.target.value)}
              placeholder={t('signup.reenterPassword')} />
          </div>
        </div>

        <div className="signup-field">
          <label htmlFor="signup-email">{t('signup.email')}</label>
          <div className="login-input">
            <Mail size={18} aria-hidden="true" />
            <input id="signup-email" autoComplete="email" type="email" maxLength={200} value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder={t('signup.emailHint')} />
          </div>
        </div>

        <div className="signup-field">
          <label htmlFor="employee_id">{t('signup.employeeId')}</label>
          <div className="login-input">
            <UserRound size={18} aria-hidden="true" />
            <input id="employee_id" maxLength={50} value={form.employee_id}
              onChange={(e) => set('employee_id', e.target.value)} />
          </div>
        </div>

        {/* No Department field here — it's now a picker over an
            admin-managed list (see Account settings), and this form runs
            before the requester has a session to fetch that list with.
            They set it themselves once an admin approves the request. */}
      </div>

      {error && <p className="login-error" role="alert">{error}</p>}

      <div className="signup-actions">
        <button className="sign-in-button" type="submit" disabled={busy}>
          {busy ? t('signup.submitting') : t('signup.submitRequest')}
          <ArrowRight size={18} aria-hidden="true" />
        </button>
        <button type="button" className="request-account-link" onClick={onBackToSignIn}>
          {t('signup.backToSignIn')}
        </button>
      </div>
    </form>
  );
}

function AuthPanel() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  return mode === 'signin'
    ? <LoginForm onRequestAccount={() => setMode('signup')} />
    : <SignupForm onBackToSignIn={() => setMode('signin')} />;
}

export default function LoginPage() {
  const { t } = useTranslation();
  return (
    <main className="login-page jabil-login">
      <Image
        src="/login-signup/login-signup-background.webp"
        alt={t('loginBrand.factoryAlt')}
        fill
        priority
        sizes="100vw"
        className="auth-background"
        unoptimized
      />
      <div className="auth-layout">
        <div className="auth-title">
          <div className="auth-mobile-brand"><JabilLogo /><span>TEST ENGINEERING</span></div>
          <h2><span>{t('loginBrand.equipment')}</span><span>{t('loginBrand.management')}</span></h2>
          <p>{t('loginBrand.workcellName')}</p>
          <div className="auth-title-accent" aria-hidden="true" />
          <ul className="auth-capabilities">
            {[
              { Icon: Cpu, action: 'trackAssetsAction', subject: 'trackAssetsSubject' },
              { Icon: Package, action: 'manageLocationsAction', subject: 'manageLocationsSubject' },
              { Icon: Wrench, action: 'planMaintenanceAction', subject: 'planMaintenanceSubject' },
              { Icon: BarChart3, action: 'improveEfficiencyAction', subject: 'improveEfficiencySubject' },
            ].map(({ Icon, action, subject }) => (
              <li key={action}>
                <span className="auth-capability-icon"><Icon size={24} strokeWidth={1.8} aria-hidden="true" /></span>
                <span className="auth-capability-label">{t(`loginBrand.${action}`)}<br />{t(`loginBrand.${subject}`)}</span>
              </li>
            ))}
          </ul>
        </div>
        <section className="login-main" aria-label={t('login.yourWorkspace')}>
          <div className="login-form-area"><Suspense fallback={<p role="status">{t('common.loadingEllipsis')}</p>}><AuthPanel /></Suspense></div>
          <div className="auth-preferences"><PreferenceControls /></div>
        </section>
      </div>
    </main>
  );
}
