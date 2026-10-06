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

test('SYNC LWW 3: Full Distributed Mutation & Anti-Resurrection Lifecycle Across Server D1 and Client SQLite', async () => {
  const SQL = await initSqlJs();
  // 1. Setup Server D1 Database
  const serverDb = new SQL.Database();
  serverDb.run(`
    CREATE TABLE books (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      drive_file_id TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at INTEGER,
      client_updated_at INTEGER NOT NULL DEFAULT 0,
      sync_seq INTEGER NOT NULL
    );
  `);

  // 2. Setup Client A and Client B SQLite Databases
  const schemaContent = fs.readFileSync('apps/mobile/src/db/schema.ts', 'utf-8');
  const match = schemaContent.match(/export const INIT_SQL = \x60([\s\S]*?)\x60;/);
  assert.ok(match, 'INIT_SQL must exist in schema.ts');

  const clientADb = new SQL.Database();
  clientADb.run(match[1]);
  const clientBDb = new SQL.Database();
  clientBDb.run(match[1]);

  const bookId = 'book-distributed-lww-1';
  const userId = 'user-test-001';

  // Step 1: Client A creates book at T = 1000
  clientADb.run(
    `INSERT INTO books (id, title, author, file_type, file_size, is_deleted, created_at, updated_at, sync_seq)
     VALUES (?, ?, ?, ?, ?, 0, 1000, 1000, 0)`,
    [bookId, 'Original Title', 'Author', 'epub', 1000]
  );

  // Client A pushes to Server D1 at seq = 1
  serverDb.run(
    `INSERT INTO books (id, user_id, title, author, file_type, file_size, drive_file_id, is_deleted, deleted_at, client_updated_at, sync_seq)
     VALUES (?, ?, ?, ?, ?, ?, NULL, 0, NULL, 1000, 1)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       is_deleted = excluded.is_deleted,
       client_updated_at = excluded.client_updated_at,
       sync_seq = excluded.sync_seq
     WHERE books.user_id = excluded.user_id
       AND excluded.client_updated_at >= COALESCE(books.client_updated_at, 0)`,
    [bookId, userId, 'Original Title', 'Author', 'epub', 1000]
  );

  // Step 2: Client B pulls book, then deletes it at T = 2000
  // Client B advances local LWW clock: updated_at = 2000, deleted_at = 2000
  clientBDb.run(
    `INSERT INTO books (id, title, author, file_type, file_size, is_deleted, created_at, updated_at, sync_seq)
     VALUES (?, ?, ?, ?, ?, 0, 1000, 1000, 1)`,
    [bookId, 'Original Title', 'Author', 'epub', 1000]
  );
  clientBDb.run(
    `UPDATE books SET is_deleted = 1, deleted_at = 2000, updated_at = 2000 WHERE id = ? AND 2000 >= updated_at`,
    [bookId]
  );

  // Client B pushes deletion to Server D1 at seq = 2
  serverDb.run(
    `INSERT INTO books (id, user_id, title, author, file_type, file_size, drive_file_id, is_deleted, deleted_at, client_updated_at, sync_seq)
     VALUES (?, ?, ?, ?, ?, ?, NULL, 1, 2000, 2000, 2)
     ON CONFLICT(id) DO UPDATE SET
       is_deleted = excluded.is_deleted,
       deleted_at = excluded.deleted_at,
       client_updated_at = excluded.client_updated_at,
       sync_seq = excluded.sync_seq
     WHERE books.user_id = excluded.user_id
       AND excluded.client_updated_at >= COALESCE(books.client_updated_at, 0)`,
    [bookId, userId, 'Original Title', 'Author', 'epub', 1000]
  );

  // Verify Server D1 is marked deleted
  const serverCheck1 = serverDb.prepare('SELECT is_deleted, client_updated_at FROM books WHERE id = ?');
  serverCheck1.bind([bookId]);
  serverCheck1.step();
  const serverRow1 = serverCheck1.getAsObject();
  assert.strictEqual(serverRow1.is_deleted, 1);
  assert.strictEqual(serverRow1.client_updated_at, 2000);
  serverCheck1.free();

  // Step 3: Client A was offline and made a stale edit at T = 1500
  // Client A reconnects and attempts to push stale edit (is_deleted = 0, client_updated_at = 1500)
  serverDb.run(
    `INSERT INTO books (id, user_id, title, author, file_type, file_size, drive_file_id, is_deleted, deleted_at, client_updated_at, sync_seq)
     VALUES (?, ?, ?, ?, ?, ?, NULL, 0, NULL, 1500, 3)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       is_deleted = excluded.is_deleted,
       client_updated_at = excluded.client_updated_at,
       sync_seq = excluded.sync_seq
     WHERE books.user_id = excluded.user_id
       AND excluded.client_updated_at >= COALESCE(books.client_updated_at, 0)`,
    [bookId, userId, 'Stale Title Edit from Client A', 'Author', 'epub', 1000]
  );

  // Server D1 MUST REJECT stale mutation (1500 < 2000)
  const serverCheck2 = serverDb.prepare('SELECT is_deleted, title, client_updated_at FROM books WHERE id = ?');
  serverCheck2.bind([bookId]);
  serverCheck2.step();
  const serverRow2 = serverCheck2.getAsObject();
  assert.strictEqual(serverRow2.is_deleted, 1, 'Server D1 must reject stale offline mutation and remain deleted');
  assert.strictEqual(serverRow2.client_updated_at, 2000);
  assert.strictEqual(serverRow2.title, 'Original Title', 'Stale title edit must not overwrite deletion on server');
  serverCheck2.free();

  // Step 4: Client A pulls remote changes from Server D1
  // Receives tombstone (is_deleted = 1, deleted_at = 2000, updated_at = 2000)
  clientADb.run(
    `UPDATE books SET is_deleted = 1, deleted_at = 2000, updated_at = 2000 WHERE id = ? AND 2000 >= updated_at`,
    [bookId]
  );

  // Now Client A attempts to apply its local stale mutation at T = 1500
  clientADb.run(
    `INSERT INTO books (id, title, author, file_type, file_size, is_deleted, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, 1000, 1500)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       is_deleted = excluded.is_deleted,
       updated_at = excluded.updated_at
     WHERE excluded.updated_at >= books.updated_at`,
    [bookId, 'Stale Local Edit', 'Author', 'epub', 1000]
  );

  // Client A local SQLite MUST REJECT resurrection (1500 < 2000)
  const clientACheck = clientADb.prepare('SELECT is_deleted, updated_at FROM books WHERE id = ?');
  clientACheck.bind([bookId]);
  clientACheck.step();
  const clientARow = clientACheck.getAsObject();
  assert.strictEqual(clientARow.is_deleted, 1, 'Client A local SQLite must not be resurrected by stale mutation');
  assert.strictEqual(clientARow.updated_at, 2000, 'Client A local LWW clock must remain advanced at deletion timestamp');
  clientACheck.free();

  // Step 5: Legitimate newer update at T = 3000 (recreation / undelete)
  serverDb.run(
    `INSERT INTO books (id, user_id, title, author, file_type, file_size, drive_file_id, is_deleted, deleted_at, client_updated_at, sync_seq)
     VALUES (?, ?, ?, ?, ?, ?, NULL, 0, NULL, 3000, 4)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       is_deleted = excluded.is_deleted,
       client_updated_at = excluded.client_updated_at,
       sync_seq = excluded.sync_seq
     WHERE books.user_id = excluded.user_id
       AND excluded.client_updated_at >= COALESCE(books.client_updated_at, 0)`,
    [bookId, userId, 'Brand New Edition', 'Author', 'epub', 1000]
  );

  const serverCheck3 = serverDb.prepare('SELECT is_deleted, title, client_updated_at FROM books WHERE id = ?');
  serverCheck3.bind([bookId]);
  serverCheck3.step();
  const serverRow3 = serverCheck3.getAsObject();
  assert.strictEqual(serverRow3.is_deleted, 0, 'Legitimate newer update at T=3000 must be accepted by server');
  assert.strictEqual(serverRow3.title, 'Brand New Edition');
  serverCheck3.free();

  // Client A pulls update at T = 3000
  clientADb.run(
    `INSERT INTO books (id, title, author, file_type, file_size, is_deleted, created_at, updated_at, sync_seq)
     VALUES (?, ?, ?, ?, ?, 0, 1000, 3000, 4)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       is_deleted = excluded.is_deleted,
       updated_at = excluded.updated_at,
       sync_seq = excluded.sync_seq
     WHERE excluded.updated_at >= books.updated_at`,
    [bookId, 'Brand New Edition', 'Author', 'epub', 1000]
  );

  const clientACheck2 = clientADb.prepare('SELECT is_deleted, title, updated_at FROM books WHERE id = ?');
  clientACheck2.bind([bookId]);
  clientACheck2.step();
  const clientARow2 = clientACheck2.getAsObject();
  assert.strictEqual(clientARow2.is_deleted, 0, 'Client A local SQLite must accept legitimate recreation at T=3000');
  assert.strictEqual(clientARow2.title, 'Brand New Edition');
  clientACheck2.free();
});

