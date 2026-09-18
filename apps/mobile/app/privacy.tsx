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

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Chính Sách Quyền Riêng Tư', headerShown: true }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.badge}>Chính thức • Cập nhật tháng 9/2026</Text>
          <Text style={styles.title}>Chính Sách Bảo Vệ Quyền Riêng Tư</Text>
          <Text style={styles.subtitle}>
            Folium được xây dựng với triết lý: Quyền riêng tư là quyền cơ bản của con người. Chúng
            tôi không theo dõi, không bán dữ liệu và không lưu trữ sách của bạn trên máy chủ.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Kiến trúc Ưu tiên Cục bộ (Local-First)</Text>
          <Text style={styles.paragraph}>
            Khi bạn sử dụng Folium để đọc sách (EPUB, PDF), toàn bộ tài liệu, vị trí trang đọc dở,
            bookmark, highlight và ghi chú cá nhân được lưu trữ trực tiếp trên thiết bị của bạn
            (SQLite trên điện thoại, IndexedDB trên trình duyệt).
          </Text>
          <Text style={styles.paragraph}>
            Ứng dụng hoạt động 100% ngoại tuyến (offline) mà không cần kết nối mạng. Bạn có thể sử
            dụng Folium trên máy bay hoặc bất kỳ nơi nào mà không bị gián đoạn.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Không Theo Dõi & Không Thu Thập Dữ Liệu (Zero Telemetry)</Text>
          <Text style={styles.paragraph}>
            Folium là một dự án mã nguồn mở phi lợi nhuận. Chúng tôi cam kết:
          </Text>
          <Text style={styles.bullet}>• KHÔNG cài đặt bất kỳ mã theo dõi hành vi, Google Analytics hay Facebook Pixel.</Text>
          <Text style={styles.bullet}>• KHÔNG ghi nhận lịch sử đọc, tốc độ đọc, thời gian đọc hay nội dung ghi chú.</Text>
          <Text style={styles.bullet}>• KHÔNG hiển thị quảng cáo thương mại hoặc thu thập dữ liệu để bán cho bên thứ ba.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Quyền Truy cập Google Drive (drive.file)</Text>
          <Text style={styles.paragraph}>
            Khi bạn tùy chọn kích hoạt tính năng sao lưu thư viện sách qua Google Drive:
          </Text>
          <Text style={styles.paragraph}>
            Folium chỉ yêu cầu phạm vi quyền tối thiểu: <Text style={styles.code}>https://www.googleapis.com/auth/drive.file</Text>.
          </Text>
          <Text style={styles.paragraph}>
            Theo quy định bảo mật của Google, phạm vi này chỉ cho phép ứng dụng đọc và ghi các file
            trong thư mục do chính Folium tạo ra (thư mục <Text style={styles.code}>/Folium</Text>).
            Folium <Text style={styles.bold}>hoàn toàn không có quyền xem, mở hoặc can thiệp</Text> vào bất kỳ hình ảnh, tài liệu cá nhân hay file nào khác có trong Google Drive của bạn.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Đồng bộ Đám mây Không Kiến Thức (Zero-Knowledge Sync)</Text>
          <Text style={styles.paragraph}>
            Tính năng đồng bộ tiến độ đọc qua Cloudflare D1 sử dụng cơ chế mã hóa đầu cuối tại máy
            khách (Client-Side AES-256-GCM). Máy chủ đám mây chỉ lưu trữ các khối dữ liệu mã hóa nhị
            phân (Blind Ciphertext) và không sở hữu khóa giải mã.
          </Text>
          <Text style={styles.paragraph}>
            Ngay cả đội ngũ phát triển hay nhà cung cấp hạ tầng máy chủ cũng không thể giải mã hoặc đọc
            được thông tin của bạn.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. Liên hệ & Mã nguồn Mở</Text>
          <Text style={styles.paragraph}>
            Mã nguồn của Folium được công khai minh bạch. Nếu bạn có bất kỳ câu hỏi hoặc khiếu nại
            về quyền riêng tư, vui lòng liên hệ qua GitHub Issues hoặc email quản trị dự án:
          </Text>
          <Text style={styles.code}>https://github.com/dannie203/folium</Text>
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
    color: '#818CF8',
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
  },
  code: {
    fontFamily: 'monospace',
    backgroundColor: '#27272A',
    color: '#6EE7B7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 13,
  },
  bold: {
    fontWeight: '700',
    color: '#FFFFFF',
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
