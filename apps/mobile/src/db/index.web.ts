/**
 * Web Database Adapter for Folium using sql.js (WebAssembly SQLite).
 * Provides an expo-sqlite compatible interface for Web platform backed by SQLite WASM
 * with persistent storage in IndexedDB.
 */
import initSqlJs, { Database } from 'sql.js';
import { INIT_SQL } from './schema';

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

const IDB_NAME = 'folium_sqlite_persistence';
const IDB_VERSION = 1;
const IDB_STORE = 'sqlite_blob';
const IDB_KEY = 'database_binary';

function openPersistenceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }

    const request = indexedDB.open(IDB_NAME, IDB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadPersistedBinary(): Promise<Uint8Array | null> {
  try {
    if (typeof indexedDB === 'undefined') return null;
    const idb = await openPersistenceDb();
    return new Promise<Uint8Array | null>((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => {
        if (req.result instanceof Uint8Array) {
          resolve(req.result);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function savePersistedBinary(binary: Uint8Array): Promise<void> {
  try {
    if (typeof indexedDB === 'undefined') return;
    const idb = await openPersistenceDb();
    return new Promise<void>((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(binary, IDB_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[WebSQLite] Failed to persist binary to IndexedDB:', err);
  }
}

export class WebSqliteDatabase implements SQLiteDatabaseLike {
  private db: Database | null = null;
  private initPromise: Promise<void> | null = null;
  private saveTimer: any = null;

  private async ensureInitialized(): Promise<void> {
    if (this.db) return;
    if (!this.initPromise) {
      this.initPromise = this.init();
    }
    return this.initPromise;
  }

  private async init(): Promise<void> {
    const SQL = await initSqlJs({
      locateFile: (file) => {
        if (typeof window !== 'undefined') {
          return `/sql-wasm.wasm`;
        }
        return file;
      },
    });

    const persistedBinary = await loadPersistedBinary();
    if (persistedBinary) {
      this.db = new SQL.Database(persistedBinary);
    } else {
      this.db = new SQL.Database();
      this.db.run(INIT_SQL);
    }

    // Run safe migrations for Phase 8.5
    try {
      this.db.run("ALTER TABLE books ADD COLUMN shelf TEXT DEFAULT 'Inbox';");
    } catch {}
    try {
      this.db.run("ALTER TABLE books ADD COLUMN tags TEXT;");
    } catch {}
    try {
      this.db.run("ALTER TABLE books ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;");
    } catch {}
    try {
      this.db.run("ALTER TABLE books ADD COLUMN deleted_at INTEGER;");
    } catch {}
    try {
      this.db.run("ALTER TABLE books ADD COLUMN sync_seq INTEGER NOT NULL DEFAULT 0;");
    } catch {}

    // Register beforeunload and visibilitychange listeners to prevent data loss on tab close/switch
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        if (this.db) {
          try {
            const binary = this.db.export();
            savePersistedBinary(binary);
          } catch {}
        }
      });
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
            this.flushImmediately();
          }
        });
      }
    }

    this.scheduleSave();
  }

  public async flushImmediately(): Promise<void> {
    if (!this.db || typeof indexedDB === 'undefined') return;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      const binary = this.db.export();
      await savePersistedBinary(binary);
    } catch (err) {
      console.warn('[WebSQLite] Immediate persist failed:', err);
    }
  }

  private scheduleSave(): void {
    if (typeof indexedDB === 'undefined') return;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(async () => {
      await this.flushImmediately();
    }, 150);
  }

  async execAsync(sql: string): Promise<void> {
    await this.ensureInitialized();
    this.db!.run(sql);
    this.scheduleSave();
  }

  async runAsync(sql: string, params: any[] = []): Promise<DatabaseResult> {
    await this.ensureInitialized();
    this.db!.run(sql, params);
    const changes = this.db!.getRowsModified();
    const rowIdRes = this.db!.exec('SELECT last_insert_rowid() as id;');
    const lastInsertRowId = (rowIdRes[0]?.values[0]?.[0] as number) || 0;
    this.scheduleSave();
    return { lastInsertRowId, changes };
  }

  async getFirstAsync<T>(sql: string, params: any[] = []): Promise<T | null> {
    await this.ensureInitialized();
    const stmt = this.db!.prepare(sql, params);
    try {
      if (stmt.step()) {
        return stmt.getAsObject() as T;
      }
      return null;
    } finally {
      stmt.free();
    }
  }

  async getAllAsync<T>(sql: string, params: any[] = []): Promise<T[]> {
    await this.ensureInitialized();
    const stmt = this.db!.prepare(sql, params);
    const rows: T[] = [];
    try {
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
      return rows;
    } finally {
      stmt.free();
    }
  }
}

let webDbInstance: WebSqliteDatabase | null = null;

export async function getDatabase(): Promise<SQLiteDatabaseLike> {
  if (!webDbInstance) {
    webDbInstance = new WebSqliteDatabase();
  }
  return webDbInstance;
}