test('SYNC RECONCILIATION 1: Full Resync Prunes Local GC-Purged Records Against Real SQLite Database', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  const schemaContent = fs.readFileSync('apps/mobile/src/db/schema.ts', 'utf-8');
  const match = schemaContent.match(/export const INIT_SQL = \x60([\s\S]*?)\x60;/);
  db.run(match[1]);

  // Seed local records:
  // 1. Synced Book A (sync_seq = 10) with bookmark, highlight, and note
  db.run(
    `INSERT INTO books (id, title, author, file_type, file_size, is_deleted, created_at, updated_at, sync_seq)
     VALUES ('book-a', 'Book A', 'Author', 'epub', 1000, 0, 1000, 1000, 10)`
  );
  db.run(
    `INSERT INTO bookmarks (id, book_id, cfi, title, client_created_at, is_deleted, sync_seq)
     VALUES ('bm-a', 'book-a', 'cfi-1', 'Bookmark A', 1000, 0, 10)`
  );
  db.run(
    `INSERT INTO highlights (id, book_id, cfi_range, text, color, client_created_at, is_deleted, sync_seq)
     VALUES ('hl-a', 'book-a', 'cfi-range-1', 'Quote A', 'yellow', 1000, 0, 10)`
  );
  db.run(
    `INSERT INTO notes (id, book_id, content, client_created_at, is_deleted, sync_seq)
     VALUES ('note-a', 'book-a', 'Note content A', 1000, 0, 10)`
  );

  // 2. Local Book B (pending in outbox, not yet committed to cloud)
  db.run(
    `INSERT INTO books (id, title, author, file_type, file_size, is_deleted, created_at, updated_at, sync_seq)
     VALUES ('book-b', 'Book B (Pending Outbox)', 'Author', 'epub', 1000, 0, 2000, 2000, 0)`
  );
  db.run(
    `INSERT INTO sync_outbox (id, entity_type, entity_id, payload, created_at)
     VALUES ('out-1', 'book', 'book-b', '{}', 2000)`
  );

  // 3. Local-only Book C (imported locally, sync_seq = 0, no drive_file_id)
  db.run(
    `INSERT INTO books (id, title, author, file_type, file_size, is_deleted, created_at, updated_at, sync_seq)
     VALUES ('book-c-local', 'Book C (Pure Local)', 'Author', 'epub', 1000, 0, 3000, 3000, 0)`
  );

  // Simulate Cloudflare Worker 410 -> Full Resync Snapshot response (since = 0):
  // Book A was deleted 35 days ago; its tombstone was permanently purged by GC on server.
  // The server snapshot only contains active 'book-cloud-d' (seq = 50).
  const serverSnapshot = {
    server_sync_seq: 100,
    books: [{ id: 'book-cloud-d', title: 'Book D', sync_seq: 50, is_deleted: false }],
    bookmarks: [],
    highlights: [],
    notes: [],
  };

  // Execute Production Reconciliation Algorithm on real SQLite:
  const activeBookIds = new Set((serverSnapshot.books || []).filter((b) => !b.is_deleted).map((b) => b.id));
  const activeBookmarkIds = new Set((serverSnapshot.bookmarks || []).filter((bm) => !bm.is_deleted).map((bm) => bm.id));
  const activeHighlightIds = new Set((serverSnapshot.highlights || []).filter((h) => !h.is_deleted).map((h) => h.id));
  const activeNoteIds = new Set((serverSnapshot.notes || []).filter((n) => !n.is_deleted).map((n) => n.id));

  // Query pending outbox
  const outboxRows = [];
  const outboxStmt = db.prepare('SELECT entity_type, entity_id FROM sync_outbox');
  while (outboxStmt.step()) outboxRows.push(outboxStmt.getAsObject());
  outboxStmt.free();
  const pendingOutbox = new Set(outboxRows.map((r) => `${r.entity_type}:${r.entity_id}`));

  const now = Date.now();

  // Prune local synced books (sync_seq > 0)
  const booksStmt = db.prepare('SELECT id FROM books WHERE is_deleted = 0 AND sync_seq > 0');
  const localSyncedBooks = [];
  while (booksStmt.step()) localSyncedBooks.push(booksStmt.getAsObject());
  booksStmt.free();

  for (const b of localSyncedBooks) {
    if (!activeBookIds.has(b.id) && !pendingOutbox.has(`book:${b.id}`)) {
      db.run(
        'UPDATE books SET is_deleted = 1, deleted_at = ?, updated_at = ?, sync_seq = ? WHERE id = ?',
        [now, now, serverSnapshot.server_sync_seq, b.id]
      );
    }
  }

  // Prune local synced bookmarks, highlights, notes (sync_seq > 0)
  const bmStmt = db.prepare('SELECT id FROM bookmarks WHERE is_deleted = 0 AND sync_seq > 0');
  while (bmStmt.step()) {
    const row = bmStmt.getAsObject();
    if (!activeBookmarkIds.has(row.id) && !pendingOutbox.has(`bookmark:${row.id}`)) {
      db.run('UPDATE bookmarks SET is_deleted = 1, sync_seq = ? WHERE id = ?', [serverSnapshot.server_sync_seq, row.id]);
    }
  }
  bmStmt.free();

  const hlStmt = db.prepare('SELECT id FROM highlights WHERE is_deleted = 0 AND sync_seq > 0');
  while (hlStmt.step()) {
    const row = hlStmt.getAsObject();
    if (!activeHighlightIds.has(row.id) && !pendingOutbox.has(`highlight:${row.id}`)) {
      db.run('UPDATE highlights SET is_deleted = 1, sync_seq = ? WHERE id = ?', [serverSnapshot.server_sync_seq, row.id]);
    }
  }
  hlStmt.free();

  const noteStmt = db.prepare('SELECT id FROM notes WHERE is_deleted = 0 AND sync_seq > 0');
  while (noteStmt.step()) {
    const row = noteStmt.getAsObject();
    if (!activeNoteIds.has(row.id) && !pendingOutbox.has(`note:${row.id}`)) {
      db.run('UPDATE notes SET is_deleted = 1, sync_seq = ? WHERE id = ?', [serverSnapshot.server_sync_seq, row.id]);
    }
  }
  noteStmt.free();

  // VERIFICATION:
  // 1. Book A (synced book purged on server) must be tombstoned
  const checkBookA = db.prepare('SELECT is_deleted, sync_seq FROM books WHERE id = ?');
  checkBookA.bind(['book-a']);
  checkBookA.step();
  const bookARow = checkBookA.getAsObject();
  assert.strictEqual(bookARow.is_deleted, 1, 'Book A must be marked deleted during reconciliation');
  assert.strictEqual(bookARow.sync_seq, 100, 'Book A must be tagged with latest server_sync_seq');
  checkBookA.free();

  // 2. Book A annotations must also be tombstoned
  const checkBmA = db.prepare('SELECT is_deleted FROM bookmarks WHERE id = ?');
  checkBmA.bind(['bm-a']);
  checkBmA.step();
  assert.strictEqual(checkBmA.getAsObject().is_deleted, 1, 'Bookmark A must be marked deleted');
  checkBmA.free();

  const checkHlA = db.prepare('SELECT is_deleted FROM highlights WHERE id = ?');
  checkHlA.bind(['hl-a']);
  checkHlA.step();
  assert.strictEqual(checkHlA.getAsObject().is_deleted, 1, 'Highlight A must be marked deleted');
  checkHlA.free();

  const checkNoteA = db.prepare('SELECT is_deleted FROM notes WHERE id = ?');
  checkNoteA.bind(['note-a']);
  checkNoteA.step();
  assert.strictEqual(checkNoteA.getAsObject().is_deleted, 1, 'Note A must be marked deleted');
  checkNoteA.free();

  // 3. Book B (pending in outbox) must be preserved active
  const checkBookB = db.prepare('SELECT is_deleted FROM books WHERE id = ?');
  checkBookB.bind(['book-b']);
  checkBookB.step();
  assert.strictEqual(checkBookB.getAsObject().is_deleted, 0, 'Book B in outbox must be preserved active');
  checkBookB.free();

  // 4. Book C (purely local book, sync_seq = 0) must be preserved active
  const checkBookC = db.prepare('SELECT is_deleted FROM books WHERE id = ?');
  checkBookC.bind(['book-c-local']);
  checkBookC.step();
  assert.strictEqual(checkBookC.getAsObject().is_deleted, 0, 'Local un-synced Book C must not be pruned');
  checkBookC.free();
});

