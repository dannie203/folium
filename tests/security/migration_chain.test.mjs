import test from 'node:test';
import assert from 'node:assert';
import initSqlJs from '../../apps/mobile/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'node:fs';
import { validateSyncPushPayload, validateDownloadTargetUrl } from '../../packages/worker/src/index.ts';

// ==============================================================================
//  MIGRATION CHAIN & RUNTIME HARDENING TEST SUITE
// ==============================================================================

test('MIGRATION CHAIN 1: Fresh Database runs 0001 through 0004 sequentially without duplicate columns', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  const migrationFiles = [
    '0001_init.sql',
    '0002_tombstone_gc.sql',
    '0003_gc_watermark.sql',
    '0004_book_lww.sql',
  ];

  for (const file of migrationFiles) {
    const sql = fs.readFileSync(`packages/worker/migrations/${file}`, 'utf-8');
    assert.doesNotThrow(() => {
      db.run(sql);
    }, `Migration ${file} must execute without SQL syntax or duplicate column errors`);
  }

  // Verify books schema has all expected columns including client_updated_at and deleted_at
  const stmt = db.prepare('PRAGMA table_info(books)');
  const columns = [];
  while (stmt.step()) {
    columns.push(stmt.getAsObject().name);
  }
  stmt.free();

  assert.ok(columns.includes('id'), 'books must have id column');
  assert.ok(columns.includes('user_id'), 'books must have user_id column');
  assert.ok(columns.includes('title'), 'books must have title column');
  assert.ok(columns.includes('is_deleted'), 'books must have is_deleted column');
  assert.ok(columns.includes('deleted_at'), 'books must have deleted_at column from 0002');
  assert.ok(columns.includes('client_updated_at'), 'books must have client_updated_at column from 0004');
  assert.ok(columns.includes('sync_seq'), 'books must have sync_seq column');

  // Verify user_sync_sequence has gc_watermark_seq from 0003
  const seqStmt = db.prepare('PRAGMA table_info(user_sync_sequence)');
  const seqCols = [];
  while (seqStmt.step()) {
    seqCols.push(seqStmt.getAsObject().name);
  }
  seqStmt.free();
  assert.ok(seqCols.includes('gc_watermark_seq'), 'user_sync_sequence must have gc_watermark_seq from 0003');
});

test('MIGRATION CHAIN 2: Existing Production Database at 0003 smoothly applies 0004_book_lww.sql', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  // 1. Simulate existing production DB that has run 0001, 0002, 0003
  db.run(fs.readFileSync('packages/worker/migrations/0001_init.sql', 'utf-8'));
  db.run(fs.readFileSync('packages/worker/migrations/0002_tombstone_gc.sql', 'utf-8'));
  db.run(fs.readFileSync('packages/worker/migrations/0003_gc_watermark.sql', 'utf-8'));

  // Insert a book prior to migration 0004
  db.run(
    `INSERT INTO books (id, user_id, title, author, file_type, file_size, is_deleted, deleted_at, sync_seq)
     VALUES ('book-prod-pre-0004', 'user-1', 'Legacy Book', 'Author', 'epub', 1000, 0, NULL, 1)`
  );

  // 2. Apply 0004_book_lww.sql
  assert.doesNotThrow(() => {
    db.run(fs.readFileSync('packages/worker/migrations/0004_book_lww.sql', 'utf-8'));
  }, '0004_book_lww.sql must execute smoothly on pre-existing production schema');

  // 3. Verify existing row defaulted to client_updated_at = 0
  const rowStmt = db.prepare('SELECT client_updated_at FROM books WHERE id = ?');
  rowStmt.bind(['book-prod-pre-0004']);
  rowStmt.step();
  assert.strictEqual(rowStmt.getAsObject().client_updated_at, 0, 'Existing books must default to 0');
  rowStmt.free();

  // 4. Verify new inserts with client_updated_at succeed
  db.run(
    `INSERT INTO books (id, user_id, title, author, file_type, file_size, is_deleted, deleted_at, client_updated_at, sync_seq)
     VALUES ('book-post-0004', 'user-1', 'New Book', 'Author', 'epub', 1000, 0, NULL, 5000, 2)`
  );
  const newStmt = db.prepare('SELECT client_updated_at FROM books WHERE id = ?');
  newStmt.bind(['book-post-0004']);
  newStmt.step();
  assert.strictEqual(newStmt.getAsObject().client_updated_at, 5000);
  newStmt.free();
});

test('SCHEMA VALIDATION 1: validateSyncPushPayload accepts valid structures and rejects malformed inputs', () => {
  // 1. Valid payload
  const validPayload = {
    books: [
      { id: 'book-1', title: 'Valid Title', author: 'Valid Author', file_type: 'epub', file_size: 1024 },
    ],
    progress: [
      { id: 'prog-1', book_id: 'book-1', percentage: 45.5, cfi: 'cfi-abc' },
    ],
  };
  const validRes = validateSyncPushPayload(validPayload);
  assert.strictEqual(validRes.valid, true);

  // 2. Reject non-object payload
  assert.strictEqual(validateSyncPushPayload(null).valid, false);
  assert.strictEqual(validateSyncPushPayload('string').valid, false);
  assert.strictEqual(validateSyncPushPayload([]).valid, false);

  // 3. Reject invalid file_type in book
  assert.strictEqual(
    validateSyncPushPayload({ books: [{ id: 'b1', file_type: 'exe' }] }).valid,
    false,
    'Invalid file_type must be rejected'
  );

  // 4. Reject negative or excessive file_size
  assert.strictEqual(
    validateSyncPushPayload({ books: [{ id: 'b1', file_type: 'epub', file_size: -10 }] }).valid,
    false,
    'Negative file_size must be rejected'
  );
  assert.strictEqual(
    validateSyncPushPayload({ books: [{ id: 'b1', file_type: 'epub', file_size: 1000000000 }] }).valid,
    false,
    'File size > 500MB must be rejected'
  );

  // 5. Reject percentage out of [0, 100] range
  assert.strictEqual(
    validateSyncPushPayload({ progress: [{ id: 'p1', book_id: 'b1', percentage: 150 }] }).valid,
    false,
    'Percentage > 100 must be rejected'
  );
  assert.strictEqual(
    validateSyncPushPayload({ progress: [{ id: 'p1', book_id: 'b1', percentage: -5 }] }).valid,
    false,
    'Percentage < 0 must be rejected'
  );

  // 6. Reject excessively long strings
  assert.strictEqual(
    validateSyncPushPayload({ books: [{ id: 'b1', title: 'A'.repeat(501) }] }).valid,
    false,
    'Title > 500 chars must be rejected'
  );
  assert.strictEqual(
    validateSyncPushPayload({ notes: [{ id: 'n1', book_id: 'b1', content: 'C'.repeat(10001) }] }).valid,
    false,
    'Note content > 10,000 chars must be rejected'
  );
});

test('SSRF HARDENING 1: validateDownloadTargetUrl enforces HTTPS and domain allowlist', () => {
  assert.strictEqual(validateDownloadTargetUrl('http://standardebooks.org/test.epub').valid, false);
  assert.strictEqual(validateDownloadTargetUrl('https://evil.com/test.epub').valid, false);
  assert.strictEqual(validateDownloadTargetUrl('https://standardebooks.org:8080/test.epub').valid, false);
  assert.strictEqual(validateDownloadTargetUrl('https://standardebooks.org/ebooks/test.epub').valid, true);
  assert.strictEqual(validateDownloadTargetUrl('https://www.gutenberg.org/ebooks/123.epub').valid, true);
});
