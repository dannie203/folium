import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { verifyCryptoVault } from '../src/services/cryptoService';
import { STANDALONE_AUDIT_SNIPPET } from '../src/services/securityProofSnippet';
import { colors, typography, spacing, radius } from '../src/theme/tokens';
import { ChevronLeftIcon, FoliumLeafIcon } from '../src/components/icons/Icons';

export default function SecurityProofScreen() {
  const router = useRouter();
  const [isRunningProof, setIsRunningProof] = useState(false);
  const [proofResult, setProofResult] = useState<{
    success: boolean;
    durationMs: number;
    samplePayload: any;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleRunLiveProof = async () => {
    try {
      setIsRunningProof(true);
      const res = await verifyCryptoVault();
      setProofResult(res);
    } catch (err: any) {
      alert(`Kiểm tra thất bại: ${err.message}`);
    } finally {
      setIsRunningProof(false);
    }
  };

  const handleCopySnippet = () => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(STANDALONE_AUDIT_SNIPPET);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } else {
      alert('Đã chọn đoạn mã kiểm toán bên dưới.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top Document Navigation Bar */}
      <View style={styles.navBar}>
        <TouchableOpacity
          style={styles.backBtn}
          activeOpacity={0.7}
          onPress={() => router.back()}
          accessibilityLabel="Quay lại"
        >
          <ChevronLeftIcon size={18} color={colors.textPrimary} />
          <Text style={styles.backBtnText}>Tủ sách</Text>
        </TouchableOpacity>

        <View style={styles.navCenter}>
          <Text style={styles.navTitle} numberOfLines={1}>
            Kiểm Toán & Bảo Mật ZK
          </Text>
        </View>

        <View style={styles.navRight}>
          <FoliumLeafIcon size={20} color={colors.accentPrimary} />
        </View>
      </View>

      {/* Main Document Body */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.article}>
          {/* Header Section */}
          <View style={styles.header}>
            <View style={styles.badgeRow}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>MÃ NGUỒN MỞ • NGUYÊN LÝ KERCKHOFFS</Text>
              </View>
              <Text style={styles.metaText}>Cập nhật: 19/09/2026</Text>
            </View>
            <Text style={styles.title}>Kiến Trúc Bảo Mật & Chứng Minh Mật Mã</Text>
            <Text style={styles.subtitle}>
              Bảo mật thực thụ không đến từ sự giấu giếm (Security through Obscurity), mà đến từ toán học
              và thiết kế mở. Folium công khai toàn bộ thuật toán để cộng đồng kỹ sư kiểm toán độc lập.
            </Text>
          </View>

          {/* Section 1: Live Benchmark */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionNumber}>
                <Text style={styles.sectionNumberText}>01</Text>
              </View>
              <Text style={styles.sectionTitle}>Kiểm Tra Mật Mã Thời Gian Thực (Live Inspector)</Text>
            </View>
            <Text style={styles.paragraph}>
              Bấm nút bên dưới để trình duyệt của bạn trực tiếp thực thi thuật toán dẫn xuất khoá PBKDF2
              (100.000 vòng lặp SHA-256) và mã hoá AES-256-GCM qua WebCrypto SubtleCrypto API chuẩn W3C:
            </Text>

            <TouchableOpacity
              style={[styles.benchmarkBtn, isRunningProof && styles.btnDisabled]}
              onPress={handleRunLiveProof}
              disabled={isRunningProof}
              activeOpacity={0.85}
            >
              {isRunningProof ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.benchmarkBtnText}>⚡ Chạy Kiểm Tra Mã Hoá Ngay</Text>
              )}
            </TouchableOpacity>

            {proofResult && (
              <View style={styles.proofCard}>
                <View style={styles.proofHeaderRow}>
                  <Text style={styles.proofBadgePass}>✓ XÁC THỰC THÀNH CÔNG (PASSED)</Text>
                  <Text style={styles.proofTime}>{proofResult.durationMs} ms</Text>
                </View>
                <Text style={styles.proofDesc}>
                  Dữ liệu truyền lên Cloudflare D1 là chuỗi Base64 mã hoá hoàn toàn mù (Blind Ciphertext):
                </Text>
                <Text style={styles.codeSnippet}>
                  {JSON.stringify(proofResult.samplePayload, null, 2)}
                </Text>
              </View>
            )}
          </View>

          {/* Section 2: Threat Matrix */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionNumber}>
                <Text style={styles.sectionNumberText}>02</Text>
              </View>
              <Text style={styles.sectionTitle}>Ma Trận Phòng Vệ Mối Đe Dọa (Threat Model)</Text>
            </View>

            <View style={styles.threatList}>
              <View style={styles.threatItem}>
                <Text style={styles.threatName}>Máy chủ Cloudflare bị thâm nhập</Text>
                <Text style={styles.threatDefense}>
                  Kẻ tấn công chỉ thu được các khối Ciphertext rác vô nghĩa. Không có khoá giải mã (Khoá mã hoá
                  chỉ lưu cục bộ trên thiết bị của bạn).
                </Text>
              </View>

              <View style={styles.threatItem}>
                <Text style={styles.threatName}>Mã độc JS nhúng trong sách EPUB</Text>
                <Text style={styles.threatDefense}>
                  Reader WebView / Iframe được cô lập nghiêm ngặt với Content Security Policy (CSP) chặt chẽ, chặn
                  triệt để việc đọc IndexedDB hay token Google.
                </Text>
              </View>

              <View style={styles.threatItem}>
                <Text style={styles.threatName}>Trát lệnh pháp lý / Yêu cầu dữ liệu</Text>
                <Text style={styles.threatDefense}>
                  Không thể tuân thủ vì nhà phát triển không sở hữu khoá giải mã hay bản rõ nội dung sách của người
                  dùng (Zero-Knowledge tuyệt đối).
                </Text>
              </View>
            </View>
          </View>

          {/* Section 3: Audit Snippet */}
          <View style={styles.sectionCard}>
            <View style={styles.snippetHeaderRow}>
              <View style={styles.sectionHeaderNoMargin}>
                <View style={styles.sectionNumber}>
                  <Text style={styles.sectionNumberText}>03</Text>
                </View>
                <Text style={styles.sectionTitle}>Đoạn Mã Kiểm Toán Độc Lập (Audit Snippet)</Text>
              </View>

              <TouchableOpacity style={styles.copyBtn} onPress={handleCopySnippet} activeOpacity={0.8}>
                <Text style={styles.copyBtnText}>{copied ? '✓ Đã sao chép' : 'Sao chép mã'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.paragraph}>
              Bất kỳ kỹ sư nào cũng có thể mở DevTools Console (F12) trên Chrome/Firefox hoặc chạy trong Node.js để tự kiểm chứng:
            </Text>

            <ScrollView
              style={styles.codeBlock}
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              <Text style={styles.codeText}>{STANDALONE_AUDIT_SNIPPET}</Text>
            </ScrollView>
          </View>

          {/* Bottom Back Button */}
          <TouchableOpacity
            style={styles.bottomBackBtn}
            activeOpacity={0.8}
            onPress={() => router.back()}
          >
            <Text style={styles.bottomBackBtnText}>← Quay lại Thư viện</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  navBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.bgSurface,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingRight: 10,
  },
  backBtnText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.medium,
  },
  navCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  navTitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.semibold,
  },
  navRight: {
    width: 60,
    alignItems: 'flex-end',
  },
  scrollContent: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  article: {
    width: '100%',
    maxWidth: 760,
  },
  header: {
    marginBottom: spacing.xxl,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  badge: {
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
  },
  badgeText: {
    color: '#A5B4FC',
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0.5,
  },
  metaText: {
    color: colors.textMuted,
    fontSize: typography.fontSize.micro,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.display,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: -0.5,
    marginBottom: spacing.sm,
    lineHeight: typography.lineHeight.display,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.body,
    lineHeight: 22,
  },
  sectionCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: spacing.md,
  },
  sectionHeaderNoMargin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  snippetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: spacing.md,
  },
  sectionNumber: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  sectionNumberText: {
    color: '#A5B4FC',
    fontSize: 12,
    fontWeight: typography.fontWeight.bold,
  },
  sectionTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.fontSize.titleMd,
    fontWeight: typography.fontWeight.bold,
  },
  paragraph: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.body,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  benchmarkBtn: {
    backgroundColor: colors.accentPrimary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  benchmarkBtnText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.semibold,
  },
  proofCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderMedium,
    marginTop: spacing.sm,
  },
  proofHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  proofBadgePass: {
    color: colors.statusSuccess,
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.bold,
  },
  proofTime: {
    color: colors.textMuted,
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.semibold,
  },
  proofDesc: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.caption,
    marginBottom: spacing.xs,
  },
  codeSnippet: {
    color: '#A5B4FC',
    fontSize: typography.fontSize.micro,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    backgroundColor: colors.bgBase,
    padding: spacing.sm,
    borderRadius: radius.xs,
  },
  threatList: {
    gap: spacing.md,
  },
  threatItem: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.accentPrimary,
  },
  threatName: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: 4,
  },
  threatDefense: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.caption,
    lineHeight: 18,
  },
  copyBtn: {
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  copyBtnText: {
    color: '#A5B4FC',
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.semibold,
  },
  codeBlock: {
    backgroundColor: colors.bgBase,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
    maxHeight: 360,
  },
  codeText: {
    color: '#E4E4E7',
    fontSize: 11,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    lineHeight: 16,
  },
  bottomBackBtn: {
    alignSelf: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xxl,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  bottomBackBtnText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.semibold,
  },
});
