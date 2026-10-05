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
import { useI18n } from '../src/i18n';

export default function TermsAndDMCAScreen() {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top Document Navigation Bar */}
      <View style={styles.navBar}>
        <TouchableOpacity
          style={styles.backBtn}
          activeOpacity={0.7}
          onPress={() => router.back()}
          accessibilityLabel={t('common.back')}
        >
          <ChevronLeftIcon size={18} color={colors.textPrimary} />
          <Text style={styles.backBtnText}>{t('settings.back')}</Text>
        </TouchableOpacity>

        <View style={styles.navCenter}>
          <Text style={styles.navTitle} numberOfLines={1}>
            {t('settings.terms')}
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
                <Text style={styles.badgeText}>PHÁP LÝ • DMCA § 512</Text>
              </View>
              <Text style={styles.metaText}>Cập nhật: 19/09/2026</Text>
            </View>
            <Text style={styles.title}>Điều Khoản Dịch Vụ & Bản Quyền</Text>
            <Text style={styles.subtitle}>
              Folium là công cụ đọc sách điện tử mã nguồn mở, hoạt động theo mô hình Local-First và Zero-Knowledge.
              Chúng tôi tôn trọng quyền tác giả và tuân thủ các quy chuẩn bảo vệ bản quyền quốc tế.
            </Text>
          </View>

          {/* Section 1 */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionNumber}>
                <Text style={styles.sectionNumberText}>01</Text>
              </View>
              <Text style={styles.sectionTitle}>Bản chất Phần mềm: Trình Đọc Trung Lập</Text>
            </View>
            <Text style={styles.paragraph}>
              Folium hoạt động tương tự như một trình duyệt web (Chrome, Firefox) hoặc trình phát đa phương tiện
              (VLC Media Player). Ứng dụng cung cấp giao diện hiển thị tài liệu cục bộ (EPUB, PDF) do người dùng
              tự chọn nạp vào từ thiết bị cá nhân.
            </Text>
            <View style={styles.calloutBox}>
              <Text style={styles.calloutText}>
                Đội ngũ Folium <Text style={styles.boldWhite}>KHÔNG sở hữu, KHÔNG phân phối, KHÔNG tải lên và KHÔNG lưu trữ</Text> bất
                kỳ tác phẩm sách thương mại có bản quyền nào trên máy chủ của chúng tôi.
              </Text>
            </View>
          </View>

          {/* Section 2 */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionNumber}>
                <Text style={styles.sectionNumberText}>02</Text>
              </View>
              <Text style={styles.sectionTitle}>Miễn Trừ Trách Nhiệm DMCA (Safe Harbor)</Text>
            </View>
            <Text style={styles.paragraph}>
              Căn cứ theo Đạo luật Bản quyền Kỹ thuật số Thiên niên kỷ (DMCA - 17 U.S.C. § 512) và các điều ước quốc tế liên quan:
            </Text>
            <Text style={styles.paragraph}>
              Folium được miễn trừ trách nhiệm pháp lý đối với dữ liệu người dùng tự lưu trữ trên bộ nhớ máy hoặc
              tài khoản Google Drive cá nhân của họ. Với kiến trúc Zero-Knowledge, toàn bộ dữ liệu đồng bộ được mã hoá
              đầu cuối (E2EE), chúng tôi hoàn toàn không thể xem hoặc can thiệp vào nội dung sách của người dùng.
            </Text>
          </View>

          {/* Section 3 */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionNumber}>
                <Text style={styles.sectionNumberText}>03</Text>
              </View>
              <Text style={styles.sectionTitle}>Quy Trình Tiếp Nhận Khiếu Nại (Notice & Takedown)</Text>
            </View>
            <Text style={styles.paragraph}>
              Nếu bạn là chủ sở hữu quyền tác giả hoặc đại diện pháp lý và phát hiện đường dẫn feed OPDS công khai
              nào vi phạm bản quyền trên trang cộng đồng, vui lòng gửi văn bản yêu cầu gỡ bỏ bao gồm:
            </Text>

            <View style={styles.bulletList}>
              <View style={styles.bulletItem}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>Chữ ký điện tử hoặc chữ ký vật lý của người đại diện có thẩm quyền.</Text>
              </View>
              <View style={styles.bulletItem}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>Mô tả chi tiết tác phẩm có bản quyền bị nghi ngờ xâm phạm.</Text>
              </View>
              <View style={styles.bulletItem}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>Đường dẫn liên kết (URL / feed feed) cụ thể cần gỡ bỏ.</Text>
              </View>
              <View style={styles.bulletItem}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>Thông tin liên hệ xác thực (Email, điện thoại, địa chỉ pháp lý).</Text>
              </View>
            </View>

            <View style={styles.contactCard}>
              <Text style={styles.contactTitle}>Đầu mối tiếp nhận khiếu nại bản quyền:</Text>
              <Text style={styles.contactEmail}>dmca@aki.is-a.dev</Text>
              <Text style={styles.contactNote}>
                Hoặc tạo Issue trực tiếp tại kho mã nguồn GitHub: github.com/dannie203/folium
              </Text>
            </View>
            <Text style={styles.paragraphFootnote}>
              Chúng tôi cam kết rà soát và xử lý gỡ bỏ các liên kết vi phạm trong vòng 24–48 giờ làm việc.
            </Text>
          </View>

          {/* Section 4 */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionNumber}>
                <Text style={styles.sectionNumberText}>04</Text>
              </View>
              <Text style={styles.sectionTitle}>Miễn Trừ Bảo Đảm (No Warranty)</Text>
            </View>
            <Text style={styles.paragraph}>
              Phần mềm được phát hành theo giấy phép mã nguồn mở phi thương mại "NGUYÊN TRẠNG" (AS IS). Đội ngũ phát
              triển không chịu trách nhiệm đối với bất kỳ sự cố mất mát dữ liệu hoặc tranh chấp quyền tác giả nào phát
              sinh do phía người dùng tự cấu hình.
            </Text>
          </View>

          {/* Bottom Back Button */}
          <TouchableOpacity
            style={styles.bottomBackBtn}
            activeOpacity={0.8}
            onPress={() => router.back()}
          >
            <Text style={styles.bottomBackBtnText}>← {t('privacy.backToLibrary')}</Text>
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
  paragraphFootnote: {
    color: colors.textMuted,
    fontSize: typography.fontSize.caption,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  calloutBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderLeftWidth: 4,
    borderLeftColor: colors.statusError,
    padding: spacing.md,
    marginTop: 4,
  },
  calloutText: {
    color: '#FECACA',
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
    marginBottom: 6,
  },
  contactNote: {
    color: colors.textMuted,
    fontSize: typography.fontSize.micro,
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
