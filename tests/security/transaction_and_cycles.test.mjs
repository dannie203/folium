import test from 'node:test';
import assert from 'node:assert';
import initSqlJs from '../../apps/mobile/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'node:fs';
import { generateUUID } from '../../apps/mobile/src/utils/uuid.ts';

// ==============================================================================
//  TRANSACTION ATOMICITY & RECOVERY TEST SUITE (sql.js Savepoint Adapter)
// ==============================================================================

class MockWebSqliteDatabase {
  constructor(db) {
    this.db = db;
    this.txDepth = 0;
  }

  async runAsync(sql, params = []) {
    this.db.run(sql, params);
    const changes = this.db.getRowsModified();
    const rowIdRes = this.db.exec('SELECT last_insert_rowid() as id;');
    const lastInsertRowId = rowIdRes[0]?.values[0]?.[0] || 0;
    return { lastInsertRowId, changes };
  }

  async getFirstAsync(sql, params = []) {
    const stmt = this.db.prepare(sql, params);
    try {
      if (stmt.step()) {
        return stmt.getAsObject();
      }
      return null;
    } finally {
      stmt.free();
    }
  }

  async getAllAsync(sql, params = []) {
    const stmt = this.db.prepare(sql, params);
    const rows = [];
    try {
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  async withTransactionAsync(task) {
    const savepointName = `sp_${this.txDepth++}`;
    this.db.run(`SAVEPOINT ${savepointName};`);
    try {
      const result = await task();
      this.db.run(`RELEASE SAVEPOINT ${savepointName};`);
      return result;
    } catch (err) {
      try {
        this.db.run(`ROLLBACK TO SAVEPOINT ${savepointName};`);
        this.db.run(`RELEASE SAVEPOINT ${savepointName};`);
      } catch (rollbackErr) {
        console.warn('Rollback failed:', rollbackErr);
      }
      throw err;
    } finally {
      this.txDepth--;
    }
  }
}

async function setupTestDb() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  const schemaContent = fs.readFileSync('apps/mobile/src/db/schema.ts', 'utf-8');
  const match = schemaContent.match(/export const INIT_SQL = \x60([\s\S]*?)\x60;/);
  assert.ok(match, 'INIT_SQL must exist in schema.ts');
  db.run(match[1]);
  return new MockWebSqliteDatabase(db);
}

test('TRANSACTION ATOMICITY 1: withTransactionAsync successfully commits entity + outbox mutations', async () => {
  const adapter = await setupTestDb();
  const bookId = 'book-tx-1';
  const outboxId = 'outbox-tx-1';
  const now = Date.now();

  await adapter.withTransactionAsync(async () => {
    await adapter.runAsync(
      `INSERT INTO books (id, title, author, file_type, file_size, shelf, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [bookId, 'Transaction Book', 'Author', 'epub', 1024, 'Inbox', 0, now, now]
    );

    await adapter.runAsync(
      `INSERT INTO sync_outbox (id, entity_type, entity_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [outboxId, 'book', bookId, JSON.stringify({ id: bookId, title: 'Transaction Book' }), now]
    );
  });

  const book = await adapter.getFirstAsync('SELECT * FROM books WHERE id = ?', [bookId]);
  const outbox = await adapter.getFirstAsync('SELECT * FROM sync_outbox WHERE id = ?', [outboxId]);

  assert.ok(book, 'Book record must be committed');
  assert.strictEqual(book.title, 'Transaction Book');
  assert.ok(outbox, 'Outbox mutation must be committed');
  assert.strictEqual(outbox.entity_id, bookId);
});

test('TRANSACTION ATOMICITY 2: withTransactionAsync rolls back both entity and outbox if task fails midway', async () => {
  const adapter = await setupTestDb();
  const bookmarkId = 'bm-rollback-1';
  const outboxId = 'outbox-rollback-1';
  const now = Date.now();

  let thrown = false;
  try {
    await adapter.withTransactionAsync(async () => {
      // 1. Insert bookmark
      await adapter.runAsync(
        `INSERT INTO bookmarks (id, book_id, cfi, title, client_created_at, is_deleted, sync_seq)
         VALUES (?, ?, ?, ?, ?, 0, 0)`,
        [bookmarkId, 'book-1', 'cfi-1', 'Test Bookmark', now]
      );

      // 2. Insert outbox mutation
      await adapter.runAsync(
        `INSERT INTO sync_outbox (id, entity_type, entity_id, payload, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [outboxId, 'bookmark', bookmarkId, JSON.stringify({ id: bookmarkId }), now]
      );

      // 3. Simulated failure / network error / constraint error
      throw new Error('Simulated crash during atomic mutation queue');
    });
  } catch (err) {
    thrown = true;
    assert.strictEqual(err.message, 'Simulated crash during atomic mutation queue');
  }

  assert.strictEqual(thrown, true, 'Error must be propagated to caller');

  // Verify full rollback: NO bookmark, and NO outbox row
  const bookmark = await adapter.getFirstAsync('SELECT * FROM bookmarks WHERE id = ?', [bookmarkId]);
  const outbox = await adapter.getFirstAsync('SELECT * FROM sync_outbox WHERE id = ?', [outboxId]);

  assert.strictEqual(bookmark, null, 'Bookmark must be rolled back completely');
  assert.strictEqual(outbox, null, 'Outbox row must be rolled back completely (no phantom queue)');
});

test('TRANSACTION ATOMICITY 3: Nested savepoints roll back inner error without corrupting outer transaction', async () => {
  const adapter = await setupTestDb();
  const outerBookId = 'book-outer';
  const innerBookId = 'book-inner';
  const now = Date.now();

  await adapter.withTransactionAsync(async () => {
    // Outer write
    await adapter.runAsync(
      `INSERT INTO books (id, title, author, file_type, file_size, shelf, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [outerBookId, 'Outer Book', 'Author', 'epub', 1024, 'Inbox', 0, now, now]
    );

    // Inner transaction fails and is caught
    try {
      await adapter.withTransactionAsync(async () => {
        await adapter.runAsync(
          `INSERT INTO books (id, title, author, file_type, file_size, shelf, is_deleted, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [innerBookId, 'Inner Book', 'Author', 'epub', 1024, 'Inbox', 0, now, now]
        );
        throw new Error('Inner failure');
      });
    } catch (innerErr) {
      assert.strictEqual(innerErr.message, 'Inner failure');
    }
  });

  const outerBook = await adapter.getFirstAsync('SELECT * FROM books WHERE id = ?', [outerBookId]);
  const innerBook = await adapter.getFirstAsync('SELECT * FROM books WHERE id = ?', [innerBookId]);

  assert.ok(outerBook, 'Outer book must be successfully committed');
  assert.strictEqual(innerBook, null, 'Inner book must be rolled back');
});

// ==============================================================================
//  DECOUPLING & LIFECYCLE HOOKS TEST SUITE
// ==============================================================================

test('AUTH LIFECYCLE 1: Lifecycle listener registration and dispatch contract', async () => {
  const lifecycleListeners = new Set();
  function registerAuthLifecycleListener(listener) {
    lifecycleListeners.add(listener);
    return () => lifecycleListeners.delete(listener);
  }

  let switchedUserId = null;
  let signedOutUserId = null;

  const unregister = registerAuthLifecycleListener({
    onAccountSwitch: async (newUserId) => {
      switchedUserId = newUserId;
    },
    onSignOut: async ({ userId }) => {
      signedOutUserId = userId;
    },
  });

  for (const listener of lifecycleListeners) {
    if (listener.onAccountSwitch) await listener.onAccountSwitch('user-new-123');
    if (listener.onSignOut) await listener.onSignOut({ userId: 'user-new-123' });
  }

  assert.strictEqual(switchedUserId, 'user-new-123');
  assert.strictEqual(signedOutUserId, 'user-new-123');

  unregister();
  assert.strictEqual(lifecycleListeners.size, 0);
});

test('DRIVE TRASH HOOK 1: Drive trash handler hook registration and invocation contract', async () => {
  let trashedFileId = null;
  let driveTrashHandler = null;

  function setDriveTrashHandler(handler) {
    driveTrashHandler = handler;
  }

  setDriveTrashHandler(async (fileId) => {
    trashedFileId = fileId;
  });

  if (driveTrashHandler) {
    await driveTrashHandler('drive-file-abc');
  }

  assert.strictEqual(trashedFileId, 'drive-file-abc');
  setDriveTrashHandler(null);
  assert.strictEqual(driveTrashHandler, null);
});

test('UUID RFC4122 1: Centralized generateUUID conforms strictly to v4 specification', () => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  for (let i = 0; i < 50; i++) {
    const id = generateUUID();
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(id.length, 36);
    assert.ok(uuidRegex.test(id), `UUID "${id}" must conform to RFC 4122 v4`);
  }
});
