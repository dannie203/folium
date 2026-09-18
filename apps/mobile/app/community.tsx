import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import type { OpdsBookEntry, CommunityCatalogSource } from '@folium/shared';
import {
  OFFICIAL_COMMUNITY_CATALOGS,
  fetchOpdsCatalog,
  importOpdsBook,
  parseOpdsXml,
} from '../src/services/opdsService';
import {
  extractDriveFolderId,
  scanPublicFolderRecursive,
  importScannedDriveBook,
  type ScannedDriveBook,
} from '../src/services/publicDriveService';

type CommunityTab = 'opds' | 'drive' | 'custom';

export default function CommunityBookshelfScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<CommunityTab>('opds');

  // OPDS State
  const [selectedCatalog, setSelectedCatalog] = useState<CommunityCatalogSource>(
    OFFICIAL_COMMUNITY_CATALOGS[0]
  );
  const [catalogBooks, setCatalogBooks] = useState<OpdsBookEntry[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [importingBookId, setImportingBookId] = useState<string | null>(null);
  const [importedBookIds, setImportedBookIds] = useState<Set<string>>(new Set());

  // Google Drive Community State
  const [driveFolderInput, setDriveFolderInput] = useState('');
  const [isScanningDrive, setIsScanningDrive] = useState(false);
  const [scannedDriveBooks, setScannedDriveBooks] = useState<ScannedDriveBook[]>([]);
  const [driveScanMessage, setDriveScanMessage] = useState<string | null>(null);

  // Custom OPDS State
  const [customOpdsUrl, setCustomOpdsUrl] = useState('');
  const [isFetchingCustom, setIsFetchingCustom] = useState(false);
  const [customBooks, setCustomBooks] = useState<OpdsBookEntry[]>([]);

  // Load selected official catalog
  useEffect(() => {
    if (activeTab === 'opds') {
      loadCatalog(selectedCatalog);
    }
  }, [selectedCatalog, activeTab]);

  const loadCatalog = async (source: CommunityCatalogSource) => {
    try {
      setIsLoadingCatalog(true);
      const books = await fetchOpdsCatalog(source);
      setCatalogBooks(books);
    } catch (err: any) {
      console.warn('Failed to load OPDS catalog:', err);
    } finally {
      setIsLoadingCatalog(false);
    }
  };

  const handleImportOpds = async (entry: OpdsBookEntry) => {
    try {
      setImportingBookId(entry.id);
      await importOpdsBook(entry);
      setImportedBookIds((prev) => new Set(prev).add(entry.id));
    } catch (err: any) {
      alert(`Lỗi tải sách: ${err.message}`);
    } finally {
      setImportingBookId(null);
    }
  };

  const handleScanDriveFolder = async () => {
    const folderId = extractDriveFolderId(driveFolderInput);
    if (!folderId) {
      alert('Vui lòng nhập đường dẫn thư mục Google Drive hợp lệ (hoặc Folder ID).');
      return;
    }

    try {
      setIsScanningDrive(true);
      setDriveScanMessage(null);
      const books = await scanPublicFolderRecursive(folderId);
      setScannedDriveBooks(books);
      setDriveScanMessage(
        `🎉 Đã tìm thấy ${books.length} file sách trong các thư mục con lồng nhau!`
      );
    } catch (err: any) {
      setDriveScanMessage(`❌ Lỗi quét thư mục: ${err.message}`);
    } finally {
      setIsScanningDrive(false);
    }
  };

  const handleImportDriveBook = async (book: ScannedDriveBook) => {
    try {
      setImportingBookId(book.driveFileId);
      await importScannedDriveBook(book, false);
      setImportedBookIds((prev) => new Set(prev).add(book.driveFileId));
    } catch (err: any) {
      alert(`Lỗi thêm sách vào kệ: ${err.message}`);
    } finally {
      setImportingBookId(null);
    }
  };

  const handleFetchCustomOpds = async () => {
    const url = customOpdsUrl.trim();
    if (!url) return;

    try {
      setIsFetchingCustom(true);
      const resp = await fetch(url);
      const xml = await resp.text();
      const books = parseOpdsXml(xml, 'custom_opds');
      setCustomBooks(books);
    } catch (err: any) {
      alert(`Lỗi duyệt nguồn OPDS: ${err.message}`);
    } finally {
      setIsFetchingCustom(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Tủ Sách Cộng Đồng & OPDS', headerShown: true }} />

      {/* Navigation Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'opds' && styles.tabItemActive]}
          onPress={() => setActiveTab('opds')}
        >
          <Text style={[styles.tabText, activeTab === 'opds' && styles.tabTextActive]}>
            📚 Sách Công Quyền
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'drive' && styles.tabItemActive]}
          onPress={() => setActiveTab('drive')}
        >
          <Text style={[styles.tabText, activeTab === 'drive' && styles.tabTextActive]}>
            ☁️ Google Drive Chia Sẻ
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'custom' && styles.tabItemActive]}
          onPress={() => setActiveTab('custom')}
        >
          <Text style={[styles.tabText, activeTab === 'custom' && styles.tabTextActive]}>
            🔗 Nguồn OPDS Riêng
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* ================= TAB 1: OPDS PUBLIC DOMAIN ================= */}
        {activeTab === 'opds' && (
          <View>
            {/* Catalog Selector Chips */}
            <View style={styles.catalogChips}>
              {OFFICIAL_COMMUNITY_CATALOGS.map((cat) => {
                const isSelected = selectedCatalog.id === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.chip, isSelected && styles.chipActive]}
                    onPress={() => setSelectedCatalog(cat)}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                      {cat.icon} {cat.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.catalogDesc}>{selectedCatalog.description}</Text>

            {isLoadingCatalog ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color="#4F46E5" />
                <Text style={styles.loadingText}>Đang tải danh mục sách công quyền...</Text>
              </View>
            ) : (
              <View style={styles.bookList}>
                {catalogBooks.map((b) => {
                  const isImported = importedBookIds.has(b.id);
                  const isImporting = importingBookId === b.id;

                  return (
                    <View key={b.id} style={styles.bookCard}>
                      {b.coverUrl ? (
                        <Image source={{ uri: b.coverUrl }} style={styles.bookCover} />
                      ) : (
                        <View style={[styles.bookCover, styles.coverPlaceholder]}>
                          <Text style={styles.coverPlaceholderText}>📖</Text>
                        </View>
                      )}
                      <View style={styles.bookMeta}>
                        <Text style={styles.bookTitle} numberOfLines={2}>
                          {b.title}
                        </Text>
                        <Text style={styles.bookAuthor} numberOfLines={1}>
                          ✍️ {b.author}
                        </Text>
                        {b.summary ? (
                          <Text style={styles.bookSummary} numberOfLines={2}>
                            {b.summary}
                          </Text>
                        ) : null}

                        <TouchableOpacity
                          style={[
                            styles.importBtn,
                            isImported && styles.importBtnDone,
                            isImporting && styles.btnDisabled,
                          ]}
                          onPress={() => handleImportOpds(b)}
                          disabled={isImported || isImporting}
                        >
                          {isImporting ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <Text style={styles.importBtnText}>
                              {isImported ? '✓ Đã có trong kệ' : '+ Tải vào Thư Viện'}
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ================= TAB 2: GOOGLE DRIVE PUBLIC FOLDERS ================= */}
        {activeTab === 'drive' && (
          <View style={styles.driveSection}>
            <View style={styles.driveHeaderCard}>
              <Text style={styles.driveHeaderTitle}>📁 Kết Nối Folder Google Drive Cộng Đồng</Text>
              <Text style={styles.driveHeaderDesc}>
                Dán đường dẫn thư mục Google Drive do bạn bè hoặc cộng đồng chia sẻ. Folium sẽ quét
                đệ quy toàn bộ các thư mục con lồng nhau và tự động biến tên subfolder thành Thể loại /
                Kệ sách tương ứng!
              </Text>

              <View style={styles.driveInputRow}>
                <TextInput
                  style={styles.driveInput}
                  value={driveFolderInput}
                  onChangeText={setDriveFolderInput}
                  placeholder="https://drive.google.com/drive/folders/1ABC_XYZ... hoặc ID folder"
                  placeholderTextColor="#71717A"
                />
                <TouchableOpacity
                  style={[styles.scanBtn, isScanningDrive && styles.btnDisabled]}
                  onPress={handleScanDriveFolder}
                  disabled={isScanningDrive}
                >
                  {isScanningDrive ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.scanBtnText}>Quét Đệ Quy</Text>
                  )}
                </TouchableOpacity>
              </View>

              {driveScanMessage && (
                <Text style={styles.scanFeedback}>{driveScanMessage}</Text>
              )}
            </View>

            {/* Scanned Books List */}
            {scannedDriveBooks.length > 0 && (
              <View style={styles.scannedList}>
                <Text style={styles.scannedTitle}>
                  Tài liệu tìm thấy ({scannedDriveBooks.length} cuốn):
                </Text>
                {scannedDriveBooks.map((b) => {
                  const isImported = importedBookIds.has(b.driveFileId);
                  const isImporting = importingBookId === b.driveFileId;

                  return (
                    <View key={b.driveFileId} style={styles.scannedCard}>
                      <View style={styles.scannedMeta}>
                        <Text style={styles.scannedBookTitle} numberOfLines={1}>
                          {b.title}
                        </Text>
                        <View style={styles.scannedBadgeRow}>
                          <Text style={styles.categoryBadge}>🏷️ {b.categoryPath}</Text>
                          <Text style={styles.formatBadge}>
                            {b.format.toUpperCase()} • {(b.fileSize / 1024 / 1024).toFixed(1)} MB
                          </Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.addScannedBtn,
                          isImported && styles.importBtnDone,
                          isImporting && styles.btnDisabled,
                        ]}
                        onPress={() => handleImportDriveBook(b)}
                        disabled={isImported || isImporting}
                      >
                        {isImporting ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.addScannedBtnText}>
                            {isImported ? '✓ Đã Thêm' : '+ Thêm Kệ'}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ================= TAB 3: CUSTOM OPDS URL ================= */}
        {activeTab === 'custom' && (
          <View style={styles.customSection}>
            <View style={styles.customCard}>
              <Text style={styles.customTitle}>🔗 Nguồn Thư Viện OPDS Tùy Chỉnh</Text>
              <Text style={styles.customDesc}>
                Kết nối với máy chủ Calibre Content Server tại nhà hoặc bất kỳ feed catalog OPDS mở
                nào khác trên internet:
              </Text>

              <View style={styles.driveInputRow}>
                <TextInput
                  style={styles.driveInput}
                  value={customOpdsUrl}
                  onChangeText={setCustomOpdsUrl}
                  placeholder="https://my-calibre-server.org/opds"
                  placeholderTextColor="#71717A"
                />
                <TouchableOpacity
                  style={[styles.scanBtn, isFetchingCustom && styles.btnDisabled]}
                  onPress={handleFetchCustomOpds}
                  disabled={isFetchingCustom}
                >
                  {isFetchingCustom ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.scanBtnText}>Duyệt Feed</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {customBooks.length > 0 && (
              <View style={styles.bookList}>
                {customBooks.map((b) => (
                  <View key={b.id} style={styles.bookCard}>
                    <View style={styles.bookMeta}>
                      <Text style={styles.bookTitle}>{b.title}</Text>
                      <Text style={styles.bookAuthor}>✍️ {b.author}</Text>
                      <TouchableOpacity
                        style={styles.importBtn}
                        onPress={() => handleImportOpds(b)}
                      >
                        <Text style={styles.importBtnText}>+ Thêm vào Kệ Sách</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090B',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#18181B',
    borderBottomWidth: 1,
    borderBottomColor: '#27272A',
  },
  tabItem: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: '#4F46E5',
  },
  tabText: {
    color: '#71717A',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#FAFAFA',
  },
  content: {
    padding: 16,
    maxWidth: 800,
    alignSelf: 'center',
    width: '100%',
  },
  catalogChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    backgroundColor: '#18181B',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  chipActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#6366F1',
  },
  chipText: {
    color: '#A1A1AA',
    fontSize: 13,
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  catalogDesc: {
    color: '#71717A',
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  centerLoading: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#A1A1AA',
    fontSize: 14,
  },
  bookList: {
    gap: 12,
  },
  bookCard: {
    flexDirection: 'row',
    backgroundColor: '#18181B',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 12,
  },
  bookCover: {
    width: 70,
    height: 100,
    borderRadius: 6,
    backgroundColor: '#27272A',
  },
  coverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverPlaceholderText: {
    fontSize: 28,
  },
  bookMeta: {
    flex: 1,
    justifyContent: 'center',
  },
  bookTitle: {
    color: '#FAFAFA',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  bookAuthor: {
    color: '#818CF8',
    fontSize: 13,
    marginBottom: 6,
  },
  bookSummary: {
    color: '#A1A1AA',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 10,
  },
  importBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#4F46E5',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  importBtnDone: {
    backgroundColor: '#10B981',
  },
  importBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  driveSection: {
    gap: 16,
  },
  driveHeaderCard: {
    backgroundColor: '#18181B',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  driveHeaderTitle: {
    color: '#FAFAFA',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  driveHeaderDesc: {
    color: '#A1A1AA',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  driveInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  driveInput: {
    flex: 1,
    backgroundColor: '#27272A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FAFAFA',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  scanBtn: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  scanBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  scanFeedback: {
    color: '#34D399',
    fontSize: 13,
    marginTop: 10,
    fontWeight: '500',
  },
  scannedList: {
    gap: 10,
  },
  scannedTitle: {
    color: '#FAFAFA',
    fontSize: 14,
    fontWeight: '700',
  },
  scannedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#18181B',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  scannedMeta: {
    flex: 1,
    marginRight: 10,
  },
  scannedBookTitle: {
    color: '#FAFAFA',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  scannedBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryBadge: {
    color: '#A78BFA',
    fontSize: 11,
    fontWeight: '500',
  },
  formatBadge: {
    color: '#71717A',
    fontSize: 11,
  },
  addScannedBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addScannedBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  customSection: {
    gap: 16,
  },
  customCard: {
    backgroundColor: '#18181B',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  customTitle: {
    color: '#FAFAFA',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  customDesc: {
    color: '#A1A1AA',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
});
