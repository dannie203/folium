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
  CloudDriveIcon,
  CommunityGlobeIcon,
} from '../icons/Icons';
import { SyncStatusBadge } from '../SyncStatusBadge';

interface BookshelfHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isDesktop: boolean;
  isImporting: boolean;
  onImport: () => void;
  onOpenDriveModal: () => void;
  onOpenCommunity: () => void;
}

export function BookshelfHeader({
  searchQuery,
  onSearchChange,
  isDesktop,
  isImporting,
  onImport,
  onOpenDriveModal,
  onOpenCommunity,
}: BookshelfHeaderProps) {
  return (
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
              onChangeText={onSearchChange}
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
                onPress={onOpenDriveModal}
                accessibilityLabel="Đồng bộ Google Drive"
              >
                <CloudDriveIcon size={16} color={colors.textSecondary} />
                <Text style={styles.actionBtnText}>Drive</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.communityBtn}
                activeOpacity={0.8}
                onPress={onOpenCommunity}
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
            onPress={onImport}
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
            onChangeText={onSearchChange}
            clearButtonMode="while-editing"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
});
