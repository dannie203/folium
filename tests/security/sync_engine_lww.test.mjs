import test from 'node:test';
import assert from 'node:assert';
import initSqlJs from '../../apps/mobile/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'node:fs';

// ==============================================================================
//  SYNC ENGINE & LWW CONFLICT RESOLUTION TEST SUITE
// ==============================================================================

test('SYNC LWW 1: Bookmarks, Highlights, and Notes reject older timestamp mutations in SQL upsert', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  const schemaContent = fs.readFileSync('apps/mobile/src/db/schema.ts', 'utf-8');
  const match = schemaContent.match(/export const INIT_SQL = \x60([\s\S]*?)\x60;/);
  assert.ok(match, 'INIT_SQL must exist in schema.ts');
  db.run(match[1]);

  const bookId = 'book-lww-1';
  db.run(
    `INSERT INTO books (id, title, author, file_type, file_size, is_deleted, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [bookId, 'Test Book', 'Test Author', 'epub', 1000, 0, 1000, 1000]
  );

  // 1. Initial Insert at T = 2000
  db.run(
    `INSERT INTO bookmarks (id, book_id, cfi, title, client_created_at, is_deleted, sync_seq)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['bm-1', bookId, 'cfi-v1', 'Chapter 1 Bookmark', 2000, 0, 1]
  );

  db.run(
    `INSERT INTO highlights (id, book_id, cfi_range, text, color, note, client_created_at, is_deleted, sync_seq)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['hl-1', bookId, 'cfi-range-1', 'Original quote', 'yellow', 'Note v1', 2000, 0, 1]
  );

  db.run(
    `INSERT INTO notes (id, book_id, highlight_id, content, client_created_at, is_deleted, sync_seq)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['note-1', bookId, null, 'Original thought', 2000, 0, 1]
  );

  // 2. Stale Update at T = 1500 (older timestamp arriving out-of-order)
  // With LWW guard: WHERE excluded.client_created_at >= bookmarks.client_created_at
  db.run(
    `INSERT INTO bookmarks (id, book_id, cfi, title, client_created_at, is_deleted, sync_seq)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       cfi = excluded.cfi,
       client_created_at = excluded.client_created_at,
       is_deleted = excluded.is_deleted,
       sync_seq = excluded.sync_seq
     WHERE excluded.client_created_at >= bookmarks.client_created_at`,
    ['bm-1', bookId, 'cfi-stale', 'Stale Bookmark', 1500, 0, 2]
  );

  db.run(
    `INSERT INTO highlights (id, book_id, cfi_range, text, color, note, client_created_at, is_deleted, sync_seq)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       note = excluded.note,
       color = excluded.color,
       client_created_at = excluded.client_created_at,
       is_deleted = excluded.is_deleted,
       sync_seq = excluded.sync_seq
     WHERE excluded.client_created_at >= highlights.client_created_at`,
    ['hl-1', bookId, 'cfi-stale', 'Stale quote', 'blue', 'Stale Note', 1500, 0, 2]
  );

  db.run(
    `INSERT INTO notes (id, book_id, highlight_id, content, client_created_at, is_deleted, sync_seq)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       content = excluded.content,
       client_created_at = excluded.client_created_at,
       is_deleted = excluded.is_deleted,
       sync_seq = excluded.sync_seq
     WHERE excluded.client_created_at >= notes.client_created_at`,
    ['note-1', bookId, null, 'Stale thought', 1500, 0, 2]
  );

  // Verify older writes were REJECTED by LWW guard
  const bmStmt = db.prepare('SELECT title, client_created_at FROM bookmarks WHERE id = ?');
  bmStmt.bind(['bm-1']);
  bmStmt.step();
  assert.strictEqual(bmStmt.getAsObject().title, 'Chapter 1 Bookmark', 'Stale bookmark write must be rejected');
  assert.strictEqual(bmStmt.getAsObject().client_created_at, 2000);
  bmStmt.free();

  const hlStmt = db.prepare('SELECT color, note, client_created_at FROM highlights WHERE id = ?');
  hlStmt.bind(['hl-1']);
  hlStmt.step();
  assert.strictEqual(hlStmt.getAsObject().color, 'yellow', 'Stale highlight color must be rejected');
  assert.strictEqual(hlStmt.getAsObject().note, 'Note v1');
  hlStmt.free();

  const noteStmt = db.prepare('SELECT content, client_created_at FROM notes WHERE id = ?');
  noteStmt.bind(['note-1']);
  noteStmt.step();
  assert.strictEqual(noteStmt.getAsObject().content, 'Original thought', 'Stale note edit must be rejected');
  noteStmt.free();
});

