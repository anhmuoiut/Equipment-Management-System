'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Globe2, Moon, Sun } from 'lucide-react';
import { setLanguage as setI18nLanguage, type SupportedLanguage } from '@/src/i18n';

type Theme = 'light' | 'dark';
type Preferences = {
  theme: Theme;
  setTheme: (value: Theme) => void;
};
const Context = createContext<Preferences | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [theme, updateTheme] = useState<Theme>('light');

  useEffect(() => {
    updateTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  }, []);

  function setTheme(value: Theme) {
    updateTheme(value);
    document.documentElement.dataset.theme = value;
    try { localStorage.setItem('equipment-theme', value); } catch {}
  }

  return <Context.Provider value={{ theme, setTheme }}>{children}</Context.Provider>;
}

export function usePreferences() {
  const value = useContext(Context);
  if (!value) throw new Error('PreferencesProvider is required');
  return value;
}

/**
 * The same two preferences as items of the account menu (UserMenu) — phones only (CSS):
 * the header has no room for the language / theme buttons. Language = radio items, theme = one item.
 */
export function PreferenceMenuItems({ onDone }: { onDone?: () => void }) {
  const { theme, setTheme } = usePreferences();
  const { t, i18n } = useTranslation();
  const language = (i18n.language === 'vi' ? 'vi' : 'en') as SupportedLanguage;
  return (
    <>
      {(['en', 'vi'] as const).map((code, i) => (
        <li key={code} role="none" className="user-menu-phone" data-first={i === 0 || undefined}>
          <button type="button" role="menuitemradio" aria-checked={language === code} lang={code}
            onClick={() => { setI18nLanguage(code); onDone?.(); }}>
            <Globe2 size={15} aria-hidden="true" />{t(code === 'en' ? 'theme.english' : 'theme.vietnamese')}
            {language === code && <Check size={15} className="user-menu-check" aria-hidden="true" />}
          </button>
        </li>
      ))}
      <li role="none" className="user-menu-phone">
        <button type="button" role="menuitem" onClick={() => { setTheme(theme === 'light' ? 'dark' : 'light'); onDone?.(); }}>
          {theme === 'light' ? <Moon size={15} aria-hidden="true" /> : <Sun size={15} aria-hidden="true" />}
          {theme === 'light' ? t('theme.switchToDark') : t('theme.switchToLight')}
        </button>
      </li>
    </>
  );
}

export function PreferenceControls() {
  const { theme, setTheme } = usePreferences();
  const { t, i18n } = useTranslation();
  const language = (i18n.language === 'vi' ? 'vi' : 'en') as SupportedLanguage;
  return (
    <div className="preference-controls">
      <div className="language-switch" role="group" aria-label={t('theme.language')}>
        <Globe2 size={15} aria-hidden="true" />
        <button type="button" lang="en" aria-label={t('theme.english')} aria-pressed={language === 'en'} onClick={() => setI18nLanguage('en')}>EN</button>
        <button type="button" lang="vi" aria-label={t('theme.vietnamese')} aria-pressed={language === 'vi'} onClick={() => setI18nLanguage('vi')}>VIE</button>
      </div>
      <button type="button" className="theme-switch" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        aria-label={theme === 'light' ? t('theme.switchToDark') : t('theme.switchToLight')}>
        {theme === 'light' ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}
        <span>{theme === 'light' ? t('theme.dark') : t('theme.light')}</span>
      </button>
    </div>
  );
}
