import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
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
}

export function ShelfFilterChips({
  books,
  availableShelves,
  selectedShelf,
  activeFilter,
  onSelectShelf,
  onSelectFilter,
}: ShelfFilterChipsProps) {
  const { t } = useI18n();

  return (
    <View style={styles.filterWrapper}>
      <View style={styles.filterHeader}>
        <Text style={styles.filterEyebrow}>{t('nav.shelves')}</Text>
        <Text style={styles.filterHint}>{books.length} {t('nav.allBooks').toLowerCase()}</Text>
      </View>
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
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  filterEyebrow: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.semibold,
  },
  filterHint: {
    color: colors.textMuted,
    fontSize: typography.fontSize.micro,
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
    paddingVertical: 8,
    borderRadius: radius.sm,
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
});
