import type { Bookmark, Highlight, Note } from '@folium/shared';
import { getDatabase } from '../db';
import { generateUUID } from './bookService';
import { queueMutation, triggerDebouncedSync } from './syncService';

export interface SearchResultItem {
  type: 'bookmark' | 'highlight' | 'note' | 'book';
  id: string;
  book_id: string;
  title: string;
  snippet: string;
  cfi: string;
  created_at: number;
}

// ------------------------------------------------------------------------------
// BOOKMARKS
// ------------------------------------------------------------------------------

export async function addBookmark(bookId: string, cfi: string, title?: string): Promise<Bookmark> {
  const db = await getDatabase();
  const id = generateUUID();
  const now = Date.now();
  const defaultTitle = title || `Dấu trang tại ${cfi.slice(0, 16)}...`;

  const bookmark: Bookmark = {
    id,
    user_id: 'local_user',
    book_id: bookId,
    cfi,
    title: defaultTitle,
    client_created_at: now,
    is_deleted: false,
    sync_seq: 0,
  };

  await db.runAsync(
    `INSERT INTO bookmarks (id, book_id, cfi, title, client_created_at, is_deleted, sync_seq)
     VALUES (?, ?, ?, ?, ?, 0, 0)`,
    [bookmark.id, bookmark.book_id, bookmark.cfi, bookmark.title, bookmark.client_created_at]
  );

  // Queue for cloud sync
  await queueMutation('bookmark', bookmark.id, bookmark);
  triggerDebouncedSync(30000);

  return bookmark;
}

export async function getBookmarks(bookId: string): Promise<Bookmark[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM bookmarks WHERE book_id = ? AND is_deleted = 0 ORDER BY client_created_at DESC`,
    [bookId]
  );

  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id || 'local_user',
    book_id: r.book_id,
    cfi: r.cfi,
    title: r.title,
    client_created_at: r.client_created_at,
    is_deleted: Boolean(r.is_deleted),
    sync_seq: r.sync_seq || 0,
  }));
}

export async function deleteBookmark(bookmarkId: string): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `UPDATE bookmarks SET is_deleted = 1 WHERE id = ?`,
    [bookmarkId]
  );

  // Queue tombstone for sync
  await queueMutation('bookmark', bookmarkId, { id: bookmarkId, is_deleted: true });
  triggerDebouncedSync(30000);
}

// ------------------------------------------------------------------------------
// HIGHLIGHTS
// ------------------------------------------------------------------------------

export async function addHighlight(
  bookId: string,
  cfiRange: string,
  text: string,
  color: 'yellow' | 'green' | 'blue' | 'pink' | 'purple' = 'yellow',
  note?: string
): Promise<Highlight> {
  const db = await getDatabase();
  const id = generateUUID();
  const now = Date.now();

  const highlight: Highlight = {
    id,
    user_id: 'local_user',
    book_id: bookId,
    cfi_range: cfiRange,
    text,
    color,
    note: note || null,
    client_created_at: now,
    is_deleted: false,
    sync_seq: 0,
  };

  await db.runAsync(
    `INSERT INTO highlights (id, book_id, cfi_range, text, color, note, client_created_at, is_deleted, sync_seq)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`,
    [
      highlight.id,
      highlight.book_id,
      highlight.cfi_range,
      highlight.text,
      highlight.color,
      highlight.note ?? null,
      highlight.client_created_at,
    ]
  );

  // Queue for cloud sync
  await queueMutation('highlight', highlight.id, highlight);
  triggerDebouncedSync(30000);

  return highlight;
}

export async function getHighlights(bookId: string): Promise<Highlight[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM highlights WHERE book_id = ? AND is_deleted = 0 ORDER BY client_created_at DESC`,
    [bookId]
  );

  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id || 'local_user',
    book_id: r.book_id,
    cfi_range: r.cfi_range,
    text: r.text,
    color: r.color,
    note: r.note ?? null,
    client_created_at: r.client_created_at,
    is_deleted: Boolean(r.is_deleted),
    sync_seq: r.sync_seq || 0,
  }));
}

export async function deleteHighlight(highlightId: string): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `UPDATE highlights SET is_deleted = 1 WHERE id = ?`,
    [highlightId]
  );

  // Also remove attached notes if any
  await db.runAsync(
    `UPDATE notes SET is_deleted = 1 WHERE highlight_id = ?`,
    [highlightId]
  );

  // Queue tombstone
  await queueMutation('highlight', highlightId, { id: highlightId, is_deleted: true });
  triggerDebouncedSync(30000);
}

// ------------------------------------------------------------------------------
// NOTES
// ------------------------------------------------------------------------------