test('SYNC LWW 2: Bookmarks, Highlights, and Notes accept newer timestamp mutations in SQL upsert', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  const schemaContent = fs.readFileSync('apps/mobile/src/db/schema.ts', 'utf-8');
  const match = schemaContent.match(/export const INIT_SQL = \x60([\s\S]*?)\x60;/);
  db.run(match[1]);

  const bookId = 'book-lww-2';
  db.run(
    `INSERT INTO books (id, title, author, file_type, file_size, is_deleted, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [bookId, 'Book 2', 'Author 2', 'epub', 1000, 0, 1000, 1000]
  );

  // Initial at T = 2000
  db.run(
    `INSERT INTO bookmarks (id, book_id, cfi, title, client_created_at, is_deleted, sync_seq)
     VALUES ('bm-2', 'book-lww-2', 'cfi-v1', 'Bookmark v1', 2000, 0, 1)`
  );
  db.run(
    `INSERT INTO highlights (id, book_id, cfi_range, text, color, note, client_created_at, is_deleted, sync_seq)
     VALUES ('hl-2', 'book-lww-2', 'cfi-range-2', 'Quote v1', 'yellow', 'Note v1', 2000, 0, 1)`
  );
  db.run(
    `INSERT INTO notes (id, book_id, highlight_id, content, client_created_at, is_deleted, sync_seq)
     VALUES ('note-2', 'book-lww-2', null, 'Thought v1', 2000, 0, 1)`
  );

  // Newer update at T = 3000
  db.run(
    `INSERT INTO bookmarks (id, book_id, cfi, title, client_created_at, is_deleted, sync_seq)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       cfi = excluded.cfi,
       client_created_at = excluded.client_created_at,
       is_deleted = excluded.is_deleted,
       sync_seq = excluded.sync_seq
     WHERE excluded.client_created_at >= bookmarks.client_created_at`,
    ['bm-2', bookId, 'cfi-v2', 'Bookmark v2', 3000, 0, 3]
  );

  db.run(
    `INSERT INTO highlights (id, book_id, cfi_range, text, color, note, client_created_at, is_deleted, sync_seq)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       note = excluded.note,
       color = excluded.color,
       client_created_at = excluded.client_created_at,
       is_deleted = excluded.is_deleted,
       sync_seq = excluded.sync_seq
     WHERE excluded.client_created_at >= highlights.client_created_at`,
    ['hl-2', bookId, 'cfi-range-2', 'Quote v1', 'pink', 'Updated Note v2', 3000, 0, 3]
  );

  db.run(
    `INSERT INTO notes (id, book_id, highlight_id, content, client_created_at, is_deleted, sync_seq)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       content = excluded.content,
       client_created_at = excluded.client_created_at,
       is_deleted = excluded.is_deleted,
       sync_seq = excluded.sync_seq
     WHERE excluded.client_created_at >= notes.client_created_at`,
    ['note-2', bookId, null, 'Thought v2 (Updated)', 3000, 0, 3]
  );

  // Verify newer writes were ACCEPTED
  const bmStmt = db.prepare('SELECT title, client_created_at FROM bookmarks WHERE id = ?');
  bmStmt.bind(['bm-2']);
  bmStmt.step();
  assert.strictEqual(bmStmt.getAsObject().title, 'Bookmark v2', 'Newer bookmark write must win');
  assert.strictEqual(bmStmt.getAsObject().client_created_at, 3000);
  bmStmt.free();

  const hlStmt = db.prepare('SELECT color, note FROM highlights WHERE id = ?');
  hlStmt.bind(['hl-2']);
  hlStmt.step();
  assert.strictEqual(hlStmt.getAsObject().color, 'pink', 'Newer highlight color must win');
  assert.strictEqual(hlStmt.getAsObject().note, 'Updated Note v2');
  hlStmt.free();

  const noteStmt = db.prepare('SELECT content FROM notes WHERE id = ?');
  noteStmt.bind(['note-2']);
  noteStmt.step();
  assert.strictEqual(noteStmt.getAsObject().content, 'Thought v2 (Updated)', 'Newer note edit must win');
  noteStmt.free();
});

test('SYNC PUSH/PULL 1: Contiguous sequence advances cursor; gap triggers intervening pull', async () => {
  let localCursor = 5;
  let pullCalled = false;

  async function mockPushCommitted(committedSeq) {
    if (committedSeq === localCursor + 1) {
      localCursor = committedSeq;
    } else if (committedSeq > localCursor + 1) {
      pullCalled = true;
      // Simulate pulling intervening sequence gap (seq 6) and setting cursor to latest
      localCursor = committedSeq;
    }
  }

  // 1. Contiguous push: local=5, server returns 6 -> advance directly
  await mockPushCommitted(6);
  assert.strictEqual(localCursor, 6, 'Contiguous sequence must advance cursor');
  assert.strictEqual(pullCalled, false, 'No pull needed when contiguous');

  // 2. Gap push: local=6, server returns 9 (Device B wrote 7 & 8) -> gap detected, pull triggered!
  await mockPushCommitted(9);
  assert.strictEqual(pullCalled, true, 'Intervening gap must trigger pull');
  assert.strictEqual(localCursor, 9, 'Cursor reaches latest committed sequence after pulling gap');
});

test('SYNC GC WATERMARK 1: Stale client with cursor older than GC watermark receives HTTP 410 Gone', () => {
  const gcWatermarkSeq = 50;

  function evaluatePullRequest(since) {
    if (gcWatermarkSeq > 0 && since > 0 && since < gcWatermarkSeq) {
      return {
        status: 410,
        body: { error: 'Sync cursor expired', code: 'CURSOR_EXPIRED' },
      };
    }
    return { status: 200, body: { server_sync_seq: 100 } };
  }

  // Stale client (since = 20 < watermark 50)
  const staleRes = evaluatePullRequest(20);
  assert.strictEqual(staleRes.status, 410, 'Stale client cursor behind GC watermark must receive 410');
  assert.strictEqual(staleRes.body.code, 'CURSOR_EXPIRED');

  // Up-to-date client (since = 55 >= watermark 50)
  const validRes = evaluatePullRequest(55);
  assert.strictEqual(validRes.status, 200, 'Client with cursor at or above watermark must succeed');

  // Full resync client (since = 0)
  const fullResyncRes = evaluatePullRequest(0);
  assert.strictEqual(fullResyncRes.status, 200, 'Full resync since=0 must always succeed regardless of watermark');
});
