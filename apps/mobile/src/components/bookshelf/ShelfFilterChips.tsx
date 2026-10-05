import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import type { BookWithProgress } from '../../services/bookService';
import { colors, typography, spacing, radius } from '../../theme/tokens';
import { FolderIcon, InboxTrayIcon } from '../icons/Icons';
import { useI18n } from '../../i18n';

export type FilterType = 'all' | 'epub' | 'pdf';

interface ShelfFilterChipsProps {
  books: BookWithProgress[];
  availableShelves: string[];
  selectedShelf: string;
  activeFilter: FilterType;
  onSelectShelf: (shelf: string) => void;
  onSelectFilter: (filter: FilterType) => void;
  isDesktop?: boolean;
}

export function ShelfFilterChips({
  books,
  availableShelves,
  selectedShelf,
  activeFilter,
  onSelectShelf,
  onSelectFilter,
  isDesktop,
}: ShelfFilterChipsProps) {
  const { t } = useI18n();

  if (isDesktop) {
    const shelfTitle =
      selectedShelf === 'all'
        ? t('nav.allBooks')
        : selectedShelf === 'Inbox'
        ? t('bookshelf.inbox')
        : selectedShelf;

    return (
      <View style={styles.desktopFilterBar}>
        <View style={styles.desktopHeadingRow}>
          <Text style={styles.desktopShelfTitle}>{shelfTitle}</Text>
          <Text style={styles.desktopShelfCount}>
            ({books.length})
          </Text>
        </View>

        <View style={styles.desktopSegmentedControl}>
          <TouchableOpacity
            style={[styles.segBtn, activeFilter === 'all' && styles.segBtnActive]}
            onPress={() => onSelectFilter('all')}
          >
            <Text style={[styles.segBtnText, activeFilter === 'all' && styles.segBtnTextActive]}>
              {t('bookshelf.all')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segBtn, activeFilter === 'epub' && styles.segBtnActive]}
            onPress={() => onSelectFilter(activeFilter === 'epub' ? 'all' : 'epub')}
          >
            <Text style={[styles.segBtnText, activeFilter === 'epub' && styles.segBtnTextActive]}>
              EPUB
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segBtn, activeFilter === 'pdf' && styles.segBtnActive]}
            onPress={() => onSelectFilter(activeFilter === 'pdf' ? 'all' : 'pdf')}
          >
            <Text style={[styles.segBtnText, activeFilter === 'pdf' && styles.segBtnTextActive]}>
              PDF
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.filterWrapper}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        <TouchableOpacity
          style={[
            styles.filterChip,
            selectedShelf === 'all' && activeFilter === 'all' && styles.filterChipActive,
          ]}
          onPress={() => {
            onSelectShelf('all');
            onSelectFilter('all');
          }}
        >
          <Text
            style={[
              styles.filterText,
              selectedShelf === 'all' && activeFilter === 'all' && styles.filterTextActive,
            ]}
          >
            {t('bookshelf.all')} ({books.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, selectedShelf === 'Inbox' && styles.filterChipActive]}
          onPress={() => onSelectShelf(selectedShelf === 'Inbox' ? 'all' : 'Inbox')}
        >
          <InboxTrayIcon
            size={13}
            color={selectedShelf === 'Inbox' ? '#FFFFFF' : colors.textSecondary}
          />
          <Text style={[styles.filterText, selectedShelf === 'Inbox' && styles.filterTextActive]}>
            {t('bookshelf.inbox')} ({books.filter((b) => !b.shelf || b.shelf === 'Inbox').length})
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
                onPress={() => onSelectShelf(isSelected ? 'all' : shelfName)}
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
              onPress={() => onSelectFilter(isActive ? 'all' : filter)}
            >
              <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                {filter.toUpperCase()} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: colors.bgElevated,
    borderColor: colors.accentBookmark,
  },
  filterText: {
    fontSize: typography.fontSize.caption,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium,
  },
  filterTextActive: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
  },
  desktopFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderHairline,
  },
  desktopHeadingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  desktopShelfTitle: {
    fontFamily: Platform.select({ web: typography.fontFamily.serif, default: 'serif' }),
    fontSize: 20,
    fontWeight: '400',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  desktopShelfCount: {
    fontSize: 12.5,
    color: colors.textMuted,
  },
  desktopSegmentedControl: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.borderMedium,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.bgSurface,
  },
  segBtn: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
  },
  segBtnActive: {
    backgroundColor: colors.bgElevated,
    borderBottomWidth: 2,
    borderBottomColor: colors.accentBookmark,
  },
  segBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  segBtnTextActive: {
    color: colors.textPrimary,
  },
});
