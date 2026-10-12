import * as DocumentPicker from 'expo-document-picker';
import type { Book, BookFormat } from '@folium/shared';
import { getDatabase } from '../db';
import { saveBookFile, deleteBookFile } from './storage';
import { queueMutation, triggerDebouncedSync } from './syncService';
import { validateBookUri } from './fileValidator';
import { getCurrentUser } from './authService';
import { generateUUID } from '../utils/uuid';

export { generateUUID };

export interface BookWithProgress extends Book {
  progress_percentage: number;
  last_cfi?: string | null;
}

export type DriveTrashHandler = (driveFileId: string) => Promise<void>;
let driveTrashHandler: DriveTrashHandler | null = null;

export function setDriveTrashHandler(handler: DriveTrashHandler | null): void {
  driveTrashHandler = handler;
}

/**
 * Parse a human-friendly title and author from a filename.
 */
function parseBookMetadata(filename: string): { title: string; author: string; format: BookFormat } {
  const clean = filename.replace(/\.(epub|pdf)$/i, '').trim();
  const ext = filename.toLowerCase().endsWith('.pdf') ? 'pdf' : 'epub';

  if (clean.includes(' - ')) {
    const parts = clean.split(' - ');
    return {
      author: parts[0].trim(),
      title: parts.slice(1).join(' - ').trim(),
      format: ext,
    };
  }

  return {
    title: clean,
    author: 'Unknown author',
    format: ext,
  };
}

/**
 * Open native / web file picker and import EPUB or PDF into Folium library.
 */
export async function importBookFromPicker(): Promise<BookWithProgress | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'application/epub+zip',
      'application/pdf',
      'application/x-zip-compressed',
      'application/octet-stream',
    ],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const filename = asset.name;
  const isEpub = filename.toLowerCase().endsWith('.epub');
  const isPdf = filename.toLowerCase().endsWith('.pdf');

  if (!isEpub && !isPdf) {
    throw new Error('Unsupported format. Please choose an .epub or .pdf file.');
  }

  const { title, author, format } = parseBookMetadata(filename);
  const bookId = generateUUID();
  const now = Date.now();
  const currentUser = getCurrentUser();
  const userId = currentUser && !currentUser.accessToken.startsWith('demo_') ? currentUser.id : (currentUser?.id || null);

  await validateBookUri(asset.uri, format);

  // Save book file into app's persistent storage
  const localPath = await saveBookFile(bookId, asset.uri, format);

  const newBook: Book = {
    id: bookId,
    user_id: userId || undefined,
    title,
    author,
    cover_url: null,
    file_type: format,
    file_size: asset.size || 0,
    local_path: localPath,
    drive_file_id: null,
    locations_cache: null,
    shelf: 'Inbox',
    tags: [],
    created_at: now,
    updated_at: now,
  };

  // Insert into local SQLite and queue mutation atomically
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO books (id, user_id, title, author, cover_url, file_type, file_size, local_path, drive_file_id, locations_cache, created_at, updated_at, shelf, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newBook.id,
        userId,
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
        newBook.tags ? newBook.tags.join(',') : '',
      ]
    );

    // Queue for cloud sync
    await queueMutation('book', newBook.id, newBook);
  });

  triggerDebouncedSync(30000);

  return {
    ...newBook,
    progress_percentage: 0,
    last_cfi: null,
  };
}

/**
 * Fetch all books from local SQLite with their reading progress.
 */
export async function getBooksWithProgress(): Promise<BookWithProgress[]> {
  const db = await getDatabase();
  const currentUser = getCurrentUser();
  const userId = currentUser && !currentUser.accessToken.startsWith('demo_') ? currentUser.id : (currentUser?.id || null);
  const sql = userId
    ? `SELECT b.*, COALESCE(p.percentage, 0) as progress_percentage, p.cfi as last_cfi
       FROM books b
       LEFT JOIN reading_progress p ON b.id = p.book_id AND p.is_deleted = 0
       WHERE b.is_deleted = 0 AND (b.user_id = ? OR b.user_id IS NULL)
       ORDER BY b.updated_at DESC`
    : `SELECT b.*, COALESCE(p.percentage, 0) as progress_percentage, p.cfi as last_cfi
       FROM books b
       LEFT JOIN reading_progress p ON b.id = p.book_id AND p.is_deleted = 0
       WHERE b.is_deleted = 0 AND b.user_id IS NULL
       ORDER BY b.updated_at DESC`;
  const params = userId ? [userId] : [];
  const rows = await db.getAllAsync<any>(sql, params);

  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id || undefined,
    title: r.title,
    author: r.author,
    cover_url: r.cover_url,
    file_type: r.file_type as BookFormat,
    file_size: r.file_size,
    local_path: r.local_path,
    drive_file_id: r.drive_file_id,
    locations_cache: r.locations_cache,
    shelf: r.shelf || 'Inbox',
    tags: r.tags ? (typeof r.tags === 'string' ? r.tags.split(',').filter(Boolean) : r.tags) : [],
    created_at: r.created_at,
    updated_at: r.updated_at,
    progress_percentage: r.progress_percentage || 0,
    last_cfi: r.last_cfi,
  }));
}

