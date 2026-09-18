import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  getBooksWithProgress,
  importBookFromPicker,
  deleteBook,
  type BookWithProgress,
} from '../src/services/bookService';
import { BookCard } from '../src/components/BookCard';
import { SyncStatusBadge } from '../src/components/SyncStatusBadge';
import { DriveSyncModal } from '../src/components/DriveSyncModal';
import { performFullSync, initSyncLifecycle } from '../src/services/syncService';

type FilterType = 'all' | 'epub' | 'pdf';

export default function BookshelfScreen() {
  const router = useRouter();
  const [books, setBooks] = useState<BookWithProgress[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);

  const loadBooks = useCallback(async () => {
    try {
      const data = await getBooksWithProgress();
      setBooks(data);
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
    // Background pull sync on bookshelf mount
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

  const handleDelete = async (book: BookWithProgress) => {
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

      const matchesFilter =
        activeFilter === 'all' || b.file_type === activeFilter;

      return matchesSearch && matchesFilter;
    });
  }, [books, searchQuery, activeFilter]);

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Search & Actions Bar */}
      <View style={styles.headerBar}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm theo tên sách, tác giả..."
            placeholderTextColor="#71717A"
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
        </View>

        <SyncStatusBadge theme="dark" />

        <TouchableOpacity
          style={styles.driveButton}
          activeOpacity={0.8}
          onPress={() => setIsDriveModalOpen(true)}
        >
          <Text style={styles.driveButtonText}>☁️ Drive</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.importButton}
          activeOpacity={0.8}
          onPress={handleImport}
          disabled={isImporting}
        >
          {isImporting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.importButtonText}>+ Thêm sách</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(['all', 'epub', 'pdf'] as FilterType[]).map((filter) => {
          const isActive = activeFilter === filter;
          const label =
            filter === 'all'
              ? `Tất cả (${books.length})`
              : filter === 'epub'
              ? `EPUB (${books.filter((b) => b.file_type === 'epub').length})`
              : `PDF (${books.filter((b) => b.file_type === 'pdf').length})`;

          return (
            <TouchableOpacity
              key={filter}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => setActiveFilter(filter)}
            >
              <Text
                style={[styles.filterText, isActive && styles.filterTextActive]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Bookshelf Grid */}
      {filteredBooks.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyIcon}>📚</Text>
          <Text style={styles.emptyTitle}>
            {books.length === 0
              ? 'Tủ sách của bạn còn trống'
              : 'Không tìm thấy sách phù hợp'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {books.length === 0
              ? 'Nhấn nút "+ Thêm sách" để chọn file EPUB hoặc PDF từ máy của bạn.'
              : 'Thử tìm kiếm với từ khoá khác hoặc xoá bộ lọc.'}
          </Text>

          {books.length === 0 && (
            <TouchableOpacity
              style={styles.ctaButton}
              activeOpacity={0.8}
              onPress={handleImport}
              disabled={isImporting}
            >
              <Text style={styles.ctaButtonText}>Chọn file sách từ máy</Text>
            </TouchableOpacity>
          )}
        </View>
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
            />
          )}
          contentContainerStyle={styles.gridContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#6366F1"
            />
          }
          ListFooterComponent={
            <View style={styles.footerContainer}>
              <View style={styles.footerLinksRow}>
                <TouchableOpacity onPress={() => router.push('/privacy' as any)}>
                  <Text style={styles.footerLinkText}>Quyền riêng tư</Text>
                </TouchableOpacity>
                <Text style={styles.footerDivider}>•</Text>
                <TouchableOpacity onPress={() => router.push('/terms' as any)}>
                  <Text style={styles.footerLinkText}>Điều khoản & DMCA</Text>
                </TouchableOpacity>
                <Text style={styles.footerDivider}>•</Text>
                <TouchableOpacity onPress={() => router.push('/security' as any)}>
                  <Text style={styles.footerLinkText}>Bảo mật ZK</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.footerCopyright}>Folium 🍃 Local-First & Zero-Knowledge E-Reader</Text>
            </View>
          }
        />
      )}

      <DriveSyncModal
        visible={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
        onSyncComplete={() => loadBooks()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090B',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181B',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  searchIcon: {
    marginRight: 8,
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    color: '#FAFAFA',
    fontSize: 14,
    height: '100%',
  },
  importButton: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  importButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  filterChipActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  filterText: {
    fontSize: 12,
    color: '#A1A1AA',
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  gridContent: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 24,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FAFAFA',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#A1A1AA',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  ctaButton: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  driveButton: {
    backgroundColor: '#27272A',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  driveButtonText: {
    color: '#E4E4E7',
    fontSize: 12,
    fontWeight: '600',
  },
  footerContainer: {
    paddingTop: 32,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 8,
  },
  footerLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  footerLinkText: {
    color: '#71717A',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  footerDivider: {
    color: '#3F3F46',
    fontSize: 12,
  },
  footerCopyright: {
    color: '#52525B',
    fontSize: 11,
    marginTop: 4,
  },
});
