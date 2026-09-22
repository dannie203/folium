import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import type { Book } from '@folium/shared';
import { getDatabase } from '../db';
import { getWebBook } from '../services/storage';
import { flushSyncImmediately } from '../services/syncService';

export function useBookLoader(id: string | undefined) {
  const [book, setBook] = useState<Book | null>(null);
  const [bookBase64, setBookBase64] = useState<string | undefined>(undefined);
  const [bookDataUrl, setBookDataUrl] = useState<string | undefined>(undefined);
  const [bookArrayBuffer, setBookArrayBuffer] = useState<ArrayBuffer | undefined>(undefined);
  const [initialCfi, setInitialCfi] = useState<string | null>(null);
  const [locationsCache, setLocationsCache] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentProgress, setCurrentProgress] = useState<number>(0);

  useEffect(() => {
    async function initBook() {
      if (!id) return;
      try {
        setIsLoading(true);
        const db = await getDatabase();
        const bookRow = await db.getFirstAsync<Book>(
          'SELECT * FROM books WHERE id = ?',
          [id]
        );

        if (!bookRow) {
          setErrorMessage('Không tìm thấy sách trong thư viện');
          setIsLoading(false);
          return;
        }

        setBook(bookRow);
        setLocationsCache(bookRow.locations_cache || null);

        // Fetch last progress
        const progressRow = await db.getFirstAsync<{ cfi: string; percentage: number }>(
          'SELECT cfi, percentage FROM reading_progress WHERE book_id = ? AND is_deleted = 0',
          [id]
        );
        if (progressRow) {
          setInitialCfi(progressRow.cfi);
          setCurrentProgress(progressRow.percentage);
        }

        // Read book file into base64 or pass buffer/url directly on web
        if (bookRow.local_path) {
          if (Platform.OS === 'web') {
            const buffer = await getWebBook(bookRow.id);
            if (buffer && buffer.byteLength > 0) {
              setBookArrayBuffer(buffer);
            } else if (bookRow.local_path && !bookRow.local_path.startsWith('indexeddb://')) {
              setBookDataUrl(bookRow.local_path);
            } else {
              setErrorMessage('Không tìm thấy tệp sách trong bộ nhớ cục bộ. Bạn vui lòng xoá và thêm lại sách nhé.');
            }
          } else {
            const base64 = await FileSystem.readAsStringAsync(bookRow.local_path, {
              encoding: 'base64',
            });
            setBookBase64(base64);
          }
        }
      } catch (err: any) {
        console.error('Failed to load book file:', err);
        setErrorMessage(err.message || 'Lỗi nạp file sách');
      } finally {
        setIsLoading(false);
      }
    }

    initBook();
    return () => {
      // Reader unmount / exit: flush any pending progress immediately
      flushSyncImmediately();
    };
  }, [id]);

  return {
    book,
    setBook,
    bookBase64,
    bookDataUrl,
    bookArrayBuffer,
    initialCfi,
    locationsCache,
    setLocationsCache,
    isLoading,
    errorMessage,
    setErrorMessage,
    currentProgress,
    setCurrentProgress,
  };
}