/**
 * Update a book's metadata (title, author, cover, shelf, tags).
 */
export async function updateBookMetadata(
  bookId: string,
  updates: {
    title?: string;
    author?: string;
    cover_url?: string | null;
    shelf?: string | null;
    tags?: string[];
  }
): Promise<void> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<Book>('SELECT * FROM books WHERE id = ?', [bookId]);
  if (!existing) throw new Error('Book not found.');

  const title = updates.title ?? existing.title;
  const author = updates.author ?? existing.author;
  const cover_url = updates.cover_url !== undefined ? updates.cover_url : existing.cover_url;
  const shelf = updates.shelf !== undefined ? updates.shelf : existing.shelf;
  const rawExistingTags = existing.tags as unknown;
  const existingTags = typeof rawExistingTags === 'string'
    ? (rawExistingTags as string).split(',').filter(Boolean)
    : (Array.isArray(rawExistingTags) ? (rawExistingTags as string[]) : []);
  const tags = updates.tags !== undefined ? updates.tags : existingTags;
  const tagsStr = Array.isArray(tags) ? tags.join(',') : '';
  const now = Date.now();

  const updatedBook: Book = {
    ...existing,
    title,
    author,
    cover_url,
    shelf,
    tags: Array.isArray(tags) ? tags : [],
    updated_at: now,
  };

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE books SET title = ?, author = ?, cover_url = ?, shelf = ?, tags = ?, updated_at = ? WHERE id = ?`,
      [title, author, cover_url ?? null, shelf ?? 'Inbox', tagsStr, now, bookId]
    );

    await queueMutation('book', bookId, updatedBook);
  });

  triggerDebouncedSync(5000);
}

/**
 * Get distinct shelves currently in use.
 */
export async function getAvailableShelves(): Promise<string[]> {
  const db = await getDatabase();
  const currentUser = getCurrentUser();
  const userId = currentUser && !currentUser.accessToken.startsWith('demo_') ? currentUser.id : (currentUser?.id || null);
  const sql = userId
    ? 'SELECT DISTINCT shelf FROM books WHERE is_deleted = 0 AND (user_id = ? OR user_id IS NULL)'
    : 'SELECT DISTINCT shelf FROM books WHERE is_deleted = 0 AND user_id IS NULL';
  const params = userId ? [userId] : [];
  const rows = await db.getAllAsync<{ shelf: string | null }>(sql, params);
  const set = new Set<string>(['Inbox']);
  for (const r of rows) {
    if (r.shelf && r.shelf.trim()) {
      set.add(r.shelf.trim());
    }
  }
  return Array.from(set);
}

/**
 * Delete a book from local disk and SQLite database.
 */
export async function deleteBook(
  bookId: string,
  options?: { skipDriveTrash?: boolean }
): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();

  const book = await db.getFirstAsync<{
    local_path: string | null;
    title?: string;
    author?: string;
    file_type?: string;
    file_size?: number;
    drive_file_id?: string | null;
    updated_at?: number;
    user_id?: string | null;
  }>('SELECT local_path, title, author, file_type, file_size, drive_file_id, updated_at, user_id FROM books WHERE id = ?', [bookId]);

  const progressRows = await db.getAllAsync<{ id: string; book_id: string }>(
    'SELECT id, book_id FROM reading_progress WHERE book_id = ?',
    [bookId]
  );
  const bookmarkRows = await db.getAllAsync<{ id: string; book_id: string }>(
    'SELECT id, book_id FROM bookmarks WHERE book_id = ?',
    [bookId]
  );
  const highlightRows = await db.getAllAsync<{ id: string; book_id: string }>(
    'SELECT id, book_id FROM highlights WHERE book_id = ?',
    [bookId]
  );
  const noteRows = await db.getAllAsync<{ id: string; book_id: string }>(
    'SELECT id, book_id FROM notes WHERE book_id = ?',
    [bookId]
  );

  // Soft delete records in SQLite with LWW clock advance and queue outbox mutations atomically
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE reading_progress SET is_deleted = 1, client_updated_at = ? WHERE book_id = ?', [now, bookId]);
    await db.runAsync('UPDATE bookmarks SET is_deleted = 1 WHERE book_id = ?', [bookId]);
    await db.runAsync('UPDATE highlights SET is_deleted = 1 WHERE book_id = ?', [bookId]);
    await db.runAsync('UPDATE notes SET is_deleted = 1 WHERE book_id = ?', [bookId]);
    await db.runAsync(
      'UPDATE books SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ? AND ? >= updated_at',
      [now, now, bookId, now]
    );

    // Track deletion in sync_outbox with explicit logical timestamps
    await queueMutation('book', bookId, {
      id: bookId,
      user_id: book?.user_id || undefined,
      title: book?.title || 'Untitled',
      author: book?.author || 'Unknown',
      file_type: book?.file_type || 'epub',
      file_size: book?.file_size || 0,
      is_deleted: true,
      deleted_at: now,
      updated_at: now,
      client_updated_at: now,
    });
    for (const row of progressRows) {
      await queueMutation('progress', row.id, {
        id: row.id,
        book_id: row.book_id,
        is_deleted: true,
        client_updated_at: now,
        deleted_at: now,
      });
    }
    for (const row of bookmarkRows) {
      await queueMutation('bookmark', row.id, {
        id: row.id,
        book_id: row.book_id,
        is_deleted: true,
        deleted_at: now,
      });
    }
    for (const row of highlightRows) {
      await queueMutation('highlight', row.id, {
        id: row.id,
        book_id: row.book_id,
        is_deleted: true,
        deleted_at: now,
      });
    }
    for (const row of noteRows) {
      await queueMutation('note', row.id, {
        id: row.id,
        book_id: row.book_id,
        is_deleted: true,
        deleted_at: now,
      });
    }
  });

  if (book && book.local_path) {
    await deleteBookFile(book.local_path, bookId);
  }

  // If connected to Google Drive and not skipping drive trash, move to Drive Trash (30-day window)
  if (!options?.skipDriveTrash && book?.drive_file_id && driveTrashHandler) {
    driveTrashHandler(book.drive_file_id).catch((e) =>
      console.warn('[BookService] Could not trash file on Drive:', e)
    );
  }

  triggerDebouncedSync(30000);
}

/**
 * Persist reading progress to SQLite and queue for background sync.
 */
export async function saveReadingProgress(
  bookId: string,
  cfi: string,
  percentage: number
): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  const progressId = generateUUID();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO reading_progress (id, book_id, cfi, percentage, client_updated_at, is_deleted, sync_seq)
       VALUES (?, ?, ?, ?, ?, 0, 0)
       ON CONFLICT(book_id) DO UPDATE SET
         cfi = excluded.cfi,
         percentage = excluded.percentage,
         client_updated_at = excluded.client_updated_at,
         is_deleted = 0`,
      [progressId, bookId, cfi, percentage, now]
    );

    // Update book's updated_at
    await db.runAsync('UPDATE books SET updated_at = ? WHERE id = ?', [now, bookId]);

    // Queue reading progress mutation (coalesced by syncService to 1 write per book)
    await queueMutation('progress', bookId, {
      id: progressId,
      user_id: 'local_user',
      book_id: bookId,
      cfi,
      percentage,
      client_updated_at: now,
      is_deleted: false,
      sync_seq: 0,
    });
  });

  // 30-second idle threshold for background D1 sync
  triggerDebouncedSync(30000);
}

/**
 * Cache generated EPUB locations in local SQLite.
 */
export async function saveBookLocationsCache(
  bookId: string,
  locationsJson: string
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE books SET locations_cache = ? WHERE id = ?', [
    locationsJson,
    bookId,
  ]);
}
