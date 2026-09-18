import { Platform, AppState, type AppStateStatus } from 'react-native';
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
import { getDatabase } from '../db';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ==============================================================================
//  SYNC ENGINE CONFIGURATION & TYPES
// ==============================================================================

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  lastSyncedAt: number | null;
  pendingCount: number;
  errorMessage?: string | null;
}

export type SyncStateListener = (state: SyncState) => void;

interface OutboxRow {
  id: string;
  entity_type: 'book' | 'progress' | 'bookmark' | 'highlight' | 'note';
  entity_id: string;
  payload: string;
  created_at: number;
}

const META_KEYS = {
  CURSOR: 'sync_cursor',
  SERVER_URL: 'sync_server_url',
  USER_ID: 'sync_user_id',
  LAST_SYNCED_AT: 'last_synced_at',
} as const;

const DEFAULT_SERVER_URL =
  process.env.EXPO_PUBLIC_SYNC_WORKER_URL || 'https://folium-sync-worker.workers.dev';
const DEFAULT_USER_ID = 'dev-user-001';

// Active state
let currentStatus: SyncStatus = 'idle';
let currentLastSyncedAt: number | null = null;
let currentPendingCount = 0;
let currentErrorMessage: string | null = null;
let isSyncing = false;

// Debouncing & Retry Timers
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;
const MAX_RETRY_DELAY_MS = 60000;

// Listeners
const listeners = new Set<SyncStateListener>();

function notifyListeners(): void {
  const state = getSyncState();
  for (const listener of listeners) {
    try {
      listener(state);
    } catch (e) {
      console.warn('[SyncService] Listener callback error:', e);
    }
  }
}

export function getSyncState(): SyncState {
  return {
    status: currentStatus,
    lastSyncedAt: currentLastSyncedAt,
    pendingCount: currentPendingCount,
    errorMessage: currentErrorMessage,
  };
}

export function subscribeSyncState(listener: SyncStateListener): () => void {
  listeners.add(listener);
  listener(getSyncState());
  return () => {
    listeners.delete(listener);
  };
}

// ==============================================================================
//  SYNC METADATA HELPERS
// ==============================================================================

export async function getSyncMeta(key: string): Promise<string | null> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM sync_meta WHERE key = ?',
      [key]
    );
    return row?.value ?? null;
  } catch (err) {
    console.warn(`[SyncService] Failed to read meta key ${key}:`, err);
    return null;
  }
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO sync_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value]
    );
  } catch (err) {
    console.warn(`[SyncService] Failed to set meta key ${key}:`, err);
  }
}

export async function getLastSyncedSeq(): Promise<number> {
  const val = await getSyncMeta(META_KEYS.CURSOR);
  return val ? parseInt(val, 10) || 0 : 0;
}

export async function setLastSyncedSeq(seq: number): Promise<void> {
  await setSyncMeta(META_KEYS.CURSOR, String(seq));
}

export async function getSyncServerUrl(): Promise<string> {
  const custom = await getSyncMeta(META_KEYS.SERVER_URL);
  return (custom || DEFAULT_SERVER_URL).replace(/\/+$/, '');
}

export async function setSyncServerUrl(url: string): Promise<void> {
  await setSyncMeta(META_KEYS.SERVER_URL, url.trim().replace(/\/+$/, ''));
}

export async function getSyncUserId(): Promise<string> {
  const custom = await getSyncMeta(META_KEYS.USER_ID);
  return custom || DEFAULT_USER_ID;
}

export async function setSyncUserId(userId: string): Promise<void> {
  await setSyncMeta(META_KEYS.USER_ID, userId.trim());
}

// ==============================================================================
//  MUTATION QUEUE & OUTBOX MANAGEMENT
// ==============================================================================

/**
 * Enqueue a mutation to the persistent sync_outbox.
 */
