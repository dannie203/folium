import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import type { DriveFileMetadata, DriveSyncResult, Book } from '@folium/shared';
import { getCurrentUser } from './authService';
import { getDatabase } from '../db';
import { getWebBook, saveWebBook, saveBookFile } from './storage';
import { deleteBook } from './bookService';
import { validateBookBytes } from './fileValidator';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const FOLIUM_FOLDER_NAME = 'Folium';

let cachedFolder: { userId: string; folderId: string } | null = null;

/**
 * Invalidate in-memory folder cache (called on signOut).
 */
export function clearGoogleDriveCache(): void {
  cachedFolder = null;
}

/**
 * Get or create the dedicated /Folium folder in the user's Google Drive.
 */
export async function getOrCreateFoliumFolder(): Promise<string> {
  const user = getCurrentUser();
  if (!user) throw new Error('Not signed in to Google Drive.');

  if (cachedFolder && cachedFolder.userId === user.id) {
    return cachedFolder.folderId;
  }

  // Demo fallback
  if (user.accessToken.startsWith('demo_')) {
    cachedFolder = { userId: user.id, folderId: 'demo-folium-folder-id' };
    return cachedFolder.folderId;
  }

  // 1. Search for existing folder
  const query = encodeURIComponent(
    `name = '${FOLIUM_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const searchResp = await fetch(`${DRIVE_API_BASE}/files?q=${query}&fields=files(id, name)`, {
    headers: { Authorization: `Bearer ${user.accessToken}` },
  });

  if (!searchResp.ok) {
    throw new Error(`Google Drive folder search failed: ${searchResp.statusText}`);
  }

  const searchData = await searchResp.json();
  if (searchData.files && searchData.files.length > 0) {
    cachedFolder = { userId: user.id, folderId: searchData.files[0].id };
    return cachedFolder.folderId;
  }

  // 2. Create new Folium folder
  const createResp = await fetch(`${DRIVE_API_BASE}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${user.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: FOLIUM_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Folium E-Reader synced library folder',
    }),
  });

  if (!createResp.ok) {
    throw new Error('Failed to create /Folium folder on Google Drive.');
  }

  const createData = await createResp.json();
  cachedFolder = { userId: user.id, folderId: createData.id };
  return cachedFolder.folderId;
}

/**
 * Get or create a shelf subfolder inside the /Folium folder (e.g. /Folium/Văn Học).
 */
export async function getOrCreateShelfSubfolder(shelfName: string): Promise<string> {
  const user = getCurrentUser();
  if (!user) throw new Error('Not signed in to Google Drive.');

  if (user.accessToken.startsWith('demo_')) {
    return `demo_folder_${shelfName}`;
  }

  const rootFolderId = await getOrCreateFoliumFolder();
  const safeName = shelfName.replace(/'/g, "\\'");
  const query = encodeURIComponent(
    `'${rootFolderId}' in parents and name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );

  const searchResp = await fetch(`${DRIVE_API_BASE}/files?q=${query}&fields=files(id, name)`, {
    headers: { Authorization: `Bearer ${user.accessToken}` },
  });

  if (searchResp.ok) {
    const data = await searchResp.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
  }

  // Create subfolder
  const createResp = await fetch(`${DRIVE_API_BASE}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${user.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: shelfName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootFolderId],
    }),
  });

  if (!createResp.ok) {
    throw new Error(`Failed to create shelf folder /Folium/${shelfName} on Google Drive.`);
  }

  const newFolder = await createResp.json();
  return newFolder.id;
}

/**
 * Upload a book binary file to the user's /Folium folder on Google Drive.
 */
