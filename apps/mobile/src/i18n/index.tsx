import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getSyncMeta, setSyncMeta } from '../services/syncService';
import type { Locale, TranslationKey, LocaleInfo } from './types';
import { vi } from './locales/vi';
import { en } from './locales/en';
import { ja } from './locales/ja';
import { zh } from './locales/zh';
import { fr } from './locales/fr';
import { es } from './locales/es';
import { de } from './locales/de';

export type { Locale, TranslationKey, LocaleInfo } from './types';

export const SUPPORTED_LOCALES: LocaleInfo[] = [
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '简体中文' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
];

const messages: Record<Locale, Partial<Record<TranslationKey, string>>> = {
  vi,
  en,
  ja,
  zh,
  fr,
  es,
  de,
};

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  supportedLocales: LocaleInfo[];
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('vi');

  useEffect(() => {
    getSyncMeta('app_locale').then((stored) => {
      if (stored && ['vi', 'en', 'ja', 'zh', 'fr', 'es', 'de'].includes(stored)) {
        setLocaleState(stored as Locale);
      }
    });
  }, []);

  const setLocale = (nextLocale: Locale) => {
    setLocaleState(nextLocale);
    void setSyncMeta('app_locale', nextLocale);
  };

  const value = useMemo<I18nContextValue>(() => {
    const translate = (key: TranslationKey, params?: Record<string, string | number>): string => {
      let text = messages[locale]?.[key] || messages.en?.[key] || messages.vi?.[key] || key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return text;
    };

    return {
      locale,
      setLocale,
      t: translate,
      supportedLocales: SUPPORTED_LOCALES,
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}
