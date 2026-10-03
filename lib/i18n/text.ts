import en from '@/src/i18n/locales/en.json';
import vi from '@/src/i18n/locales/vi.json';

/**
 * Lấy chữ theo ngôn ngữ ở phía server (file Excel sinh ra, …) — cùng nguồn
 * src/i18n/locales với giao diện, cùng cú pháp {{biến}}.
 */
export type Language = 'en' | 'vi';

export function toLanguage(value: string | null | undefined): Language {
  return value === 'en' ? 'en' : 'vi';
}

type Dict = { [key: string]: string | Dict };

function lookup(dict: Dict, key: string): string | undefined {
  let node: string | Dict | undefined = dict;
  for (const part of key.split('.')) {
    if (!node || typeof node === 'string') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export function textFor(language: Language) {
  const dict = (language === 'vi' ? vi : en) as unknown as Dict;
  return (key: string, vars: Record<string, string | number> = {}): string => {
    const raw = lookup(dict, key) ?? lookup(en as unknown as Dict, key) ?? key;
    return raw.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => (name in vars ? String(vars[name]) : ''));
  };
}