export async function uploadBookToDrive(book: Book): Promise<string> {
  const user = getCurrentUser();
  if (!user) throw new Error('Please sign in to Google Drive.');

  // Demo fallback
  if (user.accessToken.startsWith('demo_')) {
    const mockDriveId = `demo_drive_${book.id.substring(0, 8)}`;
    const db = await getDatabase();
    await db.runAsync('UPDATE books SET drive_file_id = ? WHERE id = ?', [mockDriveId, book.id]);
    return mockDriveId;
  }

  const rootFolderId = await getOrCreateFoliumFolder();
  let targetFolderId = rootFolderId;
  if (book.shelf && book.shelf !== 'Inbox') {
    try {
      targetFolderId = await getOrCreateShelfSubfolder(book.shelf);
    } catch {
      targetFolderId = rootFolderId;
    }
  }

  // Opaque UUID filename `${book.id}.${book.file_type}` is used on Drive storage
  // to index book files by unique identifier rather than arbitrary local file names.
  const filename = `${book.id}.${book.file_type}`;
  const mimeType = book.file_type === 'pdf' ? 'application/pdf' : 'application/epub+zip';

  // Read binary data
  let fileBuffer: ArrayBuffer;
  if (Platform.OS === 'web') {
    const webData = await getWebBook(book.id);
    if (!webData) throw new Error(`Book data for ${book.title} not found in IndexedDB.`);
    fileBuffer = webData;
  } else {
    if (!book.local_path) throw new Error(`Invalid file path for: ${book.title}`);
    const base64 = await FileSystem.readAsStringAsync(book.local_path, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const binaryStr = atob(base64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    fileBuffer = bytes.buffer;
  }

  // Pre-flight Storage Armor check before uploading to Google Drive
  validateBookBytes(fileBuffer, book.file_type);

  // Construct multipart/related upload payload
  const metadata = {
    name: filename,
    parents: [targetFolderId],
    appProperties: {
      foliumBookId: book.id,
      foliumFormat: book.file_type,
      foliumShelf: book.shelf || 'Inbox',
      foliumTitle: book.title,
    },
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metaPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
  const mediaHeader = `${delimiter}Content-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n`;

  // Convert buffer to base64
  let fileBase64 = '';
  const bytes = new Uint8Array(fileBuffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    fileBase64 += String.fromCharCode(bytes[i]);
  }
  fileBase64 = btoa(fileBase64);

  const requestBody = `${metaPart}${mediaHeader}${fileBase64}${closeDelimiter}`;

  const uploadResp = await fetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,size`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: requestBody,
    }
  );

  if (!uploadResp.ok) {
    const errorText = await uploadResp.text();
    throw new Error(`Lỗi tải file lên Drive (${uploadResp.status}): ${errorText}`);
  }

  const uploadResult = await uploadResp.json();
  const driveFileId = uploadResult.id;

  // Update local SQLite record
  const db = await getDatabase();
  await db.runAsync('UPDATE books SET drive_file_id = ?, updated_at = ? WHERE id = ?', [
    driveFileId,
    Date.now(),
    book.id,
  ]);

  return driveFileId;
}

/**
 * Move a book file on Google Drive to Trash (Soft delete, recoverable for 30 days).
 */
export async function trashDriveBook(driveFileId: string): Promise<boolean> {
  const user = getCurrentUser();
  if (!user) return false;

  if (user.accessToken.startsWith('demo_')) {
    return true;
  }

  try {
    const resp = await fetch(`${DRIVE_API_BASE}/files/${driveFileId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trashed: true }),
    });

    if (resp.status === 404) {
      return true;
    }

    return resp.ok;
  } catch (err) {
    console.warn('[GoogleDriveService] Failed to trash file on Drive:', err);
    return false;
  }
}

/**
 * List files in the Google Drive /Folium folder (including nested shelf subfolders).
 */
export async function listDriveBooks(): Promise<DriveFileMetadata[]> {
  const user = getCurrentUser();
  if (!user) return [];

  // Demo fallback
  if (user.accessToken.startsWith('demo_')) {
    return [
      {
        id: 'demo_drive_cloud_001',
        name: 'Tuổi Thơ Dữ Dội.epub',
        size: 1548291,
        mimeType: 'application/epub+zip',
        modifiedTime: new Date().toISOString(),
        foliumBookId: 'demo-cloud-book-001',
        shelf: 'Văn Học',
      },
    ];
  }

  const rootFolderId = await getOrCreateFoliumFolder();
  const results: DriveFileMetadata[] = [];
  const visitedFolders = new Set<string>();
  const fields = 'nextPageToken,files(id,name,size,mimeType,modifiedTime,appProperties)';

  const scanFolder = async (folderId: string, fallbackShelf: string): Promise<void> => {
    if (visitedFolders.has(folderId)) return;
    visitedFolders.add(folderId);

    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false`,
        fields,
        pageSize: '1000',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const response = await fetch(`${DRIVE_API_BASE}/files?${params.toString()}`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });

      if (!response.ok) {
        throw new Error(`Lỗi duyệt danh sách file Drive: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        nextPageToken?: string;
        files?: Array<{
          id: string;
          name: string;
          size?: string;
          mimeType: string;
          modifiedTime?: string;
          appProperties?: Record<string, string>;
        }>;
      };

      for (const item of data.files || []) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          await scanFolder(item.id, item.name);
          continue;
        }

        results.push({
          id: item.id,
          name: item.name,
          size: parseInt(item.size || '0', 10),
          mimeType: item.mimeType,
          modifiedTime: item.modifiedTime || '',
          foliumBookId: item.appProperties?.foliumBookId,
          shelf: item.appProperties?.foliumShelf || fallbackShelf,
          foliumTitle: item.appProperties?.foliumTitle,
        });
      }

      pageToken = data.nextPageToken;
    } while (pageToken);
  };

  await scanFolder(rootFolderId, 'Inbox');

  return results;
}

