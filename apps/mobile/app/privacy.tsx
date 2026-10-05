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

export default function PrivacyPolicyScreen() {
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
            {t('privacy.navTitle')}
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
                <Text style={styles.badgeText}>{t('privacy.badge')}</Text>
              </View>
              <Text style={styles.metaText}>{t('privacy.updated')}</Text>
            </View>
            <Text style={styles.title}>{t('privacy.title')}</Text>
            <Text style={styles.subtitle}>{t('privacy.subtitle')}</Text>
          </View>

          {/* Section 1 */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionNumber}>
                <Text style={styles.sectionNumberText}>01</Text>
              </View>
              <Text style={styles.sectionTitle}>{t('privacy.section1Title')}</Text>
            </View>
            <Text style={styles.paragraph}>{t('privacy.section1Paragraph1')}</Text>
            <Text style={styles.paragraph}>{t('privacy.section1Paragraph2')}</Text>
          </View>

          {/* Section 2 */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionNumber}>
                <Text style={styles.sectionNumberText}>02</Text>
              </View>
              <Text style={styles.sectionTitle}>{t('privacy.section2Title')}</Text>
            </View>
            <Text style={styles.paragraph}>{t('privacy.section2Intro')}</Text>

            <View style={styles.bulletList}>
              <View style={styles.bulletItem}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{t('privacy.section2Bullet1')}</Text>
              </View>
              <View style={styles.bulletItem}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{t('privacy.section2Bullet2')}</Text>
              </View>
              <View style={styles.bulletItem}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{t('privacy.section2Bullet3')}</Text>
              </View>
            </View>
          </View>

          {/* Section 3 */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionNumber}>
                <Text style={styles.sectionNumberText}>03</Text>
              </View>
              <Text style={styles.sectionTitle}>{t('privacy.section3Title')}</Text>
            </View>
            <Text style={styles.paragraph}>{t('privacy.section3Paragraph1')}</Text>
            <Text style={styles.paragraph}>
              {t('privacy.section3Paragraph2')}{' '}
              <Text style={styles.codeTag}>https://www.googleapis.com/auth/drive.file</Text>
            </Text>
            <View style={styles.calloutBox}>
              <Text style={styles.calloutText}>{t('privacy.section3Callout')}</Text>
            </View>
          </View>

          {/* Section 4 */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionNumber}>
                <Text style={styles.sectionNumberText}>04</Text>
              </View>
              <Text style={styles.sectionTitle}>{t('privacy.section4Title')}</Text>
            </View>
            <Text style={styles.paragraph}>{t('privacy.section4Paragraph1')}</Text>
            <Text style={styles.paragraph}>{t('privacy.section4Paragraph2')}</Text>
          </View>

          {/* Section 5 */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionNumber}>
                <Text style={styles.sectionNumberText}>05</Text>
              </View>
              <Text style={styles.sectionTitle}>{t('privacy.section5Title')}</Text>
            </View>
            <Text style={styles.paragraph}>{t('privacy.section5Paragraph')}</Text>
            <View style={styles.contactCard}>
              <Text style={styles.contactTitle}>{t('privacy.officialSource')}</Text>
              <Text style={styles.contactEmail}>{t('privacy.projectStatus')}</Text>
            </View>
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
