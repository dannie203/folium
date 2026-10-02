import React, { useState, useMemo } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
  FlatList,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { colors, radius, spacing, typography } from '../src/theme/tokens';
import {
  ChevronLeftIcon,
  CloudDriveIcon,
  FoliumLeafIcon,
  SettingsIcon,
  SpeakerIcon,
  CloseIcon,
  CheckIcon,
} from '../src/components/icons/Icons';
import { DriveSyncModal } from '../src/components/DriveSyncModal';
import { useI18n } from '../src/i18n';
import { useTTS } from '../src/hooks/useTTS';
import { sortAndFilterVoices } from '../src/services/ttsService';

const SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

export default function SettingsScreen() {
  const router = useRouter();
  const { locale, setLocale, t, supportedLocales } = useI18n();
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);

  // TTS Hook
  const {
    voices,
    settings: ttsSettings,
    updateSettings: updateTtsSettings,
    testVoice,
  } = useTTS();

  const { recommended, others } = useMemo(
    () => sortAndFilterVoices(voices, locale),
    [voices, locale]
  );

  const selectedVoice = useMemo(
    () => voices.find((v) => v.identifier === ttsSettings.voiceURI),
    [voices, ttsSettings.voiceURI]
  );

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.navBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityLabel={t('settings.back')}
        >
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

        {/* 1. Interface Language */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('settings.language')}</Text>
          <View style={styles.languageGrid}>
            {supportedLocales.map((item) => {
              const isSelected = locale === item.code;
              return (
                <TouchableOpacity
                  key={item.code}
                  style={[styles.languageChip, isSelected && styles.languageChipActive]}
                  onPress={() => setLocale(item.code)}
                >
                  <Text style={[styles.languageChipText, isSelected && styles.languageChipTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 2. Voice & Audio Narration (Phase 10 TTS) */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('settings.ttsSection')}</Text>

          {/* Voice Picker Trigger */}
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => setIsVoiceModalOpen(true)}
          >
            <View style={styles.rowIcon}>
              <SpeakerIcon size={18} color={colors.accentPrimary} />
            </View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{t('settings.ttsVoice')}</Text>
              <Text style={styles.rowDescription}>
                {selectedVoice
                  ? `${selectedVoice.name} (${selectedVoice.language})`
                  : t('settings.ttsVoiceAuto')}
              </Text>
            </View>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>

          {/* Speed Selection */}
          <View style={styles.subSettingBlock}>
            <Text style={styles.subSettingLabel}>{t('settings.ttsSpeed')}</Text>
            <View style={styles.speedChipsWrap}>
              {SPEED_OPTIONS.map((rate) => {
                const isActive = ttsSettings.rate === rate;
                return (
                  <TouchableOpacity
                    key={rate}
                    style={[styles.speedChip, isActive && styles.speedChipActive]}
                    onPress={() => updateTtsSettings({ rate })}
                  >
                    <Text style={[styles.speedChipText, isActive && styles.speedChipTextActive]}>
                      {rate.toFixed(2).replace(/\.00$/, '')}x
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Auto Next Sentence Toggle */}
          <TouchableOpacity
            style={[styles.toggleRow, ttsSettings.autoNext && styles.toggleRowActive]}
            onPress={() => updateTtsSettings({ autoNext: !ttsSettings.autoNext })}
          >
            <View style={styles.rowCopy}>
              <Text style={styles.toggleRowTitle}>{t('settings.ttsAutoNext')}</Text>
            </View>
            <View style={[styles.switchIndicator, ttsSettings.autoNext && styles.switchIndicatorActive]}>
              <View style={[styles.switchDot, ttsSettings.autoNext && styles.switchDotActive]} />
            </View>
          </TouchableOpacity>
        </View>

        {/* 3. Cloud Storage (Google Drive) */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('settings.cloud')}</Text>
          <TouchableOpacity style={styles.settingRow} onPress={() => setIsDriveModalOpen(true)}>
            <View style={styles.rowIcon}>
              <CloudDriveIcon size={18} color={colors.textSecondary} />
            </View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{t('settings.drive')}</Text>
              <Text style={styles.rowDescription}>{t('settings.driveDesc')}</Text>
            </View>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* 4. Local-First Assurance */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('settings.localFirst')}</Text>
          <View style={styles.infoRow}>
            <View style={styles.statusDot} />
            <Text style={styles.infoText}>{t('settings.localFirstDesc')}</Text>
          </View>
        </View>

        {/* 5. Legal & Security Links */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('settings.security')}</Text>
          <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/security' as any)}>
            <Text style={styles.linkText}>{t('settings.security')}</Text>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/privacy' as any)}>
            <Text style={styles.linkText}>{t('settings.privacy')}</Text>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/terms' as any)}>
            <Text style={styles.linkText}>{t('settings.terms')}</Text>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Google Drive Sync Modal */}
      <DriveSyncModal
        visible={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
      />

      {/* Voice Selection Modal */}
      <Modal
        visible={isVoiceModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsVoiceModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.voiceModalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleWrap}>
                <SpeakerIcon size={20} color={colors.accentPrimary} />
                <Text style={styles.modalTitle}>{t('settings.ttsVoice')}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsVoiceModalOpen(false)}
                style={styles.modalCloseBtn}
              >
                <CloseIcon size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.voiceListScroll}>
              {/* Option: System Default */}
              <TouchableOpacity
                style={[
                  styles.voiceItem,
                  !ttsSettings.voiceURI && styles.voiceItemActive,
                ]}
                onPress={() => {
                  updateTtsSettings({ voiceURI: undefined });
                  setIsVoiceModalOpen(false);
                }}
              >
                <View style={styles.voiceItemTextWrap}>
                  <Text style={styles.voiceItemTitle}>{t('settings.ttsVoiceAuto')}</Text>
                  <Text style={styles.voiceItemSubtitle}>OS Speech Engine</Text>
                </View>
                {!ttsSettings.voiceURI && <CheckIcon size={18} color={colors.accentPrimary} />}
              </TouchableOpacity>

              {/* Recommended Voices */}
              {recommended.length > 0 && (
                <View style={styles.voiceGroup}>
                  <Text style={styles.voiceGroupLabel}>
                    {locale.toUpperCase()} ({recommended.length})
                  </Text>
                  {recommended.map((v) => {
                    const isSelected = ttsSettings.voiceURI === v.identifier;
                    return (
                      <View key={v.identifier} style={[styles.voiceItem, isSelected && styles.voiceItemActive]}>
                        <TouchableOpacity
                          style={styles.voiceItemTextWrap}
                          onPress={() => {
                            updateTtsSettings({ voiceURI: v.identifier });
                            setIsVoiceModalOpen(false);
                          }}
                        >
                          <Text style={[styles.voiceItemTitle, isSelected && styles.voiceItemTitleActive]}>
                            {v.name}
                          </Text>
                          <Text style={styles.voiceItemSubtitle}>{v.language}</Text>
                        </TouchableOpacity>

                        <View style={styles.voiceActionWrap}>
                          <TouchableOpacity
                            style={styles.voiceTestBtn}
                            onPress={() => testVoice(v.identifier, t('settings.ttsTestSample'))}
                            accessibilityLabel={t('settings.ttsTest')}
                          >
                            <SpeakerIcon size={14} color={colors.accentPrimary} />
                            <Text style={styles.voiceTestBtnText}>{t('settings.ttsTest')}</Text>
                          </TouchableOpacity>
                          {isSelected && <CheckIcon size={18} color={colors.accentPrimary} />}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Other Voices */}
              {others.length > 0 && (
                <View style={styles.voiceGroup}>
                  <Text style={styles.voiceGroupLabel}>
                    {t('common.save') ? 'OTHER VOICES' : 'OTHER'} ({others.length})
                  </Text>
                  {others.map((v) => {
                    const isSelected = ttsSettings.voiceURI === v.identifier;
                    return (
                      <View key={v.identifier} style={[styles.voiceItem, isSelected && styles.voiceItemActive]}>
                        <TouchableOpacity
                          style={styles.voiceItemTextWrap}
                          onPress={() => {
                            updateTtsSettings({ voiceURI: v.identifier });
                            setIsVoiceModalOpen(false);
                          }}
                        >
                          <Text style={[styles.voiceItemTitle, isSelected && styles.voiceItemTitleActive]}>
                            {v.name}
                          </Text>
                          <Text style={styles.voiceItemSubtitle}>{v.language}</Text>
                        </TouchableOpacity>

                        <View style={styles.voiceActionWrap}>
                          <TouchableOpacity
                            style={styles.voiceTestBtn}
                            onPress={() => testVoice(v.identifier, t('settings.ttsTestSample'))}
                            accessibilityLabel={t('settings.ttsTest')}
                          >
                            <SpeakerIcon size={14} color={colors.accentPrimary} />
                            <Text style={styles.voiceTestBtnText}>{t('settings.ttsTest')}</Text>
                          </TouchableOpacity>
                          {isSelected && <CheckIcon size={18} color={colors.accentPrimary} />}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  navTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.titleMd,
    fontWeight: typography.fontWeight.semibold,
  },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  intro: {
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  eyebrow: {
    color: colors.accentPrimary,
    fontSize: typography.fontSize.micro,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 1.2,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.titleLg,
    lineHeight: typography.lineHeight.titleLg,
    fontWeight: typography.fontWeight.bold,
    marginTop: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.body,
    lineHeight: typography.lineHeight.body,
    marginTop: spacing.sm,
  },
  section: { marginTop: spacing.lg },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSize.micro,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  languageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  languageChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  languageChipActive: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  languageChipText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.medium,
  },
  languageChipTextActive: {
    color: '#FFFFFF',
    fontWeight: typography.fontWeight.semibold,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.sm,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
  },
  rowCopy: { flex: 1, marginLeft: spacing.md },
  rowTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.semibold,
  },
  rowDescription: {
    color: colors.textMuted,
    fontSize: typography.fontSize.caption,
    marginTop: 2,
  },
  rowArrow: { color: colors.textMuted, fontSize: 24, lineHeight: 24 },
  subSettingBlock: {
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.sm,
  },
  subSettingLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing.sm,
  },
  speedChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  speedChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  speedChipActive: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  speedChipText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.medium,
  },
  speedChipTextActive: {
    color: '#FFFFFF',
    fontWeight: typography.fontWeight.bold,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.sm,
  },
  toggleRowActive: {
    borderColor: colors.borderSubtle,
  },
  toggleRowTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.medium,
  },
  switchIndicator: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.bgElevated,
    padding: 2,
    justifyContent: 'center',
  },
  switchIndicatorActive: {
    backgroundColor: colors.accentPrimary,
  },
  switchDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.textMuted,
  },
  switchDotActive: {
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-end',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.statusSuccess,
    backgroundColor: colors.bgSurface,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.statusSuccess,
    marginTop: 5,
  },
  infoText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.fontSize.caption,
    lineHeight: typography.lineHeight.caption,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  linkText: { color: colors.textSecondary, fontSize: typography.fontSize.body },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  voiceModalContent: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '80%',
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  modalTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.titleMd,
    fontWeight: typography.fontWeight.bold,
  },
  modalCloseBtn: {
    padding: spacing.xs,
  },
  voiceListScroll: {
    padding: spacing.md,
  },
  voiceGroup: {
    marginTop: spacing.md,
  },
  voiceGroupLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSize.micro,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  voiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    marginBottom: spacing.xs,
  },
  voiceItemActive: {
    borderWidth: 1,
    borderColor: colors.accentPrimary,
  },
  voiceItemTextWrap: {
    flex: 1,
    marginRight: spacing.sm,
  },
  voiceItemTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.medium,
  },
  voiceItemTitleActive: {
    color: colors.accentPrimary,
    fontWeight: typography.fontWeight.semibold,
  },
  voiceItemSubtitle: {
    color: colors.textMuted,
    fontSize: typography.fontSize.caption,
    marginTop: 2,
  },
  voiceActionWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  voiceTestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  voiceTestBtnText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.micro,
    fontWeight: typography.fontWeight.medium,
  },
});
