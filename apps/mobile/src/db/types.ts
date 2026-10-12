export interface DatabaseResult {
  lastInsertRowId: number;
  changes: number;
}

export interface SQLiteDatabaseLike {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: any[]): Promise<DatabaseResult>;
  getFirstAsync<T>(sql: string, params?: any[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params?: any[]): Promise<T[]>;
  withTransactionAsync<T>(task: () => Promise<T>): Promise<T>;
}