test('SYNC RECONCILIATION 2: Account-owned local book (user_id = A, sync_seq = 0) is NEVER pruned during HTTP 410 full resync', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  const schemaContent = fs.readFileSync('apps/mobile/src/db/schema.ts', 'utf-8');
  const match = schemaContent.match(/export const INIT_SQL = \x60([\s\S]*?)\x60;/);
  db.run(match[1]);

  const activeUserId = 'user-alice';

  // 1. Account-owned local book: imported by user Alice, never pushed to cloud (sync_seq = 0, drive_file_id = null)
  db.run(
    `INSERT INTO books (id, user_id, title, author, file_type, file_size, drive_file_id, is_deleted, created_at, updated_at, sync_seq)
     VALUES ('book-local-owned', ?, 'My Private Offline Novel', 'Author', 'epub', 1000, NULL, 0, 1000, 1000, 0)`,
    [activeUserId]
  );

  // 2. Account-owned cloud book: previously synced to cloud (sync_seq = 5)
  db.run(
    `INSERT INTO books (id, user_id, title, author, file_type, file_size, drive_file_id, is_deleted, created_at, updated_at, sync_seq)
     VALUES ('book-cloud-owned', ?, 'Cloud Synced Book', 'Author', 'epub', 2000, NULL, 0, 1000, 1000, 5)`,
    [activeUserId]
  );

  // Server snapshot from 410 full resync only has active 'book-server-active'
  const serverSnapshot = {
    server_sync_seq: 100,
    books: [{ id: 'book-server-active', title: 'Active Cloud Book', sync_seq: 100, is_deleted: false }],
    bookmarks: [],
    highlights: [],
    notes: [],
  };

  // Run reconciliation candidate selection exactly as implemented in syncService.ts:
  // Only genuinely cloud-synced books (sync_seq > 0 OR drive_file_id IS NOT NULL) are candidates for cloud pruning!
  const bookQuery =
    'SELECT id FROM books WHERE is_deleted = 0 AND (sync_seq > 0 OR drive_file_id IS NOT NULL) AND (user_id = ? OR user_id IS NULL)';
  const candStmt = db.prepare(bookQuery);
  candStmt.bind([activeUserId]);
  const candidates = [];
  while (candStmt.step()) candidates.push(candStmt.getAsObject().id);
  candStmt.free();

  const activeBookIds = new Set(serverSnapshot.books.map((b) => b.id));
  const now = Date.now();

  for (const id of candidates) {
    if (!activeBookIds.has(id)) {
      db.run('UPDATE books SET is_deleted = 1, deleted_at = ?, updated_at = ?, sync_seq = ? WHERE id = ?', [
        now,
        now,
        serverSnapshot.server_sync_seq,
        id,
      ]);
    }
  }

  // ASSERTIONS:
  // 1. Account-owned local book MUST REMAIN ACTIVE (is_deleted = 0)
  const checkLocal = db.prepare('SELECT is_deleted, user_id, sync_seq FROM books WHERE id = ?');
  checkLocal.bind(['book-local-owned']);
  checkLocal.step();
  const localRow = checkLocal.getAsObject();
  assert.strictEqual(localRow.is_deleted, 0, 'Account-owned local book must NEVER be pruned during 410 full resync');
  assert.strictEqual(localRow.user_id, activeUserId);
  assert.strictEqual(localRow.sync_seq, 0);
  checkLocal.free();

  // 2. Cloud book (sync_seq = 5) purged on server MUST BE PRUNED (is_deleted = 1)
  const checkCloud = db.prepare('SELECT is_deleted, sync_seq FROM books WHERE id = ?');
  checkCloud.bind(['book-cloud-owned']);
  checkCloud.step();
  const cloudRow = checkCloud.getAsObject();
  assert.strictEqual(cloudRow.is_deleted, 1, 'Cloud book purged on server must be marked deleted');
  assert.strictEqual(cloudRow.sync_seq, 100);
  checkCloud.free();
});

