import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { colors, typography, spacing, radius } from '../../theme/tokens';
import {
  FoliumLeafIcon,
  BookLibraryIcon,
  FolderIcon,
  InboxTrayIcon,
  CommunityGlobeIcon,
  CloudDriveIcon,
  SettingsIcon,
} from '../icons/Icons';
import { SyncStatusBadge } from '../SyncStatusBadge';
import { useI18n } from '../../i18n';

interface SidebarNavProps {
  selectedShelf: string;
  onSelectShelf: (shelf: string) => void;
  availableShelves: string[];
  totalBooksCount: number;
  inboxCount: number;
  shelfCounts: Record<string, number>;
  activeRoute?: 'bookshelf' | 'community';
  onOpenDriveModal: () => void;
  onOpenCommunity: () => void;
  onOpenBookshelf: () => void;
  onOpenTerms: () => void;
  onOpenSecurity: () => void;
  onOpenPrivacy: () => void;
  onOpenSettings: () => void;
}

export function SidebarNav({
  selectedShelf,
  onSelectShelf,
  availableShelves,
  totalBooksCount,
  inboxCount,
  shelfCounts,
  activeRoute = 'bookshelf',
  onOpenDriveModal,
  onOpenCommunity,
  onOpenBookshelf,
  onOpenTerms,
  onOpenSecurity,
  onOpenPrivacy,
  onOpenSettings,
}: SidebarNavProps) {
  const { t } = useI18n();
  return (
    <View style={styles.sidebar}>
      {/* Brand Header */}
      <View style={styles.brandContainer}>
        <FoliumLeafIcon size={24} color={colors.accentPrimary} />
        <View>
          <Text style={styles.brandTitle}>Folium</Text>
          <Text style={styles.brandSubtitle}>{t('branding.readerVault')}</Text>
        </View>
      </View>

      <ScrollView style={styles.navScroll} showsVerticalScrollIndicator={false}>
        {/* Main Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>{t('nav.library')}</Text>

          <TouchableOpacity
            style={[
              styles.navItem,
              activeRoute === 'bookshelf' && selectedShelf === 'all' && styles.navItemActive,
            ]}
            onPress={() => {
              onOpenBookshelf();
              onSelectShelf('all');
            }}
            activeOpacity={0.75}
          >
            <BookLibraryIcon
              size={18}
              color={
                activeRoute === 'bookshelf' && selectedShelf === 'all'
                  ? colors.accentPrimary
                  : colors.textSecondary
              }
            />
            <Text
              style={[
                styles.navLabel,
                activeRoute === 'bookshelf' && selectedShelf === 'all' && styles.navLabelActive,
              ]}
            >
              {t('nav.allBooks')}
            </Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{totalBooksCount}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.navItem,
              activeRoute === 'community' && styles.navItemActive,
            ]}
            onPress={onOpenCommunity}
            activeOpacity={0.75}
          >
            <CommunityGlobeIcon
              size={18}
              color={activeRoute === 'community' ? colors.accentPrimary : colors.textSecondary}
            />
            <Text
              style={[
                styles.navLabel,
                activeRoute === 'community' && styles.navLabelActive,
              ]}
            >
              {t('nav.community')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Shelves Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>{t('nav.shelves')}</Text>

          <TouchableOpacity
            style={[
              styles.navItem,
              activeRoute === 'bookshelf' && selectedShelf === 'Inbox' && styles.navItemActive,
            ]}
            onPress={() => {
              onOpenBookshelf();
              onSelectShelf('Inbox');
            }}
            activeOpacity={0.75}
          >
            <InboxTrayIcon
              size={17}
              color={
                activeRoute === 'bookshelf' && selectedShelf === 'Inbox'
                  ? colors.accentPrimary
                  : colors.textSecondary
              }
            />
            <Text
              style={[
                styles.navLabel,
                activeRoute === 'bookshelf' && selectedShelf === 'Inbox' && styles.navLabelActive,
              ]}
            >
              {t('nav.inbox')}
            </Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{inboxCount}</Text>
            </View>
          </TouchableOpacity>

          {availableShelves
            .filter((s) => s !== 'Inbox')
            .map((shelf) => {
              const isSelected = activeRoute === 'bookshelf' && selectedShelf === shelf;
              const count = shelfCounts[shelf] || 0;
              return (
                <TouchableOpacity
                  key={shelf}
                  style={[styles.navItem, isSelected && styles.navItemActive]}
                  onPress={() => {
                    onOpenBookshelf();
                    onSelectShelf(shelf);
                  }}
                  activeOpacity={0.75}
                >
                  <FolderIcon
                    size={16}
                    color={isSelected ? colors.accentPrimary : colors.textSecondary}
                  />
                  <Text
                    style={[styles.navLabel, isSelected && styles.navLabelActive]}
                    numberOfLines={1}
                  >
                    {shelf}
                  </Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{count}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
        </View>

        {/* Sync & Cloud Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>{t('nav.syncCloud')}</Text>

          <TouchableOpacity
            style={styles.navItem}
            onPress={onOpenDriveModal}
            activeOpacity={0.75}
          >
            <CloudDriveIcon size={18} color={colors.textSecondary} />
            <Text style={styles.navLabel}>{t('nav.googleDrive')}</Text>
          </TouchableOpacity>

          <View style={styles.syncStatusWrapper}>
            <SyncStatusBadge theme="dark" compact={false} />
          </View>

          <TouchableOpacity style={styles.navItem} onPress={onOpenSettings} activeOpacity={0.75}>
            <SettingsIcon size={18} color={colors.textSecondary} />
            <Text style={styles.navLabel}>{t('nav.settings')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Footer Legal & Info */}
      <View style={styles.sidebarFooter}>
        <View style={styles.legalLinksRow}>
          <TouchableOpacity onPress={onOpenPrivacy}>
            <Text style={styles.footerLink}>{t('settings.privacy')}</Text>
          </TouchableOpacity>
          <Text style={styles.footerDivider}>•</Text>
          <TouchableOpacity onPress={onOpenTerms}>
            <Text style={styles.footerLink}>{t('settings.terms')}</Text>
          </TouchableOpacity>
          <Text style={styles.footerDivider}>•</Text>
          <TouchableOpacity onPress={onOpenSecurity}>
            <Text style={styles.footerLink}>{t('settings.security')}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.copyrightText}>{t('branding.footer')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 240,
    backgroundColor: colors.bgSurface,
    borderRightWidth: 1,
    borderRightColor: colors.borderSubtle,
    flexDirection: 'column',
    justifyContent: 'space-between',
    height: '100%',
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(39, 39, 42, 0.4)',
  },
  brandTitle: {
    fontSize: 17,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: typography.fontWeight.medium,
  },
  navScroll: {
    flex: 1,
    paddingVertical: spacing.md,
  },
  section: {
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  sectionHeading: {
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.sm,
    marginBottom: 6,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    marginBottom: 2,
  },
  navItemActive: {
    backgroundColor: 'rgba(196, 155, 102, 0.12)',
    borderLeftWidth: 2,
    borderLeftColor: colors.accentBookmark,
  },
  navLabel: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium,
  },
  navLabelActive: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
  },
  countBadge: {
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  countText: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: typography.fontWeight.semibold,
  },
  syncStatusWrapper: {
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  sidebarFooter: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    gap: 6,
  },
  legalLinksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    maxWidth: '100%',
  },
  footerLink: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
  },
  footerDivider: {
    fontSize: 10,
    color: colors.borderSubtle,
  },
  copyrightText: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
