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
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  getBooksWithProgress,
  importBookFromPicker,
  deleteBook,
  getAvailableShelves,
  type BookWithProgress,
} from '../src/services/bookService';
import { BookCard } from '../src/components/BookCard';
import { SyncStatusBadge } from '../src/components/SyncStatusBadge';
import { DriveSyncModal } from '../src/components/DriveSyncModal';
import { MetadataEditModal } from '../src/components/MetadataEditModal';
import { performFullSync, initSyncLifecycle } from '../src/services/syncService';
import { colors, typography, spacing, radius } from '../src/theme/tokens';
import {
  FoliumLeafIcon,
  SearchIcon,
  PlusIcon,
  CloudDriveIcon,
  CommunityGlobeIcon,
  InboxTrayIcon,
  FolderIcon,
  BookLibraryIcon,
  SettingsIcon,
} from '../src/components/icons/Icons';

type FilterType = 'all' | 'epub' | 'pdf';

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
      {/* Brand Navigation Bar */}
      <View style={styles.headerBar}>
        <View style={styles.headerTopRow}>
          <View style={styles.brandContainer}>
            <FoliumLeafIcon size={24} color={colors.accentPrimary} />
            <Text style={styles.brandTitle}>Folium</Text>
          </View>

          {isDesktop && (
            <View style={styles.searchBox}>
              <SearchIcon size={16} color={colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Tìm theo tên sách, tác giả..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                clearButtonMode="while-editing"
              />
            </View>
          )}

          {/* Action Controls */}
          <View style={styles.actionsGroup}>
            <SyncStatusBadge theme="dark" compact={!isDesktop} />

            {isDesktop && (
              <>
                <TouchableOpacity
                  style={styles.actionBtn}
                  activeOpacity={0.8}
                  onPress={() => setIsDriveModalOpen(true)}
                  accessibilityLabel="Đồng bộ Google Drive"
                >
                  <CloudDriveIcon size={16} color={colors.textSecondary} />
                  <Text style={styles.actionBtnText}>Drive</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.communityBtn}
                  activeOpacity={0.8}
                  onPress={() => router.push('/community' as any)}
                  accessibilityLabel="Tủ sách cộng đồng"
                >
                  <CommunityGlobeIcon size={16} color="#A5B4FC" />
                  <Text style={styles.communityBtnText}>Cộng đồng</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={styles.importButton}
              activeOpacity={0.85}
              onPress={handleImport}
              disabled={isImporting}
              accessibilityLabel="Thêm sách mới"
            >
              {isImporting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <PlusIcon size={14} color="#FFFFFF" />
                  {isDesktop && <Text style={styles.importButtonText}>Thêm sách</Text>}
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {!isDesktop && (
          <View style={styles.mobileSearchBox}>
            <SearchIcon size={16} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm theo tên sách, tác giả..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
            />
          </View>
        )}
      </View>

      {/* Horizontal Shelves & Format Filter Chips */}
      <View style={styles.filterWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <TouchableOpacity
            style={[
              styles.filterChip,
              selectedShelf === 'all' && activeFilter === 'all' && styles.filterChipActive,
            ]}
            onPress={() => {
              setSelectedShelf('all');
              setActiveFilter('all');
            }}
          >
            <Text
              style={[
                styles.filterText,
                selectedShelf === 'all' && activeFilter === 'all' && styles.filterTextActive,
              ]}
            >
              Tất cả ({books.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, selectedShelf === 'Inbox' && styles.filterChipActive]}
            onPress={() => setSelectedShelf(selectedShelf === 'Inbox' ? 'all' : 'Inbox')}
          >
            <InboxTrayIcon
              size={13}
              color={selectedShelf === 'Inbox' ? '#FFFFFF' : colors.textSecondary}
            />
            <Text style={[styles.filterText, selectedShelf === 'Inbox' && styles.filterTextActive]}>
              Hộp thư đến ({books.filter((b) => !b.shelf || b.shelf === 'Inbox').length})
            </Text>
          </TouchableOpacity>

          {availableShelves
            .filter((s) => s !== 'Inbox')
            .map((shelfName) => {
              const isSelected = selectedShelf === shelfName;
              const count = books.filter((b) => b.shelf === shelfName).length;
              return (
                <TouchableOpacity
                  key={shelfName}
                  style={[styles.filterChip, isSelected && styles.filterChipActive]}
                  onPress={() => setSelectedShelf(isSelected ? 'all' : shelfName)}
                >
                  <FolderIcon
                    size={13}
                    color={isSelected ? '#FFFFFF' : colors.textSecondary}
                  />
                  <Text style={[styles.filterText, isSelected && styles.filterTextActive]}>
                    {shelfName} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}

          {(['epub', 'pdf'] as FilterType[]).map((filter) => {
            const isActive = activeFilter === filter;
            const count = books.filter((b) => b.file_type === filter).length;
            return (
              <TouchableOpacity
                key={filter}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setActiveFilter(isActive ? 'all' : filter)}
              >
                <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                  {filter.toUpperCase()} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Bookshelf Grid or Empty Sanctuary */}
      {filteredBooks.length === 0 ? (
        <View style={styles.centerContainer}>
          <View style={styles.emptyIconCircle}>
            <FoliumLeafIcon size={48} color="rgba(99, 102, 241, 0.4)" />
          </View>
          <Text style={styles.emptyTitle}>
            {books.length === 0 ? 'Tủ sách của bạn còn trống' : 'Không tìm thấy sách phù hợp'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {books.length === 0
              ? 'Nhấn nút "+ Thêm sách" để nạp file EPUB hoặc PDF từ thiết bị vào phòng đọc riêng tư.'
              : 'Thử tìm kiếm với từ khoá khác hoặc xoá bộ lọc đang chọn.'}
          </Text>

          {books.length === 0 && (
            <TouchableOpacity
              style={styles.ctaButton}
              activeOpacity={0.85}
              onPress={handleImport}
              disabled={isImporting}
            >
              <PlusIcon size={16} color="#FFFFFF" />
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
              <Text style={styles.footerCopyright}>
                Folium 🍃 Local-First & Zero-Knowledge E-Reader
              </Text>
            </View>
          }
        />
      )}

      {/* Bottom Navigation Bar (Mobile / Tablet) */}
      {!isDesktop && (
        <View style={styles.bottomTabBar}>
          <TouchableOpacity style={styles.tabItem} activeOpacity={0.8}>
            <BookLibraryIcon size={20} color={colors.accentPrimary} />
            <Text style={[styles.tabLabel, styles.tabLabelActive]}>Tủ sách</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tabItem}
            activeOpacity={0.8}
            onPress={() => router.push('/community' as any)}
          >
            <CommunityGlobeIcon size={20} color={colors.textSecondary} />
            <Text style={styles.tabLabel}>Cộng đồng</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tabItem}
            activeOpacity={0.8}
            onPress={() => setIsDriveModalOpen(true)}
          >
            <SettingsIcon size={20} color={colors.textSecondary} />
            <Text style={styles.tabLabel}>Đồng bộ</Text>
          </TouchableOpacity>
        </View>
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
    paddingHorizontal: spacing.xxxl,
  },
  headerBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(39, 39, 42, 0.4)',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  mobileSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 38,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: 8,
    width: '100%',
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  searchBox: {
    flex: 1,
    minWidth: 180,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 40,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.fontSize.body,
    height: '100%',
    outlineStyle: 'none',
  } as any,
  actionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSurface,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: 6,
  },
  actionBtnText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.medium,
  },
  communityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(79, 70, 229, 0.12)',
    paddingHorizontal: 12,
    height: 38,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    gap: 6,
  },
  communityBtnText: {
    color: '#A5B4FC',
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.semibold,
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: radius.md,
    justifyContent: 'center',
    gap: 6,
  },
  importButtonText: {
    color: '#FFFFFF',
    fontWeight: typography.fontWeight.semibold,
    fontSize: typography.fontSize.body,
  },
  filterWrapper: {
    paddingVertical: spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: 6,
  },
  filterChipActive: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  filterText: {
    fontSize: typography.fontSize.caption,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium,
  },
  filterTextActive: {
    color: '#FFFFFF',
    fontWeight: typography.fontWeight.semibold,
  },
  gridContent: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: 72, // Space for bottom bar
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: radius.full,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: typography.fontSize.titleLg,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: typography.fontSize.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 420,
    marginBottom: spacing.xl,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius.md,
    gap: 8,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontWeight: typography.fontWeight.semibold,
    fontSize: typography.fontSize.body,
  },
  footerContainer: {
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl,
    alignItems: 'center',
    gap: 8,
  },
  footerLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  footerLinkText: {
    color: colors.textMuted,
    fontSize: typography.fontSize.caption,
    textDecorationLine: 'underline',
  },
  footerDivider: {
    color: colors.borderSubtle,
    fontSize: typography.fontSize.caption,
  },
  footerCopyright: {
    color: colors.textMuted,
    fontSize: typography.fontSize.micro,
    marginTop: 4,
  },
  bottomTabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
  },
  tabItem: {
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 16,
  },
  tabLabel: {
    fontSize: typography.fontSize.micro,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium,
  },
  tabLabelActive: {
    color: colors.accentPrimary,
    fontWeight: typography.fontWeight.bold,
  },
});
