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
  TextInput,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import type { Book, Bookmark, Highlight, Note, ReaderSettings, ReaderTheme } from '@folium/shared';
import { getDatabase } from '../../src/db';
import { EpubReader } from '../../src/reader/EpubReader';
import { PdfReader } from '../../src/reader/PdfReader';
import { generateUUID } from '../../src/services/bookService';
import { getWebBook } from '../../src/services/storage';
import {
  addBookmark,
  getBookmarks,
  deleteBookmark,
  addHighlight,
  getHighlights,
  deleteHighlight,
  addNote,
  getNotes,
  deleteNote,
  searchAnnotations,
  SearchResultItem,
} from '../../src/services/annotationService';
import {
  queueMutation,
  triggerDebouncedSync,
  flushSyncImmediately,
} from '../../src/services/syncService';
import { SyncStatusBadge } from '../../src/components/SyncStatusBadge';
import { colors, readerThemes, typography, spacing, radius } from '../../src/theme/tokens';
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  BookmarkIcon,
  ListTocIcon,
  SettingsIcon,
  CloseIcon,
  TrashIcon,
  SearchIcon,
  CheckIcon,
  TextAaIcon,
} from '../../src/components/icons/Icons';

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
  const [showDrawerModal, setShowDrawerModal] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'toc' | 'bookmarks' | 'highlights' | 'search'>('toc');
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Annotations state
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectionData, setSelectionData] = useState<{ cfiRange: string; text: string } | null>(null);
  const [highlightColor, setHighlightColor] = useState<'yellow' | 'green' | 'blue' | 'pink'>('yellow');
  const [noteInput, setNoteInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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
        // Load annotations (bookmarks, highlights, notes)
        const [bms, hls, nts] = await Promise.all([
          getBookmarks(id),
          getHighlights(id),
          getNotes(id),
        ]);
        setBookmarks(bms);
        setHighlights(hls);
        setNotes(nts);
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

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  }, []);

  const isCurrentBookmarked = bookmarks.some(
    (b) => b.cfi === currentCfi || (pageInfo.page && b.cfi === String(pageInfo.page))
  );

  const toggleBookmark = async () => {
    if (!book) return;
    try {
      const existing = bookmarks.find(
        (b) => b.cfi === currentCfi || (pageInfo.page && b.cfi === String(pageInfo.page))
      );
      if (existing) {
        await deleteBookmark(existing.id);
        setBookmarks((prev) => prev.filter((b) => b.id !== existing.id));
        showToast('Đã xóa dấu trang');
      } else {
        const targetCfi = currentCfi || String(pageInfo.page || 1);
        const pageLabel = pageInfo.page ? `Trang ${pageInfo.page}` : `${currentProgress.toFixed(1)}%`;
        const newBm = await addBookmark(book.id, targetCfi, `${book.title} (${pageLabel})`);
        setBookmarks((prev) => [newBm, ...prev]);
        showToast('Đã thêm dấu trang 🔖');
      }
    } catch (e) {
      console.error('Failed to toggle bookmark:', e);
    }
  };

  const handleSaveHighlight = async () => {
    if (!book || !selectionData) return;
    try {
      const newHl = await addHighlight(
        book.id,
        selectionData.cfiRange,
        selectionData.text,
        highlightColor,
        noteInput.trim() || undefined
      );

      if (noteInput.trim()) {
        const newNote = await addNote(book.id, noteInput.trim(), newHl.id);
        setNotes((prev) => [newNote, ...prev]);
      }

      readerRef.current?.addHighlight(newHl.id, selectionData.cfiRange, highlightColor);
      setHighlights((prev) => [newHl, ...prev]);
      setSelectionData(null);
      setNoteInput('');
      showToast('Đã lưu tô sáng ✨');
    } catch (e) {
      console.error('Failed to save highlight:', e);
    }
  };

  const handleDeleteBookmark = async (bookmarkId: string) => {
    try {
      await deleteBookmark(bookmarkId);
      setBookmarks((prev) => prev.filter((b) => b.id !== bookmarkId));
      showToast('Đã xóa dấu trang');
    } catch (e) {
      console.error('Failed to delete bookmark:', e);
    }
  };

  const handleDeleteHighlight = async (highlightId: string, cfiRange: string) => {
    try {
      await deleteHighlight(highlightId);
      readerRef.current?.removeHighlight(cfiRange);
      setHighlights((prev) => prev.filter((h) => h.id !== highlightId));
      setNotes((prev) => prev.filter((n) => n.highlight_id !== highlightId));
      showToast('Đã xóa tô sáng');
    } catch (e) {
      console.error('Failed to delete highlight:', e);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteNote(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      showToast('Đã xóa ghi chú');
    } catch (e) {
      console.error('Failed to delete note:', e);
    }
  };

  const handleSearch = async (text: string) => {
    setSearchQuery(text);
    if (!text.trim()) {
      setSearchResults([]);
      return;
    }
    if (!book) return;
    try {
      const res = await searchAnnotations(text, book.id);
      setSearchResults(res);
    } catch (e) {
      console.error('Failed to search annotations:', e);
    }
  };

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

        // Queue reading progress mutation (coalesced by syncService to 1 write per book)
        await queueMutation('progress', id, {
          id: progressId,
          user_id: 'local_user',
          book_id: id,
          cfi,
          percentage,
          client_updated_at: now,
          is_deleted: false,
          sync_seq: 0,
        });

        // 30-second idle threshold for background D1 sync
        triggerDebouncedSync(30000);
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

  const changeFontSize = useCallback((delta: number) => {
    setSettings((prev) => ({
      ...prev,
      fontSize: Math.min(200, Math.max(70, prev.fontSize + delta)),
    }));
  }, []);

  const handleEscape = useCallback(() => {
    if (selectionData) {
      setSelectionData(null);
    } else if (showSettingsModal) {
      setShowSettingsModal(false);
    } else if (showDrawerModal) {
      setShowDrawerModal(false);
    } else {
      setShowUI((prev) => !prev);
    }
  }, [selectionData, showSettingsModal, showDrawerModal]);

  // Global keyboard shortcuts for web (desktop navigation)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (
        e.key === 'ArrowRight' ||
        e.key === 'PageDown' ||
        (e.key === ' ' && !e.shiftKey) ||
        e.key === 'j'
      ) {
        e.preventDefault();
        readerRef.current?.nextPage();
      } else if (
        e.key === 'ArrowLeft' ||
        e.key === 'PageUp' ||
        (e.key === ' ' && e.shiftKey) ||
        e.key === 'k'
      ) {
        e.preventDefault();
        readerRef.current?.prevPage();
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setShowUI((prev) => !prev);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        changeFontSize(10);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        changeFontSize(-10);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleEscape();
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [handleEscape, changeFontSize]);

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

  const currentThemeTokens = readerThemes[settings.theme] || readerThemes.dark;
  const isDark = settings.theme === 'dark';
  const barBg = currentThemeTokens.surface;
  const barText = currentThemeTokens.text;
  const barBorder = currentThemeTokens.border;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: barBg }]}>
      {/* Top Header Overlay */}
      {showUI && (
        <View style={[styles.topBar, { backgroundColor: barBg, borderBottomColor: barBorder }]}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => {
              flushSyncImmediately();
              router.back();
            }}
            activeOpacity={0.7}
            accessibilityLabel="Quay lại tủ sách"
          >
            <ArrowLeftIcon size={18} color={barText} />
          </TouchableOpacity>

          <View style={styles.titleContainer}>
            <Text style={[styles.topTitle, { color: barText }]} numberOfLines={1}>
              {book.title}
            </Text>
          </View>

          <View style={styles.actionsRight}>
            <SyncStatusBadge compact theme={settings.theme} />

            <TouchableOpacity
              style={styles.iconButton}
              onPress={toggleBookmark}
              activeOpacity={0.7}
              accessibilityLabel="Đánh dấu trang"
            >
              <BookmarkIcon
                size={18}
                color={isCurrentBookmarked ? '#F59E0B' : barText}
                filled={isCurrentBookmarked}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => {
                setDrawerTab('toc');
                setShowDrawerModal(true);
              }}
              activeOpacity={0.7}
              accessibilityLabel="Mục lục và Dấu trang"
            >
              <ListTocIcon size={18} color={barText} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setShowSettingsModal(true)}
              activeOpacity={0.7}
              accessibilityLabel="Cài đặt giao diện"
            >
              <TextAaIcon size={18} color={barText} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Reader Viewer (EPUB or PDF) */}
      <View style={styles.readerWrapper}>
        <View style={styles.readerPageContainer}>
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
              onChangeFontSize={changeFontSize}
              onEscape={handleEscape}
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
              highlights={highlights}
              settings={settings}
              onLocationChange={handleLocationChange}
              onLocationsGenerated={handleLocationsGenerated}
              onTocLoaded={setToc}
              onToggleUI={() => setShowUI((prev) => !prev)}
              onChangeFontSize={changeFontSize}
              onEscape={handleEscape}
              onSelection={(sel) => setSelectionData(sel)}
              onError={(err) => setErrorMessage(err)}
            />
          )}
        </View>
      </View>

      {/* Bottom Footer Overlay */}
      {showUI && (
        <View style={[styles.bottomBar, { backgroundColor: barBg, borderTopColor: barBorder }]}>
          <TouchableOpacity
            style={styles.pageButton}
            onPress={() => readerRef.current?.prevPage()}
            activeOpacity={0.7}
            accessibilityLabel="Trang trước"
          >
            <ChevronLeftIcon size={16} color={barText} />
            <Text style={[styles.pageButtonText, { color: barText, marginLeft: 4 }]}>Trước</Text>
          </TouchableOpacity>

          <View style={styles.progressInfo}>
            <Text style={[styles.progressPercentage, { color: barText }]}>
              {book.file_type === 'pdf' && pageInfo.page && pageInfo.totalPages
                ? `Trang ${pageInfo.page} / ${pageInfo.totalPages} (${currentProgress.toFixed(1)}%)`
                : `${currentProgress.toFixed(1)}%`}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.pageButton}
            onPress={() => readerRef.current?.nextPage()}
            activeOpacity={0.7}
            accessibilityLabel="Trang sau"
          >
            <Text style={[styles.pageButtonText, { color: barText, marginRight: 4 }]}>Sau</Text>
            <ChevronRightIcon size={16} color={barText} />
          </TouchableOpacity>
        </View>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <View style={styles.toastContainer} pointerEvents="none">
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}

      {/* Floating Text Selection Card (Highlight / Note Creator) */}
      {selectionData && (
        <View style={[styles.selectionPopup, { backgroundColor: barBg, borderColor: barBorder }]}>
          <View style={styles.selectionHeader}>
            <Text style={[styles.selectionHeaderTitle, { color: barText }]}>Tô sáng & Ghi chú</Text>
            <TouchableOpacity onPress={() => { setSelectionData(null); setNoteInput(''); }}>
              <CloseIcon size={16} color={barText} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.selectionQuote, { color: barText }]} numberOfLines={2}>
            "{selectionData.text}"
          </Text>

          {/* 4 Palette Colors */}
          <View style={styles.colorPaletteRow}>
            {([
              { key: 'yellow', hex: '#FACC15' },
              { key: 'green', hex: '#4ADE80' },
              { key: 'blue', hex: '#60A5FA' },
              { key: 'pink', hex: '#F472B6' },
            ] as const).map((c) => (
              <TouchableOpacity
                key={c.key}
                style={[
                  styles.colorCircle,
                  { backgroundColor: c.hex },
                  highlightColor === c.key && styles.colorCircleActive,
                ]}
                onPress={() => setHighlightColor(c.key)}
              />
            ))}
          </View>

          {/* Note text input */}
          <TextInput
            style={[
              styles.selectionNoteInput,
              {
                color: barText,
                borderColor: barBorder,
                backgroundColor: isDark ? '#27272A' : '#F4F4F5',
              },
            ]}
            placeholder="Viết ghi chú ngắn (tùy chọn)..."
            placeholderTextColor="#A1A1AA"
            value={noteInput}
            onChangeText={setNoteInput}
          />

          <View style={styles.selectionFooterActions}>
            <TouchableOpacity
              style={[styles.btnCancel, { borderColor: barBorder }]}
              onPress={() => { setSelectionData(null); setNoteInput(''); }}
            >
              <Text style={{ color: barText, fontSize: 13 }}>Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnSaveHighlight}
              onPress={handleSaveHighlight}
            >
              <Text style={styles.btnSaveHighlightText}>Lưu tô sáng</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Reader Drawer Modal (Mục lục, Dấu trang, Ghi chú, Tìm kiếm) */}
      <Modal visible={showDrawerModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: barBg }]}>
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: barBorder }]}>
              <Text style={[styles.modalTitle, { color: barText }]}>Tủ đọc & Ghi chú</Text>
              <TouchableOpacity onPress={() => setShowDrawerModal(false)} accessibilityLabel="Đóng">
                <CloseIcon size={18} color={barText} />
              </TouchableOpacity>
            </View>

            {/* Navigation Tabs */}
            <View style={[styles.drawerTabs, { borderBottomColor: barBorder }]}>
              <TouchableOpacity
                style={[styles.drawerTab, drawerTab === 'toc' && styles.drawerTabActive]}
                onPress={() => setDrawerTab('toc')}
              >
                <Text style={[styles.drawerTabText, { color: drawerTab === 'toc' ? colors.accentPrimary : colors.textSecondary }]}>
                  Mục lục
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.drawerTab, drawerTab === 'bookmarks' && styles.drawerTabActive]}
                onPress={() => setDrawerTab('bookmarks')}
              >
                <Text style={[styles.drawerTabText, { color: drawerTab === 'bookmarks' ? colors.accentPrimary : colors.textSecondary }]}>
                  Dấu trang ({bookmarks.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.drawerTab, drawerTab === 'highlights' && styles.drawerTabActive]}
                onPress={() => setDrawerTab('highlights')}
              >
                <Text style={[styles.drawerTabText, { color: drawerTab === 'highlights' ? colors.accentPrimary : colors.textSecondary }]}>
                  Ghi chú ({highlights.length + notes.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.drawerTab, drawerTab === 'search' && styles.drawerTabActive]}
                onPress={() => setDrawerTab('search')}
              >
                <Text style={[styles.drawerTabText, { color: drawerTab === 'search' ? colors.accentPrimary : colors.textSecondary }]}>
                  Tìm kiếm
                </Text>
              </TouchableOpacity>
            </View>

            {/* Tab 1: TOC */}
            {drawerTab === 'toc' && (
              toc.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={{ color: colors.textSecondary }}>Không có mục lục</Text>
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
                        setShowDrawerModal(false);
                      }}
                    >
                      <Text style={[styles.tocItemText, { color: barText }]} numberOfLines={2}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              )
            )}

            {/* Tab 2: Bookmarks */}
            {drawerTab === 'bookmarks' && (
              bookmarks.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Chưa có dấu trang nào</Text>
                  <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 4 }}>
                    Nhấn biểu tượng dấu trang trên thanh công cụ để đánh dấu trang hiện tại
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={bookmarks}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <View style={[styles.annotationItem, { borderBottomColor: barBorder }]}>
                      <TouchableOpacity
                        style={styles.annotationContent}
                        onPress={() => {
                          readerRef.current?.goTo(item.cfi);
                          setShowDrawerModal(false);
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <BookmarkIcon size={14} color={colors.accentAmber} filled />
                          <Text style={[styles.annotationTitle, { color: barText, marginBottom: 0 }]} numberOfLines={1}>
                            {item.title}
                          </Text>
                        </View>
                        <Text style={styles.annotationMeta}>
                          {new Date(item.client_created_at).toLocaleString('vi-VN')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDeleteBookmark(item.id)}
                        accessibilityLabel="Xóa dấu trang"
                      >
                        <TrashIcon size={14} color={colors.statusError} />
                      </TouchableOpacity>
                    </View>
                  )}
                />
              )
            )}

            {/* Tab 3: Highlights & Notes */}
            {drawerTab === 'highlights' && (
              highlights.length === 0 && notes.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={{ color: '#A1A1AA', fontSize: 14 }}>Chưa có tô sáng hoặc ghi chú nào</Text>
                  <Text style={{ color: '#71717A', fontSize: 12, marginTop: 4 }}>
                    Bôi đen đoạn văn bản trong sách để tô sáng và ghi chép
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={highlights}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => {
                    const colorBadge =
                      item.color === 'yellow' ? '#FACC15' :
                      item.color === 'green' ? '#4ADE80' :
                      item.color === 'blue' ? '#60A5FA' : '#F472B6';

                    return (
                      <View style={[styles.annotationItem, { borderBottomColor: barBorder }]}>
                        <TouchableOpacity
                          style={styles.annotationContent}
                          onPress={() => {
                            readerRef.current?.goTo(item.cfi_range);
                            setShowDrawerModal(false);
                          }}
                        >
                          <View style={styles.badgeRow}>
                            <View style={[styles.colorDot, { backgroundColor: colorBadge }]} />
                            <Text style={styles.annotationMeta}>
                              {new Date(item.client_created_at).toLocaleString('vi-VN')}
                            </Text>
                          </View>
                          <Text style={[styles.annotationQuote, { color: barText }]} numberOfLines={2}>
                            "{item.text}"
                          </Text>
                          {item.note && (
                            <Text style={[styles.annotationNoteText, { color: isDark ? '#A1A1AA' : '#52525B' }]}>
                              {item.note}
                            </Text>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={() => handleDeleteHighlight(item.id, item.cfi_range)}
                          accessibilityLabel="Xóa tô sáng"
                        >
                          <TrashIcon size={14} color={colors.statusError} />
                        </TouchableOpacity>
                      </View>
                    );
                  }}
                />
              )
            )}

            {/* Tab 4: Search */}
            {drawerTab === 'search' && (
              <View style={styles.searchTabContainer}>
                <TextInput
                  style={[
                    styles.searchInput,
                    {
                      color: barText,
                      borderColor: barBorder,
                      backgroundColor: isDark ? '#27272A' : '#F4F4F5',
                    },
                  ]}
                  placeholder="Tìm kiếm trong dấu trang, ghi chú, đoạn trích..."
                  placeholderTextColor="#A1A1AA"
                  value={searchQuery}
                  onChangeText={handleSearch}
                />

                {searchQuery.trim().length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Text style={{ color: '#A1A1AA', fontSize: 13 }}>
                      Nhập từ khóa để tìm kiếm nhanh tức thì trong sách
                    </Text>
                  </View>
                ) : searchResults.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Text style={{ color: '#A1A1AA', fontSize: 13 }}>
                      Không tìm thấy kết quả phù hợp cho "{searchQuery}"
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={searchResults}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[styles.searchResultItem, { borderBottomColor: barBorder }]}
                        onPress={() => {
                          if (item.cfi) {
                            readerRef.current?.goTo(item.cfi);
                            setShowDrawerModal(false);
                          }
                        }}
                      >
                        <View style={styles.searchResultHeader}>
                          <Text style={styles.searchResultBadge}>
                            {item.type === 'bookmark' ? 'Dấu trang' : item.type === 'highlight' ? 'Tô sáng' : 'Ghi chú'}
                          </Text>
                          <Text style={styles.annotationMeta}>
                            {new Date(item.created_at).toLocaleDateString('vi-VN')}
                          </Text>
                        </View>
                        <Text style={[styles.searchResultSnippet, { color: barText }]} numberOfLines={2}>
                          {item.snippet}
                        </Text>
                      </TouchableOpacity>
                    )}
                  />
                )}
              </View>
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

            {Platform.OS === 'web' && (
              <View style={[styles.shortcutBox, { borderTopColor: barBorder }]}>
                <Text style={[styles.shortcutTitle, { color: barText }]}>PHÍM TẮT BÀN PHÍM</Text>
                <Text style={styles.shortcutRow}>
                  <Text style={styles.shortcutKey}>← / → hoặc Space</Text>: Lật trang
                </Text>
                <Text style={styles.shortcutRow}>
                  <Text style={styles.shortcutKey}>+ / -</Text>: Chỉnh cỡ chữ (70% - 200%)
                </Text>
                <Text style={styles.shortcutRow}>
                  <Text style={styles.shortcutKey}>T</Text>: Ẩn / Hiện thanh công cụ
                </Text>
                <Text style={styles.shortcutRow}>
                  <Text style={styles.shortcutKey}>Esc</Text>: Đóng bảng / Menu
                </Text>
              </View>
            )}
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
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'stretch',
    backgroundColor: '#121214',
    width: '100%',
  },
  readerPageContainer: {
    flex: 1,
    maxWidth: 840,
    width: '100%',
    height: '100%',
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
    flexDirection: 'row',
    alignItems: 'center',
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
  shortcutBox: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  shortcutTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
    opacity: 0.65,
  },
  shortcutRow: {
    fontSize: 12,
    color: '#A1A1AA',
    lineHeight: 20,
  },
  shortcutKey: {
    fontWeight: '700',
    color: '#818CF8',
  },
  toastContainer: {
    position: 'absolute',
    bottom: 76,
    alignSelf: 'center',
    backgroundColor: 'rgba(24, 24, 27, 0.95)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 8,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  selectionPopup: {
    position: 'absolute',
    bottom: 76,
    alignSelf: 'center',
    maxWidth: 600,
    width: '92%',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  selectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  selectionHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  selectionCloseBtn: {
    fontSize: 16,
    padding: 4,
  },
  selectionQuote: {
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 12,
    lineHeight: 18,
    opacity: 0.85,
  },
  colorPaletteRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  colorCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorCircleActive: {
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.15 }],
  },
  selectionNoteInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 12,
  },
  selectionFooterActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  btnCancel: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSaveHighlight: {
    backgroundColor: '#6366F1',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSaveHighlightText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  drawerTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingBottom: 4,
    marginBottom: 8,
    gap: 6,
  },
  drawerTab: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  drawerTabActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
  },
  drawerTabText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  annotationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  annotationContent: {
    flex: 1,
    marginRight: 8,
  },
  annotationTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  annotationMeta: {
    fontSize: 11,
    color: '#A1A1AA',
  },
  annotationQuote: {
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 4,
    lineHeight: 18,
  },
  annotationNoteText: {
    fontSize: 12,
    marginTop: 2,
  },
  deleteBtn: {
    padding: 8,
  },
  deleteBtnText: {
    fontSize: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  searchTabContainer: {
    flex: 1,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  searchResultItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchResultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  searchResultBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: '#818CF8',
  },
  searchResultSnippet: {
    fontSize: 13,
    lineHeight: 18,
  },
});
