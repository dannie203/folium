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
const DB_VERSION = 1;

const STORES = {
  books: 'books',
  reading_progress: 'reading_progress',
  bookmarks: 'bookmarks',
  highlights: 'highlights',
  notes: 'notes',
  sync_outbox: 'sync_outbox',
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
      const [id, title, author, cover_url, file_type, file_size, local_path, created_at, updated_at] = params;
      const record: Book = {
        id,
        title,
        author,
        cover_url,
        file_type,
        file_size,
        local_path,
        created_at,
        updated_at,
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
      const [id, book_id, cfi, percentage, client_updated_at] = params;
      const record = {
        id,
        book_id,
        cfi,
        percentage,
        client_updated_at,
        is_deleted: 0,
        sync_seq: 0,
      };

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.reading_progress, 'readwrite');
        const store = tx.objectStore(STORES.reading_progress);
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
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

    // 8. INSERT INTO sync_outbox
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

    return null;
  }

  async getAllAsync<T>(sql: string, _params: any[] = []): Promise<T[]> {
    const db = await this.dbPromise;
    const normalized = sql.trim().toUpperCase();

    // SELECT b.*, p.percentage as progress_percentage, p.cfi as last_cfi FROM books b LEFT JOIN reading_progress p ...
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
