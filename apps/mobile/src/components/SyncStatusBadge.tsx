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
import { colors, typography, radius } from '../theme/tokens';
import { SyncIcon } from './icons/Icons';
import { useI18n } from '../i18n';

interface Props {
  compact?: boolean;
  theme?: 'dark' | 'light' | 'sepia';
}

export function SyncStatusBadge({ compact = false, theme = 'dark' }: Props) {
  const { t, locale } = useI18n();
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
        ? new Date(syncState.lastSyncedAt).toLocaleTimeString(locale, {
            hour: '2-digit',
            minute: '2-digit',
          })
        : t('sync.dialogNever');

      if (compact) {
        performFullSync();
        return;
      }

      const statusLabel =
        syncState.status === 'offline'
          ? t('sync.statusOffline')
          : syncState.status === 'error'
          ? syncState.errorMessage || t('sync.statusError')
          : t('sync.statusReady');

      const infoMsg = `${t('sync.dialogStatus', { status: statusLabel })}\n${t('sync.dialogLastSync', { time: lastSyncStr })}\n${t('sync.pendingChanges', { count: syncState.pendingCount })}\n${t('sync.dialogServer', { server: serverUrl })}`;

      if (Platform.OS === 'web') {
        const confirmSync = window.confirm(`${infoMsg}\n\n${t('sync.dialogPrompt')}`);
        if (confirmSync) {
          performFullSync();
        }
      } else {
        Alert.alert(t('sync.dialogTitle'), infoMsg, [
          { text: t('sync.close'), style: 'cancel' },
          { text: t('sync.dialogSyncNow'), onPress: () => performFullSync() },
        ]);
      }
    } catch {
      performFullSync();
    }
  };

  const isDark = theme === 'dark';
  const isSepia = theme === 'sepia';
  const textColor = isDark ? colors.textSecondary : isSepia ? '#6D5B46' : colors.textMuted;

  let dotColor: string = colors.statusSuccess;
  let label = t('sync.statusSynced');

  if (syncState.status === 'syncing') {
    label = t('sync.statusSyncing');
    dotColor = colors.statusSyncing;
  } else if (syncState.status === 'offline') {
    label = t('sync.statusOffline');
    dotColor = colors.statusOffline;
  } else if (syncState.status === 'error') {
    label = t('sync.statusError');
    dotColor = colors.statusError;
  } else if (syncState.pendingCount > 0) {
    label = t('sync.pendingChanges', { count: syncState.pendingCount });
    dotColor = colors.statusSyncing;
  }

  return (
    <TouchableOpacity
      style={[
        styles.container,
        compact ? styles.containerCompact : styles.containerFull,
        {
          borderColor: isDark ? colors.borderSubtle : isSepia ? '#D7C295' : '#E4E4E7',
          backgroundColor: isDark
            ? 'rgba(20, 20, 23, 0.8)'
            : isSepia
            ? 'rgba(234, 219, 182, 0.7)'
            : 'rgba(244, 244, 245, 0.8)',
        },
      ]}
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityLabel={`${t('sync.accessibilityLabel')}: ${label}`}
    >
      {syncState.status === 'syncing' ? (
        <ActivityIndicator size="small" color={colors.accentPrimary} style={styles.spinner} />
      ) : (
        <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
      )}

      {!compact && (
        <Text style={[styles.label, { color: textColor }]} numberOfLines={1}>
          {label}
        </Text>
      )}

      <SyncIcon size={12} color={textColor} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
  },
  containerCompact: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    gap: 4,
  },
  containerFull: {
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
  },
  spinner: {
    transform: [{ scale: 0.65 }],
  },
  label: {
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.medium,
  },
});
