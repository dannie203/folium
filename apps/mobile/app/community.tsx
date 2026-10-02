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
import { colors, typography, radius, spacing } from '../src/theme/tokens';
import {
  BookLibraryIcon,
  CloudDriveIcon,
  CommunityGlobeIcon,
  FoliumLeafIcon,
  CheckIcon,
  FolderIcon,
  ChevronLeftIcon,
} from '../src/components/icons/Icons';
import { useI18n } from '../src/i18n';

type CommunityTab = 'opds' | 'drive' | 'custom';

export default function CommunityBookshelfScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<CommunityTab>('opds');

  // OPDS State
  const [selectedCatalog, setSelectedCatalog] = useState<CommunityCatalogSource>(
    OFFICIAL_COMMUNITY_CATALOGS[0]
  );
  const [catalogBooks, setCatalogBooks] = useState<OpdsBookEntry[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
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

  useEffect(() => {
    if (activeTab === 'opds') {
      loadCatalog(selectedCatalog);
    }
  }, [selectedCatalog, activeTab]);

  const loadCatalog = async (source: CommunityCatalogSource) => {
    try {
      setIsLoadingCatalog(true);
      setCatalogError(null);
      const books = await fetchOpdsCatalog(source);
      setCatalogBooks(books);
    } catch (err: any) {
      console.warn('Failed to load OPDS catalog:', err);
      setCatalogBooks([]);
      setCatalogError(err?.message || t('community.errorLoadingCatalog'));
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
      alert(`${t('community.failedDownload')}: ${err.message}`);
    } finally {
      setImportingBookId(null);
    }
  };

  const handleScanDriveFolder = async () => {
    const folderId = extractDriveFolderId(driveFolderInput);
    if (!folderId) {
      alert(t('community.driveInvalidUrl'));
      return;
    }

    try {
      setIsScanningDrive(true);
      setDriveScanMessage(null);
      const books = await scanPublicFolderRecursive(folderId);
      setScannedDriveBooks(books);
      setDriveScanMessage(t('community.driveFoundCount', { count: books.length }));
    } catch (err: any) {
      setDriveScanMessage(t('community.driveScanError', { message: err.message }));
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
      alert(`${t('community.failedDownload')}: ${err.message}`);
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
      alert(t('community.errorBrowsingOpds', { message: err.message }));
    } finally {
      setIsFetchingCustom(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top Navigation Bar */}
      <View style={styles.navBar}>
        <TouchableOpacity
          style={styles.backBtn}
          activeOpacity={0.7}
          onPress={() => router.back()}
          accessibilityLabel={t('common.back')}
        >
          <ChevronLeftIcon size={18} color={colors.textPrimary} />
          <Text style={styles.backBtnText}>{t('community.backToLibrary')}</Text>
        </TouchableOpacity>

        <View style={styles.navCenter}>
          <Text style={styles.navTitle} numberOfLines={1}>
            {t('community.title')}
          </Text>
        </View>

        <View style={styles.navRight}>
          <FoliumLeafIcon size={20} color={colors.accentPrimary} />
        </View>
      </View>

      {/* Navigation Tab Bar */}
      <View style={styles.tabBarContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBar}
        >
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'opds' && styles.tabItemActive]}
            onPress={() => setActiveTab('opds')}
          >
            <BookLibraryIcon
              size={16}
              color={activeTab === 'opds' ? colors.accentPrimary : colors.textSecondary}
            />
            <Text style={[styles.tabText, activeTab === 'opds' && styles.tabTextActive]}>
              {t('community.tabOpds')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'drive' && styles.tabItemActive]}
            onPress={() => setActiveTab('drive')}
          >
            <CloudDriveIcon
              size={16}
              color={activeTab === 'drive' ? colors.accentPrimary : colors.textSecondary}
            />
            <Text style={[styles.tabText, activeTab === 'drive' && styles.tabTextActive]}>
              {t('community.tabDrive')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'custom' && styles.tabItemActive]}
            onPress={() => setActiveTab('custom')}
          >
            <CommunityGlobeIcon
              size={16}
              color={activeTab === 'custom' ? colors.accentPrimary : colors.textSecondary}
            />
            <Text style={[styles.tabText, activeTab === 'custom' && styles.tabTextActive]}>
              {t('community.tabCustom')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
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
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.catalogDesc}>{selectedCatalog.description}</Text>

            {isLoadingCatalog ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color={colors.accentPrimary} />
                <Text style={styles.loadingText}>{t('community.loadingCatalog')}</Text>
              </View>
            ) : catalogError ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateTitle}>{t('community.errorLoadingCatalog')}</Text>
                <Text style={styles.emptyStateText}>{catalogError}</Text>
              </View>
            ) : catalogBooks.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateTitle}>{t('community.emptyCatalog')}</Text>
                <Text style={styles.emptyStateText}>{t('community.emptyCatalogDesc')}</Text>
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
                          <FoliumLeafIcon size={24} color="rgba(255, 255, 255, 0.2)" />
                        </View>
                      )}
                      <View style={styles.bookMeta}>
                        <Text style={styles.bookTitle} numberOfLines={2}>
                          {b.title}
                        </Text>
                        <Text style={styles.bookAuthor} numberOfLines={1}>
                          {b.author}
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
                            <View style={styles.btnContentRow}>
                              {isImported && <CheckIcon size={14} color="#FFFFFF" />}
                              <Text style={styles.importBtnText}>
                                {isImported ? t('community.downloaded') : t('community.download')}
                              </Text>
                            </View>
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
              <View style={styles.driveHeaderTitleRow}>
                <FolderIcon size={20} color={colors.accentPrimary} />
                <Text style={styles.driveHeaderTitle}>{t('community.driveHeader')}</Text>
              </View>
              <Text style={styles.driveHeaderDesc}>
                {t('community.driveDesc')}
              </Text>

              <View style={styles.driveInputRow}>
                <TextInput
                  style={styles.driveInput}
                  value={driveFolderInput}
                  onChangeText={setDriveFolderInput}
                  placeholder={t('community.drivePlaceholder')}
                  placeholderTextColor={colors.textMuted}
                />
                <TouchableOpacity
                  style={[styles.scanBtn, isScanningDrive && styles.btnDisabled]}
                  onPress={handleScanDriveFolder}
                  disabled={isScanningDrive}
                >
                  {isScanningDrive ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.scanBtnText}>{t('community.scanDriveBtn')}</Text>
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
                  {t('community.driveFoundCount', { count: scannedDriveBooks.length })}
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
                          <Text style={styles.categoryBadge}>{b.categoryPath}</Text>
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
                          <View style={styles.btnContentRow}>
                            {isImported && <CheckIcon size={14} color="#FFFFFF" />}
                            <Text style={styles.addScannedBtnText}>
                              {isImported ? t('community.inLibrary') : t('community.addToLibrary')}
                            </Text>
                          </View>
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
              <View style={styles.driveHeaderTitleRow}>
                <CommunityGlobeIcon size={20} color={colors.accentPrimary} />
                <Text style={styles.customTitle}>{t('community.customHeader')}</Text>
              </View>
              <Text style={styles.customDesc}>
                {t('community.customDesc')}
              </Text>

              <View style={styles.driveInputRow}>
                <TextInput
                  style={styles.driveInput}
                  value={customOpdsUrl}
                  onChangeText={setCustomOpdsUrl}
                  placeholder={t('community.customUrlPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                />
                <TouchableOpacity
                  style={[styles.scanBtn, isFetchingCustom && styles.btnDisabled]}
                  onPress={handleFetchCustomOpds}
                  disabled={isFetchingCustom}
                >
                  {isFetchingCustom ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.scanBtnText}>{t('community.fetchCatalogBtn')}</Text>
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
                      <Text style={styles.bookAuthor}>{b.author}</Text>
                      <TouchableOpacity
                        style={styles.importBtn}
                        onPress={() => handleImportOpds(b)}
                      >
                        <Text style={styles.importBtnText}>{t('community.addToLibrary')}</Text>
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
    backgroundColor: colors.bgBase,
  },
  navBar: {
    minHeight: 56,
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
    color: colors.textPrimary,
    fontSize: typography.fontSize.titleMd,
    fontWeight: typography.fontWeight.semibold,
  },
  navRight: {
    width: 60,
    alignItems: 'flex-end',
  },
  tabBarContainer: {
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  tabBar: {
    flexDirection: 'row',
    minWidth: '100%',
  },
  tabItem: {
    flex: 1,
    minWidth: 130,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: colors.accentPrimary,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.medium,
  },
  tabTextActive: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  content: {
    padding: spacing.xl,
    maxWidth: 860,
    alignSelf: 'center',
    width: '100%',
  },
  catalogChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.md,
  },
  chip: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  chipActive: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.medium,
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: typography.fontWeight.bold,
  },
  catalogDesc: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.caption,
    marginBottom: spacing.lg,
    lineHeight: 18,
  },
  centerLoading: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.body,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  emptyStateTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.titleMd,
    fontWeight: typography.fontWeight.semibold,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  emptyStateText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.body,
    lineHeight: typography.lineHeight.body,
    textAlign: 'center',
  },
  bookList: {
    gap: 12,
  },
  bookCard: {
    flexDirection: 'row',
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: 14,
  },
  bookCover: {
    width: 70,
    height: 100,
    borderRadius: radius.sm,
    backgroundColor: colors.borderSubtle,
  },
  coverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E1B4B',
  },
  bookMeta: {
    flex: 1,
    justifyContent: 'center',
  },
  bookTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.titleMd,
    fontWeight: typography.fontWeight.bold,
    marginBottom: 4,
  },
  bookAuthor: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.caption,
    marginBottom: 6,
  },
  bookSummary: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.caption,
    lineHeight: 16,
    marginBottom: 10,
  },
  importBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentPrimary,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  importBtnDone: {
    backgroundColor: colors.statusSuccess,
  },
  btnContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  importBtnText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.semibold,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  driveSection: {
    gap: 16,
  },
  driveHeaderCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  driveHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  driveHeaderTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.titleMd,
    fontWeight: typography.fontWeight.bold,
  },
  driveHeaderDesc: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.caption,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  driveInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  driveInput: {
    flex: 1,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: typography.fontSize.caption,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  scanBtn: {
    backgroundColor: colors.statusSuccess,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  scanBtnText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.semibold,
  },
  scanFeedback: {
    color: colors.statusSuccess,
    fontSize: typography.fontSize.caption,
    marginTop: 10,
    fontWeight: typography.fontWeight.medium,
  },
  scannedList: {
    gap: 10,
  },
  scannedTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.bold,
  },
  scannedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  scannedMeta: {
    flex: 1,
    marginRight: 10,
  },
  scannedBookTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: 4,
  },
  scannedBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryBadge: {
    color: colors.accentPrimary,
    fontSize: typography.fontSize.micro,
    fontWeight: typography.fontWeight.medium,
  },
  formatBadge: {
    color: colors.textMuted,
    fontSize: typography.fontSize.micro,
  },
  addScannedBtn: {
    backgroundColor: colors.accentPrimary,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addScannedBtnText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.semibold,
  },
  customSection: {
    gap: 16,
  },
  customCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  customTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.titleMd,
    fontWeight: typography.fontWeight.bold,
  },
  customDesc: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.caption,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
});
