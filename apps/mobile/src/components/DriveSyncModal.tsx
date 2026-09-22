import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useDriveSync } from '../hooks/useDriveSync';
import { colors, typography, spacing, radius } from '../theme/tokens';
import { useI18n } from '../i18n';

interface DriveSyncModalProps {
  visible: boolean;
  onClose: () => void;
  onSyncComplete?: () => void;
}

export function DriveSyncModal({ visible, onClose, onSyncComplete }: DriveSyncModalProps) {
  const router = useRouter();
  const { t } = useI18n();
  const {
    user,
    isAuthenticating,
    isSyncing,
    syncResult,
    errorMessage,
    handleSignIn,
    handleSignOut,
    handleSyncNow,
  } = useDriveSync({ onSyncComplete });

  const navigateTo = (path: string) => {
    onClose();
    router.push(path as any);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>☁️ {t('drive.title')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel={t('drive.close')}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {/* User Profile Card */}
            {user ? (
              <View style={styles.userCard}>
                <View style={styles.userInfoRow}>
                  {user.picture ? (
                    <Image source={{ uri: user.picture }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarText}>
                        {(user.name || user.email || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.userMeta}>
                    <Text style={styles.userName}>{user.name}</Text>
                    <Text style={styles.userEmail}>{user.email}</Text>
                    <Text style={styles.badgeDrive}>{t('drive.activeFolder')}</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
                  <Text style={styles.signOutBtnText}>{t('drive.signOut')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.signInCard}>
                <Text style={styles.signInDesc}>
                  {t('drive.signInDesc')}
                </Text>

                <TouchableOpacity
                  style={[styles.primaryBtn, isAuthenticating && styles.btnDisabled]}
                  onPress={() => handleSignIn(false)}
                  disabled={isAuthenticating}
                >
                  {isAuthenticating ? (
                    <ActivityIndicator size="small" color={colors.textPrimary} />
                  ) : (
                    <Text style={styles.primaryBtnText}>{t('drive.signInWithGoogle')}</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sandboxBtn}
                  onPress={() => handleSignIn(true)}
                >
                  <Text style={styles.sandboxBtnText}>{t('drive.sandboxBtn')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Sync Action Area */}
            {user && (
              <View style={styles.actionSection}>
                <TouchableOpacity
                  style={[styles.syncBtn, isSyncing && styles.btnDisabled]}
                  onPress={handleSyncNow}
                  disabled={isSyncing}
                >
                  {isSyncing ? (
                    <View style={styles.syncingRow}>
                      <ActivityIndicator size="small" color={colors.textPrimary} />
                      <Text style={styles.syncBtnText}>{t('drive.syncing')}</Text>
                    </View>
                  ) : (
                    <Text style={styles.syncBtnText}>{t('drive.syncNow')}</Text>
                  )}
                </TouchableOpacity>

                {syncResult && (
                  <View style={styles.resultBox}>
                    <Text style={styles.resultTitle}>{t('drive.results')}</Text>
                    <Text style={styles.resultItem}>{t('drive.uploaded', { count: syncResult.uploadedCount })}</Text>
                    <Text style={styles.resultItem}>{t('drive.downloaded', { count: syncResult.downloadedCount })}</Text>
                    <Text style={styles.resultItem}>{t('drive.matched', { count: syncResult.syncedCount })}</Text>
                    {syncResult.errors.length > 0 && (
                      <View style={styles.errorBox}>
                        {syncResult.errors.map((err, i) => (
                          <Text key={i} style={styles.errorText}>
                            ⚠️ {err}
                          </Text>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {errorMessage && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{errorMessage}</Text>
              </View>
            )}

            {/* Zero-Knowledge Security Callout */}
            <View style={styles.securityCallout}>
              <Text style={styles.securityTitle}>{t('drive.zeroKnowledgeVault')}</Text>
              <Text style={styles.securityDesc}>
                {t('drive.zeroKnowledgeDesc')}
              </Text>
            </View>

            {/* Legal & Public Portal Links */}
            <View style={styles.footerLinks}>
              <TouchableOpacity onPress={() => navigateTo('/privacy')}>
                <Text style={styles.footerLinkText}>{t('settings.privacy')}</Text>
              </TouchableOpacity>
              <Text style={styles.footerDivider}>•</Text>
              <TouchableOpacity onPress={() => navigateTo('/terms')}>
                <Text style={styles.footerLinkText}>{t('settings.terms')}</Text>
              </TouchableOpacity>
              <Text style={styles.footerDivider}>•</Text>
              <TouchableOpacity onPress={() => navigateTo('/security')}>
                <Text style={styles.footerLinkText}>{t('settings.security')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.bgOverlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.xl,
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  title: {
    fontSize: typography.fontSize.titleLg,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.titleLg,
    fontWeight: typography.fontWeight.semibold,
  },
  body: {
    padding: spacing.xl,
  },
  userCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: spacing.md,
  },
  avatarPlaceholder: {
    backgroundColor: colors.accentPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.titleLg,
    fontWeight: typography.fontWeight.bold,
  },
  userMeta: {
    flex: 1,
  },
  userName: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.titleMd,
    fontWeight: typography.fontWeight.semibold,
  },
  userEmail: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.caption,
    marginTop: 2,
  },
  badgeDrive: {
    color: colors.statusSuccess,
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.medium,
    marginTop: 4,
  },
  signOutBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  signOutBtnText: {
    color: colors.statusError,
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.medium,
  },
  signInCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  signInDesc: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.body,
    lineHeight: typography.lineHeight.body,
    marginBottom: spacing.lg,
  },
  primaryBtn: {
    backgroundColor: colors.accentPrimary,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.titleMd,
    fontWeight: typography.fontWeight.semibold,
  },
  sandboxBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderMedium,
  },
  sandboxBtnText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.medium,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  actionSection: {
    marginBottom: 16,
  },
  syncBtn: {
    backgroundColor: colors.statusSuccess,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncBtnText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.titleMd,
    fontWeight: typography.fontWeight.semibold,
  },
  resultBox: {
    backgroundColor: '#09090B',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  resultTitle: {
    color: '#FAFAFA',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  resultItem: {
    color: '#A1A1AA',
    fontSize: 13,
    lineHeight: 18,
  },
  errorBox: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#27272A',
    paddingTop: 6,
  },
  errorText: {
    color: '#F87171',
    fontSize: 12,
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  errorBannerText: {
    color: '#FCA5A5',
    fontSize: 13,
  },
  securityCallout: {
    backgroundColor: 'rgba(79, 70, 229, 0.1)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(79, 70, 229, 0.25)',
    marginBottom: 20,
  },
  securityTitle: {
    color: '#818CF8',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  securityDesc: {
    color: '#A1A1AA',
    fontSize: 12,
    lineHeight: 18,
  },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  footerLinkText: {
    color: '#71717A',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  footerDivider: {
    color: '#3F3F46',
    fontSize: 12,
  },
});