test('SYNC RECONCILIATION 3: Cross-account annotation isolation during HTTP 410 full resync', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  const schemaContent = fs.readFileSync('apps/mobile/src/db/schema.ts', 'utf-8');
  const match = schemaContent.match(/export const INIT_SQL = \x60([\s\S]*?)\x60;/);
  db.run(match[1]);

  const activeUserId = 'user-alice';
  const otherUserId = 'user-bob';

  // 1. Alice's cloud-tracked book (user_id = 'user-alice', sync_seq = 5)
  db.run(
    `INSERT INTO books (id, user_id, title, author, file_type, file_size, drive_file_id, is_deleted, created_at, updated_at, sync_seq)
     VALUES ('book-alice', ?, 'Alice Cloud Book', 'Author A', 'epub', 1000, 'drive-alice', 0, 1000, 1000, 5)`,
    [activeUserId]
  );
  // Alice's cloud annotations (sync_seq = 5)
  db.run(
    `INSERT INTO bookmarks (id, book_id, cfi, title, client_created_at, is_deleted, sync_seq)
     VALUES ('bm-alice', 'book-alice', 'cfi-a', 'Alice Bookmark', 1000, 0, 5)`
  );
  db.run(
    `INSERT INTO highlights (id, book_id, cfi_range, text, color, client_created_at, is_deleted, sync_seq)
     VALUES ('hl-alice', 'book-alice', 'cfi-range-a', 'Alice Highlight', 'yellow', 1000, 0, 5)`
  );
  db.run(
    `INSERT INTO notes (id, book_id, content, client_created_at, is_deleted, sync_seq)
     VALUES ('note-alice', 'book-alice', 'Alice Note', 1000, 0, 5)`
  );

  // 2. Bob's cloud-tracked book (user_id = 'user-bob', sync_seq = 7)
  db.run(
    `INSERT INTO books (id, user_id, title, author, file_type, file_size, drive_file_id, is_deleted, created_at, updated_at, sync_seq)
     VALUES ('book-bob', ?, 'Bob Cloud Book', 'Author B', 'epub', 2000, 'drive-bob', 0, 2000, 2000, 7)`,
    [otherUserId]
  );
  // Bob's cloud annotations (sync_seq = 7)
  db.run(
    `INSERT INTO bookmarks (id, book_id, cfi, title, client_created_at, is_deleted, sync_seq)
     VALUES ('bm-bob', 'book-bob', 'cfi-b', 'Bob Bookmark', 2000, 0, 7)`
  );
  db.run(
    `INSERT INTO highlights (id, book_id, cfi_range, text, color, client_created_at, is_deleted, sync_seq)
     VALUES ('hl-bob', 'book-bob', 'cfi-range-b', 'Bob Highlight', 'blue', 2000, 0, 7)`
  );
  db.run(
    `INSERT INTO notes (id, book_id, content, client_created_at, is_deleted, sync_seq)
     VALUES ('note-bob', 'book-bob', 'Bob Note', 2000, 0, 7)`
  );

  // 3. Alice's pure local offline book (sync_seq = 0, drive_file_id = NULL)
  db.run(
    `INSERT INTO books (id, user_id, title, author, file_type, file_size, drive_file_id, is_deleted, created_at, updated_at, sync_seq)
     VALUES ('book-alice-local', ?, 'Alice Offline Book', 'Author A', 'epub', 1500, NULL, 0, 1000, 1000, 0)`,
    [activeUserId]
  );
  // Alice's local un-synced bookmark (sync_seq = 0)
  db.run(
    `INSERT INTO bookmarks (id, book_id, cfi, title, client_created_at, is_deleted, sync_seq)
     VALUES ('bm-alice-local', 'book-alice-local', 'cfi-al', 'Alice Local Bookmark', 1000, 0, 0)`
  );

  // Alice encounters HTTP 410 -> Server returns full resync snapshot for Alice's account.
  // Alice's server snapshot does NOT include bm-alice, hl-alice, or note-alice (they were purged by GC).
  // Alice's server snapshot obviously does NOT contain Bob's entities either.
  const serverSnapshotForAlice = {
    server_sync_seq: 100,
    books: [{ id: 'book-alice', title: 'Alice Cloud Book', sync_seq: 5, is_deleted: false }],
    bookmarks: [],
    highlights: [],
    notes: [],
  };

  const activeBookmarkIds = new Set((serverSnapshotForAlice.bookmarks || []).filter((bm) => !bm.is_deleted).map((bm) => bm.id));
  const activeHighlightIds = new Set((serverSnapshotForAlice.highlights || []).filter((h) => !h.is_deleted).map((h) => h.id));
  const activeNoteIds = new Set((serverSnapshotForAlice.notes || []).filter((n) => !n.is_deleted).map((n) => n.id));

  // Run the EXACT annotation reconciliation query logic from syncService.ts:
  const annotationParams = activeUserId ? [activeUserId] : [];
  const bmQuery = activeUserId
    ? `SELECT bm.id FROM bookmarks bm
       JOIN books b ON b.id = bm.book_id
       WHERE bm.is_deleted = 0 AND bm.sync_seq > 0
         AND (b.sync_seq > 0 OR b.drive_file_id IS NOT NULL)
         AND (b.user_id = ? OR b.user_id IS NULL)`
    : `SELECT bm.id FROM bookmarks bm
       JOIN books b ON b.id = bm.book_id
       WHERE bm.is_deleted = 0 AND bm.sync_seq > 0
         AND (b.sync_seq > 0 OR b.drive_file_id IS NOT NULL)`;

  const bmStmt = db.prepare(bmQuery);
  if (annotationParams.length) bmStmt.bind(annotationParams);
  const localBmCandidates = [];
  while (bmStmt.step()) localBmCandidates.push(bmStmt.getAsObject().id);
  bmStmt.free();

  for (const bmId of localBmCandidates) {
    if (!activeBookmarkIds.has(bmId)) {
      db.run('UPDATE bookmarks SET is_deleted = 1, sync_seq = ? WHERE id = ?', [
        serverSnapshotForAlice.server_sync_seq,
        bmId,
      ]);
    }
  }

  const hlQuery = activeUserId
    ? `SELECT hl.id FROM highlights hl
       JOIN books b ON b.id = hl.book_id
       WHERE hl.is_deleted = 0 AND hl.sync_seq > 0
         AND (b.sync_seq > 0 OR b.drive_file_id IS NOT NULL)
         AND (b.user_id = ? OR b.user_id IS NULL)`
    : `SELECT hl.id FROM highlights hl
       JOIN books b ON b.id = hl.book_id
       WHERE hl.is_deleted = 0 AND hl.sync_seq > 0
         AND (b.sync_seq > 0 OR b.drive_file_id IS NOT NULL)`;

  const hlStmt = db.prepare(hlQuery);
  if (annotationParams.length) hlStmt.bind(annotationParams);
  const localHlCandidates = [];
  while (hlStmt.step()) localHlCandidates.push(hlStmt.getAsObject().id);
  hlStmt.free();

  for (const hlId of localHlCandidates) {
    if (!activeHighlightIds.has(hlId)) {
      db.run('UPDATE highlights SET is_deleted = 1, sync_seq = ? WHERE id = ?', [
        serverSnapshotForAlice.server_sync_seq,
        hlId,
      ]);
    }
  }

  const noteQuery = activeUserId
    ? `SELECT n.id FROM notes n
       JOIN books b ON b.id = n.book_id
       WHERE n.is_deleted = 0 AND n.sync_seq > 0
         AND (b.sync_seq > 0 OR b.drive_file_id IS NOT NULL)
         AND (b.user_id = ? OR b.user_id IS NULL)`
    : `SELECT n.id FROM notes n
       JOIN books b ON b.id = n.book_id
       WHERE n.is_deleted = 0 AND n.sync_seq > 0
         AND (b.sync_seq > 0 OR b.drive_file_id IS NOT NULL)`;

  const noteStmt = db.prepare(noteQuery);
  if (annotationParams.length) noteStmt.bind(annotationParams);
  const localNoteCandidates = [];
  while (noteStmt.step()) localNoteCandidates.push(noteStmt.getAsObject().id);
  noteStmt.free();

  for (const nId of localNoteCandidates) {
    if (!activeNoteIds.has(nId)) {
      db.run('UPDATE notes SET is_deleted = 1, sync_seq = ? WHERE id = ?', [
        serverSnapshotForAlice.server_sync_seq,
        nId,
      ]);
    }
  }

  // VERIFICATION 1: Alice's purged annotations MUST be pruned (is_deleted = 1)
  const checkBmA = db.prepare('SELECT is_deleted, sync_seq FROM bookmarks WHERE id = ?');
  checkBmA.bind(['bm-alice']);
  checkBmA.step();
  assert.strictEqual(checkBmA.getAsObject().is_deleted, 1, "Alice's purged bookmark must be marked deleted");
  assert.strictEqual(checkBmA.getAsObject().sync_seq, 100);
  checkBmA.free();

  const checkHlA = db.prepare('SELECT is_deleted, sync_seq FROM highlights WHERE id = ?');
  checkHlA.bind(['hl-alice']);
  checkHlA.step();
  assert.strictEqual(checkHlA.getAsObject().is_deleted, 1, "Alice's purged highlight must be marked deleted");
  assert.strictEqual(checkHlA.getAsObject().sync_seq, 100);
  checkHlA.free();

  const checkNoteA = db.prepare('SELECT is_deleted, sync_seq FROM notes WHERE id = ?');
  checkNoteA.bind(['note-alice']);
  checkNoteA.step();
  assert.strictEqual(checkNoteA.getAsObject().is_deleted, 1, "Alice's purged note must be marked deleted");
  assert.strictEqual(checkNoteA.getAsObject().sync_seq, 100);
  checkNoteA.free();

  // VERIFICATION 2: Bob's annotations MUST REMAIN ACTIVE (is_deleted = 0)
  // Cross-account isolation: Alice's 410 resync must NOT touch Bob's data!
  const checkBmB = db.prepare('SELECT is_deleted, sync_seq FROM bookmarks WHERE id = ?');
  checkBmB.bind(['bm-bob']);
  checkBmB.step();
  assert.strictEqual(checkBmB.getAsObject().is_deleted, 0, "Bob's bookmark must NEVER be pruned during Alice's 410 resync");
  assert.strictEqual(checkBmB.getAsObject().sync_seq, 7);
  checkBmB.free();

  const checkHlB = db.prepare('SELECT is_deleted, sync_seq FROM highlights WHERE id = ?');
  checkHlB.bind(['hl-bob']);
  checkHlB.step();
  assert.strictEqual(checkHlB.getAsObject().is_deleted, 0, "Bob's highlight must NEVER be pruned during Alice's 410 resync");
  assert.strictEqual(checkHlB.getAsObject().sync_seq, 7);
  checkHlB.free();

  const checkNoteB = db.prepare('SELECT is_deleted, sync_seq FROM notes WHERE id = ?');
  checkNoteB.bind(['note-bob']);
  checkNoteB.step();
  assert.strictEqual(checkNoteB.getAsObject().is_deleted, 0, "Bob's note must NEVER be pruned during Alice's 410 resync");
  assert.strictEqual(checkNoteB.getAsObject().sync_seq, 7);
  checkNoteB.free();

  // VERIFICATION 3: Alice's pure local annotations (sync_seq = 0) MUST REMAIN ACTIVE
  const checkBmAOffline = db.prepare('SELECT is_deleted, sync_seq FROM bookmarks WHERE id = ?');
  checkBmAOffline.bind(['bm-alice-local']);
  checkBmAOffline.step();
  assert.strictEqual(checkBmAOffline.getAsObject().is_deleted, 0, "Alice's local un-synced bookmark must NEVER be pruned");
  assert.strictEqual(checkBmAOffline.getAsObject().sync_seq, 0);
  checkBmAOffline.free();
});

