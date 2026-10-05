import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, typography, spacing, radius } from '../../theme/tokens';
import { FoliumLeafIcon, PlusIcon } from '../icons/Icons';
import { useI18n } from '../../i18n';

interface EmptyBookshelfProps {
  isLibraryEmpty: boolean;
  isImporting: boolean;
  onImport: () => void;
}

export function EmptyBookshelf({
  isLibraryEmpty,
  isImporting,
  onImport,
}: EmptyBookshelfProps) {
  const { t } = useI18n();

  return (
    <View style={styles.centerContainer}>
      <View style={styles.emptyIconCircle}>
        <FoliumLeafIcon size={48} color="rgba(99, 102, 241, 0.4)" />
      </View>
      <Text style={styles.emptyTitle}>
        {isLibraryEmpty ? t('bookshelf.emptyTitle') : t('bookshelf.emptySearchTitle')}
      </Text>
      <Text style={styles.emptySubtitle}>
        {isLibraryEmpty
          ? t('bookshelf.emptySubtitle')
          : t('bookshelf.emptySearchSubtitle')}
      </Text>

      {isLibraryEmpty && (
        <TouchableOpacity
          style={styles.ctaButton}
          activeOpacity={0.85}
          onPress={onImport}
          disabled={isImporting}
        >
          <PlusIcon size={16} color="#FFFFFF" />
          <Text style={styles.ctaButtonText}>{t('bookshelf.chooseFile')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxxl,
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
});
