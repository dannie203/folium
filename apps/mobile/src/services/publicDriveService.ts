import { Platform } from 'react-native';
import type { Book } from '@folium/shared';
import { getCurrentUser } from './authService';
import { getDatabase } from '../db';
import { generateUUID } from './bookService';
import { saveWebBook, saveBookFile, saveBookBuffer } from './storage';
import { validateBookBytes } from './fileValidator';
import { queueMutation, triggerDebouncedSync } from './syncService';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

export interface ScannedDriveBook {
  driveFileId: string;
  title: string;
  format: 'epub' | 'pdf';
  fileSize: number;
  categoryPath: string; // e.g. "Văn Học / Nam Cao"
  mimeType: string;
}

/**
 * Extract folder ID from Google Drive folder share link or raw ID.
 */
export function extractDriveFolderId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Regex matching Google Drive folder links
  const match = trimmed.match(/folders\/([a-zA-Z0-9_-]+)/i);
  if (match && match[1]) {
    return match[1];
  }

  // If already a raw 20+ char alphanumeric ID
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Recursively scan a Google Drive folder and its nested subfolders.
 * Deep folder hierarchies are transformed into category paths (Folder-as-a-Shelf).
 */
export async function scanPublicFolderRecursive(
  folderId: string,
  parentPath = '',
  customToken?: string
): Promise<ScannedDriveBook[]> {
  const user = getCurrentUser();
  const token = customToken || user?.accessToken;

  // Community scans must use a real Google access token; never fabricate results.
  if (!token || token.startsWith('demo_')) {
    throw new Error('Cần đăng nhập Google thật để quét thư mục cộng đồng.');
  }

  const results: ScannedDriveBook[] = [];
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const url = `${DRIVE_API_BASE}/files?q=${query}&fields=files(id, name, mimeType, size)`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Lỗi quét thư mục Drive (${response.status}): ${response.statusText}`);
  }

  const data = await response.json();
  const items: any[] = data.files || [];

  for (const item of items) {
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      // RECURSIVE: Traverse deeper into subfolder
      const subPath = parentPath ? `${parentPath} / ${item.name}` : item.name;
      const subBooks = await scanPublicFolderRecursive(item.id, subPath, token);
      results.push(...subBooks);
    } else if (
      item.name.toLowerCase().endsWith('.epub') ||
      item.name.toLowerCase().endsWith('.pdf') ||
      item.mimeType === 'application/epub+zip' ||
      item.mimeType === 'application/pdf'
    ) {
      const format = item.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'epub';
      results.push({
        driveFileId: item.id,
        title: item.name.replace(/\.(epub|pdf)$/i, '').trim(),
        format,
        fileSize: parseInt(item.size || '0', 10),
        categoryPath: parentPath || 'Chưa Xếp Kệ',
        mimeType: item.mimeType,
      });
    }
  }

  return results;
}

/**
 * Import a scanned Google Drive book into the local library.
 * Supports On-Demand Lazy Download: registers metadata & shelf, downloading binary on-demand.
 */
export async function importScannedDriveBook(
  scanned: ScannedDriveBook,
  downloadImmediately = false
): Promise<Book> {
  const db = await getDatabase();

  // Check if book already exists
  const existing = await db.getFirstAsync<Book>(
    'SELECT * FROM books WHERE drive_file_id = ? AND is_deleted = 0',
    [scanned.driveFileId]
  );
  if (existing) {
    return existing;
  }

  const bookId = generateUUID();
  const now = Date.now();
  let localPath: string = `drive://${scanned.driveFileId}`;

  // If immediate download requested
  if (downloadImmediately) {
    const user = getCurrentUser();
    if (user && !user.accessToken.startsWith('demo_')) {
      const downloadUrl = `${DRIVE_API_BASE}/files/${scanned.driveFileId}?alt=media`;
      const resp = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });
      if (resp.ok) {
        const buffer = await resp.arrayBuffer();
        validateBookBytes(buffer, scanned.format);
        if (Platform.OS === 'web') {
          await saveWebBook(bookId, buffer);
          localPath = `indexeddb://${bookId}`;
        } else {
          const blob = new Blob([buffer]);
          const blobUrl = URL.createObjectURL(blob);
          localPath = await saveBookFile(bookId, blobUrl, scanned.format);
        }
      }
    }
  }

  const newBook: Book = {
    id: bookId,
    title: scanned.title,
    author: 'Google Drive Community',
    cover_url: null,
    file_type: scanned.format,
    file_size: scanned.fileSize,
    local_path: localPath,
    drive_file_id: scanned.driveFileId,
    locations_cache: null,
    shelf: scanned.categoryPath || 'Inbox',
    tags: [scanned.categoryPath],
    created_at: now,
    updated_at: now,
  };

  await db.runAsync(
    `INSERT INTO books (id, title, author, cover_url, file_type, file_size, local_path, drive_file_id, locations_cache, created_at, updated_at, shelf, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newBook.id,
      newBook.title,
      newBook.author,
      newBook.cover_url ?? null,
      newBook.file_type,
      newBook.file_size,
      newBook.local_path ?? null,
      newBook.drive_file_id ?? null,
      newBook.locations_cache ?? null,
      newBook.created_at,
      newBook.updated_at,
      newBook.shelf ?? 'Inbox',
      scanned.categoryPath,
    ]
  );

  await queueMutation('book', newBook.id, newBook);
  triggerDebouncedSync(5000);

  return newBook;
}

/**
 * On-demand download and cache of a Google Drive book (resolves lazy `drive://` paths).
 * Validates bytes via Storage Armor, stores in IndexedDB (Web) or local filesystem (Native),
 * updates local SQLite record, and returns the resolved buffer/path.
 */
export async function downloadAndCacheDriveBook(book: Book): Promise<{ buffer?: ArrayBuffer; localPath: string }> {
  const driveFileId = book.drive_file_id || (book.local_path?.startsWith('drive://') ? book.local_path.replace('drive://', '') : null);
  if (!driveFileId) {
    throw new Error('Không tìm thấy Google Drive File ID cho sách này.');
  }

  const user = getCurrentUser();
  if (!user || user.accessToken.startsWith('demo_')) {
    throw new Error('Cần đăng nhập Google thật để tải sách từ Google Drive.');
  }

  const downloadUrl = `${DRIVE_API_BASE}/files/${driveFileId}?alt=media`;
  const resp = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${user.accessToken}` },
  });

  if (!resp.ok) {
    throw new Error(`Lỗi tải sách từ Google Drive (${resp.status}): ${resp.statusText}`);
  }

  const buffer = await resp.arrayBuffer();
  validateBookBytes(buffer, book.file_type);

  const newLocalPath = await saveBookBuffer(book.id, buffer, book.file_type);

  const db = await getDatabase();
  await db.runAsync('UPDATE books SET local_path = ? WHERE id = ?', [
    newLocalPath,
    book.id,
  ]);

  return { buffer, localPath: newLocalPath };
}

