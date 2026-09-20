import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getSyncMeta, setSyncMeta } from '../services/syncService';

export type Locale = 'vi' | 'en';

type TranslationKey =
  | 'settings.title'
  | 'settings.language'
  | 'settings.vietnamese'
  | 'settings.english'
  | 'settings.cloud'
  | 'settings.drive'
  | 'settings.driveDesc'
  | 'settings.security'
  | 'settings.privacy'
  | 'settings.terms'
  | 'settings.localFirst'
  | 'settings.localFirstDesc'
  | 'settings.back'
  | 'nav.library'
  | 'nav.allBooks'
  | 'nav.community'
  | 'nav.shelves'
  | 'nav.inbox'
  | 'nav.syncCloud'
  | 'nav.googleDrive'
  | 'nav.settings'
  | 'bottom.shelf'
  | 'bottom.community'
  | 'bottom.settings'
  | 'header.search'
  | 'header.addBook';

const messages: Record<Locale, Record<TranslationKey, string>> = {
  vi: {
    'settings.title': 'Cài đặt',
    'settings.language': 'Ngôn ngữ',
    'settings.vietnamese': 'Tiếng Việt',
    'settings.english': 'English',
    'settings.cloud': 'Đồng bộ & đám mây',
    'settings.drive': 'Google Drive',
    'settings.driveDesc': 'EPUB, PDF và đồng bộ thư viện',
    'settings.security': 'Kiểm toán bảo mật',
    'settings.privacy': 'Quyền riêng tư',
    'settings.terms': 'Điều khoản & DMCA',
    'settings.localFirst': 'Local-first',
    'settings.localFirstDesc': 'Thư viện và ghi chú luôn được lưu trên thiết bị trước khi đồng bộ.',
    'settings.back': 'Tủ sách',
    'nav.library': 'THƯ VIỆN',
    'nav.allBooks': 'Tất cả sách',
    'nav.community': 'Cộng đồng OPDS',
    'nav.shelves': 'KỆ SÁCH',
    'nav.inbox': 'Hộp thư đến',
    'nav.syncCloud': 'ĐỒNG BỘ & ĐÁM MÂY',
    'nav.googleDrive': 'Google Drive',
    'nav.settings': 'Cài đặt',
    'bottom.shelf': 'Tủ sách',
    'bottom.community': 'Cộng đồng',
    'bottom.settings': 'Cài đặt',
    'header.search': 'Tìm theo tên sách, tác giả...',
    'header.addBook': 'Thêm sách',
  },
  en: {
    'settings.title': 'Settings',
    'settings.language': 'Language',
    'settings.vietnamese': 'Tiếng Việt',
    'settings.english': 'English',
    'settings.cloud': 'Sync & cloud',
    'settings.drive': 'Google Drive',
    'settings.driveDesc': 'EPUB, PDF, and library sync',
    'settings.security': 'Security audit',
    'settings.privacy': 'Privacy',
    'settings.terms': 'Terms & DMCA',
    'settings.localFirst': 'Local-first',
    'settings.localFirstDesc': 'Your library and notes stay on this device before they sync.',
    'settings.back': 'Bookshelf',
    'nav.library': 'LIBRARY',
    'nav.allBooks': 'All books',
    'nav.community': 'Community OPDS',
    'nav.shelves': 'SHELVES',
    'nav.inbox': 'Inbox',
    'nav.syncCloud': 'SYNC & CLOUD',
    'nav.googleDrive': 'Google Drive',
    'nav.settings': 'Settings',
    'bottom.shelf': 'Library',
    'bottom.community': 'Community',
    'bottom.settings': 'Settings',
    'header.search': 'Search books or authors...',
    'header.addBook': 'Add book',
  },
};

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('vi');

  useEffect(() => {
    getSyncMeta('app_locale').then((stored) => {
      if (stored === 'vi' || stored === 'en') setLocaleState(stored);
    });
  }, []);

  const setLocale = (nextLocale: Locale) => {
    setLocaleState(nextLocale);
    void setSyncMeta('app_locale', nextLocale);
  };

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key) => messages[locale][key],
    }),
    [locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}
