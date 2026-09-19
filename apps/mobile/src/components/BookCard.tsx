import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, Image } from 'react-native';
import type { BookWithProgress } from '../services/bookService';
import { colors, typography, radius, spacing } from '../theme/tokens';
import { FoliumLeafIcon, FolderIcon, EditPencilIcon } from './icons/Icons';

interface BookCardProps {
  book: BookWithProgress;
  onPress: (book: BookWithProgress) => void;
  onDelete: (book: BookWithProgress) => void;
  onLongPress?: (book: BookWithProgress) => void;
}

export function BookCard({ book, onPress, onDelete, onLongPress }: BookCardProps) {
  const isPdf = book.file_type === 'pdf';
  const progressPercent = Math.round(book.progress_percentage || 0);

  const confirmDelete = () => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Bạn có chắc chắn muốn xoá cuốn "${book.title}" khỏi thư viện?`)) {
        onDelete(book);
      }
    } else {
      Alert.alert(
        'Xoá sách',
        `Bạn có chắc chắn muốn xoá cuốn "${book.title}" khỏi thư viện?`,
        [
          { text: 'Huỷ', style: 'cancel' },
          { text: 'Xoá', style: 'destructive', onPress: () => onDelete(book) },
        ]
      );
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
      style={styles.card}
      activeOpacity={0.82}
      onPress={() => onPress(book)}
      onLongPress={handleLongPress}
    >
      {/* Book Cover / Geometric Placeholder */}
      <View style={[styles.coverContainer, isPdf ? styles.coverPdf : styles.coverEpub]}>
        {book.cover_url ? (
          <Image source={{ uri: book.cover_url }} style={styles.coverImage} resizeMode="cover" />
        ) : (
          <>
            <View style={styles.spineEffect} />
            <View style={styles.watermarkContainer}>
              <FoliumLeafIcon size={40} color="rgba(255, 255, 255, 0.08)" />
            </View>
            <View style={styles.badgeContainer}>
              <View style={[styles.badge, isPdf ? styles.badgePdf : styles.badgeEpub]}>
                <Text style={[styles.badgeText, isPdf ? styles.badgeTextPdf : styles.badgeTextEpub]}>
                  {book.file_type.toUpperCase()}
                </Text>
              </View>
              {book.shelf && book.shelf !== 'Inbox' ? (
                <View style={styles.shelfBadgeContainer}>
                  <FolderIcon size={10} color="#C4B5FD" />
                  <Text style={styles.shelfBadgeText} numberOfLines={1}>
                    {book.shelf}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.coverTextWrapper}>
              <Text style={styles.coverTitlePreview} numberOfLines={3}>
                {book.title}
              </Text>
              <Text style={styles.coverAuthorPreview} numberOfLines={1}>
                {book.author}
              </Text>
            </View>
          </>
        )}

        {/* Quick Edit / Delete Options Button */}
        <TouchableOpacity
          style={styles.moreActionBtn}
          onPress={(e) => {
            e.stopPropagation?.();
            handleLongPress();
          }}
          activeOpacity={0.75}
          accessibilityLabel={`Tùy chọn cho sách ${book.title}`}
        >
          <EditPencilIcon size={12} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Book Info Section */}
      <View style={styles.infoContainer}>
        <Text style={styles.title} numberOfLines={2}>
          {book.title}
        </Text>
        <Text style={styles.author} numberOfLines={1}>
          {book.author}
        </Text>

        {/* Progress Bar & Details */}
        <View style={styles.footerRow}>
          {progressPercent > 0 ? (
            <View style={styles.progressContainer}>
              <View style={styles.progressBarBackground}>
                <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
              </View>
              <Text style={styles.progressText}>{progressPercent}%</Text>
            </View>
          ) : (
            <Text style={styles.newText}>Mới nạp</Text>
          )}

          <Text style={styles.fileSizeText}>{formatFileSize(book.file_size)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    flex: 1,
    marginHorizontal: 6,
    maxWidth: '48%',
    transition: 'transform 0.15s ease, border-color 0.15s ease',
  } as any,
  coverContainer: {
    height: 180,
    padding: spacing.md,
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
  },
  coverImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  coverEpub: {
    backgroundColor: '#18162E', // Subtle dark indigo-tinted slate
  },
  coverPdf: {
    backgroundColor: '#26141F', // Subtle dark rose-tinted slate
  },
  spineEffect: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  watermarkContainer: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    opacity: 0.8,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
    zIndex: 2,
    paddingRight: 28,
  },
  moreActionBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(20, 20, 23, 0.75)',
    borderRadius: radius.full,
    padding: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    zIndex: 10,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.xs,
  },
  badgeEpub: {
    backgroundColor: colors.badgeEpubBg,
  },
  badgePdf: {
    backgroundColor: colors.badgePdfBg,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0.5,
  },
  badgeTextEpub: {
    color: '#A5B4FC',
  },
  badgeTextPdf: {
    color: '#FDA4AF',
  },
  shelfBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.xs,
    maxWidth: 85,
  },
  shelfBadgeText: {
    fontSize: 9,
    fontWeight: typography.fontWeight.semibold,
    color: '#DDD6FE',
  },
  coverTextWrapper: {
    zIndex: 2,
    marginVertical: 'auto',
  },
  coverTitlePreview: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.titleMd,
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
    marginBottom: 4,
  },
  coverAuthorPreview: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.caption,
    textAlign: 'center',
  },
  infoContainer: {
    padding: spacing.md,
    backgroundColor: colors.bgSurface,
  },
  title: {
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: 4,
    minHeight: 36,
  },
  author: {
    fontSize: typography.fontSize.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  progressBarBackground: {
    flex: 1,
    height: 4,
    backgroundColor: colors.borderSubtle,
    borderRadius: radius.xs,
    overflow: 'hidden',
    marginRight: 6,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.accentPrimary,
    borderRadius: radius.xs,
  },
  progressText: {
    fontSize: typography.fontSize.micro,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.semibold,
  },
  newText: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  fileSizeText: {
    fontSize: typography.fontSize.micro,
    color: colors.textMuted,
  },
});
