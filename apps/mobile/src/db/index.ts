import * as SQLite from 'expo-sqlite';
import { INIT_SQL } from './schema';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
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

  dbInstance = db;
  return db;
}
