/**
 * Web Database Adapter for Folium using IndexedDB.
 * Provides an expo-sqlite compatible interface for Web platform.
 */
import type { Book } from '@folium/shared';

export interface DatabaseResult {
  lastInsertRowId: number;
  changes: number;
}

export interface SQLiteDatabaseLike {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: any[]): Promise<DatabaseResult>;
  getFirstAsync<T>(sql: string, params?: any[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params?: any[]): Promise<T[]>;
}

const DB_NAME = 'folium_sqlite_web';
const DB_VERSION = 2;

const STORES = {
  books: 'books',
  reading_progress: 'reading_progress',
  bookmarks: 'bookmarks',
  highlights: 'highlights',
  notes: 'notes',
  sync_outbox: 'sync_outbox',
  sync_meta: 'sync_meta',
} as const;

function openWebDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.books)) {
        db.createObjectStore(STORES.books, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.reading_progress)) {
        db.createObjectStore(STORES.reading_progress, { keyPath: 'book_id' });
      }
      if (!db.objectStoreNames.contains(STORES.bookmarks)) {
        db.createObjectStore(STORES.bookmarks, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.highlights)) {
        db.createObjectStore(STORES.highlights, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.notes)) {
        db.createObjectStore(STORES.notes, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.sync_outbox)) {
        db.createObjectStore(STORES.sync_outbox, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.sync_meta)) {
        db.createObjectStore(STORES.sync_meta, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

class WebSQLiteDatabase implements SQLiteDatabaseLike {
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = openWebDatabase();
  }

  async execAsync(_sql: string): Promise<void> {
    await this.dbPromise;
  }

  async runAsync(sql: string, params: any[] = []): Promise<DatabaseResult> {
    const db = await this.dbPromise;
    const normalized = sql.trim().toUpperCase();

    // 1. INSERT INTO books
    if (normalized.startsWith('INSERT INTO BOOKS')) {
      const [
        id,
        title,
        author,
        cover_url,
        file_type,
        file_size,
        local_path,
        drive_file_id,
        locations_cache,
        created_at,
        updated_at,
        shelf,
        tags,
      ] = params;
      const record: Book = {
        id,
        title,
        author,
        cover_url: cover_url ?? null,
        file_type,
        file_size,
        local_path: local_path ?? null,
        drive_file_id: drive_file_id ?? null,
        locations_cache: locations_cache ?? null,
        shelf: shelf ?? 'Inbox',
        tags: tags ? (typeof tags === 'string' ? tags.split(',') : tags) : [],
        is_deleted: false,
        deleted_at: null,
        created_at: created_at ?? Date.now(),
        updated_at: updated_at ?? Date.now(),
      };

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.books, 'readwrite');
        const store = tx.objectStore(STORES.books);
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });

      return { lastInsertRowId: 1, changes: 1 };
    }

    // 2. UPDATE books SET locations_cache = ? WHERE id = ?
    if (normalized.includes('UPDATE BOOKS') && normalized.includes('LOCATIONS_CACHE')) {
      const [locations_cache, id] = params;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.books, 'readwrite');
        const store = tx.objectStore(STORES.books);
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const item = getReq.result;
          if (item) {
            item.locations_cache = locations_cache;
            store.put(item);
          }
          resolve();
        };
        getReq.onerror = () => reject(getReq.error);
      });
      return { lastInsertRowId: 0, changes: 1 };
    }

    // 3. UPDATE books SET updated_at = ? WHERE id = ?
    if (normalized.includes('UPDATE BOOKS') && normalized.includes('UPDATED_AT')) {
      const [updated_at, id] = params;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.books, 'readwrite');
        const store = tx.objectStore(STORES.books);
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const item = getReq.result;
          if (item) {
            item.updated_at = updated_at;
            store.put(item);
          }
          resolve();
        };
        getReq.onerror = () => reject(getReq.error);
      });
      return { lastInsertRowId: 0, changes: 1 };
    }

    // 3b. UPDATE books SET title = ?, author = ?, cover_url = ?, shelf = ?, tags = ?, updated_at = ? WHERE id = ?
    if (normalized.startsWith('UPDATE BOOKS SET') && (normalized.includes('TITLE') || normalized.includes('SHELF'))) {
      const id = params[params.length - 1];
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.books, 'readwrite');
        const store = tx.objectStore(STORES.books);
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const item = getReq.result;
          if (item) {
            item.title = params[0] ?? item.title;
            item.author = params[1] ?? item.author;
            item.cover_url = params[2] ?? item.cover_url;
            item.shelf = params[3] ?? item.shelf ?? 'Inbox';
            item.tags = params[4] ? (typeof params[4] === 'string' ? params[4].split(',') : params[4]) : (item.tags || []);
            item.updated_at = Date.now();
            store.put(item);
          }
          resolve();
        };
        getReq.onerror = () => reject(getReq.error);
      });
      return { lastInsertRowId: 0, changes: 1 };
    }

    // 4. DELETE FROM books WHERE id = ?
    if (normalized.startsWith('DELETE FROM BOOKS')) {
      const [id] = params;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.books, 'readwrite');
        const store = tx.objectStore(STORES.books);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      return { lastInsertRowId: 0, changes: 1 };
    }

    // 5. INSERT INTO reading_progress ... ON CONFLICT(book_id) DO UPDATE ...
    if (normalized.startsWith('INSERT INTO READING_PROGRESS')) {
      const [id, book_id, cfi, percentage, client_updated_at, is_deleted, sync_seq] = params;
      const record = {
        id,
        book_id,
        cfi,
        percentage,
        client_updated_at,
        is_deleted: is_deleted ? 1 : 0,
        sync_seq: sync_seq || 0,
      };

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.reading_progress, 'readwrite');
        const store = tx.objectStore(STORES.reading_progress);
        const getReq = store.get(book_id);
        getReq.onsuccess = () => {
          const existing = getReq.result;
          if (!existing || client_updated_at >= (existing.client_updated_at || 0)) {
            store.put(record);
          }
          resolve();
        };
        getReq.onerror = () => reject(getReq.error);
      });

      return { lastInsertRowId: 1, changes: 1 };
    }

    // 6. DELETE FROM reading_progress WHERE book_id = ?
    if (normalized.startsWith('DELETE FROM READING_PROGRESS')) {
      const [book_id] = params;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.reading_progress, 'readwrite');
        const store = tx.objectStore(STORES.reading_progress);
        const req = store.delete(book_id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      return { lastInsertRowId: 0, changes: 1 };
    }

    // 7. DELETE FROM bookmarks / highlights / notes
    for (const storeName of [STORES.bookmarks, STORES.highlights, STORES.notes]) {
      if (normalized.startsWith(`DELETE FROM ${storeName.toUpperCase()}`)) {
        const [book_id] = params;
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          const req = store.openCursor();
          req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) {
              if (cursor.value.book_id === book_id) {
                cursor.delete();
              }
              cursor.continue();
            } else {
              resolve();
            }
          };
          req.onerror = () => reject(req.error);
        });
        return { lastInsertRowId: 0, changes: 1 };
      }
    }

    // 8. INSERT INTO bookmarks
    if (normalized.startsWith('INSERT INTO BOOKMARKS')) {
      const [id, book_id, cfi, title, client_created_at, is_deleted, sync_seq] = params;
      const record = {
        id,
        user_id: 'local_user',
        book_id,
        cfi,
        title,
        client_created_at: client_created_at ?? Date.now(),
        is_deleted: is_deleted ? 1 : 0,
        sync_seq: sync_seq || 0,
      };
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.bookmarks, 'readwrite');
        const store = tx.objectStore(STORES.bookmarks);
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      return { lastInsertRowId: 1, changes: 1 };
    }

    // 9. UPDATE bookmarks SET is_deleted = 1 WHERE id = ?
    if (normalized.includes('UPDATE BOOKMARKS') && normalized.includes('IS_DELETED = 1')) {
      const [id] = params;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.bookmarks, 'readwrite');
        const store = tx.objectStore(STORES.bookmarks);
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const item = getReq.result;
          if (item) {
            item.is_deleted = 1;
            store.put(item);
          }
          resolve();
        };
        getReq.onerror = () => reject(getReq.error);
      });
      return { lastInsertRowId: 0, changes: 1 };
    }

    // 10. INSERT INTO highlights
    if (normalized.startsWith('INSERT INTO HIGHLIGHTS')) {
      const [id, book_id, cfi_range, text, color, note, client_created_at, is_deleted, sync_seq] = params;
      const record = {
        id,
        user_id: 'local_user',
        book_id,
        cfi_range,
        text,
        color,
        note: note ?? null,
        client_created_at: client_created_at ?? Date.now(),
        is_deleted: is_deleted ? 1 : 0,
        sync_seq: sync_seq || 0,
      };
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.highlights, 'readwrite');
        const store = tx.objectStore(STORES.highlights);
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      return { lastInsertRowId: 1, changes: 1 };
    }

    // 11. UPDATE highlights SET is_deleted = 1 WHERE id = ?
    if (normalized.includes('UPDATE HIGHLIGHTS') && normalized.includes('IS_DELETED = 1')) {
      const [id] = params;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.highlights, 'readwrite');
        const store = tx.objectStore(STORES.highlights);
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const item = getReq.result;
          if (item) {
            item.is_deleted = 1;
            store.put(item);
          }
          resolve();
        };
        getReq.onerror = () => reject(getReq.error);
      });
      return { lastInsertRowId: 0, changes: 1 };
    }

    // 12. UPDATE highlights SET note = ? WHERE id = ?
    if (normalized.includes('UPDATE HIGHLIGHTS') && normalized.includes('NOTE = ?')) {
      const [note, id] = params;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.highlights, 'readwrite');
        const store = tx.objectStore(STORES.highlights);
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const item = getReq.result;
          if (item) {
            item.note = note;
            store.put(item);
          }
          resolve();
        };
        getReq.onerror = () => reject(getReq.error);
      });
      return { lastInsertRowId: 0, changes: 1 };
    }

    // 13. INSERT INTO notes
    if (normalized.startsWith('INSERT INTO NOTES')) {
      const [id, book_id, highlight_id, content, client_created_at, is_deleted, sync_seq] = params;
      const record = {
        id,
        user_id: 'local_user',
        book_id,
        highlight_id: highlight_id ?? null,
        content,
        client_created_at: client_created_at ?? Date.now(),
        is_deleted: is_deleted ? 1 : 0,
        sync_seq: sync_seq || 0,
      };
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.notes, 'readwrite');
        const store = tx.objectStore(STORES.notes);
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      return { lastInsertRowId: 1, changes: 1 };
    }

    // 14. UPDATE notes SET is_deleted = 1
    if (normalized.includes('UPDATE NOTES') && normalized.includes('IS_DELETED = 1')) {
      const [targetId] = params;
      const isByHighlight = normalized.includes('HIGHLIGHT_ID =');
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.notes, 'readwrite');
        const store = tx.objectStore(STORES.notes);
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            const matches = isByHighlight
              ? cursor.value.highlight_id === targetId
              : cursor.value.id === targetId;
            if (matches) {
              const updated = { ...cursor.value, is_deleted: 1 };
              cursor.update(updated);
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = () => reject(req.error);
      });
      return { lastInsertRowId: 0, changes: 1 };
    }

    // 15. INSERT INTO sync_outbox
    if (normalized.startsWith('INSERT INTO SYNC_OUTBOX')) {
      const [id, entity_type, entity_id, payload, created_at] = params;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.sync_outbox, 'readwrite');
        const store = tx.objectStore(STORES.sync_outbox);
        const req = store.put({ id, entity_type, entity_id, payload, created_at });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      return { lastInsertRowId: 1, changes: 1 };
    }

    // 16. DELETE FROM sync_outbox
    if (normalized.startsWith('DELETE FROM SYNC_OUTBOX')) {
      const [id] = params;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.sync_outbox, 'readwrite');
        const store = tx.objectStore(STORES.sync_outbox);
        const req = id ? store.delete(id) : store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      return { lastInsertRowId: 0, changes: 1 };
    }

    // 17. INSERT OR REPLACE INTO sync_meta
    if (normalized.includes('SYNC_META')) {
      const [key, value] = params;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.sync_meta, 'readwrite');
        const store = tx.objectStore(STORES.sync_meta);
        const req = store.put({ key, value: String(value) });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      return { lastInsertRowId: 1, changes: 1 };
    }

    return { lastInsertRowId: 0, changes: 0 };
  }

  async getFirstAsync<T>(sql: string, params: any[] = []): Promise<T | null> {
    const db = await this.dbPromise;
    const normalized = sql.trim().toUpperCase();

    // 1. SELECT * FROM books WHERE id = ?
    if (normalized.includes('FROM BOOKS') && normalized.includes('WHERE ID =')) {
      const [id] = params;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.books, 'readonly');
        const store = tx.objectStore(STORES.books);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    }

    // 2. SELECT local_path FROM books WHERE id = ?
    if (normalized.includes('LOCAL_PATH FROM BOOKS') && normalized.includes('WHERE ID =')) {
      const [id] = params;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.books, 'readonly');
        const store = tx.objectStore(STORES.books);
        const req = store.get(id);
        req.onsuccess = () => {
          if (req.result) {
            resolve({ local_path: req.result.local_path } as any);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => reject(req.error);
      });
    }

    // 3. SELECT cfi, percentage FROM reading_progress WHERE book_id = ?
    if (normalized.includes('FROM READING_PROGRESS') && normalized.includes('WHERE BOOK_ID =')) {
      const [book_id] = params;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.reading_progress, 'readonly');
        const store = tx.objectStore(STORES.reading_progress);
        const req = store.get(book_id);
        req.onsuccess = () => {
          const item = req.result;
          if (item && !item.is_deleted) {
            resolve({ cfi: item.cfi, percentage: item.percentage } as any);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => reject(req.error);
      });
    }

    // 4. SELECT value FROM sync_meta WHERE key = ?
    if (normalized.includes('FROM SYNC_META') && normalized.includes('WHERE KEY =')) {
      const [key] = params;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.sync_meta, 'readonly');
        const store = tx.objectStore(STORES.sync_meta);
        const req = store.get(key);
        req.onsuccess = () => {
          resolve(req.result ? ({ value: req.result.value } as any) : null);
        };
        req.onerror = () => reject(req.error);
      });
    }

    // 5. SELECT COUNT(*) FROM sync_outbox
    if (normalized.includes('COUNT') && normalized.includes('FROM SYNC_OUTBOX')) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.sync_outbox, 'readonly');
        const store = tx.objectStore(STORES.sync_outbox);
        const req = store.count();
        req.onsuccess = () => {
          resolve({ count: req.result, 'COUNT(*)': req.result } as any);
        };
        req.onerror = () => reject(req.error);
      });
    }

    return null;
  }

  async getAllAsync<T>(sql: string, params: any[] = []): Promise<T[]> {
    const db = await this.dbPromise;
    const normalized = sql.trim().toUpperCase();

    // 1. SELECT FROM BOOKMARKS
    if (normalized.includes('FROM BOOKMARKS')) {
      const isSearch = normalized.includes('LIKE');
      const allBookmarks = await new Promise<any[]>((resolve, reject) => {
        const tx = db.transaction(STORES.bookmarks, 'readonly');
        const store = tx.objectStore(STORES.bookmarks);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });

      let filtered = allBookmarks.filter((b) => !b.is_deleted);
      if (isSearch) {
        const bookId = params.length > 1 ? params[0] : null;
        const term = (params.length > 1 ? params[1] : params[0]).replace(/%/g, '').toLowerCase();
        if (bookId) {
          filtered = filtered.filter((b) => b.book_id === bookId);
        }
        filtered = filtered.filter((b) => b.title?.toLowerCase().includes(term));
      } else if (params[0]) {
        filtered = filtered.filter((b) => b.book_id === params[0]);
      }
      filtered.sort((a, b) => (b.client_created_at || 0) - (a.client_created_at || 0));
      return filtered as unknown as T[];
    }

    // 2. SELECT FROM HIGHLIGHTS
    if (normalized.includes('FROM HIGHLIGHTS')) {
      const isSearch = normalized.includes('LIKE');
      const allHighlights = await new Promise<any[]>((resolve, reject) => {
        const tx = db.transaction(STORES.highlights, 'readonly');
        const store = tx.objectStore(STORES.highlights);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });

      let filtered = allHighlights.filter((h) => !h.is_deleted);
      if (isSearch) {
        const bookId = params.length > 2 ? params[0] : null;
        const term = (params.length > 2 ? params[1] : params[0]).replace(/%/g, '').toLowerCase();
        if (bookId) {
          filtered = filtered.filter((h) => h.book_id === bookId);
        }
        filtered = filtered.filter(
          (h) =>
            h.text?.toLowerCase().includes(term) ||
            (h.note && h.note.toLowerCase().includes(term))
        );
      } else if (params[0]) {
        filtered = filtered.filter((h) => h.book_id === params[0]);
      }
      filtered.sort((a, b) => (b.client_created_at || 0) - (a.client_created_at || 0));
      return filtered as unknown as T[];
    }

    // 3. SELECT FROM NOTES
    if (normalized.includes('FROM NOTES')) {
      const isSearch = normalized.includes('LIKE');
      const allNotes = await new Promise<any[]>((resolve, reject) => {
        const tx = db.transaction(STORES.notes, 'readonly');
        const store = tx.objectStore(STORES.notes);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });

      let filtered = allNotes.filter((n) => !n.is_deleted);
      if (isSearch) {
        const bookId = params.length > 1 ? params[0] : null;
        const term = (params.length > 1 ? params[1] : params[0]).replace(/%/g, '').toLowerCase();
        if (bookId) {
          filtered = filtered.filter((n) => n.book_id === bookId);
        }
        filtered = filtered.filter((n) => n.content?.toLowerCase().includes(term));
      } else if (params[0]) {
        filtered = filtered.filter((n) => n.book_id === params[0]);
      }
      filtered.sort((a, b) => (b.client_created_at || 0) - (a.client_created_at || 0));
      return filtered as unknown as T[];
    }

    // 4. SELECT b.*, p.percentage as progress_percentage, p.cfi as last_cfi FROM books b LEFT JOIN reading_progress p ...
    if (normalized.includes('FROM BOOKS')) {
      const [books, progressMap] = await Promise.all([
        new Promise<Book[]>((resolve, reject) => {
          const tx = db.transaction(STORES.books, 'readonly');
          const store = tx.objectStore(STORES.books);
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        }),
        new Promise<Map<string, { percentage: number; cfi: string }>>((resolve, reject) => {
          const tx = db.transaction(STORES.reading_progress, 'readonly');
          const store = tx.objectStore(STORES.reading_progress);
          const req = store.getAll();
          req.onsuccess = () => {
            const map = new Map<string, { percentage: number; cfi: string }>();
            for (const p of req.result || []) {
              if (!p.is_deleted) {
                map.set(p.book_id, { percentage: p.percentage, cfi: p.cfi });
              }
            }
            resolve(map);
          };
          req.onerror = () => reject(req.error);
        }),
      ]);

      const result = books.map((book) => {
        const prog = progressMap.get(book.id);
        return {
          ...book,
          progress_percentage: prog?.percentage || 0,
          last_cfi: prog?.cfi || null,
        } as unknown as T;
      });

      // Sort by updated_at DESC
      result.sort((a: any, b: any) => (b.updated_at || 0) - (a.updated_at || 0));
      return result;
    }

    // 5. SELECT FROM SYNC_OUTBOX
    if (normalized.includes('FROM SYNC_OUTBOX')) {
      const allOutbox = await new Promise<any[]>((resolve, reject) => {
        const tx = db.transaction(STORES.sync_outbox, 'readonly');
        const store = tx.objectStore(STORES.sync_outbox);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      allOutbox.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
      return allOutbox as unknown as T[];
    }

    return [];
  }
}

let webDbInstance: WebSQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLiteDatabaseLike> {
  if (!webDbInstance) {
    webDbInstance = new WebSQLiteDatabase();
  }
  return webDbInstance;
}
