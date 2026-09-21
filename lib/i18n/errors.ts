import type { ErrorCode } from '@/lib/errors';
import en from '@/src/i18n/locales/en.json';
import vi from '@/src/i18n/locales/vi.json';

/**
 * Bilingual text for every server error code — Spec v0.9 mục 36.
 *
 * The server only ever returns a stable `code` plus a message meant for logs
 * (mostly Vietnamese, some English — whichever the person who added that
 * error code happened to write). Rendering that raw message in the UI meant
 * error text ignored the EN/VI toggle entirely. This dictionary is the fix:
 * every render site looks up `code` here for the current language, and only
 * falls back to the server's raw message for a code this file doesn't know
 * about yet (`Record<ErrorCode, Pair>` makes the compiler flag anything
 * missing whenever a new error code is added to lib/errors). The strings
 * themselves live in src/i18n/locales/{en,vi}.json under "errors" so they
 * share one source of truth with the rest of the UI copy.
 */

type Pair = readonly [english: string, vietnamese: string];

const enErrors: Record<string, string> = en.errors;
const viErrors: Record<string, string> = vi.errors;

export const ERROR_MESSAGES: Record<ErrorCode, Pair> = Object.fromEntries(
  Object.keys(enErrors).map((code) => [code, [enErrors[code], viErrors[code] ?? enErrors[code]] as Pair]),
) as Record<ErrorCode, Pair>;

/** Falls back to the server's raw message for any code not listed above. */
export function translateError(code: string, language: 'en' | 'vi', fallback: string): string {
  const pair = (ERROR_MESSAGES as Record<string, Pair>)[code];
  if (!pair) return fallback;
  return language === 'vi' ? pair[1] : pair[0];
}
