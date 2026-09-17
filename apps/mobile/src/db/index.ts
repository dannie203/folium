import * as SQLite from 'expo-sqlite';
import { INIT_SQL } from './schema';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  const db = await SQLite.openDatabaseAsync('folium.db');
  await db.execAsync(INIT_SQL);
  dbInstance = db;
  return db;
}
