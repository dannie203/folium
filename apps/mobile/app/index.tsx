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

export default function BookshelfScreen() {
  const router = useRouter();
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
      const msg = err.message || 'Không thể nhập file sách này.';
      if (Platform.OS === 'web') {
        alert(msg);
      } else {
        Alert.alert('Lỗi nhập sách', msg);
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

  return (
    <SafeAreaView style={styles.container}>
      <BookshelfHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isDesktop={isDesktop}
        isImporting={isImporting}
        onImport={handleImport}
        onOpenDriveModal={() => setIsDriveModalOpen(true)}
        onOpenCommunity={() => router.push('/community' as any)}
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
          data={filteredBooks}
          keyExtractor={(item) => item.id}
          numColumns={2}
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
            <BookshelfFooter onNavigate={(route) => router.push(route as any)} />
          }
        />
      )}

      {!isDesktop && (
        <BottomTabBar
          activeTab="shelf"
          onOpenCommunity={() => router.push('/community' as any)}
          onOpenSync={() => setIsDriveModalOpen(true)}
        />
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
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridContent: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: 72,
  },
});
