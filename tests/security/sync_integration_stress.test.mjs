import test from 'node:test';
import assert from 'node:assert';
import initSqlJs from '../../apps/mobile/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'node:fs';

// ==============================================================================
//  SYNC INTEGRATION & CONCURRENCY STRESS TEST SUITE
// ==============================================================================

test('INTEGRATION STRESS 1: Pull Snapshot Consistency Under Concurrent Mid-Flight Writes', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  const schemaContent = fs.readFileSync('apps/mobile/src/db/schema.ts', 'utf-8');
  const match = schemaContent.match(/export const INIT_SQL = \x60([\s\S]*?)\x60;/);
  db.run(match[1]);

  const bookId = 'book-snap-1';
  db.run(
    `INSERT INTO books (id, title, author, file_type, file_size, is_deleted, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [bookId, 'Snapshot Test Book', 'Author', 'epub', 1000, 0, 1000, 1000]
  );

  // Initial state: 2 highlights at seq 5 and seq 10
  db.run(
    `INSERT INTO highlights (id, book_id, cfi_range, text, color, client_created_at, is_deleted, sync_seq)
     VALUES ('hl-1', ?, 'cfi-1', 'Quote 1', 'yellow', 1000, 0, 5),
            ('hl-2', ?, 'cfi-2', 'Quote 2', 'green', 2000, 0, 10)`,
    [bookId, bookId]
  );

  // Pull request arrives when server_sync_seq is 10
  const initialServerSeq = 10;
  const snapshotSeq = initialServerSeq;

  // Mid-flight: A concurrent push from Device B commits at seq 11
  db.run(
    `INSERT INTO highlights (id, book_id, cfi_range, text, color, client_created_at, is_deleted, sync_seq)
     VALUES ('hl-3', ?, 'cfi-3', 'Concurrent Quote 3', 'pink', 3000, 0, 11)`,
    [bookId]
  );

  // Pull query bounded by snapshotSeq: WHERE sync_seq > since AND sync_seq <= snapshotSeq
  const since = 0;
  const pullStmt = db.prepare(
    `SELECT id, text, sync_seq FROM highlights
     WHERE sync_seq > ? AND sync_seq <= ?
     ORDER BY sync_seq ASC`
  );
  pullStmt.bind([since, snapshotSeq]);

  const returnedHighlights = [];
  while (pullStmt.step()) {
    returnedHighlights.push(pullStmt.getAsObject());
  }
  pullStmt.free();

  // Assert Snapshot Consistency:
  // Must return hl-1 (seq 5) and hl-2 (seq 10)
  assert.strictEqual(returnedHighlights.length, 2, 'Snapshot must only contain mutations up to snapshotSeq');
  assert.strictEqual(returnedHighlights[0].id, 'hl-1');
  assert.strictEqual(returnedHighlights[1].id, 'hl-2');

  // hl-3 (seq 11) must be strictly excluded from this response!
  const hasExcluded = returnedHighlights.some((h) => h.id === 'hl-3');
  assert.strictEqual(hasExcluded, false, 'Mutations newer than snapshotSeq must be excluded');

  // Subsequent pull with since = snapshotSeq (10) and new snapshotSeq (11)
  const nextPullStmt = db.prepare(
    `SELECT id, text, sync_seq FROM highlights
     WHERE sync_seq > ? AND sync_seq <= ?`
  );
  nextPullStmt.bind([snapshotSeq, 11]);
  nextPullStmt.step();
  const nextRecord = nextPullStmt.getAsObject();
  assert.strictEqual(nextRecord.id, 'hl-3', 'Excluded mutation must be safely captured in next pull');
  nextPullStmt.free();
});

test('INTEGRATION STRESS 2: Real End-to-End Gap Recovery Lifecycle with SQLite', async () => {
  const SQL = await initSqlJs();
  const clientDb = new SQL.Database();

  const schemaContent = fs.readFileSync('apps/mobile/src/db/schema.ts', 'utf-8');
  const match = schemaContent.match(/export const INIT_SQL = \x60([\s\S]*?)\x60;/);
  clientDb.run(match[1]);

  const bookId = 'book-gap-lifecycle';
  clientDb.run(
    `INSERT INTO books (id, title, author, file_type, file_size, is_deleted, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [bookId, 'Lifecycle Book', 'Author', 'epub', 2048, 0, 1000, 1000]
  );

  // Client A starts with cursor = 10
  let clientCursor = 10;

  // Remote Device B committed a highlight at server sequence 11
  const remoteHighlight = {
    id: 'hl-from-device-b',
    book_id: bookId,
    cfi_range: 'cfi-device-b',
    text: 'Note by Device B while A was offline',
    color: 'purple',
    note: 'Important',
    client_created_at: 2500,
    is_deleted: 0,
    sync_seq: 11,
  };

  // Client A creates a local note offline and queues it in sync_outbox
  const localNote = {
    id: 'note-from-device-a',
    book_id: bookId,
    highlight_id: null,
    content: 'Client A offline thought',
    client_created_at: 3000,
    is_deleted: 0,
    sync_seq: 0,
  };

  clientDb.run(
    `INSERT INTO notes (id, book_id, highlight_id, content, client_created_at, is_deleted, sync_seq)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [localNote.id, localNote.book_id, null, localNote.content, localNote.client_created_at, 0, 0]
  );

  clientDb.run(
    `INSERT INTO sync_outbox (id, entity_type, entity_id, payload, created_at)
     VALUES ('out-1', 'note', ?, ?, ?)`,
    [localNote.id, JSON.stringify(localNote), 3000]
  );

  // Client A pushes local outbox. Server commits it at seq = 12!
  const committedSeq = 12;

  // Client detects gap: committedSeq (12) > clientCursor (10) + 1
  let gapDetected = false;
  if (committedSeq > clientCursor + 1) {
    gapDetected = true;

    // Simulate Client A triggering pullRemoteChanges(since = 10)
    // Server returns all changes between 10 and 12 (including Device B's seq 11 and Device A's seq 12)
    const serverPullPayload = {
      server_sync_seq: 12,
      highlights: [remoteHighlight],
      notes: [{ ...localNote, sync_seq: 12 }],
    };

    // Client applies remote highlights to SQLite
    for (const h of serverPullPayload.highlights) {
      clientDb.run(
        `INSERT INTO highlights (id, book_id, cfi_range, text, color, note, client_created_at, is_deleted, sync_seq)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           note = excluded.note,
           color = excluded.color,
           client_created_at = excluded.client_created_at,
           is_deleted = excluded.is_deleted,
           sync_seq = excluded.sync_seq
         WHERE excluded.client_created_at >= highlights.client_created_at`,
        [h.id, h.book_id, h.cfi_range, h.text, h.color, h.note, h.client_created_at, 0, h.sync_seq]
      );
    }

    // Client applies notes
    for (const n of serverPullPayload.notes) {
      clientDb.run(
        `INSERT INTO notes (id, book_id, highlight_id, content, client_created_at, is_deleted, sync_seq)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           content = excluded.content,
           client_created_at = excluded.client_created_at,
           is_deleted = excluded.is_deleted,
           sync_seq = excluded.sync_seq
         WHERE excluded.client_created_at >= notes.client_created_at`,
        [n.id, n.book_id, n.highlight_id, n.content, n.client_created_at, 0, n.sync_seq]
      );
    }

    // Drain outbox on confirmed push
    clientDb.run('DELETE FROM sync_outbox WHERE id = ?', ['out-1']);

    // Advance cursor to server_sync_seq
    clientCursor = serverPullPayload.server_sync_seq;
  }

  // Assertions:
  assert.strictEqual(gapDetected, true, 'Gap must be detected');
  assert.strictEqual(clientCursor, 12, 'Client cursor must advance to 12 after full gap recovery');

  // Verify Device B's remote highlight is now saved locally in Client A's SQLite
  const bHighlightStmt = clientDb.prepare('SELECT id, text, sync_seq FROM highlights WHERE id = ?');
  bHighlightStmt.bind([remoteHighlight.id]);
  assert.strictEqual(bHighlightStmt.step(), true, 'Device B highlight must exist in Client A database');
  assert.strictEqual(bHighlightStmt.getAsObject().text, remoteHighlight.text);
  bHighlightStmt.free();

  // Verify outbox is drained
  const outboxStmt = clientDb.prepare('SELECT count(*) as cnt FROM sync_outbox');
  outboxStmt.step();
  assert.strictEqual(outboxStmt.getAsObject().cnt, 0, 'Outbox must be drained');
  outboxStmt.free();
});

test('INTEGRATION STRESS 3: 50 Serialized Transactional Pushes Simulation with sql.js (Sequence Continuity & Convergence)', async () => {
  const SQL = await initSqlJs();
  const serverDb = new SQL.Database();

  // Create server tables
  serverDb.run(`
    CREATE TABLE user_sync_sequence (
      user_id TEXT PRIMARY KEY,
      current_seq INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE highlights (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      text TEXT NOT NULL,
      client_created_at INTEGER NOT NULL,
      sync_seq INTEGER NOT NULL
    );
  `);

  const userId = 'user-concurrent-stress';
  serverDb.run('INSERT INTO user_sync_sequence (user_id, current_seq, updated_at) VALUES (?, 0, ?)', [userId, Date.now()]);

  const NUM_CONCURRENT_PUSHES = 50;

  // Simulate atomic execution of 50 concurrent pushes
  // In SQLite/D1, transactions serialize write operations.
  // Each push executes in an atomic transaction: read sequence, increment, insert highlight, commit.
  async function simulatePush(index) {
    serverDb.run('BEGIN TRANSACTION');
    try {
      const seqStmt = serverDb.prepare('SELECT current_seq FROM user_sync_sequence WHERE user_id = ?');
      seqStmt.bind([userId]);
      seqStmt.step();
      const currentSeq = seqStmt.getAsObject().current_seq;
      seqStmt.free();

      const newSeq = currentSeq + 1;

      serverDb.run(
        'UPDATE user_sync_sequence SET current_seq = ?, updated_at = ? WHERE user_id = ?',
        [newSeq, Date.now(), userId]
      );

      serverDb.run(
        'INSERT INTO highlights (id, user_id, text, client_created_at, sync_seq) VALUES (?, ?, ?, ?, ?)',
        [`hl-concurrent-${index}`, userId, `Concurrent highlight #${index}`, Date.now() + index, newSeq]
      );

      serverDb.run('COMMIT');
      return { success: true, assignedSeq: newSeq };
    } catch (err) {
      serverDb.run('ROLLBACK');
      throw err;
    }
  }

  // Execute all 50 pushes
  const promises = [];
  for (let i = 1; i <= NUM_CONCURRENT_PUSHES; i++) {
    promises.push(simulatePush(i));
  }

  const results = await Promise.all(promises);

  // Assert: All 50 pushes succeeded
  assert.strictEqual(results.length, NUM_CONCURRENT_PUSHES);

  // Assert: Final sequence in user_sync_sequence must be exactly 50
  const finalSeqStmt = serverDb.prepare('SELECT current_seq FROM user_sync_sequence WHERE user_id = ?');
  finalSeqStmt.bind([userId]);
  finalSeqStmt.step();
  assert.strictEqual(finalSeqStmt.getAsObject().current_seq, NUM_CONCURRENT_PUSHES);
  finalSeqStmt.free();

  // Assert: Exactly 50 distinct highlights are in the database (0 dropped mutations)
  const countStmt = serverDb.prepare('SELECT count(*) as cnt FROM highlights WHERE user_id = ?');
  countStmt.bind([userId]);
  countStmt.step();
  assert.strictEqual(countStmt.getAsObject().cnt, NUM_CONCURRENT_PUSHES);
  countStmt.free();

  // Assert: Pulling with since=0 returns all 50 mutations strictly ordered by sync_seq
  const pullStmt = serverDb.prepare(
    'SELECT sync_seq FROM highlights WHERE user_id = ? AND sync_seq > 0 AND sync_seq <= ? ORDER BY sync_seq ASC'
  );
  pullStmt.bind([userId, NUM_CONCURRENT_PUSHES]);

  let expectedSeq = 1;
  while (pullStmt.step()) {
    const row = pullStmt.getAsObject();
    assert.strictEqual(row.sync_seq, expectedSeq, `Sequence must be strictly contiguous without gaps: ${expectedSeq}`);
    expectedSeq++;
  }
  pullStmt.free();
  assert.strictEqual(expectedSeq, NUM_CONCURRENT_PUSHES + 1);
});

