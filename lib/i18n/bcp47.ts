import type { SupportedLang } from './resolveLocale';

const MAP: Record<SupportedLang, string> = {
  en: 'en-US',
  it: 'it-IT',
  de: 'de-DE',
  fr: 'fr-FR',
  es: 'es-ES',
};

/** BCP 47 tag for Intl / toLocaleDateString. */
export function toBcp47(i18nLanguage: string): string {
  const base = i18nLanguage.split('-')[0]?.toLowerCase() as SupportedLang;
  return MAP[base] ?? 'en-US';
}
