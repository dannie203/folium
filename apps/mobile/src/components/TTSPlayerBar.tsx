import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';
import {
  SpeakerIcon,
  PlayIcon,
  PauseIcon,
  SkipBackIcon,
  SkipForwardIcon,
  CloseIcon,
} from './icons/Icons';
import { useI18n } from '../i18n';

interface TTSPlayerBarProps {
  visible: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  currentSentence: string;
  currentSentenceIndex: number;
  totalSentences: number;
  rate: number;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onNext: () => void;
  onPrev: () => void;
  onRateChange: (rate: number) => void;
  onClose: () => void;
}

const SPEED_STEPS = [0.75, 1.0, 1.25, 1.5, 2.0];

export const TTSPlayerBar: React.FC<TTSPlayerBarProps> = ({
  visible,
  isPlaying,
  isPaused,
  currentSentence,
  currentSentenceIndex,
  totalSentences,
  rate,
  onPlay,
  onPause,
  onResume,
  onStop,
  onNext,
  onPrev,
  onRateChange,
  onClose,
}) => {
  const { t } = useI18n();

  if (!visible) return null;

  const cycleSpeed = () => {
    const currentIdx = SPEED_STEPS.indexOf(rate);
    const nextIdx = currentIdx === -1 || currentIdx === SPEED_STEPS.length - 1 ? 0 : currentIdx + 1;
    onRateChange(SPEED_STEPS[nextIdx]);
  };

  const handleTogglePlay = () => {
    if (isPlaying && !isPaused) {
      onPause();
    } else if (isPaused) {
      onResume();
    } else {
      onPlay();
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Header / Meta Row */}
      <View style={styles.headerRow}>
        <View style={styles.statusWrap}>
          <SpeakerIcon size={16} color={colors.accentPrimary} />
          <Text style={styles.statusText}>
            {isPlaying && !isPaused ? t('reader.ttsPlaying') : t('reader.ttsPaused')}
          </Text>
          {totalSentences > 0 && (
            <Text style={styles.counterText}>
              ({currentSentenceIndex + 1}/{totalSentences})
            </Text>
          )}
        </View>

        <View style={styles.headerActions}>
          {/* Speed Chip */}
          <TouchableOpacity
            style={styles.speedButton}
            onPress={cycleSpeed}
            accessibilityLabel={t('reader.ttsSpeed')}
          >
            <Text style={styles.speedText}>{rate.toFixed(2).replace(/\.00$/, '')}x</Text>
          </TouchableOpacity>

          {/* Close / Dismiss */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => {
              onStop();
              onClose();
            }}
            accessibilityLabel={t('common.close')}
          >
            <CloseIcon size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Current Sentence Quote Box */}
      <View style={styles.sentenceCard}>
        <Text style={styles.sentenceText} numberOfLines={2} ellipsizeMode="tail">
          {currentSentence ? `"${currentSentence}"` : t('reader.ttsExtracting')}
        </Text>
      </View>

      {/* Transport Playback Controls */}
      <View style={styles.controlsRow}>
        <TouchableOpacity
          style={[styles.skipButton, currentSentenceIndex <= 0 && styles.controlDisabled]}
          onPress={onPrev}
          disabled={currentSentenceIndex <= 0}
          accessibilityLabel={t('reader.ttsPrevSentence')}
        >
          <SkipBackIcon size={20} color={currentSentenceIndex <= 0 ? colors.textMuted : colors.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.playPauseButton}
          onPress={handleTogglePlay}
          accessibilityLabel={isPlaying && !isPaused ? t('reader.ttsPause') : t('reader.ttsPlay')}
        >
          {isPlaying && !isPaused ? (
            <PauseIcon size={20} color="#FFFFFF" />
          ) : (
            <PlayIcon size={20} color="#FFFFFF" />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.skipButton,
            currentSentenceIndex >= totalSentences - 1 && styles.controlDisabled,
          ]}
          onPress={onNext}
          disabled={currentSentenceIndex >= totalSentences - 1}
          accessibilityLabel={t('reader.ttsNextSentence')}
        >
          <SkipForwardIcon
            size={20}
            color={
              currentSentenceIndex >= totalSentences - 1 ? colors.textMuted : colors.textPrimary
            }
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 74,
    left: spacing.md,
    right: spacing.md,
    maxWidth: 600,
    alignSelf: 'center',
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 90,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  statusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusText: {
    color: colors.accentBookmark,
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.semibold,
  },
  counterText: {
    color: colors.textMuted,
    fontSize: typography.fontSize.caption,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  speedButton: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  speedText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.micro,
    fontWeight: typography.fontWeight.bold,
  },
  closeButton: {
    padding: 4,
  },
  sentenceCard: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.sm,
    marginVertical: spacing.xs,
  },
  sentenceText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.caption,
    lineHeight: typography.lineHeight.caption,
    fontStyle: 'italic',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    marginTop: spacing.xs,
  },
  skipButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
  },
  controlDisabled: {
    opacity: 0.4,
  },
  playPauseButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentBookmark,
  },
});
