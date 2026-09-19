import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { colors, typography } from '../../theme/tokens';
import { BookLibraryIcon, CommunityGlobeIcon, SettingsIcon } from '../icons/Icons';

interface BottomTabBarProps {
  activeTab?: 'shelf' | 'community' | 'sync';
  onOpenShelf?: () => void;
  onOpenCommunity: () => void;
  onOpenSync: () => void;
}

export function BottomTabBar({
  activeTab = 'shelf',
  onOpenShelf,
  onOpenCommunity,
  onOpenSync,
}: BottomTabBarProps) {
  return (
    <View style={styles.bottomTabBar}>
      <TouchableOpacity
        style={styles.tabItem}
        activeOpacity={0.8}
        onPress={onOpenShelf}
      >
        <BookLibraryIcon
          size={20}
          color={activeTab === 'shelf' ? colors.accentPrimary : colors.textSecondary}
        />
        <Text
          style={[
            styles.tabLabel,
            activeTab === 'shelf' && styles.tabLabelActive,
          ]}
        >
          Tủ sách
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.tabItem}
        activeOpacity={0.8}
        onPress={onOpenCommunity}
      >
        <CommunityGlobeIcon
          size={20}
          color={activeTab === 'community' ? colors.accentPrimary : colors.textSecondary}
        />
        <Text
          style={[
            styles.tabLabel,
            activeTab === 'community' && styles.tabLabelActive,
          ]}
        >
          Cộng đồng
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.tabItem}
        activeOpacity={0.8}
        onPress={onOpenSync}
      >
        <SettingsIcon
          size={20}
          color={activeTab === 'sync' ? colors.accentPrimary : colors.textSecondary}
        />
        <Text
          style={[
            styles.tabLabel,
            activeTab === 'sync' && styles.tabLabelActive,
          ]}
        >
          Đồng bộ
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
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