export async function queueMutation(
  entityType: 'book' | 'progress' | 'bookmark' | 'highlight' | 'note',
  entityId: string,
  payload: any
): Promise<void> {
  try {
    const db = await getDatabase();
    const id = generateUUID();
    const now = Date.now();
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);

    await db.runAsync(
      `INSERT INTO sync_outbox (id, entity_type, entity_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, entityType, entityId, payloadStr, now]
    );

    currentPendingCount++;
    notifyListeners();
  } catch (err) {
    console.error('[SyncService] Failed to queue mutation:', err);
  }
}

/**
 * Read outbox rows and update current pending count.
 */
export async function refreshPendingCount(): Promise<number> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ count?: number; 'COUNT(*)'?: number }>(
      'SELECT COUNT(*) as count FROM sync_outbox'
    );
    const count = row?.count ?? row?.['COUNT(*)'] ?? 0;
    currentPendingCount = count;
    notifyListeners();
    return count;
  } catch {
    return currentPendingCount;
  }
}

/**
 * Quota Defense: Coalesce micro-mutations into a single compact payload.
 * Collapses multiple page turns per book into the latest reading progress.
 */
export async function drainAndCompactOutbox(): Promise<{
  payload: SyncPushPayload;
  outboxIds: string[];
}> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<OutboxRow>(
    'SELECT * FROM sync_outbox ORDER BY created_at ASC'
  );

  if (rows.length === 0) {
    return { payload: {}, outboxIds: [] };
  }

  const outboxIds = rows.map((r) => r.id);

  // Grouped maps for LWW collapsing
  const booksMap = new Map<string, Book>();
  const progressMap = new Map<string, ReadingProgress>();
  const bookmarksMap = new Map<string, Bookmark>();
  const highlightsMap = new Map<string, Highlight>();
  const notesMap = new Map<string, Note>();

  for (const row of rows) {
    try {
      const data = JSON.parse(row.payload);

      switch (row.entity_type) {
        case 'book': {
          booksMap.set(row.entity_id, {
            ...(booksMap.get(row.entity_id) || ({} as Book)),
            ...data,
          });
          break;
        }
        case 'progress': {
          const existing = progressMap.get(row.entity_id);
          if (!existing || (data.client_updated_at || 0) >= existing.client_updated_at) {
            progressMap.set(row.entity_id, data);
          }
          break;
        }
        case 'bookmark': {
          bookmarksMap.set(row.entity_id, {
            ...(bookmarksMap.get(row.entity_id) || ({} as Bookmark)),
            ...data,
          });
          break;
        }
        case 'highlight': {
          highlightsMap.set(row.entity_id, {
            ...(highlightsMap.get(row.entity_id) || ({} as Highlight)),
            ...data,
          });
          break;
        }
        case 'note': {
          notesMap.set(row.entity_id, {
            ...(notesMap.get(row.entity_id) || ({} as Note)),
            ...data,
          });
          break;
        }
      }
    } catch (e) {
      console.warn('[SyncService] Skipping corrupted outbox row:', row.id, e);
    }
  }

  const payload: SyncPushPayload = {};
  if (booksMap.size > 0) payload.books = Array.from(booksMap.values());
  if (progressMap.size > 0) payload.progress = Array.from(progressMap.values());
  if (bookmarksMap.size > 0) payload.bookmarks = Array.from(bookmarksMap.values());
  if (highlightsMap.size > 0) payload.highlights = Array.from(highlightsMap.values());
  if (notesMap.size > 0) payload.notes = Array.from(notesMap.values());

  return { payload, outboxIds };
}

// ==============================================================================
//  SYNC PROTOCOL: PUSH & PULL
// ==============================================================================

/**
 * Push pending mutations from outbox to Cloudflare D1.
 */
export async function pushPendingMutations(): Promise<{
  pushedCount: number;
  committedSeq: number;
}> {
  const { payload, outboxIds } = await drainAndCompactOutbox();

  const hasItems =
    (payload.books && payload.books.length > 0) ||
    (payload.progress && payload.progress.length > 0) ||
    (payload.bookmarks && payload.bookmarks.length > 0) ||
    (payload.highlights && payload.highlights.length > 0) ||
    (payload.notes && payload.notes.length > 0);

  if (!hasItems || outboxIds.length === 0) {
    const seq = await getLastSyncedSeq();
    return { pushedCount: 0, committedSeq: seq };
  }

  const serverUrl = await getSyncServerUrl();
  const userId = await getSyncUserId();

  console.log(
    `[SyncService] Pushing ${outboxIds.length} mutations (compacted) to ${serverUrl}/api/sync/push`
  );

  const res = await fetch(`${serverUrl}/api/sync/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Sync push failed (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as SyncPushResponse;
  const committedSeq = data.committed_sync_seq;

  // Drain confirmed rows from outbox
  const db = await getDatabase();
  for (const id of outboxIds) {
    await db.runAsync('DELETE FROM sync_outbox WHERE id = ?', [id]);
  }

  // Advance local cursor if server sequence is higher
  const currentCursor = await getLastSyncedSeq();
  if (committedSeq > currentCursor) {
    await setLastSyncedSeq(committedSeq);
  }

  await refreshPendingCount();
  return { pushedCount: data.accepted_count, committedSeq };
}

/**
 * Pull incremental changes newer than local sequence cursor from Cloudflare D1.
 */
export async function pullRemoteChanges(): Promise<{
  pulledCount: number;
  serverSeq: number;
}> {
  const serverUrl = await getSyncServerUrl();
  const userId = await getSyncUserId();
  const cursor = await getLastSyncedSeq();

  console.log(
    `[SyncService] Pulling updates since seq ${cursor} from ${serverUrl}/api/sync/pull`
  );

  const res = await fetch(`${serverUrl}/api/sync/pull?since=${cursor}`, {
    method: 'GET',
    headers: {
      'x-user-id': userId,
      'If-None-Match': `W/"${cursor}"`,
    },
  });

  // Quota Defense: 304 Not Modified
  if (res.status === 304) {
    console.log('[SyncService] Remote returned 304 Not Modified (0 query execution)');
    return { pulledCount: 0, serverSeq: cursor };
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Sync pull failed (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as SyncPullResponse;
  const db = await getDatabase();
  let pulledCount = 0;

  // 1. Apply Reading Progress (LWW)
  if (data.progress && data.progress.length > 0) {
    for (const p of data.progress) {
      await db.runAsync(
        `INSERT INTO reading_progress (id, book_id, cfi, percentage, client_updated_at, is_deleted, sync_seq)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(book_id) DO UPDATE SET
           cfi = excluded.cfi,
           percentage = excluded.percentage,
           client_updated_at = excluded.client_updated_at,
           is_deleted = excluded.is_deleted,
           sync_seq = excluded.sync_seq
         WHERE excluded.client_updated_at >= reading_progress.client_updated_at`,
        [
          p.id,
          p.book_id,
          p.cfi,
          p.percentage,
          p.client_updated_at,
          p.is_deleted ? 1 : 0,
          p.sync_seq,
        ]
      );
      pulledCount++;
    }
  }

  // 2. Apply Bookmarks
  if (data.bookmarks && data.bookmarks.length > 0) {
    for (const b of data.bookmarks) {
      if (b.is_deleted) {
        await db.runAsync('UPDATE bookmarks SET is_deleted = 1 WHERE id = ?', [b.id]);
      } else {
        await db.runAsync(
          `INSERT INTO bookmarks (id, book_id, cfi, title, client_created_at, is_deleted, sync_seq)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             title = excluded.title,
             cfi = excluded.cfi,
             is_deleted = excluded.is_deleted,
             sync_seq = excluded.sync_seq`,
          [b.id, b.book_id, b.cfi, b.title, b.client_created_at, 0, b.sync_seq]
        );
      }
      pulledCount++;
    }
  }

  // 3. Apply Highlights
  if (data.highlights && data.highlights.length > 0) {
    for (const h of data.highlights) {
      if (h.is_deleted) {
        await db.runAsync('UPDATE highlights SET is_deleted = 1 WHERE id = ?', [h.id]);
      } else {
        await db.runAsync(
          `INSERT INTO highlights (id, book_id, cfi_range, text, color, note, client_created_at, is_deleted, sync_seq)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             note = excluded.note,
             color = excluded.color,
             is_deleted = excluded.is_deleted,
             sync_seq = excluded.sync_seq`,
          [
            h.id,
            h.book_id,
            h.cfi_range,
            h.text,
            h.color,
            h.note ?? null,
            h.client_created_at,
            0,
            h.sync_seq,
          ]
        );
      }
      pulledCount++;
    }
  }

  // 4. Apply Notes
  if (data.notes && data.notes.length > 0) {
    for (const n of data.notes) {
      if (n.is_deleted) {
        await db.runAsync('UPDATE notes SET is_deleted = 1 WHERE id = ?', [n.id]);
      } else {
        await db.runAsync(
          `INSERT INTO notes (id, book_id, highlight_id, content, client_created_at, is_deleted, sync_seq)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             content = excluded.content,
             is_deleted = excluded.is_deleted,
             sync_seq = excluded.sync_seq`,
          [
            n.id,
            n.book_id,
            n.highlight_id ?? null,
            n.content,
            n.client_created_at,
            0,
            n.sync_seq,
          ]
        );
      }
      pulledCount++;
    }
  }

  // 5. Apply Books Metadata
  if (data.books && data.books.length > 0) {
    for (const b of data.books) {
      if (b.is_deleted) {
        await db.runAsync('DELETE FROM books WHERE id = ?', [b.id]);
      } else {
        // Upsert metadata into books table
        await db.runAsync(
          `INSERT INTO books (id, title, author, cover_url, file_type, file_size, drive_file_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             title = excluded.title,
             author = excluded.author,
             cover_url = COALESCE(excluded.cover_url, books.cover_url),
             file_type = excluded.file_type,
             file_size = excluded.file_size,
             drive_file_id = COALESCE(excluded.drive_file_id, books.drive_file_id),
             updated_at = excluded.updated_at`,
          [
            b.id,
            b.title,
            b.author,
            b.cover_url ?? null,
            b.file_type,
            b.file_size,
            b.drive_file_id ?? null,
            b.created_at || Date.now(),
            b.updated_at || Date.now(),
          ]
        );
      }
      pulledCount++;
    }
  }

  // Update server sequence cursor
  if (data.server_sync_seq > cursor) {
    await setLastSyncedSeq(data.server_sync_seq);
  }

  return { pulledCount, serverSeq: data.server_sync_seq };
}

// ==============================================================================
//  FULL SYNC PIPELINE & EXPONENTIAL BACKOFF
// ==============================================================================

/**
 * Execute push then pull in a single atomic synchronization cycle.
 */
export async function performFullSync(): Promise<{ pushed: number; pulled: number }> {
  if (isSyncing) {
    console.log('[SyncService] Sync already in progress, skipping concurrent trigger');
    return { pushed: 0, pulled: 0 };
  }

  isSyncing = true;
  currentStatus = 'syncing';
  currentErrorMessage = null;
  notifyListeners();

  try {
    // 1. Push pending local mutations
    const pushRes = await pushPendingMutations();

    // 2. Pull incremental updates from edge
    const pullRes = await pullRemoteChanges();

    // 3. Mark success
    currentStatus = 'idle';
    currentLastSyncedAt = Date.now();
    await setSyncMeta(META_KEYS.LAST_SYNCED_AT, String(currentLastSyncedAt));
    retryAttempt = 0; // Reset backoff
    await refreshPendingCount();

    console.log(
      `[SyncService] Full sync completed successfully. (Pushed: ${pushRes.pushedCount}, Pulled: ${pullRes.pulledCount})`
    );

    return { pushed: pushRes.pushedCount, pulled: pullRes.pulledCount };
  } catch (err: any) {
    const isNetworkError =
      err?.message?.includes('Network request failed') ||
      err?.message?.includes('fetch failed') ||
      err?.name === 'TypeError';

    if (isNetworkError) {
      console.warn('[SyncService] Device is offline, sync postponed.');
      currentStatus = 'offline';
      currentErrorMessage = 'Thiết bị đang ngoại tuyến';
    } else {
      console.error('[SyncService] Sync failed with error:', err);
      currentStatus = 'error';
      currentErrorMessage = err?.message || 'Lỗi đồng bộ';
      scheduleRetry();
    }

    notifyListeners();
    return { pushed: 0, pulled: 0 };
  } finally {
    isSyncing = false;
  }
}

/**
 * Exponential backoff retry for transient network / edge errors.
 */
function scheduleRetry(): void {
  if (retryTimer) clearTimeout(retryTimer);

  retryAttempt++;
  const delay = Math.min(1000 * Math.pow(2, retryAttempt), MAX_RETRY_DELAY_MS);
  console.log(`[SyncService] Scheduling retry #${retryAttempt} in ${delay}ms`);

  retryTimer = setTimeout(() => {
    performFullSync();
  }, delay);
}

// ==============================================================================
//  ADAPTIVE DEBOUNCING & LIFECYCLE HOOKS
// ==============================================================================

/**
 * Trigger debounced sync (Default 30s idle threshold during active reading).
 */
export function triggerDebouncedSync(delayMs: number = 30000): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    performFullSync();
  }, delayMs);
}

/**
 * Flush pending sync operations immediately (e.g. reader exit or app background).
 */
export async function flushSyncImmediately(): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  await performFullSync();
}

// ==============================================================================
//  LIFECYCLE INITIALIZER
// ==============================================================================

let isLifecycleInitialized = false;

/**
 * Initialize app lifecycle listeners for background flushing and web beforeunload.
 */
export function initSyncLifecycle(): void {
  if (isLifecycleInitialized) return;
  isLifecycleInitialized = true;

  // Restore initial state from local SQLite
  (async () => {
    const lastTime = await getSyncMeta(META_KEYS.LAST_SYNCED_AT);
    if (lastTime) {
      currentLastSyncedAt = parseInt(lastTime, 10) || null;
    }
    await refreshPendingCount();
  })();

  // Native AppState background flush
  AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (nextState === 'background' || nextState === 'inactive') {
      console.log('[SyncService] App transitioning to background, flushing outbox...');
      flushSyncImmediately();
    }
  });

  // Web beforeunload & visibilitychange flush
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      flushSyncImmediately();
    });

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          console.log('[SyncService] Tab hidden, flushing outbox...');
          flushSyncImmediately();
        }
      });
    }
  }
}
