import { Hono } from 'hono';
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
import type { Bindings } from '../bindings.ts';
import { getClientIp, checkRateLimit } from '../middleware/rateLimit.ts';
import { authenticateUser } from '../auth/googleAuth.ts';
import { validateSyncPushPayload } from '../sync/validateSyncPushPayload.ts';

export const syncRoutes = new Hono<{ Bindings: Bindings }>();

// ------------------------------------------------------------------------------
// Sync Push (Batch upsert pending mutations from client outbox)
// ------------------------------------------------------------------------------
syncRoutes.post('/api/sync/push', async (c) => {
  try {
    const db = c.env.DB;
    const ip = getClientIp(c.req);
    const userId = await authenticateUser(c.req.header('authorization'), c.env);

    // Rate limit per user if authenticated, per IP if unauthenticated
    const rateKey = `sync:push:${userId ? `user:${userId}` : `ip:${ip}`}`;
    const rateCheck = await checkRateLimit(
      c.env?.SYNC_RATE_LIMITER,
      rateKey,
      60,
      60
    );
    if (!rateCheck.allowed) {
      return c.json(
        { error: 'Too Many Requests', code: 'RATE_LIMITED' },
        429,
        { 'Retry-After': String(rateCheck.retryAfter) }
      );
    }

    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    let body: SyncPushPayload;
    try {
      body = await c.req.json<SyncPushPayload>();
    } catch {
      return c.json({ error: 'Invalid JSON payload' }, 400);
    }

    const schemaValidation = validateSyncPushPayload(body);
    if (!schemaValidation.valid) {
      return c.json({ error: schemaValidation.error, code: 'INVALID_SCHEMA' }, 400);
    }

    const totalItems =
      (body.books?.length || 0) +
      (body.progress?.length || 0) +
      (body.bookmarks?.length || 0) +
      (body.highlights?.length || 0) +
      (body.notes?.length || 0);

    // D1 Single-Transaction Atomicity Invariant:
    // Cloudflare D1 executes each db.batch() in a separate transaction (limit 100 statements).
    // Client outbox is hard-capped at 50 items (syncService.ts:215).
    // Enforce MAX_PUSH_ITEMS = 90 so that sequence advance (1) + mutations (<=90) + GC (<=6)
    // always sum to <= 97 statements, guaranteeing execution in a single atomic transaction.
    const MAX_PUSH_ITEMS = 90;
    if (totalItems > MAX_PUSH_ITEMS) {
      return c.json(
        {
          error: `Push payload exceeds maximum batch limit of ${MAX_PUSH_ITEMS} items (${totalItems} received). Split into smaller batches.`,
          code: 'PAYLOAD_TOO_LARGE',
        },
        400
      );
    }

    const now = Date.now();

    const statements: D1PreparedStatement[] = [];
    let acceptedCount = 0;

    // 1. In-Batch Atomic Sequence Allocation:
    // Advance user sequence directly inside the database transaction (UPSERT with +1).
    // RETURNING current_seq gives the exact committed sequence without pre-transaction JS race conditions.
    statements.push(
      db
        .prepare(
          `INSERT INTO user_sync_sequence (user_id, current_seq, updated_at)
           VALUES (?, 1, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             current_seq = user_sync_sequence.current_seq + 1,
             updated_at = excluded.updated_at
           RETURNING current_seq`
        )
        .bind(userId, now)
    );

    // Batch upsert books metadata
    if (body.books && body.books.length > 0) {
      for (const b of body.books) {
        if (!b?.id) continue;
        const title = b.title?.trim() || 'Chưa có tiêu đề';
        const author = b.author?.trim() || 'Tác giả không rõ';
        const fileType = b.file_type || 'epub';
        const fileSize = typeof b.file_size === 'number' && !isNaN(b.file_size) ? b.file_size : 0;
        const isDeleted = b.is_deleted ? 1 : 0;
        const deletedAt = isDeleted ? (b.deleted_at || now) : null;
        const clientUpdatedAt = typeof b.updated_at === 'number' && !isNaN(b.updated_at)
          ? b.updated_at
          : (typeof b.client_updated_at === 'number' && !isNaN(b.client_updated_at) ? b.client_updated_at : (deletedAt || now));

        statements.push(
          db
            .prepare(
              `INSERT INTO books (id, user_id, title, author, cover_url, file_type, file_size, drive_file_id, is_deleted, deleted_at, client_updated_at, sync_seq)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT current_seq FROM user_sync_sequence WHERE user_id = ?))
               ON CONFLICT(id) DO UPDATE SET
                 title = CASE WHEN excluded.is_deleted = 0 AND excluded.title != 'Chưa có tiêu đề' THEN excluded.title ELSE books.title END,
                 author = CASE WHEN excluded.is_deleted = 0 AND excluded.author != 'Tác giả không rõ' THEN excluded.author ELSE books.author END,
                 cover_url = CASE WHEN excluded.is_deleted = 0 THEN COALESCE(excluded.cover_url, books.cover_url) ELSE books.cover_url END,
                 file_type = CASE WHEN excluded.is_deleted = 0 AND excluded.file_type != '' THEN excluded.file_type ELSE books.file_type END,
                 file_size = CASE WHEN excluded.is_deleted = 0 AND excluded.file_size > 0 THEN excluded.file_size ELSE books.file_size END,
                 drive_file_id = CASE WHEN excluded.is_deleted = 0 THEN COALESCE(excluded.drive_file_id, books.drive_file_id) ELSE books.drive_file_id END,
                 is_deleted = excluded.is_deleted,
                 deleted_at = excluded.deleted_at,
                 client_updated_at = excluded.client_updated_at,
                 sync_seq = excluded.sync_seq
               WHERE books.user_id = excluded.user_id
                 AND excluded.client_updated_at >= COALESCE(books.client_updated_at, 0)`
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
              deletedAt,
              clientUpdatedAt,
              userId
            )
        );
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
        const deletedAt = isDeleted ? (p.deleted_at || now) : null;

        statements.push(
          db
            .prepare(
              `INSERT INTO reading_progress (id, user_id, book_id, cfi, percentage, client_updated_at, is_deleted, deleted_at, sync_seq)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT current_seq FROM user_sync_sequence WHERE user_id = ?))
               ON CONFLICT(user_id, book_id) DO UPDATE SET
                 cfi = CASE WHEN excluded.is_deleted = 0 AND excluded.cfi != '' THEN excluded.cfi ELSE reading_progress.cfi END,
                 percentage = CASE WHEN excluded.is_deleted = 0 THEN excluded.percentage ELSE reading_progress.percentage END,
                 client_updated_at = excluded.client_updated_at,
                 is_deleted = excluded.is_deleted,
                 deleted_at = excluded.deleted_at,
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
              deletedAt,
              userId
            )
        );
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
        const deletedAt = isDeleted ? (b.deleted_at || now) : null;

        statements.push(
          db
            .prepare(
              `INSERT INTO bookmarks (id, user_id, book_id, cfi, title, client_created_at, is_deleted, deleted_at, sync_seq)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT current_seq FROM user_sync_sequence WHERE user_id = ?))
               ON CONFLICT(id) DO UPDATE SET
                 book_id = CASE WHEN excluded.is_deleted = 0 AND excluded.book_id != '' THEN excluded.book_id ELSE bookmarks.book_id END,
                 title = CASE WHEN excluded.is_deleted = 0 AND excluded.title != '' THEN excluded.title ELSE bookmarks.title END,
                 cfi = CASE WHEN excluded.is_deleted = 0 AND excluded.cfi != '' THEN excluded.cfi ELSE bookmarks.cfi END,
                 is_deleted = excluded.is_deleted,
                 deleted_at = excluded.deleted_at,
                 sync_seq = excluded.sync_seq
               WHERE bookmarks.user_id = excluded.user_id
                 AND excluded.client_created_at >= bookmarks.client_created_at`
            )
            .bind(
              b.id,
              userId,
              bookId,
              cfi,
              title,
              clientCreatedAt,
              isDeleted,
              deletedAt,
              userId
            )
        );
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
        const deletedAt = isDeleted ? (h.deleted_at || now) : null;

        statements.push(
          db
            .prepare(
              `INSERT INTO highlights (id, user_id, book_id, cfi_range, text, color, note, client_created_at, is_deleted, deleted_at, sync_seq)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT current_seq FROM user_sync_sequence WHERE user_id = ?))
               ON CONFLICT(id) DO UPDATE SET
                 book_id = CASE WHEN excluded.is_deleted = 0 AND excluded.book_id != '' THEN excluded.book_id ELSE highlights.book_id END,
                 cfi_range = CASE WHEN excluded.is_deleted = 0 AND excluded.cfi_range != '' THEN excluded.cfi_range ELSE highlights.cfi_range END,
                 text = CASE WHEN excluded.is_deleted = 0 AND excluded.text != '' THEN excluded.text ELSE highlights.text END,
                 color = CASE WHEN excluded.is_deleted = 0 AND excluded.color != '' THEN excluded.color ELSE highlights.color END,
                 note = CASE WHEN excluded.is_deleted = 0 THEN COALESCE(excluded.note, highlights.note) ELSE highlights.note END,
                 is_deleted = excluded.is_deleted,
                 deleted_at = excluded.deleted_at,
                 sync_seq = excluded.sync_seq
               WHERE highlights.user_id = excluded.user_id
                 AND excluded.client_created_at >= highlights.client_created_at`
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
              deletedAt,
              userId
            )
        );
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
        const deletedAt = isDeleted ? (n.deleted_at || now) : null;

        statements.push(
          db
            .prepare(
              `INSERT INTO notes (id, user_id, book_id, highlight_id, content, client_created_at, is_deleted, deleted_at, sync_seq)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT current_seq FROM user_sync_sequence WHERE user_id = ?))
               ON CONFLICT(id) DO UPDATE SET
                 book_id = CASE WHEN excluded.is_deleted = 0 AND excluded.book_id != '' THEN excluded.book_id ELSE notes.book_id END,
                 highlight_id = CASE WHEN excluded.is_deleted = 0 THEN COALESCE(excluded.highlight_id, notes.highlight_id) ELSE notes.highlight_id END,
                 content = CASE WHEN excluded.is_deleted = 0 AND excluded.content != '' THEN excluded.content ELSE notes.content END,
                 is_deleted = excluded.is_deleted,
                 deleted_at = excluded.deleted_at,
                 sync_seq = excluded.sync_seq
               WHERE notes.user_id = excluded.user_id
                 AND excluded.client_created_at >= notes.client_created_at`
            )
            .bind(
              n.id,
              userId,
              bookId,
              n.highlight_id ?? null,
              content,
              clientCreatedAt,
              isDeleted,
              deletedAt,
              userId
            )
        );
      }
    }

    const entityStatementsCount = statements.length - 1;

    // 30-Day Tombstone Retention & Auto Garbage Collection
    // Purges tombstones older than 30 days during sync cycles
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const gcThreshold = now - THIRTY_DAYS_MS;

    try {
      const maxPurged = await db
        .prepare(`
          SELECT MAX(seq) as max_seq FROM (
            SELECT sync_seq as seq FROM books WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?
            UNION ALL
            SELECT sync_seq as seq FROM reading_progress WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?
            UNION ALL
            SELECT sync_seq as seq FROM bookmarks WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?
            UNION ALL
            SELECT sync_seq as seq FROM highlights WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?
            UNION ALL
            SELECT sync_seq as seq FROM notes WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?
          )
        `)
        .bind(userId, gcThreshold, userId, gcThreshold, userId, gcThreshold, userId, gcThreshold, userId, gcThreshold)
        .first<{ max_seq: number | null }>();

      if (maxPurged?.max_seq && maxPurged.max_seq > 0) {
        statements.push(
          db
            .prepare(
              `UPDATE user_sync_sequence
               SET gc_watermark_seq = CASE WHEN ? > COALESCE(gc_watermark_seq, 0) THEN ? ELSE gc_watermark_seq END
               WHERE user_id = ?`
            )
            .bind(maxPurged.max_seq, maxPurged.max_seq, userId)
        );
      }
    } catch {
      // Column may not exist yet if migration 0003 is pending
    }

    statements.push(
      db.prepare('DELETE FROM books WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?').bind(userId, gcThreshold),
      db.prepare('DELETE FROM reading_progress WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?').bind(userId, gcThreshold),
      db.prepare('DELETE FROM bookmarks WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?').bind(userId, gcThreshold),
      db.prepare('DELETE FROM highlights WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?').bind(userId, gcThreshold),
      db.prepare('DELETE FROM notes WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?').bind(userId, gcThreshold)
    );

    const D1_BATCH_LIMIT = 100;
    let committedSeq = 0;

    for (let i = 0; i < statements.length; i += D1_BATCH_LIMIT) {
      const chunk = statements.slice(i, i + D1_BATCH_LIMIT);
      if (chunk.length > 0) {
        const batchResults = await db.batch(chunk);
        // Statement 0 in the first chunk returns the newly allocated sequence
        if (i === 0 && batchResults?.[0]?.results?.[0]) {
          const row = batchResults[0].results[0] as { current_seq?: number };
          if (row.current_seq) {
            committedSeq = Number(row.current_seq);
          }
        }

        // Count accepted mutations based on actual affected rows (LWW acceptance)
        for (let j = 0; j < batchResults.length; j++) {
          const globalIdx = i + j;
          if (globalIdx >= 1 && globalIdx <= entityStatementsCount) {
            const meta = (batchResults[j] as any)?.meta;
            if (typeof meta?.changes === 'number') {
              if (meta.changes > 0) acceptedCount++;
            } else {
              acceptedCount++;
            }
          }
        }
      }
    }

    if (!committedSeq) {
      const fallbackRow = await db
        .prepare('SELECT current_seq FROM user_sync_sequence WHERE user_id = ?')
        .bind(userId)
        .first<{ current_seq: number }>();
      committedSeq = fallbackRow?.current_seq ?? 1;
    }

    const response: SyncPushResponse = {
      committed_sync_seq: committedSeq,
      accepted_count: acceptedCount,
    };

    return c.json(response);
  } catch (err: any) {
    console.error('[Sync Worker] Push error:', err);
    return c.json({ error: err?.message || 'Sync push failed on server' }, 500);
  }
});

// ------------------------------------------------------------------------------
// Explicit 30-Day Garbage Collection Trigger (Cron / Maintenance)
// ------------------------------------------------------------------------------
syncRoutes.post('/api/sync/gc', async (c) => {
  try {
    const ip = getClientIp(c.req);
    const userId = await authenticateUser(c.req.header('authorization'), c.env);

    const rateKey = `sync:gc:${userId ? `user:${userId}` : `ip:${ip}`}`;
    const rateCheck = await checkRateLimit(
      c.env?.SYNC_RATE_LIMITER,
      rateKey,
      60,
      60
    );
    if (!rateCheck.allowed) {
      return c.json(
        { error: 'Too Many Requests', code: 'RATE_LIMITED' },
        429,
        { 'Retry-After': String(rateCheck.retryAfter) }
      );
    }

    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const db = c.env.DB;
    const now = Date.now();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const gcThreshold = now - THIRTY_DAYS_MS;

    let maxPurgedSeq = 0;
    try {
      const maxPurged = await db
        .prepare(`
          SELECT MAX(seq) as max_seq FROM (
            SELECT sync_seq as seq FROM books WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?
            UNION ALL
            SELECT sync_seq as seq FROM reading_progress WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?
            UNION ALL
            SELECT sync_seq as seq FROM bookmarks WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?
            UNION ALL
            SELECT sync_seq as seq FROM highlights WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?
            UNION ALL
            SELECT sync_seq as seq FROM notes WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?
          )
        `)
        .bind(userId, gcThreshold, userId, gcThreshold, userId, gcThreshold, userId, gcThreshold, userId, gcThreshold)
        .first<{ max_seq: number | null }>();
      maxPurgedSeq = maxPurged?.max_seq ?? 0;
    } catch {
      // Column or table query fallback
    }

    const gcStatements: D1PreparedStatement[] = [];
    if (maxPurgedSeq > 0) {
      gcStatements.push(
        db
          .prepare(
            `UPDATE user_sync_sequence
             SET gc_watermark_seq = CASE WHEN ? > COALESCE(gc_watermark_seq, 0) THEN ? ELSE gc_watermark_seq END
             WHERE user_id = ?`
          )
          .bind(maxPurgedSeq, maxPurgedSeq, userId)
      );
    }

    gcStatements.push(
      db.prepare('DELETE FROM books WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?').bind(userId, gcThreshold),
      db.prepare('DELETE FROM reading_progress WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?').bind(userId, gcThreshold),
      db.prepare('DELETE FROM bookmarks WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?').bind(userId, gcThreshold),
      db.prepare('DELETE FROM highlights WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?').bind(userId, gcThreshold),
      db.prepare('DELETE FROM notes WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?').bind(userId, gcThreshold)
    );

    await db.batch(gcStatements);

    return c.json({
      status: 'ok',
      purged_before: gcThreshold,
      timestamp: now,
    });
  } catch (err: any) {
    console.error('[Sync Worker] GC error:', err);
    return c.json({ error: err?.message || 'Garbage collection failed' }, 500);
  }
});

// ------------------------------------------------------------------------------
// Sync Pull (Fetch incremental changes newer than client cursor `since`)
// ------------------------------------------------------------------------------
syncRoutes.get('/api/sync/pull', async (c) => {
  try {
    const db = c.env.DB;
    const ip = getClientIp(c.req);
    const userId = await authenticateUser(c.req.header('authorization'), c.env);

    const rateKey = `sync:pull:${userId ? `user:${userId}` : `ip:${ip}`}`;
    const rateCheck = await checkRateLimit(
      c.env?.SYNC_RATE_LIMITER,
      rateKey,
      60,
      60
    );
    if (!rateCheck.allowed) {
      return c.json(
        { error: 'Too Many Requests', code: 'RATE_LIMITED' },
        429,
        { 'Retry-After': String(rateCheck.retryAfter) }
      );
    }

    if (!userId) return c.json({ error: 'Unauthorized' }, 401);
    const since = parseInt(c.req.query('since') || '0', 10);
    const ifNoneMatch = c.req.header('if-none-match');

    let seqRow: { current_seq: number; gc_watermark_seq?: number } | null = null;
    try {
      seqRow = await db
        .prepare('SELECT current_seq, gc_watermark_seq FROM user_sync_sequence WHERE user_id = ?')
        .bind(userId)
        .first<{ current_seq: number; gc_watermark_seq?: number }>();
    } catch {
      seqRow = await db
        .prepare('SELECT current_seq FROM user_sync_sequence WHERE user_id = ?')
        .bind(userId)
        .first<{ current_seq: number }>();
    }

    const currentServerSeq = seqRow?.current_seq ?? 0;
    const gcWatermarkSeq = seqRow?.gc_watermark_seq ?? 0;

    // Stale Cursor Defense: If client cursor is older than GC watermark,
    // tombstones prior to this cursor were permanently purged.
    // Client cannot safely compute diff without risking data resurrection.
    // Return HTTP 410 Gone to force a full re-sync.
    if (gcWatermarkSeq > 0 && since > 0 && since < gcWatermarkSeq) {
      return c.json(
        {
          error: 'Sync cursor expired. Tombstones older than cursor were purged.',
          code: 'CURSOR_EXPIRED',
          server_sync_seq: currentServerSeq,
          gc_watermark_seq: gcWatermarkSeq,
        },
        410
      );
    }

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

    const snapshotSeq = currentServerSeq;

    // Parallel queries for changed items bounded by snapshotSeq:
    // Ensures strict snapshot isolation (since < sync_seq <= snapshotSeq).
    // Any concurrent writes committed at > snapshotSeq are excluded and left for subsequent pull.
    const [booksRes, progressRes, bookmarksRes, highlightsRes, notesRes] = await Promise.all([
      db
        .prepare('SELECT * FROM books WHERE user_id = ? AND sync_seq > ? AND sync_seq <= ?')
        .bind(userId, since, snapshotSeq)
        .all<Book>(),
      db
        .prepare('SELECT * FROM reading_progress WHERE user_id = ? AND sync_seq > ? AND sync_seq <= ?')
        .bind(userId, since, snapshotSeq)
        .all<ReadingProgress>(),
      db
        .prepare('SELECT * FROM bookmarks WHERE user_id = ? AND sync_seq > ? AND sync_seq <= ?')
        .bind(userId, since, snapshotSeq)
        .all<Bookmark>(),
      db
        .prepare('SELECT * FROM highlights WHERE user_id = ? AND sync_seq > ? AND sync_seq <= ?')
        .bind(userId, since, snapshotSeq)
        .all<Highlight>(),
      db
        .prepare('SELECT * FROM notes WHERE user_id = ? AND sync_seq > ? AND sync_seq <= ?')
        .bind(userId, since, snapshotSeq)
        .all<Note>(),
    ]);

    const response: SyncPullResponse = {
      server_sync_seq: snapshotSeq,
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
