import React, { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { colors, radius, spacing, typography } from '../src/theme/tokens';
import { ChevronLeftIcon, CloudDriveIcon, FoliumLeafIcon, SettingsIcon } from '../src/components/icons/Icons';
import { DriveSyncModal } from '../src/components/DriveSyncModal';
import { useI18n } from '../src/i18n';

export default function SettingsScreen() {
  const router = useRouter();
  const { locale, setLocale, t } = useI18n();
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityLabel={t('settings.back')}>
          <ChevronLeftIcon size={18} color={colors.textPrimary} />
          <Text style={styles.backText}>{t('settings.back')}</Text>
        </TouchableOpacity>
        <View style={styles.navTitleWrap}>
          <SettingsIcon size={18} color={colors.accentPrimary} />
          <Text style={styles.navTitle}>{t('settings.title')}</Text>
        </View>
        <FoliumLeafIcon size={20} color={colors.accentPrimary} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>FOLIUM</Text>
          <Text style={styles.title}>{t('settings.title')}</Text>
          <Text style={styles.subtitle}>{t('settings.localFirstDesc')}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('settings.language')}</Text>
          <View style={styles.segmentedControl}>
            <TouchableOpacity
              style={[styles.segment, locale === 'vi' && styles.segmentActive]}
              onPress={() => setLocale('vi')}
            >
              <Text style={[styles.segmentText, locale === 'vi' && styles.segmentTextActive]}>
                {t('settings.vietnamese')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segment, locale === 'en' && styles.segmentActive]}
              onPress={() => setLocale('en')}
            >
              <Text style={[styles.segmentText, locale === 'en' && styles.segmentTextActive]}>
                {t('settings.english')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('settings.cloud')}</Text>
          <TouchableOpacity style={styles.settingRow} onPress={() => setIsDriveModalOpen(true)}>
            <View style={styles.rowIcon}><CloudDriveIcon size={18} color={colors.textSecondary} /></View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{t('settings.drive')}</Text>
              <Text style={styles.rowDescription}>{t('settings.driveDesc')}</Text>
            </View>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('settings.localFirst')}</Text>
          <View style={styles.infoRow}>
            <View style={styles.statusDot} />
            <Text style={styles.infoText}>{t('settings.localFirstDesc')}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('settings.security')}</Text>
          <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/security' as any)}>
            <Text style={styles.linkText}>{t('settings.security')}</Text><Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/privacy' as any)}>
            <Text style={styles.linkText}>{t('settings.privacy')}</Text><Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/terms' as any)}>
            <Text style={styles.linkText}>{t('settings.terms')}</Text><Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <DriveSyncModal
        visible={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  navBar: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minWidth: 92 },
  backText: { color: colors.textPrimary, fontSize: typography.fontSize.body },
  navTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  navTitle: { color: colors.textPrimary, fontSize: typography.fontSize.titleMd, fontWeight: typography.fontWeight.semibold },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: spacing.xl, paddingBottom: spacing.xxxl },
  intro: { paddingVertical: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  eyebrow: { color: colors.accentPrimary, fontSize: typography.fontSize.micro, fontWeight: typography.fontWeight.bold, letterSpacing: 1.2 },
  title: { color: colors.textPrimary, fontSize: typography.fontSize.display, lineHeight: typography.lineHeight.display, fontWeight: typography.fontWeight.bold, marginTop: spacing.xs },
  subtitle: { color: colors.textSecondary, fontSize: typography.fontSize.body, lineHeight: typography.lineHeight.body, marginTop: spacing.sm },
  section: { marginTop: spacing.xl },
  sectionLabel: { color: colors.textMuted, fontSize: typography.fontSize.micro, fontWeight: typography.fontWeight.bold, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: spacing.sm },
  segmentedControl: { flexDirection: 'row', padding: spacing.xs, borderRadius: radius.md, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.borderSubtle },
  segment: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.accentPrimary },
  segmentText: { color: colors.textSecondary, fontSize: typography.fontSize.body, fontWeight: typography.fontWeight.medium },
  segmentTextActive: { color: colors.textPrimary, fontWeight: typography.fontWeight.semibold },
  settingRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.md },
  rowIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated },
  rowCopy: { flex: 1, marginLeft: spacing.md },
  rowTitle: { color: colors.textPrimary, fontSize: typography.fontSize.body, fontWeight: typography.fontWeight.semibold },
  rowDescription: { color: colors.textMuted, fontSize: typography.fontSize.caption, marginTop: 2 },
  rowArrow: { color: colors.textMuted, fontSize: 24, lineHeight: 24 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.statusSuccess, backgroundColor: colors.bgSurface },
  statusDot: { width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.statusSuccess, marginTop: 5 },
  infoText: { flex: 1, color: colors.textSecondary, fontSize: typography.fontSize.caption, lineHeight: typography.lineHeight.caption },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  linkText: { color: colors.textSecondary, fontSize: typography.fontSize.body },
});
