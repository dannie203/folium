import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { colors, typography, spacing, radius } from '../../theme/tokens';
import {
  FoliumLeafIcon,
  SearchIcon,
  PlusIcon,
} from '../icons/Icons';
import { SyncStatusBadge } from '../SyncStatusBadge';
import { useI18n } from '../../i18n';

interface BookshelfHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isDesktop: boolean;
  isImporting: boolean;
  onImport: () => void;
  totalBooks: number;
  visibleBooks: number;
}

export function BookshelfHeader({
  searchQuery,
  onSearchChange,
  isDesktop,
  isImporting,
  onImport,
  totalBooks,
  visibleBooks,
}: BookshelfHeaderProps) {
  const { t } = useI18n();
  return (
    <View style={styles.headerBar}>
      <View style={styles.headerTopRow}>
        {!isDesktop && (
          <View style={styles.brandContainer}>
            <FoliumLeafIcon size={24} color={colors.accentPrimary} />
            <View>
              <Text style={styles.brandKicker}>FOLIUM</Text>
              <Text style={styles.brandTitle}>{t('nav.library')}</Text>
            </View>
          </View>
        )}

        {isDesktop && (
          <View style={styles.searchBox}>
            <SearchIcon size={16} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('header.search')}
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={onSearchChange}
              clearButtonMode="while-editing"
            />
          </View>
        )}

        {/* Action Controls */}
        <View style={styles.actionsGroup}>
          <SyncStatusBadge theme="dark" compact />

          <TouchableOpacity
            style={styles.importButton}
            activeOpacity={0.85}
            onPress={onImport}
            disabled={isImporting}
            accessibilityLabel="Thêm sách mới"
          >
            {isImporting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <PlusIcon size={14} color={colors.accentText} />
                {isDesktop && <Text style={styles.importButtonText}>{t('header.addBook')}</Text>}
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
            placeholder={t('header.search')}
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={onSearchChange}
            clearButtonMode="while-editing"
          />
        </View>
      )}

      {isDesktop && (
        <View style={styles.desktopContextRow}>
          <View style={styles.contextCopy}>
            <Text style={styles.contextTitle}>{t('nav.allBooks')}</Text>
            <Text style={styles.contextSubtitle}>{t('settings.localFirstDesc')}</Text>
          </View>
          <View style={styles.contextStats}>
            <View style={styles.statBlock}>
              <Text style={styles.statValue}>{visibleBooks}</Text>
              <Text style={styles.statLabel}>{t('nav.allBooks')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBlock}>
              <Text style={styles.statValue}>{totalBooks}</Text>
              <Text style={styles.statLabel}>{t('nav.library')}</Text>
            </View>
          </View>
        </View>
      )}

      {!isDesktop && (
        <View style={styles.mobileContextRow}>
          <View>
            <Text style={styles.contextTitle}>{t('nav.allBooks')}</Text>
            <Text style={styles.contextSubtitle}>{visibleBooks} / {totalBooks}</Text>
          </View>
          <Text style={styles.mobileContextAccent}>LOCAL-FIRST</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandKicker: {
    color: colors.accentPrimary,
    fontSize: typography.fontSize.micro,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 1.3,
  },
  brandTitle: {
    fontSize: typography.fontSize.titleLg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    marginTop: 1,
  },
  searchBox: {
    flex: 1,
    minWidth: 180,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: 8,
  },
  mobileSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 42,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: 8,
    width: '100%',
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
    height: 40,
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
  desktopContextRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
  },
  contextCopy: {
    flex: 1,
    paddingRight: spacing.lg,
  },
  contextTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.display,
    lineHeight: typography.lineHeight.display,
    fontWeight: typography.fontWeight.bold,
  },
  contextSubtitle: {
    color: colors.textMuted,
    fontSize: typography.fontSize.caption,
    lineHeight: typography.lineHeight.caption,
    marginTop: 2,
    maxWidth: 620,
  },
  contextStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  statBlock: {
    alignItems: 'flex-end',
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.titleLg,
    fontWeight: typography.fontWeight.bold,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSize.micro,
    marginTop: 1,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.borderSubtle,
  },
  mobileContextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    padding: spacing.md,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
  },
  mobileContextAccent: {
    color: colors.accentPrimary,
    fontSize: typography.fontSize.micro,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0.8,
  },
});
