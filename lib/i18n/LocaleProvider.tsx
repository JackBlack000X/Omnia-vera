import { STORAGE_KEYS } from '@/lib/storageKeys';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { I18nextProvider } from 'react-i18next';

import { getExpoLocalesSafely } from './getExpoLocalesSafely';
import i18n from './i18n';
import {
  type AppLocalePreference,
  parseStoredLocalePreference,
  resolveResolvedLang,
  type SupportedLang,
} from './resolveLocale';

type LocaleContextValue = {
  preference: AppLocalePreference;
  setPreference: (next: AppLocalePreference) => Promise<void>;
  resolvedLanguage: SupportedLang;
  hydrated: boolean;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<AppLocalePreference>('system');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.appLocale);
        const parsed = parseStoredLocalePreference(raw);
        if (parsed) setPreferenceState(parsed);
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  const resolvedLanguage = useMemo(
    () => resolveResolvedLang(preference, getExpoLocalesSafely()),
    [preference],
  );

  useEffect(() => {
    if (!hydrated) return;
    void i18n.changeLanguage(resolvedLanguage);
  }, [hydrated, resolvedLanguage]);

  const setPreference = useCallback(async (next: AppLocalePreference) => {
    setPreferenceState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.appLocale, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      preference,
      setPreference,
      resolvedLanguage,
      hydrated,
    }),
    [preference, setPreference, resolvedLanguage, hydrated],
  );

  return (
    <I18nextProvider i18n={i18n}>
      <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
    </I18nextProvider>
  );
}

export function useLocaleSettings(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocaleSettings must be used within LocaleProvider');
  }
  return ctx;
}
