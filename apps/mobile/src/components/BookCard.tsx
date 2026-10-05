import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, Image, useWindowDimensions } from 'react-native';
import type { BookWithProgress } from '../services/bookService';
import { colors, typography, radius, spacing } from '../theme/tokens';
import { FoliumLeafIcon, FolderIcon, EditPencilIcon } from './icons/Icons';
import { useI18n } from '../i18n';

interface BookCardProps {
  book: BookWithProgress;
  onPress: (book: BookWithProgress) => void;
  onDelete: (book: BookWithProgress) => void;
  onLongPress?: (book: BookWithProgress) => void;
}

export function BookCard({ book, onPress, onDelete, onLongPress }: BookCardProps) {
  const { t } = useI18n();
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = windowWidth >= 768;
  const desktopCardWidth = Math.min(190, Math.max(120, (windowWidth - 280) / 4 - 12));
  const isPdf = book.file_type === 'pdf';
  const progressPercent = Math.round(book.progress_percentage || 0);

  const confirmDelete = () => {
    const confirmMsg = t('bookshelf.deleteConfirmMsg', { title: book.title });
    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) {
        onDelete(book);
      }
    } else {
      Alert.alert(t('bookshelf.deleteConfirmTitle'), confirmMsg, [
        { text: t('bookshelf.cancel'), style: 'cancel' },
        { text: t('bookshelf.delete'), style: 'destructive', onPress: () => onDelete(book) },
      ]);
    }
  };

  const handleLongPress = () => {
    if (onLongPress) {
      onLongPress(book);
    } else {
      confirmDelete();
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isDesktop ? { width: desktopCardWidth } : styles.cardMobile,
      ]}
      activeOpacity={0.88}
      onPress={() => onPress(book)}
      onLongPress={handleLongPress}
    >
      {/* 3D Realistic Book Cover Frame */}
      <View style={[styles.coverContainer, isPdf ? styles.coverPdf : styles.coverEpub]}>
        {book.cover_url ? (
          <Image source={{ uri: book.cover_url }} style={styles.coverImage} resizeMode="cover" />
        ) : (
          <View style={styles.placeholderWrapper}>
            <View style={styles.watermarkContainer}>
              <FoliumLeafIcon size={44} color="rgba(255, 255, 255, 0.07)" />
            </View>
            <View style={styles.coverTextWrapper}>
              <Text style={styles.coverTitlePreview} numberOfLines={3}>
                {book.title}
              </Text>
              <Text style={styles.coverAuthorPreview} numberOfLines={1}>
                {book.author}
              </Text>
            </View>
          </View>
        )}

        {/* Realistic Book Spine Effect (Left Border Highlight) */}
        <View style={styles.spineHighlight} />
        <View style={styles.spineShadow} />

        {/* Top Badges: Format & Shelf */}
        <View style={styles.topBadgesRow}>
          <View style={[styles.formatBadge, isPdf ? styles.badgePdf : styles.badgeEpub]}>
            <Text style={[styles.formatBadgeText, isPdf ? styles.badgeTextPdf : styles.badgeTextEpub]}>
              {book.file_type.toUpperCase()}
            </Text>
          </View>

          {book.shelf && book.shelf !== 'Inbox' ? (
            <View style={styles.shelfBadge}>
              <FolderIcon size={9} color="#DDD6FE" />
              <Text style={styles.shelfBadgeText} numberOfLines={1}>
                {book.shelf}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Quick Options Button */}
        <TouchableOpacity
          style={styles.moreActionBtn}
          onPress={(e) => {
            e.stopPropagation?.();
            handleLongPress();
          }}
          activeOpacity={0.75}
          accessibilityLabel={`${t('bookshelf.bookOptions')}: ${book.title}`}
        >
          <EditPencilIcon size={12} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Slender Progress Bar Overlay at bottom of cover */}
        {progressPercent > 0 && (
          <View style={styles.coverProgressTrack}>
            <View
              style={[
                styles.coverProgressFill,
                { width: `${progressPercent}%` },
                progressPercent >= 100 && styles.coverProgressFillDone,
              ]}
            />
          </View>
        )}
      </View>

      {/* Book Metadata Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.title} numberOfLines={2}>
          {book.title}
        </Text>
        <Text style={styles.author} numberOfLines={1}>
          {book.author || t('common.unknownAuthor')}
        </Text>

        <View style={styles.metaRow}>
          {progressPercent > 0 ? (
            <Text style={styles.progressLabel}>
              {t('bookshelf.readProgress', { percent: progressPercent })}
            </Text>
          ) : (
            <Text style={styles.newLabel}>{t('bookshelf.unread')}</Text>
          )}
          <Text style={styles.fileSizeText}>{formatFileSize(book.file_size)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'transparent',
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: spacing.xxl,
    marginHorizontal: 6,
  },
  cardMobile: {
    width: '48%',
  },
  coverContainer: {
    aspectRatio: 1 / 1.5,
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    boxShadow: '0 8px 22px rgba(0, 0, 0, 0.55)',
  } as any,
  coverImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  coverEpub: {
    backgroundColor: '#20262D',
  },
  coverPdf: {
    backgroundColor: '#3A2924',
  },
  placeholderWrapper: {
    flex: 1,
    padding: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spineHighlight: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 5,
  },
  spineShadow: {
    position: 'absolute',
    left: 2,
    top: 0,
    bottom: 0,
    width: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    zIndex: 4,
  },
  watermarkContainer: {
    position: 'absolute',
    right: 12,
    bottom: 12,
  },
  topBadgesRow: {
    position: 'absolute',
    top: 10,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 6,
  },
  formatBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: radius.xs,
  },
  badgeEpub: {
    backgroundColor: 'rgba(196, 155, 102, 0.32)',
  },
  badgePdf: {
    backgroundColor: 'rgba(237, 224, 200, 0.22)',
  },
  formatBadgeText: {
    fontSize: 9,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0.5,
  },
  badgeTextEpub: {
    color: '#F0D7AD',
  },
  badgeTextPdf: {
    color: '#F2E6D1',
  },
  shelfBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(129, 140, 248, 0.22)',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: radius.xs,
    maxWidth: 90,
  },
  shelfBadgeText: {
    fontSize: 9,
    fontWeight: typography.fontWeight.semibold,
    color: '#DDD6FE',
  },
  moreActionBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(20, 20, 23, 0.8)',
    borderRadius: radius.full,
    padding: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 10,
  },
  coverTextWrapper: {
    zIndex: 2,
    alignItems: 'center',
    paddingHorizontal: 8,
    width: '100%',
  },
  coverTitlePreview: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
    marginBottom: 6,
    lineHeight: 20,
  },
  coverAuthorPreview: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.caption,
    textAlign: 'center',
  },
  coverProgressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    zIndex: 8,
  },
  coverProgressFill: {
    height: '100%',
    backgroundColor: colors.accentBookmark,
  },
  coverProgressFillDone: {
    backgroundColor: colors.statusSuccess,
  },
  infoContainer: {
    paddingTop: 10,
    paddingHorizontal: 2,
  },
  title: {
    fontFamily: Platform.select({ web: typography.fontFamily.serif, default: 'serif' }),
    fontSize: 13.5,
    fontWeight: '500',
    color: colors.textPrimary,
    lineHeight: 18,
    marginBottom: 2,
    minHeight: 36,
  },
  author: {
    fontSize: 11.5,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 10.5,
    color: colors.accentBookmark,
    fontWeight: '500',
  },
  newLabel: {
    fontSize: 10.5,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  fileSizeText: {
    fontSize: 10,
    color: colors.textMuted,
  },
});
