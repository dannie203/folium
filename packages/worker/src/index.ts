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

const OFFICIAL_OPDS_FEEDS: Record<string, string> = {
  standard_ebooks: 'https://standardebooks.org/feeds/atom/new-releases',
  project_gutenberg: 'https://www.gutenberg.org/ebooks/search.opds/?sort_order=downloads',
};

async function authenticateUser(authorization: string | undefined): Promise<string | null> {
  if (!authorization?.startsWith('Bearer ')) return null;

  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: authorization },
    });
    if (!response.ok) return null;

    const profile = (await response.json()) as { sub?: string };
    return profile.sub || null;
  } catch {
    return null;
  }
}

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

const STANDARD_EBOOKS_FALLBACK_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Standard Ebooks - Curated Masterpieces</title>
  <updated>2026-09-20T00:00:00Z</updated>
  <entry>
    <id>https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice</id>
    <title>Pride and Prejudice</title>
    <author><name>Jane Austen</name></author>
    <summary>The romantic clash between the opinionated Elizabeth and her proud beau, Mr. Darcy.</summary>
    <link rel="http://opds-spec.org/image/thumbnail" href="https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice/downloads/cover-thumbnail.jpg"/>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice/downloads/jane-austen_pride-and-prejudice.epub"/>
  </entry>
  <entry>
    <id>https://standardebooks.org/ebooks/mary-shelley/frankenstein</id>
    <title>Frankenstein</title>
    <author><name>Mary Shelley</name></author>
    <summary>A young scientist creates a sapient creature in an unorthodox scientific experiment.</summary>
    <link rel="http://opds-spec.org/image/thumbnail" href="https://standardebooks.org/ebooks/mary-shelley/frankenstein/downloads/cover-thumbnail.jpg"/>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="https://standardebooks.org/ebooks/mary-shelley/frankenstein/downloads/mary-shelley_frankenstein.epub"/>
  </entry>
  <entry>
    <id>https://standardebooks.org/ebooks/f-scott-fitzgerald/the-great-gatsby</id>
    <title>The Great Gatsby</title>
    <author><name>F. Scott Fitzgerald</name></author>
    <summary>The tragic story of Jay Gatsby and his unrequited passion for Daisy Buchanan.</summary>
    <link rel="http://opds-spec.org/image/thumbnail" href="https://standardebooks.org/ebooks/f-scott-fitzgerald/the-great-gatsby/downloads/cover-thumbnail.jpg"/>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="https://standardebooks.org/ebooks/f-scott-fitzgerald/the-great-gatsby/downloads/f-scott-fitzgerald_the-great-gatsby.epub"/>
  </entry>
  <entry>
    <id>https://standardebooks.org/ebooks/lewis-carroll/alices-adventures-in-wonderland</id>
    <title>Alice's Adventures in Wonderland</title>
    <author><name>Lewis Carroll</name></author>
    <summary>Alice falls down a rabbit hole into a fantasy realm of nonsensical creatures.</summary>
    <link rel="http://opds-spec.org/image/thumbnail" href="https://standardebooks.org/ebooks/lewis-carroll/alices-adventures-in-wonderland/downloads/cover-thumbnail.jpg"/>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="https://standardebooks.org/ebooks/lewis-carroll/alices-adventures-in-wonderland/downloads/lewis-carroll_alices-adventures-in-wonderland.epub"/>
  </entry>
  <entry>
    <id>https://standardebooks.org/ebooks/charlotte-bronte/jane-eyre</id>
    <title>Jane Eyre</title>
    <author><name>Charlotte Brontë</name></author>
    <summary>An orphaned governess discovers dark secrets at Thornfield Hall and falls for Mr. Rochester.</summary>
    <link rel="http://opds-spec.org/image/thumbnail" href="https://standardebooks.org/ebooks/charlotte-bronte/jane-eyre/downloads/cover-thumbnail.jpg"/>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="https://standardebooks.org/ebooks/charlotte-bronte/jane-eyre/downloads/charlotte-bronte_jane-eyre.epub"/>
  </entry>
