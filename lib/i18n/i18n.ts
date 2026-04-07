import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import de from './bundles/de';
import en from './bundles/en';
import es from './bundles/es';
import fr from './bundles/fr';
import it from './bundles/it';
import { getExpoLocalesSafely } from './getExpoLocalesSafely';
import { resolveResolvedLang } from './resolveLocale';

const initialLanguage = resolveResolvedLang('system', getExpoLocalesSafely());

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en as Record<string, unknown> },
    it: { translation: it as Record<string, unknown> },
    de: { translation: de as Record<string, unknown> },
    fr: { translation: fr as Record<string, unknown> },
    es: { translation: es as Record<string, unknown> },
  },
  lng: initialLanguage,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

export default i18n;
