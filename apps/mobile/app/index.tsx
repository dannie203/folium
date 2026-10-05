import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { Book } from '@folium/shared';
import {
  getBooksWithProgress,
  importBookFromPicker,
  deleteBook,
  getAvailableShelves,
  type BookWithProgress,
} from '../src/services/bookService';
import { BookCard } from '../src/components/BookCard';
import { DriveSyncModal } from '../src/components/DriveSyncModal';
import { MetadataEditModal } from '../src/components/MetadataEditModal';
import { performFullSync, initSyncLifecycle } from '../src/services/syncService';
import { colors, spacing, typography, radius } from '../src/theme/tokens';
import { BookshelfHeader } from '../src/components/bookshelf/BookshelfHeader';
import { ShelfFilterChips, type FilterType } from '../src/components/bookshelf/ShelfFilterChips';
import { EmptyBookshelf } from '../src/components/bookshelf/EmptyBookshelf';
import { BookshelfFooter } from '../src/components/bookshelf/BookshelfFooter';
import { BottomTabBar } from '../src/components/navigation/BottomTabBar';
import { SidebarNav } from '../src/components/navigation/SidebarNav';
import { useI18n } from '../src/i18n';

export default function BookshelfScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const [books, setBooks] = useState<BookWithProgress[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [selectedShelf, setSelectedShelf] = useState<string>('all');
  const [availableShelves, setAvailableShelves] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<BookWithProgress | null>(null);

  const loadBooks = useCallback(async () => {
    try {
      const data = await getBooksWithProgress();
      setBooks(data);
      const shelves = await getAvailableShelves();
      setAvailableShelves(shelves);
    } catch (e) {
      console.error('Failed to load books:', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    initSyncLifecycle();
    loadBooks();
    performFullSync().then(() => {
      loadBooks();
    });
  }, [loadBooks]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await performFullSync();
    } catch (e) {
      console.warn('Sync failed on pull-to-refresh:', e);
    }
    await loadBooks();
  };

  const handleImport = async () => {
    try {
      setIsImporting(true);
      const newBook = await importBookFromPicker();
      if (newBook) {
        setBooks((prev) => [newBook, ...prev]);
      }
    } catch (err: any) {
      const msg = err.message || t('bookshelf.importFailed');
      if (Platform.OS === 'web') {
        alert(msg);
      } else {
        Alert.alert(t('bookshelf.importFailedTitle'), msg);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleDelete = async (book: Book | BookWithProgress) => {
    try {
      await deleteBook(book.id);
      setBooks((prev) => prev.filter((b) => b.id !== book.id));
    } catch (err) {
      console.error('Failed to delete book:', err);
    }
  };

  const handleOpenBook = (book: BookWithProgress) => {
    router.push(`/reader/${book.id}` as any);
  };

  const shelfCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of books) {
      if (b.shelf) {
        counts[b.shelf] = (counts[b.shelf] || 0) + 1;
      }
    }
    return counts;
  }, [books]);

  const filteredBooks = useMemo(() => {
    return books.filter((b) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.author.toLowerCase().includes(searchQuery.toLowerCase());

      let matchesFilter = true;
      if (activeFilter === 'epub') matchesFilter = b.file_type === 'epub';
      else if (activeFilter === 'pdf') matchesFilter = b.file_type === 'pdf';

      let matchesShelf = true;
      if (selectedShelf === 'Inbox') {
        matchesShelf = !b.shelf || b.shelf === 'Inbox';
      } else if (selectedShelf !== 'all') {
        matchesShelf = b.shelf === selectedShelf;
      }

      return matchesSearch && matchesFilter && matchesShelf;
    });
  }, [books, searchQuery, activeFilter, selectedShelf]);

  // Derive genuinely active reading book from database (0 mock data!)
  const activeBook = useMemo(() => {
    if (searchQuery.trim() !== '' || activeFilter !== 'all' || selectedShelf !== 'all') {
      return null;
    }
    return (
      books.find(
        (b) => (b.progress_percentage ?? 0) > 0 && (b.progress_percentage ?? 0) < 100
      ) || null
    );
  }, [books, searchQuery, activeFilter, selectedShelf]);

  const renderReadingDesk = useCallback(() => {
    if (!activeBook) return null;
    const progressPercent = Math.round(activeBook.progress_percentage || 0);

    return (
      <View style={styles.deskWrapper}>
        <Text style={styles.deskHeadingLabel}>
          {t('bookshelf.currentlyReading')}
        </Text>
        <TouchableOpacity
          style={styles.deskCard}
          activeOpacity={0.88}
          onPress={() => handleOpenBook(activeBook)}
        >
          <View style={styles.deskCoverWrap}>
            {activeBook.cover_url ? (
              <Image
                source={{ uri: activeBook.cover_url }}
                style={styles.deskCoverImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.deskCoverPlaceholder}>
                <Text style={styles.deskPlaceholderText} numberOfLines={2}>
                  {activeBook.title}
                </Text>
              </View>
            )}
            <View style={styles.deskSpineHighlight} />
            <View style={styles.deskSpineShadow} />
            <View style={styles.deskProgressTrack}>
              <View
                style={[styles.deskProgressFill, { width: `${progressPercent}%` }]}
              />
            </View>
          </View>

          <View style={styles.deskDetails}>
            <Text style={styles.deskTitle} numberOfLines={2}>
              {activeBook.title}
            </Text>
            <Text style={styles.deskAuthor} numberOfLines={1}>
              {activeBook.author || t('common.unknownAuthor')}
            </Text>

            <View style={styles.deskMetaRow}>
              <Text style={styles.deskProgressText}>
                {t('bookshelf.readProgress', { percent: progressPercent })}
              </Text>
              <Text style={styles.deskDot}>·</Text>
              <Text style={styles.deskFormatText}>
                {activeBook.file_type.toUpperCase()}
              </Text>
            </View>

            <View style={styles.deskActionBtn}>
              <Text style={styles.deskActionBtnText}>
                {t('bookshelf.continueReading')}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  }, [activeBook, t]);

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.accentPrimary} />
      </View>
    );
  }

  const mainBookshelfView = (
    <View style={styles.mainContent}>
      <BookshelfHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isDesktop={isDesktop}
        isImporting={isImporting}
        onImport={handleImport}
      />

      <ShelfFilterChips
        books={books}
        availableShelves={availableShelves}
        selectedShelf={selectedShelf}
        activeFilter={activeFilter}
        onSelectShelf={setSelectedShelf}
        onSelectFilter={setActiveFilter}
        isDesktop={isDesktop}
      />

      {filteredBooks.length === 0 ? (
        <EmptyBookshelf
          isLibraryEmpty={books.length === 0}
          isImporting={isImporting}
          onImport={handleImport}
          onOpenCommunity={() => router.push('/community' as any)}
          onOpenDriveModal={() => setIsDriveModalOpen(true)}
        />
      ) : (
        <FlatList
          key={isDesktop ? 'desktop-grid' : 'mobile-grid'}
          data={filteredBooks}
          keyExtractor={(item) => item.id}
          numColumns={isDesktop ? 4 : 2}
          ListHeaderComponent={renderReadingDesk}
          renderItem={({ item }) => (
            <BookCard
              book={item}
              onPress={handleOpenBook}
              onDelete={handleDelete}
              onLongPress={(b) => setEditingBook(b)}
            />
          )}
          contentContainerStyle={styles.gridContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accentPrimary}
            />
          }
          ListFooterComponent={
            isDesktop ? undefined : (
              <BookshelfFooter onNavigate={(route) => router.push(route as any)} />
            )
          }
        />
      )}

      {!isDesktop && (
        <BottomTabBar
          activeTab="shelf"
          onOpenShelf={() => setSelectedShelf('all')}
          onOpenCommunity={() => router.push('/community' as any)}
          onOpenSettings={() => router.push('/settings' as any)}
        />
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {isDesktop ? (
        <View style={styles.desktopLayout}>
          <SidebarNav
            selectedShelf={selectedShelf}
            onSelectShelf={setSelectedShelf}
            availableShelves={availableShelves}
            totalBooksCount={books.length}
            inboxCount={books.filter((b) => !b.shelf || b.shelf === 'Inbox').length}
            shelfCounts={shelfCounts}
            activeRoute="bookshelf"
            onOpenDriveModal={() => setIsDriveModalOpen(true)}
            onOpenCommunity={() => router.push('/community' as any)}
            onOpenBookshelf={() => setSelectedShelf('all')}
            onOpenTerms={() => router.push('/terms' as any)}
            onOpenSecurity={() => router.push('/security' as any)}
            onOpenPrivacy={() => router.push('/privacy' as any)}
            onOpenSettings={() => router.push('/settings' as any)}
          />
          {mainBookshelfView}
        </View>
      ) : (
        mainBookshelfView
      )}

      <DriveSyncModal
        visible={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
        onSyncComplete={() => loadBooks()}
      />

      <MetadataEditModal
        visible={!!editingBook}
        book={editingBook}
        onClose={() => setEditingBook(null)}
        onSaved={() => loadBooks()}
        onDelete={handleDelete}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  desktopLayout: {
    flex: 1,
    flexDirection: 'row',
    height: '100%',
  },
  mainContent: {
    flex: 1,
    flexDirection: 'column',
    height: '100%',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgBase,
  },
  gridContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 72,
  },
  deskWrapper: {
    paddingHorizontal: 8,
    marginBottom: spacing.xl,
    marginTop: spacing.xs,
  },
  deskHeadingLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  deskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  deskCoverWrap: {
    width: 72,
    aspectRatio: 1 / 1.5,
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: '#1E202B',
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderHairline,
    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.45)',
  } as any,
  deskCoverImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  deskCoverPlaceholder: {
    flex: 1,
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deskPlaceholderText: {
    fontSize: 10,
    color: colors.textSecondary,
    textAlign: 'center',
    fontWeight: '600',
  },
  deskSpineHighlight: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    zIndex: 5,
  },
  deskSpineShadow: {
    position: 'absolute',
    left: 2,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    zIndex: 4,
  },
  deskProgressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    zIndex: 8,
  },
  deskProgressFill: {
    height: '100%',
    backgroundColor: colors.accentBookmark,
  },
  deskDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  deskTitle: {
    fontFamily: Platform.select({ web: typography.fontFamily.serif, default: 'serif' }),
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '400',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  deskAuthor: {
    fontSize: 12.5,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  deskMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  deskProgressText: {
    fontSize: 12,
    color: colors.accentBookmark,
    fontWeight: '500',
  },
  deskDot: {
    fontSize: 12,
    color: colors.textMuted,
  },
  deskFormatText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },
  deskActionBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#F7F7F8',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
  },
  deskActionBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#0A0A0C',
  },
});