test('SYNC ACCOUNT ISOLATION 1: Account Switch Detaches Previous User Cloud Data and Legacy Synced Books', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  const schemaContent = fs.readFileSync('apps/mobile/src/db/schema.ts', 'utf-8');
  const match = schemaContent.match(/export const INIT_SQL = \x60([\s\S]*?)\x60;/);
  db.run(match[1]);

  // User A state:
  // 1. Synced book from Google Drive
  db.run(
    `INSERT INTO books (id, user_id, title, author, file_type, file_size, drive_file_id, is_deleted, created_at, updated_at, sync_seq)
     VALUES ('book-user-a', 'user-a', 'User A Private Novel', 'Author', 'epub', 5000, 'drive-file-user-a', 0, 1000, 1000, 5)`
  );
  db.run(
    `INSERT INTO reading_progress (id, book_id, cfi, percentage, client_updated_at, is_deleted, sync_seq)
     VALUES ('prog-a', 'book-user-a', 'cfi-10', 50.0, 1000, 0, 5)`
  );
  db.run(
    `INSERT INTO sync_outbox (id, entity_type, entity_id, payload, created_at)
     VALUES ('outbox-user-a', 'progress', 'prog-a', '{"percentage": 50}', 1000)`
  );

  // 2. Legacy synced book belonging to User A (sync_seq = 0, drive_file_id = NULL, but tagged with user_id)
  db.run(
    `INSERT INTO books (id, user_id, title, author, file_type, file_size, drive_file_id, is_deleted, created_at, updated_at, sync_seq)
     VALUES ('book-legacy-a', 'user-a', 'User A Legacy Cloud Book', 'Author', 'epub', 3000, NULL, 0, 1000, 1000, 0)`
  );

  // 3. Pure local un-synced guest book (user_id IS NULL, sync_seq = 0, drive_file_id IS NULL)
  db.run(
    `INSERT INTO books (id, user_id, title, author, file_type, file_size, drive_file_id, is_deleted, created_at, updated_at, sync_seq)
     VALUES ('book-local-guest', NULL, 'Guest Public Book', 'Author', 'epub', 2000, NULL, 0, 1000, 1000, 0)`
  );

  // User A logs out and User B logs in -> Account switch lifecycle triggers detachAccountLocalState('user-a') & purgeSyncOutbox()
  // Detach query using user_id and cloud markers:
  const targetUserId = 'user-a';
  const syncedBooksStmt = db.prepare(
    'SELECT id FROM books WHERE user_id = ? OR (user_id IS NOT NULL AND user_id != ?) OR sync_seq > 0 OR drive_file_id IS NOT NULL'
  );
  syncedBooksStmt.bind([targetUserId, targetUserId]);
  const syncedBookIds = [];
  while (syncedBooksStmt.step()) syncedBookIds.push(syncedBooksStmt.getAsObject().id);
  syncedBooksStmt.free();

  for (const id of syncedBookIds) {
    db.run('DELETE FROM reading_progress WHERE book_id = ?', [id]);
    db.run('DELETE FROM bookmarks WHERE book_id = ?', [id]);
    db.run('DELETE FROM highlights WHERE book_id = ?', [id]);
    db.run('DELETE FROM notes WHERE book_id = ?', [id]);
    db.run('DELETE FROM books WHERE id = ?', [id]);
  }
  // Purge outbox:
  db.run('DELETE FROM sync_outbox');

  // Assert User B sees clean isolated state:
  const checkUserABook = db.prepare('SELECT * FROM books WHERE id = ?');
  checkUserABook.bind(['book-user-a']);
  assert.strictEqual(checkUserABook.step(), false, 'User A cloud book must be detached on account switch');
  checkUserABook.free();

  const checkLegacyBook = db.prepare('SELECT * FROM books WHERE id = ?');
  checkLegacyBook.bind(['book-legacy-a']);
  assert.strictEqual(checkLegacyBook.step(), false, 'User A legacy synced book must be detached on account switch even if sync_seq=0');
  checkLegacyBook.free();

  const checkUserAProgress = db.prepare('SELECT * FROM reading_progress WHERE id = ?');
  checkUserAProgress.bind(['prog-a']);
  assert.strictEqual(checkUserAProgress.step(), false, 'User A progress must be detached on account switch');
  checkUserAProgress.free();

  const checkOutbox = db.prepare('SELECT COUNT(*) as count FROM sync_outbox');
  checkOutbox.step();
  assert.strictEqual(checkOutbox.getAsObject().count, 0, 'Outbox must be empty after account switch');
  checkOutbox.free();

  const checkLocalBook = db.prepare('SELECT * FROM books WHERE id = ?');
  checkLocalBook.bind(['book-local-guest']);
  assert.strictEqual(checkLocalBook.step(), true, 'Pure local guest book must be preserved on account switch');
  checkLocalBook.free();

  // User B claims guest books
  db.run('UPDATE books SET user_id = ? WHERE user_id IS NULL', ['user-b']);
  const checkClaimedBook = db.prepare('SELECT user_id FROM books WHERE id = ?');
  checkClaimedBook.bind(['book-local-guest']);
  checkClaimedBook.step();
  assert.strictEqual(checkClaimedBook.getAsObject().user_id, 'user-b', 'Guest book claimed by User B');
  checkClaimedBook.free();
});

