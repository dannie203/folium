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
            <Text style={styles.title}>✏️ Chỉnh Sửa Sách & Kệ</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {/* Title Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Tên sách:</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Nhập tên sách..."
                placeholderTextColor="#71717A"
              />
            </View>

            {/* Author Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Tác giả:</Text>
              <TextInput
                style={styles.input}
                value={author}
                onChangeText={setAuthor}
                placeholder="Tên tác giả..."
                placeholderTextColor="#71717A"
              />
            </View>

            {/* Shelf / Category Selection */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Kệ sách (Thư mục):</Text>
              <View style={styles.shelfChipsRow}>
                {availableShelves.map((s) => {
                  const isSelected = shelf === s;
                  return (
                    <TouchableOpacity
                      key={s}
                      style={[styles.shelfChip, isSelected && styles.shelfChipSelected]}
                      onPress={() => handleSelectShelf(s)}
                    >
                      <Text style={[styles.shelfChipText, isSelected && styles.shelfChipTextSelected]}>
                        {s === 'Inbox' ? '📥 Hộp thư đến (Inbox)' : `📁 ${s}`}
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
                  placeholderTextColor="#71717A"
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
              <Text style={styles.label}>Đường dẫn ảnh bìa (Cover URL - Tùy chọn):</Text>
              <TextInput
                style={styles.input}
                value={coverUrl}
                onChangeText={setCoverUrl}
                placeholder="https://example.com/cover.jpg"
                placeholderTextColor="#71717A"
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
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#18181B',
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: '#27272A',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#27272A',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FAFAFA',
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    color: '#A1A1AA',
    fontSize: 18,
    fontWeight: '600',
  },
  body: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    color: '#A1A1AA',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#27272A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FAFAFA',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  shelfChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  shelfChip: {
    backgroundColor: '#27272A',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  shelfChipSelected: {
    backgroundColor: '#4F46E5',
    borderColor: '#6366F1',
  },
  shelfChipText: {
    color: '#D4D4D8',
    fontSize: 12,
    fontWeight: '500',
  },
  shelfChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  addShelfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addShelfInput: {
    flex: 1,
    paddingVertical: 8,
  },
  addShelfBtn: {
    backgroundColor: '#3F3F46',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  addShelfBtnText: {
    color: '#FAFAFA',
    fontSize: 13,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 12,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  cancelBtnText: {
    color: '#A1A1AA',
    fontSize: 14,
    fontWeight: '500',
  },
  saveBtn: {
    backgroundColor: '#4F46E5',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