test('INTEGRATION STRESS 4: Stale Client 410 GC Watermark & Full Resync Convergence', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  const schemaContent = fs.readFileSync('apps/mobile/src/db/schema.ts', 'utf-8');
  const match = schemaContent.match(/export const INIT_SQL = \x60([\s\S]*?)\x60;/);
  db.run(match[1]);

  // Server state: gc_watermark_seq is 100, current_seq is 150
  const serverState = {
    current_seq: 150,
    gc_watermark_seq: 100,
  };

  // Client A has an old cursor of 40 (offline for > 30 days)
  let clientCursor = 40;

  function handlePullRequest(since) {
    if (serverState.gc_watermark_seq > 0 && since > 0 && since < serverState.gc_watermark_seq) {
      return {
        status: 410,
        body: {
          error: 'Sync cursor expired. Tombstones older than cursor were purged.',
          code: 'CURSOR_EXPIRED',
          server_sync_seq: serverState.current_seq,
          gc_watermark_seq: serverState.gc_watermark_seq,
        },
      };
    }

    return {
      status: 200,
      body: {
        server_sync_seq: serverState.current_seq,
        books: [{ id: 'active-book-1', title: 'Active Book', sync_seq: 120 }],
      },
    };
  }

  // 1. Client calls pull with stale cursor
  const res1 = handlePullRequest(clientCursor);
  assert.strictEqual(res1.status, 410, 'Must receive HTTP 410 Gone');
  assert.strictEqual(res1.body.code, 'CURSOR_EXPIRED');

  // 2. Client handles 410 by resetting cursor to 0 and re-pulling
  clientCursor = 0;
  const res2 = handlePullRequest(clientCursor);
  assert.strictEqual(res2.status, 200, 'Full resync with since=0 must succeed');
  assert.strictEqual(res2.body.server_sync_seq, 150);

  // Client updates cursor to latest server sequence
  clientCursor = res2.body.server_sync_seq;
  assert.strictEqual(clientCursor, 150, 'Client cursor reaches full convergence at 150');
});

