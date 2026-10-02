import React, { useState, useRef, useCallback } from 'react';
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
import type { ReaderTheme } from '@folium/shared';
import { getDatabase } from '../../src/db';
import { EpubReader } from '../../src/reader/EpubReader';
import { PdfReader } from '../../src/reader/PdfReader';
import { generateUUID } from '../../src/services/bookService';
import {
  queueMutation,
  triggerDebouncedSync,
  flushSyncImmediately,
} from '../../src/services/syncService';
import { SyncStatusBadge } from '../../src/components/SyncStatusBadge';
import { colors, typography, spacing, radius } from '../../src/theme/tokens';
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  BookmarkIcon,
  ListTocIcon,
  CloseIcon,
  TrashIcon,
  SearchIcon,
  TextAaIcon,
  SpeakerIcon,
} from '../../src/components/icons/Icons';
import { TTSPlayerBar } from '../../src/components/TTSPlayerBar';

import { useBookLoader } from '../../src/hooks/useBookLoader';
import { useReaderAnnotations } from '../../src/hooks/useReaderAnnotations';
import { useReaderSettings } from '../../src/hooks/useReaderSettings';
import { useReaderKeyboard } from '../../src/hooks/useReaderKeyboard';
import { useTTS } from '../../src/hooks/useTTS';
import { useI18n } from '../../src/i18n';

