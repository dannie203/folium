import * as SQLite from 'expo-sqlite';
import { INIT_SQL } from './schema';
import type { DatabaseResult, SQLiteDatabaseLike } from './types';

export type { DatabaseResult, SQLiteDatabaseLike } from './types';

let dbInstance: SQLiteDatabaseLike | null = null;

export async function getDatabase(): Promise<SQLiteDatabaseLike> {
  if (dbInstance) {
    return dbInstance;
  }

  const db = await SQLite.openDatabaseAsync('folium.db');
  await db.execAsync(INIT_SQL);

  // Safe migration for Phase 8.5
  try {
    await db.execAsync("ALTER TABLE books ADD COLUMN shelf TEXT DEFAULT 'Inbox';");
  } catch {}
  try {
    await db.execAsync("ALTER TABLE books ADD COLUMN tags TEXT;");
  } catch {}
  try {
    await db.execAsync("ALTER TABLE books ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;");
  } catch {}
  try {
    await db.execAsync("ALTER TABLE books ADD COLUMN deleted_at INTEGER;");
  } catch {}
  try {
    await db.execAsync("ALTER TABLE books ADD COLUMN sync_seq INTEGER NOT NULL DEFAULT 0;");
  } catch {}
  try {
    await db.execAsync("ALTER TABLE books ADD COLUMN user_id TEXT;");
  } catch {}

  let txDepth = 0;
  const originalWithTx = db.withTransactionAsync.bind(db);

  const enhancedDb: SQLiteDatabaseLike = {
    execAsync: (sql) => db.execAsync(sql),
    runAsync: (sql, params) => db.runAsync(sql, params || []),
    getFirstAsync: (sql, params) => db.getFirstAsync(sql, params || []),
    getAllAsync: (sql, params) => db.getAllAsync(sql, params || []),
    withTransactionAsync: async <T>(task: () => Promise<T>): Promise<T> => {
      if (txDepth > 0) {
        const sp = `sp_${txDepth++}`;
        await db.execAsync(`SAVEPOINT ${sp};`);
        try {
          const result = await task();
          await db.execAsync(`RELEASE SAVEPOINT ${sp};`);
          return result;
        } catch (err) {
          try {
            await db.execAsync(`ROLLBACK TO SAVEPOINT ${sp};`);
            await db.execAsync(`RELEASE SAVEPOINT ${sp};`);
          } catch {}
          throw err;
        } finally {
          txDepth--;
        }
      }

      txDepth++;
      let result: T;
      try {
        await originalWithTx(async () => {
          result = await task();
        });
        return result!;
      } finally {
        txDepth--;
      }
    },
  };

  dbInstance = enhancedDb;
  return enhancedDb;
}