</feed>`;

// Proxy only the allowlisted official OPDS feeds so web clients are not blocked by CORS.
app.get('/api/community/opds', async (c) => {
  const source = c.req.query('source');
  const feedUrl = source ? OFFICIAL_OPDS_FEEDS[source] : undefined;
  if (!feedUrl) return c.json({ error: 'Unknown OPDS source' }, 400);

  try {
    const response = await fetch(feedUrl, {
      redirect: 'follow',
      headers: {
        Accept: 'application/atom+xml, application/xml, text/xml, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      if (source === 'standard_ebooks') {
        c.header('Cache-Control', 'public, max-age=600');
        c.header('Content-Type', 'application/atom+xml; charset=utf-8');
        return c.body(STANDARD_EBOOKS_FALLBACK_FEED);
      }
      const errText = await response.text().catch(() => '');
      return c.json({ error: `OPDS source returned ${response.status}`, details: errText.slice(0, 300) }, response.status as any);
    }

    const body = await response.text();
    c.header('Cache-Control', 'public, max-age=300');
    c.header('Content-Type', 'application/atom+xml; charset=utf-8');
    return c.body(body);
  } catch (err) {
    console.error('[Community OPDS] Proxy error:', err);
    if (source === 'standard_ebooks') {
      c.header('Cache-Control', 'public, max-age=600');
      c.header('Content-Type', 'application/atom+xml; charset=utf-8');
      return c.body(STANDARD_EBOOKS_FALLBACK_FEED);
    }
    return c.json({ error: 'Unable to fetch official OPDS source' }, 502);
  }
});

// Proxy book download to avoid browser CORS issues on Web
app.get('/api/community/download', async (c) => {
  const fileUrl = c.req.query('url');
  if (!fileUrl) return c.json({ error: 'Missing url parameter' }, 400);

  let targetUrl: URL;
  try {
    targetUrl = new URL(fileUrl);
  } catch {
    return c.json({ error: 'Invalid url' }, 400);
  }

  const isAllowedHost =
    targetUrl.hostname === 'standardebooks.org' ||
    targetUrl.hostname.endsWith('.standardebooks.org') ||
    targetUrl.hostname === 'www.gutenberg.org' ||
    targetUrl.hostname.endsWith('.gutenberg.org');

  if (!isAllowedHost) {
    return c.json({ error: 'Forbidden download host' }, 403);
  }

  try {
    const response = await fetch(fileUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return c.json({ error: `Upstream error ${response.status}` }, response.status as any);
    }

    const contentType = response.headers.get('content-type') || 'application/epub+zip';
    c.header('Content-Type', contentType);
    c.header('Cache-Control', 'public, max-age=86400');
    return c.body(response.body as any);
  } catch (err) {
    console.error('[Community Download] Proxy error:', err);
    return c.json({ error: 'Download proxy failed' }, 502);
  }
});

// ------------------------------------------------------------------------------
// Sync Push (Batch upsert pending mutations from client outbox)
// ------------------------------------------------------------------------------
app.post('/api/sync/push', async (c) => {
  try {
    const db = c.env.DB;
    const userId = await authenticateUser(c.req.header('authorization'));
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

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
        const deletedAt = isDeleted ? (b.deleted_at || now) : null;

        statements.push(
          db
            .prepare(
              `INSERT INTO books (id, user_id, title, author, cover_url, file_type, file_size, drive_file_id, is_deleted, deleted_at, sync_seq)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 title = CASE WHEN excluded.is_deleted = 0 AND excluded.title != 'Chưa có tiêu đề' THEN excluded.title ELSE books.title END,
                 author = CASE WHEN excluded.is_deleted = 0 AND excluded.author != 'Tác giả không rõ' THEN excluded.author ELSE books.author END,
                 cover_url = CASE WHEN excluded.is_deleted = 0 THEN COALESCE(excluded.cover_url, books.cover_url) ELSE books.cover_url END,
                 file_type = CASE WHEN excluded.is_deleted = 0 AND excluded.file_type != '' THEN excluded.file_type ELSE books.file_type END,
                 file_size = CASE WHEN excluded.is_deleted = 0 AND excluded.file_size > 0 THEN excluded.file_size ELSE books.file_size END,
                 drive_file_id = CASE WHEN excluded.is_deleted = 0 THEN COALESCE(excluded.drive_file_id, books.drive_file_id) ELSE books.drive_file_id END,
                 is_deleted = excluded.is_deleted,
                 deleted_at = excluded.deleted_at,
                 sync_seq = excluded.sync_seq
               WHERE books.user_id = excluded.user_id`
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
        const deletedAt = isDeleted ? (p.deleted_at || now) : null;

        statements.push(
          db
            .prepare(
              `INSERT INTO reading_progress (id, user_id, book_id, cfi, percentage, client_updated_at, is_deleted, deleted_at, sync_seq)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        const deletedAt = isDeleted ? (b.deleted_at || now) : null;

        statements.push(
          db
            .prepare(
              `INSERT INTO bookmarks (id, user_id, book_id, cfi, title, client_created_at, is_deleted, deleted_at, sync_seq)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 book_id = CASE WHEN excluded.is_deleted = 0 AND excluded.book_id != '' THEN excluded.book_id ELSE bookmarks.book_id END,
                 title = CASE WHEN excluded.is_deleted = 0 AND excluded.title != '' THEN excluded.title ELSE bookmarks.title END,
                 cfi = CASE WHEN excluded.is_deleted = 0 AND excluded.cfi != '' THEN excluded.cfi ELSE bookmarks.cfi END,
                 is_deleted = excluded.is_deleted,
                 deleted_at = excluded.deleted_at,
                 sync_seq = excluded.sync_seq
               WHERE bookmarks.user_id = excluded.user_id`
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
        const deletedAt = isDeleted ? (h.deleted_at || now) : null;

        statements.push(
          db
            .prepare(
              `INSERT INTO highlights (id, user_id, book_id, cfi_range, text, color, note, client_created_at, is_deleted, deleted_at, sync_seq)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 book_id = CASE WHEN excluded.is_deleted = 0 AND excluded.book_id != '' THEN excluded.book_id ELSE highlights.book_id END,
                 cfi_range = CASE WHEN excluded.is_deleted = 0 AND excluded.cfi_range != '' THEN excluded.cfi_range ELSE highlights.cfi_range END,
                 text = CASE WHEN excluded.is_deleted = 0 AND excluded.text != '' THEN excluded.text ELSE highlights.text END,
                 color = CASE WHEN excluded.is_deleted = 0 AND excluded.color != '' THEN excluded.color ELSE highlights.color END,
                 note = CASE WHEN excluded.is_deleted = 0 THEN COALESCE(excluded.note, highlights.note) ELSE highlights.note END,
                 is_deleted = excluded.is_deleted,
                 deleted_at = excluded.deleted_at,
                 sync_seq = excluded.sync_seq
               WHERE highlights.user_id = excluded.user_id`
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
        const deletedAt = isDeleted ? (n.deleted_at || now) : null;

        statements.push(
          db
            .prepare(
              `INSERT INTO notes (id, user_id, book_id, highlight_id, content, client_created_at, is_deleted, deleted_at, sync_seq)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 book_id = CASE WHEN excluded.is_deleted = 0 AND excluded.book_id != '' THEN excluded.book_id ELSE notes.book_id END,
                 highlight_id = CASE WHEN excluded.is_deleted = 0 THEN COALESCE(excluded.highlight_id, notes.highlight_id) ELSE notes.highlight_id END,
                 content = CASE WHEN excluded.is_deleted = 0 AND excluded.content != '' THEN excluded.content ELSE notes.content END,
                 is_deleted = excluded.is_deleted,
                 deleted_at = excluded.deleted_at,
                 sync_seq = excluded.sync_seq
               WHERE notes.user_id = excluded.user_id`
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
              newSeq
            )
        );
        acceptedCount++;
      }
    }

    // 30-Day Tombstone Retention & Auto Garbage Collection
    // Purges tombstones older than 30 days during sync cycles
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const gcThreshold = now - THIRTY_DAYS_MS;

    statements.push(
      db.prepare('DELETE FROM books WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?').bind(gcThreshold),
      db.prepare('DELETE FROM reading_progress WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?').bind(gcThreshold),
      db.prepare('DELETE FROM bookmarks WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?').bind(gcThreshold),
      db.prepare('DELETE FROM highlights WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?').bind(gcThreshold),
      db.prepare('DELETE FROM notes WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?').bind(gcThreshold)
    );

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
// Explicit 30-Day Garbage Collection Trigger (Cron / Maintenance)
// ------------------------------------------------------------------------------
app.post('/api/sync/gc', async (c) => {
  try {
    const userId = await authenticateUser(c.req.header('authorization'));
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const db = c.env.DB;
    const now = Date.now();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const gcThreshold = now - THIRTY_DAYS_MS;

    await db.batch([
      db.prepare('DELETE FROM books WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?').bind(gcThreshold),
      db.prepare('DELETE FROM reading_progress WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?').bind(gcThreshold),
      db.prepare('DELETE FROM bookmarks WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?').bind(gcThreshold),
      db.prepare('DELETE FROM highlights WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?').bind(gcThreshold),
      db.prepare('DELETE FROM notes WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?').bind(gcThreshold),
    ]);

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
app.get('/api/sync/pull', async (c) => {
  try {
    const db = c.env.DB;
    const userId = await authenticateUser(c.req.header('authorization'));
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);
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