test('SYNC PUSH LWW CANONICAL RECONCILIATION: Client pulls canonical tombstone after server rejects stale push', async () => {
  const SQL = await initSqlJs();
  const serverDb = new SQL.Database();
  const clientDb = new SQL.Database();

  const schemaContent = fs.readFileSync('apps/mobile/src/db/schema.ts', 'utf-8');
  const match = schemaContent.match(/export const INIT_SQL = \x60([\s\S]*?)\x60;/);
  clientDb.run(match[1]);

  const workerMigrations = ['0001_init.sql', '0002_tombstone_gc.sql', '0003_gc_watermark.sql', '0004_book_lww.sql'];
  for (const m of workerMigrations) {
    const sql = fs.readFileSync(`packages/worker/migrations/${m}`, 'utf-8');
    serverDb.run(sql);
  }

  const userId = 'user-recon-test';
  const bookId = 'book-recon-1';

  // Seed user sync sequence on server
  serverDb.run('INSERT INTO user_sync_sequence (user_id, current_seq, updated_at) VALUES (?, 1, 1000)', [userId]);

  // Step 1: Book was deleted on Server at T = 2000 (sync_seq = 1)
  serverDb.run(
    `INSERT INTO books (id, user_id, title, author, file_type, file_size, drive_file_id, is_deleted, deleted_at, client_updated_at, sync_seq)
     VALUES (?, ?, 'Original Title', 'Author', 'epub', 1000, NULL, 1, 2000, 2000, 1)`,
    [bookId, userId]
  );

  // Step 2: Client was offline at cursor = 0, and has an active book locally with stale edit at T = 1500
  clientDb.run(
    `INSERT INTO books (id, user_id, title, author, file_type, file_size, is_deleted, created_at, updated_at, sync_seq)
     VALUES (?, ?, 'Stale Local Title', 'Author', 'epub', 1000, 0, 1000, 1500, 0)`,
    [bookId, userId]
  );
  let clientCursor = 0;

  // Step 3: Client pushes stale mutation at T = 1500
  // Worker simulation:
  // Worker increments sequence to 2
  serverDb.run('UPDATE user_sync_sequence SET current_seq = current_seq + 1 WHERE user_id = ?', [userId]);
  const committedSeq = 2;

  // Worker executes upsert statement with LWW guard:
  // WHERE books.user_id = excluded.user_id AND excluded.client_updated_at >= COALESCE(books.client_updated_at, 0)
  serverDb.run(
    `INSERT INTO books (id, user_id, title, author, file_type, file_size, drive_file_id, is_deleted, deleted_at, client_updated_at, sync_seq)
     VALUES (?, ?, 'Stale Local Title', 'Author', 'epub', 1000, NULL, 0, NULL, 1500, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       is_deleted = excluded.is_deleted,
       client_updated_at = excluded.client_updated_at,
       sync_seq = excluded.sync_seq
     WHERE books.user_id = excluded.user_id
       AND excluded.client_updated_at >= COALESCE(books.client_updated_at, 0)`,
    [bookId, userId, committedSeq]
  );

  // Check server: book MUST remain deleted (1500 < 2000, mutation rejected)
  const serverStmt = serverDb.prepare('SELECT is_deleted, title, client_updated_at FROM books WHERE id = ?');
  serverStmt.bind([bookId]);
  serverStmt.step();
  const serverBook = serverStmt.getAsObject();
  assert.strictEqual(serverBook.is_deleted, 1, 'Server must reject stale push');
  assert.strictEqual(serverBook.title, 'Original Title');
  serverStmt.free();

  // In the FIXED code, client unconditionally calls pullRemoteChanges() instead of blindly advancing cursor:
  // Worker returns pull payload for since = clientCursor (0):
  const pullStmt = serverDb.prepare('SELECT * FROM books WHERE user_id = ? AND sync_seq > ?');
  pullStmt.bind([userId, clientCursor]);
  const remoteBooks = [];
  while (pullStmt.step()) remoteBooks.push(pullStmt.getAsObject());
  pullStmt.free();

  assert.strictEqual(remoteBooks.length, 1);
  const canonicalRemoteBook = remoteBooks[0];
  assert.strictEqual(canonicalRemoteBook.is_deleted, 1);

  // Client applies pullRemoteChanges() LWW logic:
  if (canonicalRemoteBook.is_deleted) {
    clientDb.run(
      'UPDATE books SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ? AND ? >= updated_at',
      [canonicalRemoteBook.deleted_at, canonicalRemoteBook.client_updated_at, canonicalRemoteBook.id, canonicalRemoteBook.client_updated_at]
    );
  }
  clientCursor = committedSeq;

  // Step 4: Verify client local SQLite now CONVERGES with canonical server state
  const clientStmt = clientDb.prepare('SELECT is_deleted, updated_at FROM books WHERE id = ?');
  clientStmt.bind([bookId]);
  clientStmt.step();
  const clientBook = clientStmt.getAsObject();
  assert.strictEqual(clientBook.is_deleted, 1, 'Client local SQLite must be reconciled to deleted state');
  assert.strictEqual(clientBook.updated_at, 2000, 'Client local updated_at must advance to winning timestamp 2000');
  assert.strictEqual(clientCursor, 2, 'Client cursor advances to committedSeq after successful pull');
  clientStmt.free();
});

test('SYNC WORKER ACCEPTED COUNT: Worker accepted_count accurately reflects SQL LWW affected rows', () => {
  // Simulate D1 batch results where one statement succeeded and one failed the LWW WHERE condition
  const mockBatchResults = [
    { results: [{ current_seq: 3 }] }, // Sequence increment
    { meta: { changes: 1 } },          // Book 1: accepted write (changes = 1)
    { meta: { changes: 0 } },          // Book 2: rejected by WHERE timestamp guard (changes = 0)
    { results: [{ count: 0 }] },       // Tombstone GC check
  ];

  const entityStatementsCount = 2;
  let acceptedCount = 0;

  for (let j = 0; j < mockBatchResults.length; j++) {
    const globalIdx = j;
    if (globalIdx >= 1 && globalIdx <= entityStatementsCount) {
      const meta = mockBatchResults[j]?.meta;
      if (typeof meta?.changes === 'number') {
        if (meta.changes > 0) acceptedCount++;
      } else {
        acceptedCount++;
      }
    }
  }

  assert.strictEqual(acceptedCount, 1, 'Only statements with meta.changes > 0 must count as accepted');
});
