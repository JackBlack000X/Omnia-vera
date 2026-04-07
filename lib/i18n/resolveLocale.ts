import type { ExpoLocaleLike } from './getExpoLocalesSafely';

export const SUPPORTED_LANGS = ['en', 'it', 'de', 'fr', 'es'] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];
export type AppLocalePreference = 'system' | SupportedLang;

export function isSupportedLang(value: string | null | undefined): value is SupportedLang {
  return SUPPORTED_LANGS.includes(value as SupportedLang);
}

/** Map device languageCode to a supported app language (fallback: en). */
export function normalizeLangTag(code: string | undefined | null): SupportedLang {
  const base = (code ?? 'en').split('-')[0]?.toLowerCase() ?? 'en';
  if (base === 'it' || base === 'de' || base === 'fr' || base === 'es' || base === 'en') {
    return base;
  }
  return 'en';
}

export function resolveResolvedLang(
  preference: AppLocalePreference,
  deviceLocales: readonly ExpoLocaleLike[],
): SupportedLang {
  if (preference !== 'system') return preference;
  return normalizeLangTag(deviceLocales[0]?.languageCode);
}

export function parseStoredLocalePreference(raw: string | null | undefined): AppLocalePreference | null {
  if (raw == null || raw === '') return null;
  if (raw === 'system') return 'system';
  if (isSupportedLang(raw)) return raw;
  return null;
}