export default function ReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, locale } = useI18n();
  const readerRef = useRef<any>(null);

  // 1. Book file & metadata loader hook
  const {
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
  } = useBookLoader(id);

  // 2. Reader UI state
  const [showUI, setShowUI] = useState(true);
  const [currentCfi, setCurrentCfi] = useState<string>('');
  const [pageInfo, setPageInfo] = useState<{ page?: number; totalPages?: number }>({});
  const [toc, setToc] = useState<Array<{ label: string; href: string }>>([]);
  const [showDrawerModal, setShowDrawerModal] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'toc' | 'bookmarks' | 'highlights' | 'search'>('toc');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  }, []);

  // 3. Reader typography & theme settings hook
  const { settings, setSettings, selectTheme, changeFontSize } = useReaderSettings();

  // 4. Reader annotations & search hook
  const {
    bookmarks,
    setBookmarks,
    highlights,
    setHighlights,
    notes,
    setNotes,
    selectionData,
    setSelectionData,
    highlightColor,
    setHighlightColor,
    noteInput,
    setNoteInput,
    searchQuery,
    setSearchQuery,
    searchResults,
    isCurrentBookmarked,
    toggleBookmark,
    handleSaveHighlight,
    handleDeleteBookmark,
    handleDeleteHighlight,
    handleDeleteNote,
    handleSearch,
  } = useReaderAnnotations({
    book,
    currentCfi,
    pageInfo,
    currentProgress,
    readerRef,
    showToast,
  });

  // 5. Desktop keyboard shortcuts hook
  const { handleEscape } = useReaderKeyboard({
    readerRef,
    setShowUI,
    changeFontSize,
    selectionData,
    setSelectionData,
    showSettingsModal,
    setShowSettingsModal,
    showDrawerModal,
    setShowDrawerModal,
  });

  // 6. Text-to-Speech (TTS) hook & controls
  const [showTTSPlayer, setShowTTSPlayer] = useState(false);
  const {
    settings: ttsSettings,
    updateSettings: updateTtsSettings,
    sentences: ttsSentences,
    currentSentenceIndex: ttsCurrentSentenceIndex,
    currentSentence: ttsCurrentSentence,
    isPlaying: isTtsPlaying,
    isPaused: isTtsPaused,
    loadText: loadTtsText,
    play: playTts,
    pause: pauseTts,
    resume: resumeTts,
    stop: stopTts,
    nextSentence: nextTtsSentence,
    prevSentence: prevTtsSentence,
  } = useTTS();

  const handleTextExtracted = useCallback(
    (text: string) => {
      if (!text || !text.trim()) {
        showToast(t('reader.ttsNoText'));
        return;
      }
      const chunks = loadTtsText(text);
      if (chunks.length > 0) {
        playTts(0);
      } else {
        showToast(t('reader.ttsNoText'));
      }
    },
    [loadTtsText, playTts, showToast, t]
  );

  const handleToggleTTS = useCallback(() => {
    if (showTTSPlayer) {
      stopTts();
      setShowTTSPlayer(false);
      return;
    }

    setShowTTSPlayer(true);

    if (selectionData?.text && selectionData.text.trim().length > 0) {
      const chunks = loadTtsText(selectionData.text);
      if (chunks.length > 0) {
        playTts(0);
      }
      return;
    }

    if (readerRef.current?.getCurrentText) {
      readerRef.current.getCurrentText();
    }
  }, [showTTSPlayer, stopTts, selectionData, loadTtsText, playTts]);

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

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (errorMessage || !book) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>{errorMessage || t('reader.errorLoadingBook')}</Text>
        <TouchableOpacity style={styles.backButtonCta} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>{t('community.backToLibrary')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentThemeTokens = colors.reader[settings.theme] || colors.reader.dark;
  const isDark = settings.theme === 'dark';
  const barBg = currentThemeTokens.surface;
  const barText = currentThemeTokens.text;
  const barBorder = currentThemeTokens.border;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: barBg }]}>
      {/* Top Header Overlay */}
      {showUI && (
        <View style={[styles.topBar, { backgroundColor: barBg, borderColor: barBorder }]}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => {
              flushSyncImmediately();
              router.back();
            }}
            activeOpacity={0.7}
            accessibilityLabel={t('settings.back')}
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
              accessibilityLabel={t('reader.bookmarks')}
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
              accessibilityLabel={t('reader.toc')}
            >
              <ListTocIcon size={18} color={barText} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setShowSettingsModal(true)}
              activeOpacity={0.7}
              accessibilityLabel={t('reader.appearanceTitle')}
            >
              <TextAaIcon size={18} color={barText} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleToggleTTS}
              activeOpacity={0.7}
              accessibilityLabel={t('reader.ttsTitle')}
            >
              <SpeakerIcon
                size={18}
                color={showTTSPlayer ? colors.accentPrimary : barText}
              />
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
              onTextExtracted={handleTextExtracted}
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
              onTextExtracted={handleTextExtracted}
              onError={(err) => setErrorMessage(err)}
            />
          )}
        </View>
      </View>

      {/* Bottom Footer Overlay */}
      {showUI && (
        <View style={[styles.bottomBar, { backgroundColor: barBg, borderColor: barBorder }]}>
          <TouchableOpacity
            style={styles.pageButton}
            onPress={() => readerRef.current?.prevPage()}
            activeOpacity={0.7}
            accessibilityLabel={t('reader.prevPage')}
          >
            <ChevronLeftIcon size={16} color={barText} />
            <Text style={[styles.pageButtonText, { color: barText, marginLeft: 4 }]}>{t('reader.prevPage')}</Text>
          </TouchableOpacity>

          <View style={styles.progressInfo}>
            <Text style={[styles.progressPercentage, { color: barText }]}>
              {book.file_type === 'pdf' && pageInfo.page && pageInfo.totalPages
                ? t('reader.pageOf', { page: pageInfo.page, total: pageInfo.totalPages, percent: currentProgress.toFixed(1) })
                : `${currentProgress.toFixed(1)}%`}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.pageButton}
            onPress={() => readerRef.current?.nextPage()}
            activeOpacity={0.7}
            accessibilityLabel={t('reader.nextPage')}
          >
            <Text style={[styles.pageButtonText, { color: barText, marginRight: 4 }]}>{t('reader.nextPage')}</Text>
            <ChevronRightIcon size={16} color={barText} />
          </TouchableOpacity>
        </View>
      )}

      {/* TTS Audio Narration Player Bar */}
      <TTSPlayerBar
        visible={showTTSPlayer}
        isPlaying={isTtsPlaying}
        isPaused={isTtsPaused}
        currentSentence={ttsCurrentSentence}
        currentSentenceIndex={ttsCurrentSentenceIndex}
        totalSentences={ttsSentences.length}
        rate={ttsSettings.rate}
        onPlay={playTts}
        onPause={pauseTts}
        onResume={resumeTts}
        onStop={stopTts}
        onNext={nextTtsSentence}
        onPrev={prevTtsSentence}
        onRateChange={(rate) => updateTtsSettings({ rate })}
        onClose={() => {
          stopTts();
          setShowTTSPlayer(false);
        }}
      />

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
            <Text style={[styles.selectionHeaderTitle, { color: barText }]}>{t('reader.selectionTitle')}</Text>
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
            placeholder={t('reader.addNotePlaceholder')}
            placeholderTextColor="#A1A1AA"
            value={noteInput}
            onChangeText={setNoteInput}
          />

          <View style={styles.selectionFooterActions}>
            <TouchableOpacity
              style={[styles.btnCancel, { borderColor: barBorder }]}
              onPress={() => { setSelectionData(null); setNoteInput(''); }}
            >
              <Text style={{ color: barText, fontSize: 13 }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnSaveHighlight}
              onPress={handleSaveHighlight}
            >
              <Text style={styles.btnSaveHighlightText}>{t('reader.saveHighlight')}</Text>
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
              <Text style={[styles.modalTitle, { color: barText }]}>{t('reader.shelfDrawerTitle')}</Text>
              <TouchableOpacity onPress={() => setShowDrawerModal(false)} accessibilityLabel={t('common.close')}>
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
                  {t('reader.toc')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.drawerTab, drawerTab === 'bookmarks' && styles.drawerTabActive]}
                onPress={() => setDrawerTab('bookmarks')}
              >
                <Text style={[styles.drawerTabText, { color: drawerTab === 'bookmarks' ? colors.accentPrimary : colors.textSecondary }]}>
                  {t('reader.bookmarks')} ({bookmarks.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.drawerTab, drawerTab === 'highlights' && styles.drawerTabActive]}
                onPress={() => setDrawerTab('highlights')}
              >
                <Text style={[styles.drawerTabText, { color: drawerTab === 'highlights' ? colors.accentPrimary : colors.textSecondary }]}>
                  {t('reader.highlights')} ({highlights.length + notes.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.drawerTab, drawerTab === 'search' && styles.drawerTabActive]}
                onPress={() => setDrawerTab('search')}
              >
                <Text style={[styles.drawerTabText, { color: drawerTab === 'search' ? colors.accentPrimary : colors.textSecondary }]}>
                  {t('reader.search')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Tab 1: TOC */}
            {drawerTab === 'toc' && (
              toc.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={{ color: colors.textSecondary }}>{t('reader.emptyToc')}</Text>
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
                  <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{t('reader.emptyBookmarks')}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                    {t('reader.emptyBookmarksHint')}
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
                          <BookmarkIcon size={14} color={colors.statusSyncing} filled />
                          <Text style={[styles.annotationTitle, { color: barText, marginBottom: 0 }]} numberOfLines={1}>
                            {item.title}
                          </Text>
                        </View>
                        <Text style={styles.annotationMeta}>
                          {new Date(item.client_created_at).toLocaleString(locale)}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDeleteBookmark(item.id)}
                        accessibilityLabel={t('reader.deleteBookmark')}
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
                  <Text style={{ color: '#A1A1AA', fontSize: 14 }}>{t('reader.emptyHighlights')}</Text>
                  <Text style={{ color: '#71717A', fontSize: 12, marginTop: 4 }}>
                    {t('reader.emptyHighlightsHint')}
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
                              {new Date(item.client_created_at).toLocaleString(locale)}
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
                          accessibilityLabel={t('reader.deleteHighlight')}
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
                  placeholder={t('reader.searchPlaceholder')}
                  placeholderTextColor="#A1A1AA"
                  value={searchQuery}
                  onChangeText={handleSearch}
                />

                {searchQuery.trim().length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Text style={{ color: '#A1A1AA', fontSize: 13 }}>
                      {t('reader.searchEmptyPrompt')}
                    </Text>
                  </View>
                ) : searchResults.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Text style={{ color: '#A1A1AA', fontSize: 13 }}>
                      {t('reader.noResults', { query: searchQuery })}
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
                            {item.type === 'bookmark' ? t('reader.bookmarks') : item.type === 'highlight' ? t('reader.highlights') : t('reader.notes')}
                          </Text>
                          <Text style={styles.annotationMeta}>
                            {new Date(item.created_at).toLocaleDateString(locale)}
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
            <Text style={[styles.settingsSectionTitle, { color: barText }]}>{t('reader.appearanceTitle')}</Text>
            <View style={styles.themeRow}>
              {(['dark', 'sepia', 'light'] as ReaderTheme[]).map((themeKey) => (
                <TouchableOpacity
                  key={themeKey}
                  style={[
                    styles.themeButton,
                    themeKey === 'dark' && { backgroundColor: '#121214' },
                    themeKey === 'sepia' && { backgroundColor: '#F4ECD8' },
                    themeKey === 'light' && { backgroundColor: '#FFFFFF' },
                    settings.theme === themeKey && styles.themeButtonActive,
                  ]}
                  onPress={() => selectTheme(themeKey)}
                >
                  <Text
                    style={[
                      styles.themeButtonLabel,
                      { color: themeKey === 'dark' ? '#E4E4E7' : '#18181B' },
                    ]}
                  >
                    {themeKey === 'dark' ? t('reader.themeDark') : themeKey === 'sepia' ? t('reader.themeSepia') : t('reader.themeLight')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.settingsSectionTitle, { color: barText, marginTop: 18 }]}>
              {t('reader.fontSize').toUpperCase()} ({settings.fontSize}%)
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
                <Text style={[styles.shortcutTitle, { color: barText }]}>{t('reader.keyboardShortcuts')}</Text>
                <Text style={styles.shortcutRow}>{t('reader.shortcutTurnPage')}</Text>
                <Text style={styles.shortcutRow}>{t('reader.shortcutFontSize')}</Text>
                <Text style={styles.shortcutRow}>{t('reader.shortcutToggleUI')}</Text>
                <Text style={styles.shortcutRow}>{t('reader.shortcutClose')}</Text>
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
    marginTop: Platform.OS === 'web' ? 14 : 0,
    marginHorizontal: 16,
    width: '90%',
    maxWidth: 860,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
  },
  iconButton: {
    padding: 8,
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
    alignItems: 'center',
    gap: 4,
  },
  bottomBar: {
    marginTop: 12,
    marginBottom: Platform.OS === 'web' ? 16 : 24,
    marginHorizontal: 16,
    maxWidth: 480,
    width: '90%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
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
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
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
