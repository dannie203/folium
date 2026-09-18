import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import type { Book, ReaderSettings, ReaderTheme } from '@folium/shared';
import { getDatabase } from '../../src/db';
import { EpubReader } from '../../src/reader/EpubReader';
import { PdfReader } from '../../src/reader/PdfReader';
import { generateUUID } from '../../src/services/bookService';
import { getWebBook } from '../../src/services/storage';

export default function ReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const readerRef = useRef<any>(null);

  const [book, setBook] = useState<Book | null>(null);
  const [bookBase64, setBookBase64] = useState<string | undefined>(undefined);
  const [bookDataUrl, setBookDataUrl] = useState<string | undefined>(undefined);
  const [bookArrayBuffer, setBookArrayBuffer] = useState<ArrayBuffer | undefined>(undefined);
  const [initialCfi, setInitialCfi] = useState<string | null>(null);
  const [locationsCache, setLocationsCache] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // UI state
  const [showUI, setShowUI] = useState(true);
  const [currentCfi, setCurrentCfi] = useState<string>('');
  const [currentProgress, setCurrentProgress] = useState<number>(0);
  const [pageInfo, setPageInfo] = useState<{ page?: number; totalPages?: number }>({});
  const [toc, setToc] = useState<Array<{ label: string; href: string }>>([]);
  const [showTocModal, setShowTocModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Reader settings
  const [settings, setSettings] = useState<ReaderSettings>({
    theme: 'dark',
    fontSize: 100,
    fontFamily: 'system-ui',
    lineHeight: 1.5,
    spread: 'none',
  });

  // Load book details and file from local database
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
  }, [id]);

  // Debounced progress saver
  const saveProgressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveProgressToDb = useCallback(
    async (cfi: string, percentage: number) => {
      if (!id) return;
      try {
        const db = await getDatabase();
        const now = Date.now();
        const progressId = generateUUID();

        await db.runAsync(
          `INSERT INTO reading_progress (id, book_id, cfi, percentage, client_updated_at, is_deleted, sync_seq)
           VALUES (?, ?, ?, ?, ?, 0, 0)
           ON CONFLICT(book_id) DO UPDATE SET
             cfi = excluded.cfi,
             percentage = excluded.percentage,
             client_updated_at = excluded.client_updated_at,
             is_deleted = 0`,
          [progressId, id, cfi, percentage, now]
        );

        // Update book's updated_at
        await db.runAsync('UPDATE books SET updated_at = ? WHERE id = ?', [now, id]);
      } catch (e) {
        console.error('Failed to save progress to SQLite:', e);
      }
    },
    [id]
  );

  const handleLocationChange = (loc: { cfi: string; percentage: number; page?: number; totalPages?: number }) => {
    setCurrentCfi(loc.cfi);
    setCurrentProgress(loc.percentage);
    if (loc.page !== undefined && loc.totalPages !== undefined) {
      setPageInfo({ page: loc.page, totalPages: loc.totalPages });
    }

    if (saveProgressTimerRef.current) {
      clearTimeout(saveProgressTimerRef.current);
    }
    saveProgressTimerRef.current = setTimeout(() => {
      saveProgressToDb(loc.cfi, loc.percentage);
    }, 1000);
  };

  const handleLocationsGenerated = async (locationsJson: string) => {
    if (!id) return;
    try {
      const db = await getDatabase();
      await db.runAsync('UPDATE books SET locations_cache = ? WHERE id = ?', [
        locationsJson,
        id,
      ]);
    } catch (e) {
      console.warn('Failed to cache locations in SQLite:', e);
    }
  };

  const selectTheme = (theme: ReaderTheme) => {
    setSettings((prev) => ({ ...prev, theme }));
  };

  const changeFontSize = (delta: number) => {
    setSettings((prev) => ({
      ...prev,
      fontSize: Math.min(160, Math.max(70, prev.fontSize + delta)),
    }));
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Đang nạp sách...</Text>
      </View>
    );
  }

  if (errorMessage || !book) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>{errorMessage || 'Không thể mở sách'}</Text>
        <TouchableOpacity style={styles.backButtonCta} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Quay lại thư viện</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isDark = settings.theme === 'dark';
  const isSepia = settings.theme === 'sepia';
  const barBg = isDark ? '#18181B' : isSepia ? '#EADBB6' : '#FFFFFF';
  const barText = isDark ? '#FAFAFA' : isSepia ? '#433422' : '#18181B';
  const barBorder = isDark ? '#27272A' : isSepia ? '#D7C295' : '#E4E4E7';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: barBg }]}>
      {/* Top Header Overlay */}
      {showUI && (
        <View style={[styles.topBar, { backgroundColor: barBg, borderBottomColor: barBorder }]}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Text style={[styles.iconButtonText, { color: barText }]}>←</Text>
          </TouchableOpacity>

          <View style={styles.titleContainer}>
            <Text style={[styles.topTitle, { color: barText }]} numberOfLines={1}>
              {book.title}
            </Text>
          </View>

          <View style={styles.actionsRight}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setShowTocModal(true)}
              activeOpacity={0.7}
            >
              <Text style={[styles.iconButtonText, { color: barText }]}>📑</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setShowSettingsModal(true)}
              activeOpacity={0.7}
            >
              <Text style={[styles.iconButtonText, { color: barText }]}>Aa</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Reader Viewer (EPUB or PDF) */}
      <View style={styles.readerWrapper}>
        {book.file_type === 'pdf' ? (
          <PdfReader
            ref={readerRef}
            bookDataBase64={bookBase64}
            bookDataArrayBuffer={bookArrayBuffer}
            bookDataUrl={bookDataUrl}
            initialCfi={initialCfi}
            settings={settings}
            onLocationChange={handleLocationChange}
            onTocLoaded={setToc}
            onToggleUI={() => setShowUI((prev) => !prev)}
            onError={(err) => setErrorMessage(err)}
          />
        ) : (
          <EpubReader
            ref={readerRef}
            bookDataBase64={bookBase64}
            bookDataArrayBuffer={bookArrayBuffer}
            bookDataUrl={bookDataUrl}
            initialCfi={initialCfi}
            locationsCache={locationsCache}
            settings={settings}
            onLocationChange={handleLocationChange}
            onLocationsGenerated={handleLocationsGenerated}
            onTocLoaded={setToc}
            onToggleUI={() => setShowUI((prev) => !prev)}
            onError={(err) => setErrorMessage(err)}
          />
        )}
      </View>

      {/* Bottom Footer Overlay */}
      {showUI && (
        <View style={[styles.bottomBar, { backgroundColor: barBg, borderTopColor: barBorder }]}>
          <TouchableOpacity
            style={styles.pageButton}
            onPress={() => readerRef.current?.prevPage()}
            activeOpacity={0.7}
          >
            <Text style={[styles.pageButtonText, { color: barText }]}>Trang trước</Text>
          </TouchableOpacity>

          <View style={styles.progressInfo}>
            <Text style={[styles.progressPercentage, { color: barText }]}>
              {pageInfo.page && pageInfo.totalPages
                ? `Trang ${pageInfo.page}/${pageInfo.totalPages} (${currentProgress.toFixed(1)}%)`
                : `${currentProgress.toFixed(1)}%`}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.pageButton}
            onPress={() => readerRef.current?.nextPage()}
            activeOpacity={0.7}
          >
            <Text style={[styles.pageButtonText, { color: barText }]}>Trang sau</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Table of Contents Modal */}
      <Modal visible={showTocModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: barBg }]}>
            <View style={[styles.modalHeader, { borderBottomColor: barBorder }]}>
              <Text style={[styles.modalTitle, { color: barText }]}>Mục lục</Text>
              <TouchableOpacity onPress={() => setShowTocModal(false)}>
                <Text style={[styles.modalCloseText, { color: barText }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {toc.length === 0 ? (
              <View style={styles.emptyToc}>
                <Text style={{ color: '#A1A1AA' }}>Không có mục lục</Text>
              </View>
            ) : (
              <FlatList
                data={toc}
                keyExtractor={(_, index) => index.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.tocItem, { borderBottomColor: barBorder }]}
                    onPress={() => {
                      readerRef.current?.goTo(item.href);
                      setShowTocModal(false);
                    }}
                  >
                    <Text style={[styles.tocItemText, { color: barText }]} numberOfLines={2}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Settings Modal (Theme & Font Size) */}
      <Modal visible={showSettingsModal} animationType="fade" transparent={true}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSettingsModal(false)}
        >
          <View style={[styles.settingsCard, { backgroundColor: barBg, borderColor: barBorder }]}>
            <Text style={[styles.settingsSectionTitle, { color: barText }]}>GIAO DIỆN ĐỌC</Text>
            <View style={styles.themeRow}>
              {(['dark', 'sepia', 'light'] as ReaderTheme[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.themeButton,
                    t === 'dark' && { backgroundColor: '#121214' },
                    t === 'sepia' && { backgroundColor: '#F4ECD8' },
                    t === 'light' && { backgroundColor: '#FFFFFF' },
                    settings.theme === t && styles.themeButtonActive,
                  ]}
                  onPress={() => selectTheme(t)}
                >
                  <Text
                    style={[
                      styles.themeButtonLabel,
                      { color: t === 'dark' ? '#E4E4E7' : '#18181B' },
                    ]}
                  >
                    {t === 'dark' ? 'Tối' : t === 'sepia' ? 'Sepia' : 'Sáng'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.settingsSectionTitle, { color: barText, marginTop: 18 }]}>
              CỠ CHỮ ({settings.fontSize}%)
            </Text>
            <View style={styles.fontRow}>
              <TouchableOpacity
                style={[styles.fontButton, { borderColor: barBorder }]}
                onPress={() => changeFontSize(-10)}
              >
                <Text style={[styles.fontButtonText, { color: barText }]}>A -</Text>
              </TouchableOpacity>
              <Text style={[styles.fontValue, { color: barText }]}>{settings.fontSize}%</Text>
              <TouchableOpacity
                style={[styles.fontButton, { borderColor: barBorder }]}
                onPress={() => changeFontSize(10)}
              >
                <Text style={[styles.fontButtonText, { color: barText }]}>A +</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121214',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#09090B',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#A1A1AA',
    fontSize: 14,
    marginTop: 12,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  backButtonCta: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  readerWrapper: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 52,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  iconButton: {
    padding: 8,
  },
  iconButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  titleContainer: {
    flex: 1,
    marginHorizontal: 8,
  },
  topTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionsRight: {
    flexDirection: 'row',
    gap: 4,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 52,
    borderTopWidth: 1,
    zIndex: 10,
  },
  pageButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  pageButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
  progressInfo: {
    alignItems: 'center',
  },
  progressPercentage: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: '75%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  modalCloseText: {
    fontSize: 18,
    fontWeight: '600',
    padding: 4,
  },
  emptyToc: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tocItem: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tocItemText: {
    fontSize: 15,
  },
  settingsCard: {
    margin: 20,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  settingsSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 10,
    color: '#71717A',
  },
  themeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  themeButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  themeButtonActive: {
    borderColor: '#6366F1',
    borderWidth: 2,
  },
  themeButtonLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  fontRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fontButton: {
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  fontButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  fontValue: {
    fontSize: 14,
    fontWeight: '600',
  },
});
