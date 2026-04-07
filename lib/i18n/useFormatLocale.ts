import { useTranslation } from 'react-i18next';
import { toBcp47 } from './bcp47';

/** Locale string for `Intl`, `toLocaleDateString`, `toLocaleString`. */
export function useFormatLocale(): string {
  const { i18n } = useTranslation();
  return toBcp47(i18n.language);
}
