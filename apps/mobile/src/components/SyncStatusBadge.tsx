import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import {
  subscribeSyncState,
  performFullSync,
  getSyncServerUrl,
  type SyncState,
} from '../services/syncService';

interface Props {
  compact?: boolean;
  theme?: 'dark' | 'light' | 'sepia';
}

export function SyncStatusBadge({ compact = false, theme = 'dark' }: Props) {
  const [syncState, setSyncState] = useState<SyncState>({
    status: 'idle',
    lastSyncedAt: null,
    pendingCount: 0,
    errorMessage: null,
  });

  useEffect(() => {
    const unsubscribe = subscribeSyncState(setSyncState);
    return unsubscribe;
  }, []);

  const handlePress = async () => {
    if (syncState.status === 'syncing') return;

    try {
      const serverUrl = await getSyncServerUrl();
      const lastSyncStr = syncState.lastSyncedAt
        ? new Date(syncState.lastSyncedAt).toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'Chưa từng';

      if (compact) {
        // In compact mode, immediately trigger sync
        performFullSync();
        return;
      }

      const statusLabel =
        syncState.status === 'offline'
          ? 'Ngoại tuyến'
          : syncState.status === 'error'
          ? syncState.errorMessage || 'Lỗi kết nối'
          : 'Đã sẵn sàng';

      const infoMsg = `Trạng thái: ${statusLabel}\nLần cuối: ${lastSyncStr}\nThay đổi chờ: ${syncState.pendingCount}\nMáy chủ: ${serverUrl}`;

      if (Platform.OS === 'web') {
        const confirmSync = window.confirm(`${infoMsg}\n\nNhấn OK để đồng bộ ngay.`);
        if (confirmSync) {
          performFullSync();
        }
      } else {
        Alert.alert('Đồng bộ Cloudflare D1', infoMsg, [
          { text: 'Đóng', style: 'cancel' },
          { text: 'Đồng bộ ngay', onPress: () => performFullSync() },
        ]);
      }
    } catch {
      performFullSync();
    }
  };

  const isDark = theme === 'dark';
  const isSepia = theme === 'sepia';
  const textColor = isDark ? '#A1A1AA' : isSepia ? '#6D5B46' : '#71717A';
  const activeColor = '#10B981'; // Emerald
  const syncingColor = '#6366F1'; // Indigo
  const errorColor = '#EF4444'; // Red
  const offlineColor = '#9CA3AF'; // Gray

  let icon = '☁️';
  let label = 'Đã đồng bộ';
  let badgeColor = activeColor;

  if (syncState.status === 'syncing') {
    label = 'Đang đồng bộ...';
    badgeColor = syncingColor;
  } else if (syncState.status === 'offline') {
    icon = '⚡';
    label = 'Ngoại tuyến';
    badgeColor = offlineColor;
  } else if (syncState.status === 'error') {
    icon = '⚠️';
    label = 'Lỗi đồng bộ';
    badgeColor = errorColor;
  } else if (syncState.pendingCount > 0) {
    icon = '⏳';
    label = `${syncState.pendingCount} chờ`;
    badgeColor = '#F59E0B';
  }

  return (
    <TouchableOpacity
      style={[
        styles.container,
        compact ? styles.containerCompact : styles.containerFull,
        {
          borderColor: isDark ? '#27272A' : isSepia ? '#D7C295' : '#E4E4E7',
          backgroundColor: isDark
            ? 'rgba(39, 39, 42, 0.6)'
            : isSepia
            ? 'rgba(234, 219, 182, 0.7)'
            : 'rgba(244, 244, 245, 0.8)',
        },
      ]}
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityLabel={`Trạng thái đồng bộ: ${label}`}
    >
      {syncState.status === 'syncing' ? (
        <ActivityIndicator size="small" color={syncingColor} style={styles.spinner} />
      ) : (
        <Text style={[styles.icon, { color: badgeColor }]}>{icon}</Text>
      )}

      {!compact && (
        <Text style={[styles.label, { color: textColor }]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  containerCompact: {
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  containerFull: {
    gap: 5,
  },
  spinner: {
    transform: [{ scale: 0.75 }],
    marginRight: 2,
  },
  icon: {
    fontSize: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
  },
});