export async function addNote(
  bookId: string,
  content: string,
  highlightId?: string | null
): Promise<Note> {
  const db = await getDatabase();
  const id = generateUUID();
  const now = Date.now();

  const note: Note = {
    id,
    user_id: 'local_user',
    book_id: bookId,
    highlight_id: highlightId || null,
    content,
    client_created_at: now,
    is_deleted: false,
    sync_seq: 0,
  };

  await db.runAsync(
    `INSERT INTO notes (id, book_id, highlight_id, content, client_created_at, is_deleted, sync_seq)
     VALUES (?, ?, ?, ?, ?, 0, 0)`,
    [note.id, note.book_id, note.highlight_id ?? null, note.content, note.client_created_at]
  );

  // If tied to highlight, update note preview on highlight
  if (highlightId) {
    await db.runAsync(
      `UPDATE highlights SET note = ? WHERE id = ?`,
      [content, highlightId]
    );
  }

  // Queue for cloud sync
  await queueMutation('note', note.id, note);
  triggerDebouncedSync(30000);

  return note;
}

export async function getNotes(bookId: string): Promise<Note[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM notes WHERE book_id = ? AND is_deleted = 0 ORDER BY client_created_at DESC`,
    [bookId]
  );

  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id || 'local_user',
    book_id: r.book_id,
    highlight_id: r.highlight_id ?? null,
    content: r.content,
    client_created_at: r.client_created_at,
    is_deleted: Boolean(r.is_deleted),
    sync_seq: r.sync_seq || 0,
  }));
}

export async function deleteNote(noteId: string): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `UPDATE notes SET is_deleted = 1 WHERE id = ?`,
    [noteId]
  );

  await queueMutation('note', noteId, { id: noteId, is_deleted: true });
  triggerDebouncedSync(30000);
}

// ------------------------------------------------------------------------------
// FULL-TEXT SEARCH (FTS) ACROSS ANNOTATIONS & BOOKMARKS
// ------------------------------------------------------------------------------

export async function searchAnnotations(
  query: string,
  bookId?: string
): Promise<SearchResultItem[]> {
  if (!query || query.trim().length === 0) return [];
  const db = await getDatabase();
  const term = `%${query.trim().toLowerCase()}%`;
  const results: SearchResultItem[] = [];

  // 1. Search Highlights
  const highlightSql = bookId
    ? `SELECT h.*, b.title as book_title FROM highlights h JOIN books b ON h.book_id = b.id WHERE h.book_id = ? AND h.is_deleted = 0 AND (LOWER(h.text) LIKE ? OR LOWER(COALESCE(h.note, '')) LIKE ?) ORDER BY h.client_created_at DESC LIMIT 30`
    : `SELECT h.*, b.title as book_title FROM highlights h JOIN books b ON h.book_id = b.id WHERE h.is_deleted = 0 AND (LOWER(h.text) LIKE ? OR LOWER(COALESCE(h.note, '')) LIKE ?) ORDER BY h.client_created_at DESC LIMIT 30`;
  const highlightParams = bookId ? [bookId, term, term] : [term, term];

  const highlightRows = await db.getAllAsync<any>(highlightSql, highlightParams);
  for (const r of highlightRows) {
    results.push({
      type: 'highlight',
      id: r.id,
      book_id: r.book_id,
      title: r.book_title || 'Tô sáng',
      snippet: r.text + (r.note ? ` — Ghi chú: ${r.note}` : ''),
      cfi: r.cfi_range,
      created_at: r.client_created_at,
    });
  }

  // 2. Search Bookmarks
  const bookmarkSql = bookId
    ? `SELECT bm.*, b.title as book_title FROM bookmarks bm JOIN books b ON bm.book_id = b.id WHERE bm.book_id = ? AND bm.is_deleted = 0 AND LOWER(bm.title) LIKE ? ORDER BY bm.client_created_at DESC LIMIT 30`
    : `SELECT bm.*, b.title as book_title FROM bookmarks bm JOIN books b ON bm.book_id = b.id WHERE bm.is_deleted = 0 AND LOWER(bm.title) LIKE ? ORDER BY bm.client_created_at DESC LIMIT 30`;
  const bookmarkParams = bookId ? [bookId, term] : [term];

  const bookmarkRows = await db.getAllAsync<any>(bookmarkSql, bookmarkParams);
  for (const r of bookmarkRows) {
    results.push({
      type: 'bookmark',
      id: r.id,
      book_id: r.book_id,
      title: r.book_title || 'Dấu trang',
      snippet: r.title,
      cfi: r.cfi,
      created_at: r.client_created_at,
    });
  }

  // 3. Search Standalone Notes
  const noteSql = bookId
    ? `SELECT n.*, b.title as book_title FROM notes n JOIN books b ON n.book_id = b.id WHERE n.book_id = ? AND n.is_deleted = 0 AND LOWER(n.content) LIKE ? ORDER BY n.client_created_at DESC LIMIT 30`
    : `SELECT n.*, b.title as book_title FROM notes n JOIN books b ON n.book_id = b.id WHERE n.is_deleted = 0 AND LOWER(n.content) LIKE ? ORDER BY n.client_created_at DESC LIMIT 30`;
  const noteParams = bookId ? [bookId, term] : [term];

  const noteRows = await db.getAllAsync<any>(noteSql, noteParams);
  for (const r of noteRows) {
    results.push({
      type: 'note',
      id: r.id,
      book_id: r.book_id,
      title: r.book_title || 'Ghi chú',
      snippet: r.content,
      cfi: '',
      created_at: r.client_created_at,
    });
  }

  return results;
}
