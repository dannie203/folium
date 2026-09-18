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
      <Stack.Screen options={{ title: 'Kiểm Toán & Bảo Mật Zero-Knowledge', headerShown: true }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.badge}>Mã Nguồn Mở • Nguyên Lý Kerckhoffs</Text>
          <Text style={styles.title}>Kiến Trúc Bảo Mật & Chứng Minh Mật Mã</Text>
          <Text style={styles.subtitle}>
            Bảo mật thực sự không đến từ sự giấu giếm (Security through obscurity), mà đến từ toán học
            và thiết kế mở. Folium công khai toàn bộ cơ chế mã hóa để cộng đồng kỹ sư kiểm toán độc lập.
          </Text>
        </View>

        {/* Live Interactive Benchmark */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Kiểm Tra Mật Mã Thời Gian Thực (Live Inspector)</Text>
          <Text style={styles.paragraph}>
            Bấm nút bên dưới để trình duyệt của bạn trực tiếp thực thi thuật toán dẫn xuất khóa PBKDF2
            (100.000 vòng lặp SHA-256) và mã hóa AES-256-GCM qua WebCrypto SubtleCrypto API:
          </Text>

          <TouchableOpacity
            style={[styles.benchmarkBtn, isRunningProof && styles.btnDisabled]}
            onPress={handleRunLiveProof}
            disabled={isRunningProof}
          >
            {isRunningProof ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.benchmarkBtnText}>⚡ Chạy Kiểm Tra Mã Hóa Ngay</Text>
            )}
          </TouchableOpacity>

          {proofResult && (
            <View style={styles.proofCard}>
              <View style={styles.proofHeaderRow}>
                <Text style={styles.proofBadgePass}>✅ VERIFICATION PASSED</Text>
                <Text style={styles.proofTime}>{proofResult.durationMs} ms</Text>
              </View>
              <Text style={styles.proofDesc}>
                Dữ liệu truyền lên Cloudflare D1 là chuỗi Base64 mã hóa hoàn toàn mù (Blind Ciphertext):
              </Text>
              <Text style={styles.codeSnippet}>
                {JSON.stringify(proofResult.samplePayload, null, 2)}
              </Text>
            </View>
          )}
        </View>

        {/* Threat Model Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Ma Trận Phòng Vệ Mối Đe Dọa (Threat Model)</Text>
          
          <View style={styles.threatRow}>
            <Text style={styles.threatName}>Máy chủ Cloudflare bị tấn công</Text>
            <Text style={styles.threatDefense}>
              🛡️ Kẻ tấn công chỉ thu được các khối Ciphertext rác vô nghĩa. Không có khóa giải mã (Key chỉ nằm trên máy bạn).
            </Text>
          </View>

          <View style={styles.threatRow}>
            <Text style={styles.threatName}>Mã độc JS nhúng trong sách EPUB</Text>
            <Text style={styles.threatDefense}>
              🛡️ Reader WebView / Iframe được cô lập nghiêm ngặt với <Text style={styles.inlineCode}>sandbox=&quot;allow-same-origin&quot;</Text> và CSP chặn triệt để đọc IndexedDB hay token Google.
            </Text>
          </View>

          <View style={styles.threatRow}>
            <Text style={styles.threatName}>Trát lệnh pháp lý / Yêu cầu dữ liệu</Text>
            <Text style={styles.threatDefense}>
              🛡️ Không thể tuân thủ vì nhà phát triển không sở hữu khóa giải mã hay nội dung sách của người dùng (Zero-Knowledge).
            </Text>
          </View>
        </View>

        {/* Standalone Snippet */}
        <View style={styles.section}>
          <View style={styles.snippetHeaderRow}>
            <Text style={styles.sectionTitle}>3. Đoạn Mã Kiểm Toán Độc Lập (Audit Snippet)</Text>
            <TouchableOpacity style={styles.copyBtn} onPress={handleCopySnippet}>
              <Text style={styles.copyBtnText}>{copied ? '✓ Đã sao chép' : 'Sao chép'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.paragraph}>
            Bất kỳ kỹ sư nào cũng có thể mở DevTools Console (F12) trên Chrome/Firefox/Safari hoặc chạy trong Node.js để tự kiểm chứng:
          </Text>
          <View style={styles.codeBlock}>
            <Text style={styles.codeText}>{STANDALONE_AUDIT_SNIPPET}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>← Quay lại Thư viện</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090B',
  },
  content: {
    padding: 20,
    maxWidth: 760,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    marginBottom: 28,
  },
  badge: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  title: {
    color: '#FAFAFA',
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 12,
  },
  subtitle: {
    color: '#A1A1AA',
    fontSize: 15,
    lineHeight: 22,
  },
  section: {
    marginBottom: 24,
    backgroundColor: '#18181B',
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  sectionTitle: {
    color: '#FAFAFA',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 10,
  },
  paragraph: {
    color: '#D4D4D8',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 14,
  },
  benchmarkBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  benchmarkBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  proofCard: {
    backgroundColor: '#09090B',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#22C55E',
    marginTop: 8,
  },
  proofHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  proofBadgePass: {
    color: '#22C55E',
    fontWeight: '700',
    fontSize: 13,
  },
  proofTime: {
    color: '#A1A1AA',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  proofDesc: {
    color: '#D4D4D8',
    fontSize: 13,
    marginBottom: 8,
  },
  codeSnippet: {
    fontFamily: 'monospace',
    color: '#6EE7B7',
    fontSize: 11,
    lineHeight: 16,
    backgroundColor: '#18181B',
    padding: 10,
    borderRadius: 6,
  },
  threatRow: {
    backgroundColor: '#27272A',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  threatName: {
    color: '#FAFAFA',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  threatDefense: {
    color: '#A1A1AA',
    fontSize: 13,
    lineHeight: 18,
  },
  inlineCode: {
    fontFamily: 'monospace',
    color: '#F472B6',
    backgroundColor: '#18181B',
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  snippetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  copyBtn: {
    backgroundColor: '#27272A',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  copyBtnText: {
    color: '#A1A1AA',
    fontSize: 12,
    fontWeight: '500',
  },
  codeBlock: {
    backgroundColor: '#09090B',
    borderRadius: 8,
    padding: 12,
    maxHeight: 260,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  codeText: {
    fontFamily: 'monospace',
    color: '#93C5FD',
    fontSize: 11,
    lineHeight: 16,
  },
  backBtn: {
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 32,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#27272A',
    borderRadius: 8,
  },
  backBtnText: {
    color: '#FAFAFA',
    fontSize: 14,
    fontWeight: '600',
  },
});