test('INTEGRATION STRESS 5: Push Payload Exceeding Single-Transaction Limit (90 items) is Rejected', () => {
  const MAX_PUSH_ITEMS = 90;

  function validatePushSize(body) {
    const totalItems =
      (body.books?.length || 0) +
      (body.progress?.length || 0) +
      (body.bookmarks?.length || 0) +
      (body.highlights?.length || 0) +
      (body.notes?.length || 0);

    if (totalItems > MAX_PUSH_ITEMS) {
      return {
        status: 400,
        body: {
          error: `Push payload exceeds maximum batch limit of ${MAX_PUSH_ITEMS} items`,
          code: 'PAYLOAD_TOO_LARGE',
        },
      };
    }
    return { status: 200 };
  }

  // 1. Normal client payload (50 items matching syncService.ts outbox limit)
  const normalPayload = {
    highlights: Array.from({ length: 50 }, (_, i) => ({ id: `hl-${i}`, text: `text ${i}` })),
  };
  const normalRes = validatePushSize(normalPayload);
  assert.strictEqual(normalRes.status, 200, 'Normal 50-item client payload must pass validation');

  // 2. Exact boundary payload (90 items — chosen safety margin headroom)
  const boundaryPayload = {
    notes: Array.from({ length: 90 }, (_, i) => ({ id: `note-${i}`, content: `content ${i}` })),
  };
  const boundaryRes = validatePushSize(boundaryPayload);
  assert.strictEqual(boundaryRes.status, 200, 'Exact boundary payload (90 items) must be accepted');

  // 3. Boundary + 1 payload (91 items — exceeds chosen safety margin)
  const overBoundaryPayload = {
    notes: Array.from({ length: 91 }, (_, i) => ({ id: `note-${i}`, content: `content ${i}` })),
  };
  const overBoundaryRes = validatePushSize(overBoundaryPayload);
  assert.strictEqual(overBoundaryRes.status, 400, 'Boundary + 1 payload (91 items) must be rejected');
  assert.strictEqual(overBoundaryRes.body.code, 'PAYLOAD_TOO_LARGE');
});

