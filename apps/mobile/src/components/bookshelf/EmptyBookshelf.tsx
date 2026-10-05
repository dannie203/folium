import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { colors, typography, spacing, radius } from '../../theme/tokens';
import { BookLibraryIcon, CloudDriveIcon, FoliumLeafIcon } from '../icons/Icons';
import { useI18n } from '../../i18n';

interface EmptyBookshelfProps {
  isLibraryEmpty: boolean;
  isImporting: boolean;
  onImport: () => void;
  onOpenCommunity?: () => void;
  onOpenDriveModal?: () => void;
}

export function EmptyBookshelf({
  isLibraryEmpty,
  isImporting,
  onImport,
  onOpenCommunity,
  onOpenDriveModal,
}: EmptyBookshelfProps) {
  const { t } = useI18n();

  if (!isLibraryEmpty) {
    // Search empty state (understated, no results)
    return (
      <View style={styles.centerContainer}>
        <View style={styles.emptyIconWrap}>
          <FoliumLeafIcon size={32} color={colors.textMuted} />
        </View>
        <Text style={styles.searchEmptyTitle}>{t('bookshelf.emptySearchTitle')}</Text>
        <Text style={styles.searchEmptySubtitle}>{t('bookshelf.emptySearchSubtitle')}</Text>
      </View>
    );
  }

  // The Literary Frontispiece & Colophon (From foundation.html)
  return (
    <View style={styles.frontispieceContainer}>
      <View style={styles.leafMotifWrap}>
        <FoliumLeafIcon size={36} color={colors.accentPrimary} strokeWidth={1.5} />
      </View>

      <Text style={styles.frontispieceTitle}>
        {t('bookshelf.emptyTitle')}
      </Text>

      <Text style={styles.frontispieceSubtitle}>
        {t('bookshelf.emptySubtitle')}
      </Text>

      <View style={styles.actionsWrap}>
        <TouchableOpacity
          style={[styles.primaryButton, isImporting && styles.buttonDisabled]}
          activeOpacity={0.88}
          onPress={onImport}
          disabled={isImporting}
        >
          <Text style={styles.primaryButtonText}>
            {isImporting ? '…' : t('bookshelf.chooseFile')}
          </Text>
        </TouchableOpacity>

        {(onOpenCommunity || onOpenDriveModal) && (
          <View style={styles.subActionsRow}>
            {onOpenCommunity && (
              <TouchableOpacity style={styles.secondaryAction} activeOpacity={0.7} onPress={onOpenCommunity}>
                <BookLibraryIcon size={15} color={colors.textSecondary} />
                <Text style={styles.subActionLink}>{t('bookshelf.browseCommunity')}</Text>
              </TouchableOpacity>
            )}
            {onOpenCommunity && onOpenDriveModal && (
              <Text style={styles.subActionDot}>•</Text>
            )}
            {onOpenDriveModal && (
              <TouchableOpacity style={styles.secondaryAction} activeOpacity={0.7} onPress={onOpenDriveModal}>
                <CloudDriveIcon size={15} color={colors.textSecondary} />
                <Text style={styles.subActionLink}>{t('bookshelf.syncDrive')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      <View style={styles.colophonBox}>
        <View style={styles.colophonDivider} />
        <Text style={styles.colophonMotto}>{t('bookshelf.colophonMotto')}</Text>
        <Text style={styles.colophonAssurances}>
          {t('bookshelf.colophonAssurance')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxxl,
    paddingVertical: spacing.huge,
  },
  frontispieceContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.colossal,
    maxWidth: 620,
    alignSelf: 'center',
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  searchEmptyTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  searchEmptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 360,
  },
  leafMotifWrap: {
    marginBottom: spacing.lg,
    opacity: 0.85,
  },
  frontispieceTitle: {
    fontFamily: Platform.select({ web: typography.fontFamily.serif, default: 'serif' }),
    fontSize: 28,
    lineHeight: 36,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
    letterSpacing: -0.3,
  },
  frontispieceSubtitle: {
    fontSize: 13.5,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xxl,
    maxWidth: 520,
  },
  actionsWrap: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.md,
  },
  primaryButton: {
    backgroundColor: '#F7F7F8',
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: radius.sm,
    minWidth: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#0A0A0C',
    fontWeight: '500',
    fontSize: 13,
  },
  subActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  secondaryAction: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  subActionLink: {
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  subActionDot: {
    fontSize: 11,
    color: colors.borderMedium,
  },
  colophonBox: {
    marginTop: spacing.huge,
    alignItems: 'center',
    width: '100%',
  },
  colophonDivider: {
    width: 48,
    height: 1,
    backgroundColor: colors.borderMedium,
    marginBottom: spacing.md,
  },
  colophonMotto: {
    fontFamily: Platform.select({ web: typography.fontFamily.serif, default: 'serif' }),
    fontStyle: 'italic',
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  colophonAssurances: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
});
