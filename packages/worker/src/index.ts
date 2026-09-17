import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type {
  SyncPushPayload,
  SyncPullResponse,
  SyncPushResponse,
  ReadingProgress,
  Bookmark,
  Highlight,
  Note,
} from '@folium/shared';

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for web clients & local dev
app.use('*', cors());

// ------------------------------------------------------------------------------
// Health Check
// ------------------------------------------------------------------------------
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'folium-sync-worker',
    timestamp: Date.now(),
  });
});

// ------------------------------------------------------------------------------
// Sync Push (Batch upsert pending mutations from client outbox)
// ------------------------------------------------------------------------------
app.post('/api/sync/push', async (c) => {
  const db = c.env.DB;
  // TODO: Extract authenticated user_id from Google ID token header
  const userId = c.req.header('x-user-id') || 'dev-user-001';

  const body = await c.req.json<SyncPushPayload>();
  const now = Date.now();

  // 1. Advance monotonic sequence atomically for this user
  await db
    .prepare(
      `INSERT INTO user_sync_sequence (user_id, current_seq, updated_at)
       VALUES (?, 1, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         current_seq = current_seq + 1,
         updated_at = ?`
    )
    .bind(userId, now, now)
    .run();

  const seqRow = await db
    .prepare('SELECT current_seq FROM user_sync_sequence WHERE user_id = ?')
    .bind(userId)
    .first<{ current_seq: number }>();

  const newSeq = seqRow?.current_seq ?? 1;

  const statements: D1PreparedStatement[] = [];
  let acceptedCount = 0;

  // Batch insert/update reading progress (LWW by client_updated_at)
  if (body.progress && body.progress.length > 0) {
    for (const p of body.progress) {
      statements.push(
        db
          .prepare(
            `INSERT INTO reading_progress (id, user_id, book_id, cfi, percentage, client_updated_at, is_deleted, sync_seq)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id, book_id) DO UPDATE SET
               cfi = excluded.cfi,
               percentage = excluded.percentage,
               client_updated_at = excluded.client_updated_at,
               is_deleted = excluded.is_deleted,
               sync_seq = excluded.sync_seq
             WHERE excluded.client_updated_at >= reading_progress.client_updated_at`
          )
          .bind(
            p.id,
            userId,
            p.book_id,
            p.cfi,
            p.percentage,
            p.client_updated_at,
            p.is_deleted ? 1 : 0,
            newSeq
          )
      );
      acceptedCount++;
    }
  }

  // Batch upsert bookmarks
  if (body.bookmarks && body.bookmarks.length > 0) {
    for (const b of body.bookmarks) {
      statements.push(
        db
          .prepare(
            `INSERT INTO bookmarks (id, user_id, book_id, cfi, title, client_created_at, is_deleted, sync_seq)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               title = excluded.title,
               cfi = excluded.cfi,
               is_deleted = excluded.is_deleted,
               sync_seq = excluded.sync_seq`
          )
          .bind(
            b.id,
            userId,
            b.book_id,
            b.cfi,
            b.title,
            b.client_created_at,
            b.is_deleted ? 1 : 0,
            newSeq
          )
      );
      acceptedCount++;
    }
  }

  // Batch upsert highlights
  if (body.highlights && body.highlights.length > 0) {
    for (const h of body.highlights) {
      statements.push(
        db
          .prepare(
            `INSERT INTO highlights (id, user_id, book_id, cfi_range, text, color, note, client_created_at, is_deleted, sync_seq)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               note = excluded.note,
               color = excluded.color,
               is_deleted = excluded.is_deleted,
               sync_seq = excluded.sync_seq`
          )
          .bind(
            h.id,
            userId,
            h.book_id,
            h.cfi_range,
            h.text,
            h.color,
            h.note ?? null,
            h.client_created_at,
            h.is_deleted ? 1 : 0,
            newSeq
          )
      );
      acceptedCount++;
    }
  }

  // Batch upsert notes
  if (body.notes && body.notes.length > 0) {
    for (const n of body.notes) {
      statements.push(
        db
          .prepare(
            `INSERT INTO notes (id, user_id, book_id, highlight_id, content, client_created_at, is_deleted, sync_seq)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               content = excluded.content,
               is_deleted = excluded.is_deleted,
               sync_seq = excluded.sync_seq`
          )
          .bind(
            n.id,
            userId,
            n.book_id,
            n.highlight_id ?? null,
            n.content,
            n.client_created_at,
            n.is_deleted ? 1 : 0,
            newSeq
          )
      );
      acceptedCount++;
    }
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }

  const response: SyncPushResponse = {
    committed_sync_seq: newSeq,
    accepted_count: acceptedCount,
  };

  return c.json(response);
});

// ------------------------------------------------------------------------------
// Sync Pull (Fetch incremental changes newer than client cursor `since`)
// ------------------------------------------------------------------------------
app.get('/api/sync/pull', async (c) => {
  const db = c.env.DB;
  const userId = c.req.header('x-user-id') || 'dev-user-001';
  const since = parseInt(c.req.query('since') || '0', 10);

  const seqRow = await db
    .prepare('SELECT current_seq FROM user_sync_sequence WHERE user_id = ?')
    .bind(userId)
    .first<{ current_seq: number }>();

  const currentServerSeq = seqRow?.current_seq ?? 0;

  // Parallel queries for changed items
  const [progressRes, bookmarksRes, highlightsRes, notesRes] = await Promise.all([
    db
      .prepare('SELECT * FROM reading_progress WHERE user_id = ? AND sync_seq > ?')
      .bind(userId, since)
      .all<ReadingProgress>(),
    db
      .prepare('SELECT * FROM bookmarks WHERE user_id = ? AND sync_seq > ?')
      .bind(userId, since)
      .all<Bookmark>(),
    db
      .prepare('SELECT * FROM highlights WHERE user_id = ? AND sync_seq > ?')
      .bind(userId, since)
      .all<Highlight>(),
    db
      .prepare('SELECT * FROM notes WHERE user_id = ? AND sync_seq > ?')
      .bind(userId, since)
      .all<Note>(),
  ]);

  const response: SyncPullResponse = {
    server_sync_seq: currentServerSeq,
    progress: (progressRes.results || []).map((r: any) => ({
      ...r,
      is_deleted: Boolean(r.is_deleted),
    })),
    bookmarks: (bookmarksRes.results || []).map((r: any) => ({
      ...r,
      is_deleted: Boolean(r.is_deleted),
    })),
    highlights: (highlightsRes.results || []).map((r: any) => ({
      ...r,
      is_deleted: Boolean(r.is_deleted),
    })),
    notes: (notesRes.results || []).map((r: any) => ({
      ...r,
      is_deleted: Boolean(r.is_deleted),
    })),
  };

  return c.json(response);
});

export default app;