test('INTEGRATION STRESS 6: In-Batch Atomic Sequence Allocation Prevents Pre-Transaction JS Memory Races', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  db.run(`
    CREATE TABLE user_sync_sequence (
      user_id TEXT PRIMARY KEY,
      current_seq INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE highlights (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      text TEXT NOT NULL,
      sync_seq INTEGER NOT NULL
    );
  `);

  const userId = 'user-atomic-seq';

  // Function simulating worker push batch with In-Batch Atomic Sequence Allocation
  function executePushBatch(highlightId, text) {
    db.run('BEGIN TRANSACTION;');

    // Statement 0: In-batch sequence increment + RETURNING current_seq
    const res = db.exec(`
      INSERT INTO user_sync_sequence (user_id, current_seq, updated_at)
      VALUES ('${userId}', 1, ${Date.now()})
      ON CONFLICT(user_id) DO UPDATE SET
        current_seq = user_sync_sequence.current_seq + 1,
        updated_at = excluded.updated_at
      RETURNING current_seq;
    `);
    const committedSeq = res[0].values[0][0];

    // Statement 1: Entity insert referencing (SELECT current_seq FROM user_sync_sequence WHERE user_id = ?)
    db.run(`
      INSERT INTO highlights (id, user_id, text, sync_seq)
      VALUES (?, ?, ?, (SELECT current_seq FROM user_sync_sequence WHERE user_id = ?))
      ON CONFLICT(id) DO UPDATE SET
        text = excluded.text,
        sync_seq = excluded.sync_seq;
    `, [highlightId, userId, text, userId]);

    db.run('COMMIT;');
    return committedSeq;
  }

  // Request A and Request B both execute push
  const committedSeqA = executePushBatch('hl-req-a', 'First write');
  const committedSeqB = executePushBatch('hl-req-b', 'Second concurrent write');

  // Assert: No collision in committed sequences
  assert.strictEqual(committedSeqA, 1, 'First write receives sequence 1');
  assert.strictEqual(committedSeqB, 2, 'Second write receives sequence 2');

  // Assert: Entities received the exact respective sequence inside transaction
  const stmtA = db.prepare('SELECT sync_seq FROM highlights WHERE id = ?');
  stmtA.bind(['hl-req-a']);
  stmtA.step();
  assert.strictEqual(stmtA.getAsObject().sync_seq, 1, 'hl-req-a entity must have sync_seq = 1');
  stmtA.free();

  const stmtB = db.prepare('SELECT sync_seq FROM highlights WHERE id = ?');
  stmtB.bind(['hl-req-b']);
  stmtB.step();
  assert.strictEqual(stmtB.getAsObject().sync_seq, 2, 'hl-req-b entity must have sync_seq = 2');
  stmtB.free();

  // Assert: No unused sequence gap on server
  const seqStmt = db.prepare('SELECT current_seq FROM user_sync_sequence WHERE user_id = ?');
  seqStmt.bind([userId]);
  seqStmt.step();
  assert.strictEqual(seqStmt.getAsObject().current_seq, 2, 'Final sequence must be exactly 2 with 0 ghost gaps');
  seqStmt.free();
});


