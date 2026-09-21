'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserPlus, UserRound } from 'lucide-react';
import { PreferenceControls } from '@/components/Preferences';
import { safeLoginDestination } from '@/lib/auth/username';

function LoginForm({ onRequestAccount }: { onRequestAccount: () => void }) {
  const router = useRouter();
  const destination = safeLoginDestination(useSearchParams().get('next'));
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<'credentials' | 'network' | 'limit' | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        setError(response.status === 429 ? 'limit' : response.status >= 500 ? 'network' : 'credentials');
        return;
      }
      router.replace(destination);
      router.refresh();
    } catch { setError('network'); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="login-form">
      <div className="login-icon"><LockKeyhole size={24} aria-hidden="true" /></div>
      <p className="eyebrow">{t('login.yourWorkspace')}</p>
      <h1>{t('login.welcomeBack')}</h1>
      <p className="login-description">{t('login.description')}</p>

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
      {error && <p id="login-error" className="login-error" role="alert">{
        error === 'credentials' ? t('login.errorCredentials') :
          error === 'limit' ? t('login.errorLimit') :
            t('login.errorNetwork')
      }</p>}
      <button className="sign-in-button" type="submit" disabled={busy}>
        {busy ? t('login.signingIn') : t('login.signIn')}
        <ArrowRight size={18} aria-hidden="true" />
      </button>
      <p className="login-help">{t('login.forgotPassword')}<br />
        <span>{t('login.contactAdmin')}</span>
      </p>
      <button type="button" className="request-account-link" onClick={onRequestAccount}>
        <UserPlus size={15} aria-hidden="true" />
        {t('login.requestAccountLink')}
      </button>
      <div className="login-security"><ShieldCheck size={15} aria-hidden="true" />{t('login.authorizedOnly')}</div>
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
    if (form.password !== form.confirm) {
      setError(t('signup.errorPasswordMismatch'));
      return;
    }
    if (form.password.length < 10) {
      setError(t('signup.errorPasswordTooShort'));
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name,
          username: form.username,
          password: form.password,
          email: form.email || undefined,
          employee_id: form.employee_id || undefined,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          body?.error?.code === 'USERNAME_ALREADY_EXISTS'
            ? t('signup.errorUsernameTaken')
            : body?.error?.code === 'EMAIL_ALREADY_EXISTS'
              ? t('signup.errorEmailTaken')
              : body?.error?.code === 'LOGIN_RATE_LIMITED'
                ? t('signup.errorRateLimited')
                : t('signup.errorGeneric'),
        );
        return;
      }
      setSubmitted(true);
    } catch {
      setError(t('signup.errorNetwork'));
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="login-form">
        <div className="login-icon"><UserPlus size={24} aria-hidden="true" /></div>
        <p className="eyebrow">{t('signup.requestSubmitted')}</p>
        <h1>{t('signup.almostThere')}</h1>
        <p className="login-description">{t('signup.submittedDescription')}</p>
        <button type="button" className="sign-in-button" onClick={onBackToSignIn}>
          {t('signup.backToSignIn')}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="login-form signup-form">
      <div className="login-icon"><UserPlus size={24} aria-hidden="true" /></div>
      <p className="eyebrow">{t('signup.requestAccess')}</p>
      <h1>{t('signup.requestAnAccount')}</h1>
      <p className="login-description">{t('signup.description')}</p>

      <div className="signup-fields">
        <div className="signup-field">
          <label htmlFor="full_name">{t('signup.fullName')}</label>
          <div className="login-input">
            <UserRound size={18} aria-hidden="true" />
            <input id="full_name" required maxLength={200} value={form.full_name}
              onChange={(e) => set('full_name', e.target.value)}
              placeholder={t('signup.yourFullName')} />
          </div>
        </div>

        <div className="signup-field">
          <label htmlFor="signup-username">{t('signup.desiredUsername')}</label>
          <div className="login-input">
            <UserRound size={18} aria-hidden="true" />
            <input id="signup-username" required maxLength={64} autoCapitalize="none" spellCheck={false}
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

        <div className="signup-field signup-field--wide">
          <label htmlFor="signup-email">{t('signup.email')}</label>
          <div className="login-input">
            <Mail size={18} aria-hidden="true" />
            <input id="signup-email" type="email" maxLength={200} value={form.email}
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
    <main className="login-page">
      <section className="login-brand">
        <div className="login-hero-image" role="presentation" />
        <span className="brand-division-tag">{t('loginBrand.division')}</span>
        <div className="brand-content">
          <h2>{t('loginBrand.headlineLine1')}<br />{t('loginBrand.headlineLine2')}</h2>
        </div>
        <p className="brand-footer">{t('loginBrand.footer')}</p>
      </section>
      <section className="login-main">
        <div className="login-toolbar"><PreferenceControls /></div>
        <div className="login-form-area"><Suspense fallback={<p>{t('common.loadingEllipsis')}</p>}><AuthPanel /></Suspense></div>
        <footer className="login-footer">{t('nav.equipmentControlSystem')}</footer>
      </section>
    </main>
  );
}
