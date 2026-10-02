import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, typography, spacing, radius } from '../../theme/tokens';
import { FoliumLeafIcon, PlusIcon, CloudDriveIcon, BookLibraryIcon } from '../icons/Icons';
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
      <View style={styles.emptyPanel}>
        <View style={styles.emptyLead}>
          <View style={styles.emptyIconCircle}>
            <FoliumLeafIcon size={42} color={colors.accentPrimary} />
          </View>
          <View style={styles.emptyCopy}>
            <Text style={styles.emptyKicker}>{t('settings.localFirst')}</Text>
            <Text style={styles.emptyTitle}>
              {isLibraryEmpty ? t('bookshelf.emptyTitle') : t('bookshelf.emptySearchTitle')}
            </Text>
            <Text style={styles.emptySubtitle}>
              {isLibraryEmpty ? t('bookshelf.emptySubtitle') : t('bookshelf.emptySearchSubtitle')}
            </Text>
          </View>
        </View>

        {isLibraryEmpty && (
          <View style={styles.emptyActions}>
            <TouchableOpacity
              style={styles.ctaButton}
              activeOpacity={0.85}
              onPress={onImport}
              disabled={isImporting}
            >
              <PlusIcon size={16} color={colors.accentText} />
              <Text style={styles.ctaButtonText}>{t('bookshelf.chooseFile')}</Text>
            </TouchableOpacity>
            <View style={styles.emptyMetaRow}>
              <BookLibraryIcon size={14} color={colors.textMuted} />
              <Text style={styles.emptyMetaText}>EPUB / PDF</Text>
              <CloudDriveIcon size={14} color={colors.textMuted} />
              <Text style={styles.emptyMetaText}>{t('settings.drive')}</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxxl,
  },
  emptyPanel: {
    width: '100%',
    maxWidth: 760,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  emptyLead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  emptyCopy: {
    flex: 1,
  },
  emptyKicker: {
    color: colors.accentPrimary,
    fontSize: typography.fontSize.micro,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: 'rgba(184, 227, 107, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
    transform: [{ rotate: '-4deg' }],
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
    textAlign: 'left',
    lineHeight: 22,
    maxWidth: 520,
    marginBottom: 0,
  },
  emptyActions: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  emptyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  emptyMetaText: {
    color: colors.textMuted,
    fontSize: typography.fontSize.micro,
    marginRight: spacing.sm,
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
    color: colors.accentText,
    fontWeight: typography.fontWeight.semibold,
    fontSize: typography.fontSize.body,
  },
});
