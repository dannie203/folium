import { useState, useCallback, useEffect } from 'react';
import type { ReaderSettings, ReaderTheme } from '@folium/shared';
import { getDatabase } from '../db';

const SETTINGS_KEY = 'reader_settings';

export function useReaderSettings(initialSettings?: Partial<ReaderSettings>) {
  const [settings, setSettings] = useState<ReaderSettings>({
    theme: initialSettings?.theme || 'dark',
    fontSize: initialSettings?.fontSize || 100,
    fontFamily: initialSettings?.fontFamily || 'system-ui',
    lineHeight: initialSettings?.lineHeight || 1.5,
    spread: initialSettings?.spread || 'none',
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const db = await getDatabase();
        const row = await db.getFirstAsync<{ value: string }>(
          'SELECT value FROM sync_meta WHERE key = ?',
          [SETTINGS_KEY]
        );
        if (row?.value && active) {
          const parsed = JSON.parse(row.value);
          setSettings((prev) => ({ ...prev, ...parsed }));
        }
      } catch {}
    })();
    return () => {
      active = false;
    };
  }, []);

  const persistSettings = useCallback(async (newSettings: ReaderSettings) => {
    try {
      const db = await getDatabase();
      await db.runAsync(
        'INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [SETTINGS_KEY, JSON.stringify(newSettings)]
      );
    } catch {}
  }, []);

  const selectTheme = useCallback((theme: ReaderTheme) => {
    setSettings((prev) => {
      const next = { ...prev, theme };
      persistSettings(next);
      return next;
    });
  }, [persistSettings]);

  const changeFontSize = useCallback((delta: number) => {
    setSettings((prev) => {
      const next = {
        ...prev,
        fontSize: Math.min(200, Math.max(70, prev.fontSize + delta)),
      };
      persistSettings(next);
      return next;
    });
  }, [persistSettings]);

  const updateSettings = useCallback((updater: React.SetStateAction<ReaderSettings>) => {
    setSettings((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      persistSettings(next);
      return next;
    });
  }, [persistSettings]);

  return {
    settings,
    setSettings: updateSettings,
    selectTheme,
    changeFontSize,
  };
}
