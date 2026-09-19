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
  Book,
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
  try {
    const db = c.env.DB;
    // TODO: Extract authenticated user_id from Google ID token header
    const userId = c.req.header('x-user-id') || 'dev-user-001';

    let body: SyncPushPayload;
    try {
      body = await c.req.json<SyncPushPayload>();
    } catch {
      return c.json({ error: 'Invalid JSON payload' }, 400);
    }

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

    // Batch upsert books metadata
    if (body.books && body.books.length > 0) {
      for (const b of body.books) {
        if (!b?.id) continue;
        const title = b.title?.trim() || 'Chưa có tiêu đề';
        const author = b.author?.trim() || 'Tác giả không rõ';
        const fileType = b.file_type || 'epub';
        const fileSize = typeof b.file_size === 'number' && !isNaN(b.file_size) ? b.file_size : 0;
        const isDeleted = b.is_deleted ? 1 : 0;

        statements.push(
          db
            .prepare(
              `INSERT INTO books (id, user_id, title, author, cover_url, file_type, file_size, drive_file_id, is_deleted, sync_seq)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 title = CASE WHEN excluded.is_deleted = 0 AND excluded.title != 'Chưa có tiêu đề' THEN excluded.title ELSE books.title END,
                 author = CASE WHEN excluded.is_deleted = 0 AND excluded.author != 'Tác giả không rõ' THEN excluded.author ELSE books.author END,
                 cover_url = CASE WHEN excluded.is_deleted = 0 THEN COALESCE(excluded.cover_url, books.cover_url) ELSE books.cover_url END,
                 file_type = CASE WHEN excluded.is_deleted = 0 AND excluded.file_type != '' THEN excluded.file_type ELSE books.file_type END,
                 file_size = CASE WHEN excluded.is_deleted = 0 AND excluded.file_size > 0 THEN excluded.file_size ELSE books.file_size END,
                 drive_file_id = CASE WHEN excluded.is_deleted = 0 THEN COALESCE(excluded.drive_file_id, books.drive_file_id) ELSE books.drive_file_id END,
                 is_deleted = excluded.is_deleted,
                 sync_seq = excluded.sync_seq`
            )
            .bind(
              b.id,
              userId,
              title,
              author,
              b.cover_url ?? null,
              fileType,
              fileSize,
              b.drive_file_id ?? null,
              isDeleted,
              newSeq
            )
        );
        acceptedCount++;
      }
    }

    // Batch insert/update reading progress (LWW by client_updated_at)
    if (body.progress && body.progress.length > 0) {
      for (const p of body.progress) {
        if (!p?.id || !p?.book_id) continue;
        const cfi = p.cfi || '';
        const percentage = typeof p.percentage === 'number' && !isNaN(p.percentage) ? p.percentage : 0;
        const clientUpdatedAt = typeof p.client_updated_at === 'number' && !isNaN(p.client_updated_at) ? p.client_updated_at : now;
        const isDeleted = p.is_deleted ? 1 : 0;

        statements.push(
          db
            .prepare(
              `INSERT INTO reading_progress (id, user_id, book_id, cfi, percentage, client_updated_at, is_deleted, sync_seq)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id, book_id) DO UPDATE SET
                 cfi = CASE WHEN excluded.is_deleted = 0 AND excluded.cfi != '' THEN excluded.cfi ELSE reading_progress.cfi END,
                 percentage = CASE WHEN excluded.is_deleted = 0 THEN excluded.percentage ELSE reading_progress.percentage END,
                 client_updated_at = excluded.client_updated_at,
                 is_deleted = excluded.is_deleted,
                 sync_seq = excluded.sync_seq
               WHERE excluded.client_updated_at >= reading_progress.client_updated_at`
            )
            .bind(
              p.id,
              userId,
              p.book_id,
              cfi,
              percentage,
              clientUpdatedAt,
              isDeleted,
              newSeq
            )
        );
        acceptedCount++;
      }
    }

    // Batch upsert bookmarks
    if (body.bookmarks && body.bookmarks.length > 0) {
      for (const b of body.bookmarks) {
        if (!b?.id) continue;
        const bookId = b.book_id || '';
        const cfi = b.cfi || '';
        const title = b.title || '';
        const clientCreatedAt = typeof b.client_created_at === 'number' && !isNaN(b.client_created_at) ? b.client_created_at : now;
        const isDeleted = b.is_deleted ? 1 : 0;

        statements.push(
          db
            .prepare(
              `INSERT INTO bookmarks (id, user_id, book_id, cfi, title, client_created_at, is_deleted, sync_seq)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 book_id = CASE WHEN excluded.is_deleted = 0 AND excluded.book_id != '' THEN excluded.book_id ELSE bookmarks.book_id END,
                 title = CASE WHEN excluded.is_deleted = 0 AND excluded.title != '' THEN excluded.title ELSE bookmarks.title END,
                 cfi = CASE WHEN excluded.is_deleted = 0 AND excluded.cfi != '' THEN excluded.cfi ELSE bookmarks.cfi END,
                 is_deleted = excluded.is_deleted,
                 sync_seq = excluded.sync_seq`
            )
            .bind(
              b.id,
              userId,
              bookId,
              cfi,
              title,
              clientCreatedAt,
              isDeleted,
              newSeq
            )
        );
        acceptedCount++;
      }
    }

    // Batch upsert highlights
    if (body.highlights && body.highlights.length > 0) {
      for (const h of body.highlights) {
        if (!h?.id) continue;
        const bookId = h.book_id || '';
        const cfiRange = h.cfi_range || '';
        const text = h.text || '';
        const color = h.color || 'yellow';
        const clientCreatedAt = typeof h.client_created_at === 'number' && !isNaN(h.client_created_at) ? h.client_created_at : now;
        const isDeleted = h.is_deleted ? 1 : 0;

        statements.push(
          db
            .prepare(
              `INSERT INTO highlights (id, user_id, book_id, cfi_range, text, color, note, client_created_at, is_deleted, sync_seq)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 book_id = CASE WHEN excluded.is_deleted = 0 AND excluded.book_id != '' THEN excluded.book_id ELSE highlights.book_id END,
                 cfi_range = CASE WHEN excluded.is_deleted = 0 AND excluded.cfi_range != '' THEN excluded.cfi_range ELSE highlights.cfi_range END,
                 text = CASE WHEN excluded.is_deleted = 0 AND excluded.text != '' THEN excluded.text ELSE highlights.text END,
                 color = CASE WHEN excluded.is_deleted = 0 AND excluded.color != '' THEN excluded.color ELSE highlights.color END,
                 note = CASE WHEN excluded.is_deleted = 0 THEN COALESCE(excluded.note, highlights.note) ELSE highlights.note END,
                 is_deleted = excluded.is_deleted,
                 sync_seq = excluded.sync_seq`
            )
            .bind(
              h.id,
              userId,
              bookId,
              cfiRange,
              text,
              color,
              h.note ?? null,
              clientCreatedAt,
              isDeleted,
              newSeq
            )
        );
        acceptedCount++;
      }
    }

    // Batch upsert notes
    if (body.notes && body.notes.length > 0) {
      for (const n of body.notes) {
        if (!n?.id) continue;
        const bookId = n.book_id || '';
        const content = n.content || '';
        const clientCreatedAt = typeof n.client_created_at === 'number' && !isNaN(n.client_created_at) ? n.client_created_at : now;
        const isDeleted = n.is_deleted ? 1 : 0;

        statements.push(
          db
            .prepare(
              `INSERT INTO notes (id, user_id, book_id, highlight_id, content, client_created_at, is_deleted, sync_seq)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 book_id = CASE WHEN excluded.is_deleted = 0 AND excluded.book_id != '' THEN excluded.book_id ELSE notes.book_id END,
                 highlight_id = CASE WHEN excluded.is_deleted = 0 THEN COALESCE(excluded.highlight_id, notes.highlight_id) ELSE notes.highlight_id END,
                 content = CASE WHEN excluded.is_deleted = 0 AND excluded.content != '' THEN excluded.content ELSE notes.content END,
                 is_deleted = excluded.is_deleted,
                 sync_seq = excluded.sync_seq`
            )
            .bind(
              n.id,
              userId,
              bookId,
              n.highlight_id ?? null,
              content,
              clientCreatedAt,
              isDeleted,
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
  } catch (err: any) {
    console.error('[Sync Worker] Push error:', err);
    return c.json({ error: err?.message || 'Sync push failed on server' }, 500);
  }
});

// ------------------------------------------------------------------------------
// Sync Pull (Fetch incremental changes newer than client cursor `since`)
// ------------------------------------------------------------------------------
app.get('/api/sync/pull', async (c) => {
  try {
    const db = c.env.DB;
    const userId = c.req.header('x-user-id') || 'dev-user-001';
    const since = parseInt(c.req.query('since') || '0', 10);
    const ifNoneMatch = c.req.header('if-none-match');

    const seqRow = await db
      .prepare('SELECT current_seq FROM user_sync_sequence WHERE user_id = ?')
      .bind(userId)
      .first<{ current_seq: number }>();

    const currentServerSeq = seqRow?.current_seq ?? 0;
    const etag = `W/"${currentServerSeq}"`;

    // 100k Writes/Day & Reads Quota Defense:
    // If client ETag matches or client cursor is already at or beyond currentServerSeq,
    // skip all 5 D1 queries!
    if (ifNoneMatch === etag || (since > 0 && since >= currentServerSeq)) {
      c.header('ETag', etag);
      c.header('Cache-Control', 'private, no-cache');
      const emptyResponse: SyncPullResponse = {
        server_sync_seq: currentServerSeq,
        books: [],
        progress: [],
        bookmarks: [],
        highlights: [],
        notes: [],
      };
      return c.json(emptyResponse, 200);
    }

    // Parallel queries for changed items
    const [booksRes, progressRes, bookmarksRes, highlightsRes, notesRes] = await Promise.all([
      db
        .prepare('SELECT * FROM books WHERE user_id = ? AND sync_seq > ?')
        .bind(userId, since)
        .all<Book>(),
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
      books: (booksRes.results || []).map((r: any) => ({
        ...r,
        is_deleted: Boolean(r.is_deleted),
      })),
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

    c.header('ETag', etag);
    c.header('Cache-Control', 'private, no-cache');
    return c.json(response);
  } catch (err: any) {
    console.error('[Sync Worker] Pull error:', err);
    return c.json({ error: err?.message || 'Sync pull failed on server' }, 500);
  }
});

export default app;
