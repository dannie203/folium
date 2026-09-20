import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { colors, typography, spacing, radius } from '../src/theme/tokens';
import { ChevronLeftIcon, FoliumLeafIcon } from '../src/components/icons/Icons';

export default function PrivacyPolicyScreen() {
  const router = useRouter();

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
            Chính Sách Quyền Riêng Tư
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
                <Text style={styles.badgeText}>QUYỀN RIÊNG TƯ • ZERO-TELEMETRY</Text>
              </View>
              <Text style={styles.metaText}>Cập nhật: 19/09/2026</Text>
            </View>
            <Text style={styles.title}>Chính Sách Bảo Vệ Quyền Riêng Tư</Text>
            <Text style={styles.subtitle}>
              Folium được xây dựng với triết lý: Quyền riêng tư khi đọc là bất khả xâm phạm. Chúng tôi không theo
              dõi hành vi, không bán dữ liệu và không bao giờ lưu trữ sách của bạn trên máy chủ trung tâm.
            </Text>
          </View>

          {/* Section 1 */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionNumber}>
                <Text style={styles.sectionNumberText}>01</Text>
              </View>
              <Text style={styles.sectionTitle}>Kiến Trúc Ưu Tiên Cục Bộ (Local-First)</Text>
            </View>
            <Text style={styles.paragraph}>
              Khi bạn sử dụng Folium để đọc sách (EPUB, PDF), toàn bộ tài liệu, vị trí đọc dở (CFI), bookmark,
              highlight và ghi chú được lưu trữ trực tiếp trên thiết bị của bạn (SQLite trên mobile, IndexedDB trên web).
            </Text>
            <Text style={styles.paragraph}>
              Ứng dụng hoạt động 100% ngoại tuyến mà không đòi hỏi kết nối internet. Bạn có thể đọc sách trên máy bay
              hoặc nơi hẻo lánh mà không lo bị ngắt quãng.
            </Text>
          </View>

          {/* Section 2 */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionNumber}>
                <Text style={styles.sectionNumberText}>02</Text>
              </View>
              <Text style={styles.sectionTitle}>Không Thu Thập Dữ Liệu (Zero Telemetry)</Text>
            </View>
            <Text style={styles.paragraph}>
              Folium là dự án mã nguồn mở phi lợi nhuận. Chúng tôi cam kết tuyệt đối:
            </Text>

            <View style={styles.bulletList}>
              <View style={styles.bulletItem}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>KHÔNG cài đặt bất kỳ mã theo dõi, Google Analytics hay Facebook Pixel.</Text>
              </View>
              <View style={styles.bulletItem}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>KHÔNG ghi nhận lịch sử đọc, tốc độ đọc hay thời gian đọc của bạn.</Text>
              </View>
              <View style={styles.bulletItem}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>KHÔNG hiển thị quảng cáo thương mại hoặc bán hồ sơ người dùng cho bên thứ ba.</Text>
              </View>
            </View>
          </View>

          {/* Section 3 */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionNumber}>
                <Text style={styles.sectionNumberText}>03</Text>
              </View>
              <Text style={styles.sectionTitle}>Quyền Truy Cập Google Drive (drive.file)</Text>
            </View>
            <Text style={styles.paragraph}>
              Khi bạn tuỳ chọn kích hoạt tính năng sao lưu thư viện qua Google Drive:
            </Text>
            <Text style={styles.paragraph}>
              Folium chỉ yêu cầu quyền hạn hẹp nhất:{' '}
              <Text style={styles.codeTag}>https://www.googleapis.com/auth/drive.file</Text>
            </Text>
            <View style={styles.calloutBox}>
              <Text style={styles.calloutText}>
                Theo quy định bảo mật của Google, quyền này chỉ cho phép ứng dụng đọc/ghi các file nằm trong thư mục do chính
                Folium tạo ra (<Text style={styles.codeTag}>/Folium</Text>). Folium{' '}
                <Text style={styles.boldWhite}>hoàn toàn không có quyền xem hay chạm vào</Text> bất kỳ hình ảnh, tài liệu cá nhân
                nào khác trên Google Drive của bạn.
              </Text>
            </View>
          </View>

          {/* Section 4 */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionNumber}>
                <Text style={styles.sectionNumberText}>04</Text>
              </View>
              <Text style={styles.sectionTitle}>Đồng Bộ Không Kiến Thức (Zero-Knowledge Sync)</Text>
            </View>
            <Text style={styles.paragraph}>
              Tính năng đồng bộ tiến độ đọc qua Cloudflare D1 sử dụng cơ chế mã hoá đầu cuối tại máy khách (Client-Side AES-256-GCM).
              Hạ tầng serverless chỉ lưu trữ các khối bản mã mù (Blind Ciphertext) và không sở hữu khoá giải mã.
            </Text>
            <Text style={styles.paragraph}>
              Ngay cả đội ngũ phát triển hay nhà cung cấp hạ tầng máy chủ cũng không thể giải mã hay xem được dữ liệu của bạn.
            </Text>
          </View>

          {/* Section 5 */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionNumber}>
                <Text style={styles.sectionNumberText}>05</Text>
              </View>
              <Text style={styles.sectionTitle}>Minh Bạch Mã Nguồn Mở</Text>
            </View>
            <Text style={styles.paragraph}>
              Mã nguồn của Folium được công khai 100% trên GitHub để cộng đồng tự do kiểm chứng và đóng góp:
            </Text>
            <View style={styles.contactCard}>
              <Text style={styles.contactTitle}>Kho mã nguồn chính thức:</Text>
              <Text style={styles.contactEmail}>github.com/dannie203/folium</Text>
            </View>
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
    maxWidth: 720,
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
  codeTag: {
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    color: '#A5B4FC',
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
    fontSize: 13,
  },
  calloutBox: {
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    borderLeftWidth: 4,
    borderLeftColor: colors.accentPrimary,
    padding: spacing.md,
    marginTop: 4,
  },
  calloutText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.body,
    lineHeight: 21,
  },
  boldWhite: {
    fontWeight: typography.fontWeight.bold,
    color: '#FFFFFF',
  },
  bulletList: {
    gap: 8,
    marginVertical: spacing.sm,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accentPrimary,
    marginTop: 8,
  },
  bulletText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.fontSize.body,
    lineHeight: 22,
  },
  contactCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderMedium,
    padding: spacing.lg,
    marginVertical: spacing.md,
  },
  contactTitle: {
    color: colors.textMuted,
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.medium,
    marginBottom: 4,
  },
  contactEmail: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
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
