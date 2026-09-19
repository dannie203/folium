import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import type { BookWithProgress } from '../services/bookService';

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
      activeOpacity={0.7}
      onPress={() => onPress(book)}
      onLongPress={handleLongPress}
    >
      {/* Book Cover / Placeholder */}
      <View style={[styles.coverContainer, isPdf ? styles.coverPdf : styles.coverEpub]}>
        <View style={styles.spineEffect} />
        <View style={styles.badgeContainer}>
          <Text style={[styles.badgeText, isPdf ? styles.badgePdf : styles.badgeEpub]}>
            {book.file_type.toUpperCase()}
          </Text>
          {book.shelf && book.shelf !== 'Inbox' ? (
            <Text style={styles.shelfBadge} numberOfLines={1}>
              {book.shelf}
            </Text>
          ) : null}
        </View>

        <Text style={styles.coverTitlePreview} numberOfLines={3}>
          {book.title}
        </Text>
        <Text style={styles.coverAuthorPreview} numberOfLines={1}>
          {book.author}
        </Text>
      </View>

      {/* Book Info */}
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
            <Text style={styles.newText}>Chưa đọc</Text>
          )}

          <Text style={styles.fileSizeText}>{formatFileSize(book.file_size)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#18181B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272A',
    overflow: 'hidden',
    marginBottom: 16,
    flex: 1,
    marginHorizontal: 6,
    maxWidth: '48%',
  },
  coverContainer: {
    height: 180,
    padding: 12,
    justifyContent: 'space-between',
    position: 'relative',
  },
  coverEpub: {
    backgroundColor: '#1E1B4B', // Deep indigo
  },
  coverPdf: {
    backgroundColor: '#3B0764', // Deep purple-rose
  },
  spineEffect: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  badgeContainer: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  shelfBadge: {
    fontSize: 9,
    fontWeight: '600',
    backgroundColor: 'rgba(168, 85, 247, 0.25)',
    color: '#D8B4FE',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    maxWidth: 75,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  badgeEpub: {
    backgroundColor: 'rgba(99, 102, 241, 0.25)',
    color: '#A5B4FC',
  },
  badgePdf: {
    backgroundColor: 'rgba(244, 63, 94, 0.25)',
    color: '#FDA4AF',
  },
  coverTitlePreview: {
    color: '#FAFAFA',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginVertical: 'auto',
  },
  coverAuthorPreview: {
    color: '#D4D4D8',
    fontSize: 11,
    textAlign: 'center',
  },
  infoContainer: {
    padding: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FAFAFA',
    marginBottom: 2,
    minHeight: 36,
  },
  author: {
    fontSize: 12,
    color: '#A1A1AA',
    marginBottom: 8,
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
    marginRight: 8,
  },
  progressBarBackground: {
    flex: 1,
    height: 4,
    backgroundColor: '#27272A',
    borderRadius: 2,
    overflow: 'hidden',
    marginRight: 6,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#6366F1',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 10,
    color: '#A1A1AA',
    fontWeight: '600',
  },
  newText: {
    fontSize: 11,
    color: '#71717A',
    fontStyle: 'italic',
  },
  fileSizeText: {
    fontSize: 10,
    color: '#71717A',
  },
});
