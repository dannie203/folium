import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import type { Book } from '@folium/shared';
import { updateBookMetadata, getAvailableShelves } from '../services/bookService';
import { colors, typography, radius, spacing } from '../theme/tokens';
import { EditPencilIcon, CloseIcon, FolderIcon, InboxTrayIcon } from './icons/Icons';

interface MetadataEditModalProps {
  visible: boolean;
  book: Book | null;
  onClose: () => void;
  onSaved: () => void;
}

export function MetadataEditModal({
  visible,
  book,
  onClose,
  onSaved,
}: MetadataEditModalProps) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [shelf, setShelf] = useState('Inbox');
  const [newShelfInput, setNewShelfInput] = useState('');
  const [availableShelves, setAvailableShelves] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (book) {
      setTitle(book.title || '');
      setAuthor(book.author || '');
      setCoverUrl(book.cover_url || '');
      setShelf(book.shelf || 'Inbox');
      setNewShelfInput('');

      getAvailableShelves().then((shelves) => {
        setAvailableShelves(shelves);
      });
    }
  }, [book]);

  const handleSelectShelf = (s: string) => {
    setShelf(s);
  };

  const handleAddNewShelf = () => {
    const trimmed = newShelfInput.trim();
    if (trimmed) {
      if (!availableShelves.includes(trimmed)) {
        setAvailableShelves((prev) => [...prev, trimmed]);
      }
      setShelf(trimmed);
      setNewShelfInput('');
    }
  };

  const handleSave = async () => {
    if (!book) return;
    try {
      setIsSaving(true);
      await updateBookMetadata(book.id, {
        title: title.trim() || book.title,
        author: author.trim() || book.author,
        cover_url: coverUrl.trim() || null,
        shelf: shelf || 'Inbox',
      });
      onSaved();
      onClose();
    } catch (err: any) {
      alert(`Lỗi lưu thông tin: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!book) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <EditPencilIcon size={18} color={colors.accentPrimary} />
              <Text style={styles.title}>Chỉnh Sửa Sách & Kệ</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Đóng">
              <CloseIcon size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {/* Title Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Tên sách</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Nhập tên sách..."
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Author Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Tác giả</Text>
              <TextInput
                style={styles.input}
                value={author}
                onChangeText={setAuthor}
                placeholder="Tên tác giả..."
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Shelf / Category Selection */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Kệ sách (Folder trên Google Drive)</Text>
              <View style={styles.shelfChipsRow}>
                {availableShelves.map((s) => {
                  const isSelected = shelf === s;
                  const isInbox = s === 'Inbox';
                  return (
                    <TouchableOpacity
                      key={s}
                      style={[styles.shelfChip, isSelected && styles.shelfChipSelected]}
                      onPress={() => handleSelectShelf(s)}
                    >
                      {isInbox ? (
                        <InboxTrayIcon size={12} color={isSelected ? '#FFFFFF' : colors.textSecondary} />
                      ) : (
                        <FolderIcon size={12} color={isSelected ? '#FFFFFF' : colors.textSecondary} />
                      )}
                      <Text style={[styles.shelfChipText, isSelected && styles.shelfChipTextSelected]}>
                        {isInbox ? 'Hộp thư đến (Inbox)' : s}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Add New Shelf Input */}
              <View style={styles.addShelfRow}>
                <TextInput
                  style={[styles.input, styles.addShelfInput]}
                  value={newShelfInput}
                  onChangeText={setNewShelfInput}
                  placeholder="+ Tên kệ mới (Văn học, Kỹ thuật...)"
                  placeholderTextColor={colors.textMuted}
                />
                <TouchableOpacity
                  style={styles.addShelfBtn}
                  onPress={handleAddNewShelf}
                  disabled={!newShelfInput.trim()}
                >
                  <Text style={styles.addShelfBtnText}>Thêm Kệ</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Cover URL Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Đường dẫn ảnh bìa (Cover URL - Tùy chọn)</Text>
              <TextInput
                style={styles.input}
                value={coverUrl}
                onChangeText={setCoverUrl}
                placeholder="https://example.com/cover.jpg"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={isSaving}>
                <Text style={styles.cancelBtnText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, isSaving && styles.btnDisabled]}
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Lưu Thay Đổi</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.bgOverlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.xl,
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: typography.fontSize.titleLg,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  closeBtn: {
    padding: 6,
  },
  body: {
    padding: spacing.xl,
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: typography.fontSize.body,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  shelfChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  shelfChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bgSurface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  shelfChipSelected: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  shelfChipText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.medium,
  },
  shelfChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: typography.fontWeight.semibold,
  },
  addShelfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  addShelfInput: {
    flex: 1,
    paddingVertical: 8,
  },
  addShelfBtn: {
    backgroundColor: colors.borderMedium,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  addShelfBtnText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.semibold,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.medium,
  },
  saveBtn: {
    backgroundColor: colors.accentPrimary,
    paddingVertical: 10,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.sm,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.semibold,
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
