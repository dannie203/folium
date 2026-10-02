import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
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
import { colors, spacing } from '../src/theme/tokens';
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
        totalBooks={books.length}
        visibleBooks={filteredBooks.length}
      />

      <ShelfFilterChips
        books={books}
        availableShelves={availableShelves}
        selectedShelf={selectedShelf}
        activeFilter={activeFilter}
        onSelectShelf={setSelectedShelf}
        onSelectFilter={setActiveFilter}
      />

      {filteredBooks.length === 0 ? (
        <EmptyBookshelf
          isLibraryEmpty={books.length === 0}
          isImporting={isImporting}
          onImport={handleImport}
        />
      ) : (
        <FlatList
          key={isDesktop ? 'desktop-grid' : 'mobile-grid'}
          data={filteredBooks}
          keyExtractor={(item) => item.id}
          numColumns={isDesktop ? 4 : 2}
          renderItem={({ item }) => (
            <View style={[styles.gridItem, isDesktop ? styles.gridItemDesktop : styles.gridItemMobile]}>
              <BookCard
                book={item}
                onPress={handleOpenBook}
                onDelete={handleDelete}
                onLongPress={(b) => setEditingBook(b)}
              />
            </View>
          )}
          contentContainerStyle={styles.gridContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accentPrimary}
            />
          }
        />
      )}

      <BookshelfFooter onNavigate={(route) => router.push(route as any)} />

      {!isDesktop && (
        <BottomTabBar
          activeTab="shelf"
          onOpenShelf={() => {
            setSelectedShelf('all');
            setActiveFilter('all');
          }}
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
  gridItem: {
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 0,
  },
  gridItemDesktop: {
    width: '25%',
  },
  gridItemMobile: {
    width: '50%',
  },
});
