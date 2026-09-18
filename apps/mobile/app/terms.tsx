import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';

export default function TermsAndDMCAScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Điều Khoản & DMCA Safe Harbor', headerShown: true }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.badge}>Pháp lý • Miễn trừ trách nhiệm DMCA § 512</Text>
          <Text style={styles.title}>Điều Khoản Dịch Vụ & Bản Quyền</Text>
          <Text style={styles.subtitle}>
            Folium là công cụ phần mềm đọc sách mã nguồn mở độc lập. Chúng tôi tuân thủ nghiêm ngặt
            các quy định quốc tế về bản quyền số và quyền sở hữu trí tuệ.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Bản chất Phần mềm: Trình đọc Trung lập (Neutral Utility)</Text>
          <Text style={styles.paragraph}>
            Folium được thiết kế tương tự như một trình duyệt web (Google Chrome, Firefox) hoặc một
            trình phát đa phương tiện (VLC Media Player). Ứng dụng cung cấp giao diện hiển thị tài
            liệu cục bộ (EPUB, PDF) do người dùng tự nạp vào.
          </Text>
          <Text style={styles.paragraph}>
            Đội ngũ phát triển Folium <Text style={styles.bold}>KHÔNG sở hữu, KHÔNG phân phối, KHÔNG tải lên và KHÔNG lưu trữ</Text> bất kỳ tác phẩm sách thương mại có bản quyền nào trên các máy chủ của chúng tôi.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Tuyên bố Miễn trừ Trách nhiệm DMCA (Safe Harbor Compliance)</Text>
          <Text style={styles.paragraph}>
            Theo Đạo luật Bản quyền Kỹ thuật số Thiên niên kỷ (Digital Millennium Copyright Act - 17 U.S.C. § 512)
            và các điều ước quốc tế liên quan:
          </Text>
          <Text style={styles.paragraph}>
            Folium được miễn trừ trách nhiệm pháp lý đối với nội dung mà người dùng tự lưu trữ trên
            bộ nhớ thiết bị cá nhân hoặc tài khoản Google Drive cá nhân của họ. Chúng tôi áp dụng kiến
            trúc Zero-Knowledge, do đó hoàn toàn không thể can thiệp, duyệt hay xem nội dung sách của
            người dùng.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Quy trình Tiếp nhận Khiếu nại (Notice-and-Takedown)</Text>
          <Text style={styles.paragraph}>
            Nếu bạn là chủ sở hữu quyền tác giả hoặc đại diện pháp lý và nhận thấy có bất kỳ đường
            dẫn nguồn mở hoặc mục lục công quyền nào trên trang cộng đồng vi phạm bản quyền của bạn,
            vui lòng gửi văn bản thông báo gỡ bỏ (Takedown Notice) bao gồm:
          </Text>
          <Text style={styles.bullet}>1. Chữ ký vật lý hoặc điện tử của chủ sở hữu bản quyền.</Text>
          <Text style={styles.bullet}>2. Mô tả rõ ràng về tác phẩm bị nghi ngờ xâm phạm.</Text>
          <Text style={styles.bullet}>3. Đường dẫn URL cụ thể cần kiểm tra hoặc gỡ bỏ.</Text>
          <Text style={styles.bullet}>4. Thông tin liên hệ (Email, số điện thoại, địa chỉ).</Text>
          <View style={styles.contactBox}>
            <Text style={styles.contactLabel}>Đầu mối Tiếp nhận Bản quyền (DMCA Designated Agent):</Text>
            <Text style={styles.contactEmail}>dmca@aki.is-a.dev • hoặc qua GitHub Repository Issues</Text>
          </View>
          <Text style={styles.paragraph}>
            Chúng tôi cam kết phản hồi và xử lý gỡ bỏ các liên kết vi phạm trong vòng 48–72 giờ làm việc.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Miễn trừ Bảo đảm (No Warranty)</Text>
          <Text style={styles.paragraph}>
            Phần mềm được phát hành theo giấy phép mã nguồn mở phi lợi nhuận "NGUYÊN TRẠNG" (AS IS).
            Đội ngũ phát triển không chịu trách nhiệm về bất kỳ tổn thất dữ liệu cá nhân nào phát sinh
            trong quá trình sử dụng.
          </Text>
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
    maxWidth: 720,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    marginBottom: 28,
  },
  badge: {
    color: '#34D399',
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
    marginBottom: 10,
  },
  bullet: {
    color: '#D4D4D8',
    fontSize: 14,
    lineHeight: 22,
    marginLeft: 8,
    marginBottom: 4,
  },
  bold: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  contactBox: {
    backgroundColor: '#27272A',
    borderRadius: 8,
    padding: 12,
    marginVertical: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#34D399',
  },
  contactLabel: {
    color: '#A1A1AA',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  contactEmail: {
    color: '#FAFAFA',
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: '700',
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