/**
 * Download a book file from Google Drive into local storage.
 */
export async function downloadBookFromDrive(
  driveFile: DriveFileMetadata
): Promise<string> {
  const user = getCurrentUser();
  if (!user) throw new Error('Chưa đăng nhập Google Drive.');

  const format = driveFile.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'epub';
  const bookId = driveFile.foliumBookId || `drive_${driveFile.id.substring(0, 12)}`;

  if (user.accessToken.startsWith('demo_')) {
    // Return mock uri for demo
    return `indexeddb://${bookId}`;
  }

  const downloadUrl = `${DRIVE_API_BASE}/files/${driveFile.id}?alt=media`;
  const resp = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${user.accessToken}` },
  });

  if (!resp.ok) {
    throw new Error(`Không thể tải sách từ Google Drive: ${resp.statusText}`);
  }

  const arrayBuf = await resp.arrayBuffer();

  // Validate downloaded book bytes before saving to disk/IndexedDB
  validateBookBytes(arrayBuf, format);

  if (Platform.OS === 'web') {
    await saveWebBook(bookId, arrayBuf);
    return `indexeddb://${bookId}`;
  } else {
    const blob = new Blob([arrayBuf]);
    const blobUrl = URL.createObjectURL(blob);
    return await saveBookFile(bookId, blobUrl, format);
  }
}

/**
 * Two-way sync books between local SQLite and Google Drive.
 */
export async function syncWithGoogleDrive(): Promise<DriveSyncResult> {
  const result: DriveSyncResult = {
    uploadedCount: 0,
    downloadedCount: 0,
    syncedCount: 0,
    errors: [],
  };

  const user = getCurrentUser();
  if (!user) {
    result.errors.push('Chưa đăng nhập tài khoản Google.');
    return result;
  }

  try {
    const db = await getDatabase();
    const localBooks = await db.getAllAsync<Book>(
      'SELECT * FROM books WHERE is_deleted = 0'
    );

    // 1. Upload local books that haven't been backed up to Drive
    for (const book of localBooks) {
      if (!book.drive_file_id) {
        try {
          await uploadBookToDrive(book);
          result.uploadedCount++;
        } catch (err: any) {
          result.errors.push(`Lỗi tải lên ${book.title}: ${err.message}`);
        }
      } else {
        result.syncedCount++;
      }
    }

    // 2. Discover remote books on Drive not yet present locally
    const driveFiles = await listDriveBooks();
    for (const driveFile of driveFiles) {
      const existsLocally = localBooks.some(
        (b) => b.drive_file_id === driveFile.id || (driveFile.foliumBookId && b.id === driveFile.foliumBookId)
      );

      if (!existsLocally) {
        try {
          const localPath = await downloadBookFromDrive(driveFile);
          const title = driveFile.foliumTitle || driveFile.name.replace(/\.(epub|pdf)$/i, '');
          const format = driveFile.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'epub';
          const newId = driveFile.foliumBookId || `drive_${driveFile.id.substring(0, 12)}`;
          const now = Date.now();

          await db.runAsync(
            `INSERT INTO books (id, title, author, cover_url, file_type, file_size, local_path, drive_file_id, locations_cache, shelf, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              newId,
              title,
              'Google Drive Backup',
              null,
              format,
              driveFile.size,
              localPath,
              driveFile.id,
              null,
              driveFile.shelf || 'Inbox',
              now,
              now,
            ]
          );
          result.downloadedCount++;
        } catch (err: any) {
          result.errors.push(`Lỗi tải về ${driveFile.name}: ${err.message}`);
        }
      }
    }

    // 3. Reconcile deletions: detect books deleted/trashed on Google Drive and remove locally
    const driveFileIdSet = new Set(driveFiles.map((f) => f.id));
    const driveFoliumBookIdSet = new Set(
      driveFiles.filter((f) => f.foliumBookId).map((f) => f.foliumBookId!)
    );

    for (const book of localBooks) {
      if (book.drive_file_id) {
        const existsInDrive =
          driveFileIdSet.has(book.drive_file_id) || driveFoliumBookIdSet.has(book.id);

        if (!existsInDrive) {
          console.log(
            `[GoogleDriveService] Book "${book.title}" (${book.id}) was deleted in Google Drive. Removing locally.`
          );
          try {
            await deleteBook(book.id, { skipDriveTrash: true });
            result.deletedCount = (result.deletedCount || 0) + 1;
          } catch (err: any) {
            result.errors.push(
              `Lỗi xoá sách "${book.title}" sau khi phát hiện xoá trên Drive: ${err.message}`
            );
          }
        }
      }
    }
  } catch (err: any) {
    result.errors.push(`Lỗi tổng hợp đồng bộ Drive: ${err.message}`);
  }

  return result;
}
