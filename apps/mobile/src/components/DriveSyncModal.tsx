import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { AuthUser, DriveSyncResult } from '@folium/shared';
import {
  getCurrentUser,
  onAuthStateChanged,
  signInWithGoogle,
  signOut,
} from '../services/authService';
import { syncWithGoogleDrive } from '../services/googleDriveService';

interface DriveSyncModalProps {
  visible: boolean;
  onClose: () => void;
  onSyncComplete?: () => void;
}

export function DriveSyncModal({ visible, onClose, onSyncComplete }: DriveSyncModalProps) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(getCurrentUser());
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<DriveSyncResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged((newUser) => {
      setUser(newUser);
      setErrorMessage(null);
    });
  }, []);

  const handleSignIn = async (demo = false) => {
    try {
      setIsAuthenticating(true);
      setErrorMessage(null);
      await signInWithGoogle(demo);
    } catch (err: any) {
      setErrorMessage(err.message || 'Đăng nhập Google thất bại.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setSyncResult(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Đăng xuất thất bại.');
    }
  };

  const handleSyncNow = async () => {
    try {
      setIsSyncing(true);
      setErrorMessage(null);
      const res = await syncWithGoogleDrive();
      setSyncResult(res);
      if (onSyncComplete) {
        onSyncComplete();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi đồng bộ Google Drive.');
    } finally {
      setIsSyncing(false);
    }
  };

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
            <Text style={styles.title}>☁️ Google Drive Sync</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
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
                      <Text style={styles.avatarText}>{user.name.charAt(0)}</Text>
                    </View>
                  )}
                  <View style={styles.userMeta}>
                    <Text style={styles.userName}>{user.name}</Text>
                    <Text style={styles.userEmail}>{user.email}</Text>
                    <Text style={styles.badgeDrive}>📁 /Folium folder active</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
                  <Text style={styles.signOutBtnText}>Đăng xuất</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.signInCard}>
                <Text style={styles.signInDesc}>
                  Đăng nhập tài khoản Google để tự động sao lưu file sách (.epub, .pdf) vào thư mục
                  riêng tư trên Google Drive của bạn mà không tốn chi phí máy chủ.
                </Text>

                <TouchableOpacity
                  style={[styles.primaryBtn, isAuthenticating && styles.btnDisabled]}
                  onPress={() => handleSignIn(false)}
                  disabled={isAuthenticating}
                >
                  {isAuthenticating ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Đăng nhập với Google</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sandboxBtn}
                  onPress={() => handleSignIn(true)}
                >
                  <Text style={styles.sandboxBtnText}>🛠️ Kết nối Sandbox (Chế độ Nhà phát triển)</Text>
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
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={styles.syncBtnText}>Đang đồng bộ file sách...</Text>
                    </View>
                  ) : (
                    <Text style={styles.syncBtnText}>🔄 Đồng bộ Thư viện Ngay</Text>
                  )}
                </TouchableOpacity>

                {syncResult && (
                  <View style={styles.resultBox}>
                    <Text style={styles.resultTitle}>Kết quả đồng bộ:</Text>
                    <Text style={styles.resultItem}>• Tải lên Drive: {syncResult.uploadedCount} cuốn</Text>
                    <Text style={styles.resultItem}>• Tải về máy: {syncResult.downloadedCount} cuốn</Text>
                    <Text style={styles.resultItem}>• Đã khớp sẵn: {syncResult.syncedCount} cuốn</Text>
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
              <Text style={styles.securityTitle}>🛡️ Cơ Chế Khóa Thông Tin (Zero-Knowledge)</Text>
              <Text style={styles.securityDesc}>
                Toàn bộ tiến độ đọc, bookmark và ghi chú được mã hóa AES-256-GCM tại máy client.
                Server Cloudflare hoàn toàn mù (Blind Vault), không giữ khóa giải mã và không thể
                đọc lén sách của bạn.
              </Text>
            </View>

            {/* Legal & Public Portal Links */}
            <View style={styles.footerLinks}>
              <TouchableOpacity onPress={() => navigateTo('/privacy')}>
                <Text style={styles.footerLinkText}>Quyền riêng tư</Text>
              </TouchableOpacity>
              <Text style={styles.footerDivider}>•</Text>
              <TouchableOpacity onPress={() => navigateTo('/terms')}>
                <Text style={styles.footerLinkText}>Điều khoản & DMCA</Text>
              </TouchableOpacity>
              <Text style={styles.footerDivider}>•</Text>
              <TouchableOpacity onPress={() => navigateTo('/security')}>
                <Text style={styles.footerLinkText}>Kiểm toán Bảo mật</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#18181B',
    borderRadius: 16,
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: '#27272A',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#27272A',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FAFAFA',
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    color: '#A1A1AA',
    fontSize: 18,
    fontWeight: '600',
  },
  body: {
    padding: 20,
  },
  userCard: {
    backgroundColor: '#27272A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 14,
  },
  avatarPlaceholder: {
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  userMeta: {
    flex: 1,
  },
  userName: {
    color: '#FAFAFA',
    fontSize: 16,
    fontWeight: '600',
  },
  userEmail: {
    color: '#A1A1AA',
    fontSize: 13,
    marginTop: 2,
  },
  badgeDrive: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  signOutBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  signOutBtnText: {
    color: '#F87171',
    fontSize: 13,
    fontWeight: '500',
  },
  signInCard: {
    backgroundColor: '#27272A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  signInDesc: {
    color: '#D4D4D8',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  sandboxBtn: {
    marginTop: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  sandboxBtnText: {
    color: '#A1A1AA',
    fontSize: 13,
    fontWeight: '500',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  actionSection: {
    marginBottom: 16,
  },
  syncBtn: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
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
