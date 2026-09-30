'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserPlus, UserRound } from 'lucide-react';
import { PreferenceControls } from '@/components/Preferences';
import Image from 'next/image';
import './login.css';
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
    <form onSubmit={submit} className="login-form" aria-label={t('login.signIn')} aria-busy={busy}>
      <div className="solar-identity">
        <SolarMark />
        <div className="solar-identity-copy">
          <p className="solar-product-name">SolarEdge</p>
          <p className="solar-subtitle">{t('loginBrand.headlineLine2')}</p>
        </div>
      </div>
      <div className="login-intro">
        <p className="solar-overline">{t('loginBrand.division')}</p>
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

// A small vector mark stays crisp on both phone and desktop displays.
function SolarMark() {
  return (
    <svg className="solar-mark" viewBox="0 0 180 140" fill="none" aria-hidden="true" focusable="false">
      <g fill="currentColor">
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x="49" y="39" width="17" height="22" rx="3" transform={`rotate(${i * 36} 57.5 86)`} />
        ))}
        <circle cx="57.5" cy="86" r="36" />
      </g>
      <circle cx="57.5" cy="86" r="22" className="solar-gear-center" />
      <g stroke="var(--jabil-picton)" strokeWidth="6" strokeLinecap="round">
        <path d="M90 51a29 29 0 0 1 57 0" />
        <path d="M118 6v10M84 15l5 9M152 15l-5 9M164 40l9-4" strokeWidth="4" />
      </g>
      <path d="M89 57h82l-32 61H56z" fill="var(--jabil-picton)" stroke="var(--solar-mark-ground)" strokeWidth="5" strokeLinejoin="round" />
      <path d="M116 58l-32 59M144 58l-32 59M74 87h80" stroke="var(--solar-mark-ground)" strokeWidth="4" />
      <path d="M68 124h66" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export default function LoginPage() {
  const { t } = useTranslation();
  return (
    <main className="login-page solar-login">
      <div className="solar-grid" aria-hidden="true" />
      <section className="solar-visual" aria-label={t('loginBrand.division')}>
        <div className="solar-photo-frame">
          <Image
            src="/Image/TEguy.png"
            alt={t('loginBrand.photoAlt')}
            width={1536}
            height={1024}
            sizes="(max-width: 900px) 100vw, (max-width: 1600px) 60vw, 1040px"
            priority
            className="solar-photo"
          />
          <span className="solar-photo-edge" aria-hidden="true" />
        </div>
        <div className="solar-circuit" aria-hidden="true">
          <span /><span /><span />
        </div>
      </section>
      <section className="login-main" aria-label={t('login.yourWorkspace')}>
        <div className="login-form-area"><Suspense fallback={<p role="status">{t('common.loadingEllipsis')}</p>}><AuthPanel /></Suspense></div>
        <div className="solar-preferences"><PreferenceControls /></div>
      </section>
    </main>
  );
}
