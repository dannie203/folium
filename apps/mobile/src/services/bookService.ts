import * as DocumentPicker from 'expo-document-picker';
import type { Book, BookFormat } from '@folium/shared';
import { getDatabase } from '../db';
import { saveBookFile, deleteBookFile } from './storage';

export interface BookWithProgress extends Book {
  progress_percentage: number;
  last_cfi?: string | null;
}

/**
 * Generate a random v4 UUID without external dependencies.
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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
    author: 'Tác giả không rõ',
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
    throw new Error('Định dạng không được hỗ trợ. Vui lòng chọn file .epub hoặc .pdf.');
  }

  const { title, author, format } = parseBookMetadata(filename);
  const bookId = generateUUID();
  const now = Date.now();

  // Save book file into app's persistent storage
  const localPath = await saveBookFile(bookId, asset.uri, format);

  const newBook: Book = {
    id: bookId,
    title,
    author,
    cover_url: null,
    file_type: format,
    file_size: asset.size || 0,
    local_path: localPath,
    drive_file_id: null,
    locations_cache: null,
    created_at: now,
    updated_at: now,
  };

  // Insert into local SQLite
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO books (id, title, author, cover_url, file_type, file_size, local_path, drive_file_id, locations_cache, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    ]
  );

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
  const rows = await db.getAllAsync<any>(
    `SELECT b.*, COALESCE(p.percentage, 0) as progress_percentage, p.cfi as last_cfi
     FROM books b
     LEFT JOIN reading_progress p ON b.id = p.book_id AND p.is_deleted = 0
     ORDER BY b.updated_at DESC`
  );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    author: r.author,
    cover_url: r.cover_url,
    file_type: r.file_type as BookFormat,
    file_size: r.file_size,
    local_path: r.local_path,
    drive_file_id: r.drive_file_id,
    locations_cache: r.locations_cache,
    created_at: r.created_at,
    updated_at: r.updated_at,
    progress_percentage: r.progress_percentage || 0,
    last_cfi: r.last_cfi,
  }));
}

/**
 * Delete a book from local disk and SQLite database.
 */
export async function deleteBook(bookId: string): Promise<void> {
  const db = await getDatabase();

  const book = await db.getFirstAsync<{ local_path: string | null }>(
    'SELECT local_path FROM books WHERE id = ?',
    [bookId]
  );

  if (book && book.local_path) {
    await deleteBookFile(book.local_path);
  }

  // Delete records in SQLite
  await db.runAsync('DELETE FROM reading_progress WHERE book_id = ?', [bookId]);
  await db.runAsync('DELETE FROM bookmarks WHERE book_id = ?', [bookId]);
  await db.runAsync('DELETE FROM highlights WHERE book_id = ?', [bookId]);
  await db.runAsync('DELETE FROM notes WHERE book_id = ?', [bookId]);
  await db.runAsync('DELETE FROM books WHERE id = ?', [bookId]);

  // Track deletion in sync_outbox for future D1 synchronization
  await db.runAsync(
    `INSERT INTO sync_outbox (id, entity_type, entity_id, payload, created_at)
     VALUES (?, 'book', ?, ?, ?)`,
    [generateUUID(), bookId, JSON.stringify({ id: bookId, is_deleted: true }), Date.now()]
  );
}
