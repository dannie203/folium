import { Platform, AppState, type AppStateStatus } from 'react-native';
import * as ExpoCrypto from 'expo-crypto';
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
import { getCurrentUser } from './authService';

function generateUUID(): string {
  return ExpoCrypto.randomUUID();
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
  ACTIVE_USER_ID: 'sync_active_user_id',
  LAST_SYNCED_AT: 'last_synced_at',
} as const;

const DEFAULT_SERVER_URL =
  process.env.EXPO_PUBLIC_SYNC_WORKER_URL ||
  'https://folium-sync-worker.hung23012.workers.dev';
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
  const user = getCurrentUser();
  const key = user?.id ? `${META_KEYS.CURSOR}:${user.id}` : META_KEYS.CURSOR;
  const val = await getSyncMeta(key);
  return val ? parseInt(val, 10) || 0 : 0;
}

export async function setLastSyncedSeq(seq: number): Promise<void> {
  const user = getCurrentUser();
  const key = user?.id ? `${META_KEYS.CURSOR}:${user.id}` : META_KEYS.CURSOR;
  await setSyncMeta(key, String(seq));
}

/**
 * Reset in-memory sync session state and timers upon user sign-out.
 */
export function resetSyncSessionState(): void {
  currentStatus = 'idle';
  currentLastSyncedAt = null;
  currentPendingCount = 0;
  currentErrorMessage = null;
  isSyncing = false;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  retryAttempt = 0;
  notifyListeners();
}

/**
 * Purge all pending outbox mutations from SQLite.
 * Called on signOut and account-switch to avoid cross-account contamination.
 */
export async function purgeSyncOutbox(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM sync_outbox');
}

/**
 * Detach all cloud-synced or account-owned books and associated metadata from local SQLite.
 * Keeps purely local guest books (user_id IS NULL AND sync_seq == 0 AND drive_file_id IS NULL).
 */
export async function detachAccountLocalState(targetUserId?: string | null): Promise<void> {
  const db = await getDatabase();
  let sql: string;
  let params: any[] = [];

  if (targetUserId) {
    // Detach books belonging to the specific target user OR any cloud-synced records
    sql = 'SELECT id FROM books WHERE user_id = ? OR (user_id IS NOT NULL AND user_id != ?) OR sync_seq > 0 OR drive_file_id IS NOT NULL';
    params = [targetUserId, targetUserId];
  } else {
    // Detach all account-bound / cloud records (e.g. on full signOut with clearLocalData)
    const activeUserId = getCurrentUser()?.id || (await getSyncMeta(META_KEYS.ACTIVE_USER_ID));
    if (activeUserId) {
      sql = 'SELECT id FROM books WHERE user_id = ? OR user_id IS NOT NULL OR sync_seq > 0 OR drive_file_id IS NOT NULL';
      params = [activeUserId];
    } else {
      sql = 'SELECT id FROM books WHERE user_id IS NOT NULL OR sync_seq > 0 OR drive_file_id IS NOT NULL';
    }
  }

  const syncedBooks = await db.getAllAsync<{ id: string }>(sql, params);
  for (const b of syncedBooks) {
    await db.runAsync('DELETE FROM reading_progress WHERE book_id = ?', [b.id]);
    await db.runAsync('DELETE FROM bookmarks WHERE book_id = ?', [b.id]);
    await db.runAsync('DELETE FROM highlights WHERE book_id = ?', [b.id]);
    await db.runAsync('DELETE FROM notes WHERE book_id = ?', [b.id]);
    await db.runAsync('DELETE FROM books WHERE id = ?', [b.id]);
  }
  await db.runAsync('DELETE FROM sync_outbox');
}

/**
 * Handle account lifecycle transitions upon login/switch.
 * If switching to a different user ID, detaches previous user's cloud data and outbox.
 */
export async function handleAccountLifecycleSwitch(newUserId: string | null): Promise<void> {
  const previousUserId = await getSyncMeta(META_KEYS.ACTIVE_USER_ID);

  if (previousUserId && newUserId && previousUserId !== newUserId) {
    console.log(`[SyncService] Account switch detected: ${previousUserId} -> ${newUserId}. Detaching previous account state.`);
    const db = await getDatabase();
    // Attribute any lingering legacy unassigned books to previous user so they are detached cleanly
    await db.runAsync('UPDATE books SET user_id = ? WHERE user_id IS NULL', [previousUserId]);
    await detachAccountLocalState(previousUserId);
    resetSyncSessionState();
  }

  if (newUserId) {
    const db = await getDatabase();
    // Claim unassigned guest books for the newly authenticated account
    if (!previousUserId) {
      await db.runAsync('UPDATE books SET user_id = ? WHERE user_id IS NULL', [newUserId]);
    }

    // Ensure strict isolation against foreign account artifacts
    const foreignBooks = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM books WHERE user_id IS NOT NULL AND user_id != ?',
      [newUserId]
    );
    for (const b of foreignBooks) {
      await db.runAsync('DELETE FROM reading_progress WHERE book_id = ?', [b.id]);
      await db.runAsync('DELETE FROM bookmarks WHERE book_id = ?', [b.id]);
      await db.runAsync('DELETE FROM highlights WHERE book_id = ?', [b.id]);
      await db.runAsync('DELETE FROM notes WHERE book_id = ?', [b.id]);
      await db.runAsync('DELETE FROM books WHERE id = ?', [b.id]);
    }

    await setSyncMeta(META_KEYS.ACTIVE_USER_ID, newUserId);
  }
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
  return custom || getCurrentUser()?.id || '';
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
    throw err;
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
    'SELECT * FROM sync_outbox ORDER BY created_at ASC LIMIT 50'
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
          const existing = booksMap.get(row.entity_id);
          if (!existing || (data.updated_at || 0) >= (existing.updated_at || 0)) {
            booksMap.set(row.entity_id, {
              ...(existing || ({} as Book)),
              ...data,
            });
          }
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
  if (booksMap.size > 0) {
    payload.books = Array.from(booksMap.values()).map((b) => ({
      ...b,
      title: b.title || 'Untitled',
      author: b.author || 'Unknown',
      file_type: b.file_type || 'epub',
      file_size: typeof b.file_size === 'number' && !isNaN(b.file_size) ? b.file_size : 0,
      is_deleted: Boolean(b.is_deleted),
    }));
  }
  if (progressMap.size > 0) {
    payload.progress = Array.from(progressMap.values()).map((p) => ({
      ...p,
      cfi: p.cfi || '',
      percentage: typeof p.percentage === 'number' && !isNaN(p.percentage) ? p.percentage : 0,
      client_updated_at: p.client_updated_at || Date.now(),
      is_deleted: Boolean(p.is_deleted),
    }));
  }
  if (bookmarksMap.size > 0) {
    payload.bookmarks = Array.from(bookmarksMap.values()).map((bm) => ({
      ...bm,
      book_id: bm.book_id || '',
      cfi: bm.cfi || '',
      title: bm.title || '',
      client_created_at: bm.client_created_at || Date.now(),
      is_deleted: Boolean(bm.is_deleted),
    }));
  }
  if (highlightsMap.size > 0) {
    payload.highlights = Array.from(highlightsMap.values()).map((h) => ({
      ...h,
      book_id: h.book_id || '',
      cfi_range: h.cfi_range || '',
      text: h.text || '',
      color: h.color || 'yellow',
      client_created_at: h.client_created_at || Date.now(),
      is_deleted: Boolean(h.is_deleted),
    }));
  }
  if (notesMap.size > 0) {
    payload.notes = Array.from(notesMap.values()).map((n) => ({
      ...n,
      book_id: n.book_id || '',
      content: n.content || '',
      client_created_at: n.client_created_at || Date.now(),
      is_deleted: Boolean(n.is_deleted),
    }));
  }

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
  const user = getCurrentUser();
  if (!user || user.accessToken.startsWith('demo_')) {
    throw new Error('Google sign-in required for data sync.');
  }

  console.log(
    `[SyncService] Pushing ${outboxIds.length} mutations (compacted) to ${serverUrl}/api/sync/push`
  );

  const res = await fetch(`${serverUrl}/api/sync/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.idToken || user.accessToken}`,
    },
    body: JSON.stringify(payload),
    ...(Platform.OS === 'web' ? { keepalive: true } : {}),
  });

  if (!res.ok) {
    let errorDetail = '';
    try {
      const errJson = await res.json();
      errorDetail = errJson.error || JSON.stringify(errJson);
    } catch {
      errorDetail = await res.text().catch(() => '');
    }
    throw new Error(`Sync push failed (${res.status}): ${errorDetail || res.statusText}`);
  }

  const data = (await res.json()) as SyncPushResponse;
  const committedSeq = data.committed_sync_seq;

  // Drain confirmed rows from outbox in a single batch
  const db = await getDatabase();
  if (outboxIds.length > 0) {
    const placeholders = outboxIds.map(() => '?').join(',');
    await db.runAsync(
      `DELETE FROM sync_outbox WHERE id IN (${placeholders})`,
      outboxIds
    );
  }

  // Canonical state reconciliation:
  // After pushing mutations, ALWAYS pull remote changes to reconcile canonical server state.
  // 1. If any mutations were rejected by server-side LWW (e.g. stale title edits on deleted books),
  //    pulling immediately applies the canonical winning state (tombstones) to local SQLite.
  // 2. If mutations were accepted, pulling stamps the official sync_seq on local records.
  // 3. If intervening remote writes occurred (committedSeq > currentCursor + 1), pulling closes the sequence gap.
  // 4. pullRemoteChanges() automatically advances local sequence cursor to server_sync_seq upon success.
  await pullRemoteChanges();

  await refreshPendingCount();

  // If we processed a full chunk of 50 items, trigger next debounced push to drain remaining
  if (outboxIds.length >= 50) {
    triggerDebouncedSync();
  }

  return { pushedCount: data.accepted_count, committedSeq };
}

/**
 * Pull incremental changes newer than local sequence cursor from Cloudflare D1.
 */
export async function pullRemoteChanges(isFullResync = false): Promise<{
  pulledCount: number;
  serverSeq: number;
}> {
  const serverUrl = await getSyncServerUrl();
  const user = getCurrentUser();
  if (!user || user.accessToken.startsWith('demo_')) {
    throw new Error('Google sign-in required for data sync.');
  }
  const cursor = await getLastSyncedSeq();

  console.log(
    `[SyncService] Pulling updates since seq ${cursor} from ${serverUrl}/api/sync/pull`
  );

  const res = await fetch(`${serverUrl}/api/sync/pull?since=${cursor}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${user.idToken || user.accessToken}`,
      'If-None-Match': `W/"${cursor}"`,
    },
  });

  // Quota Defense: 304 Not Modified
  if (res.status === 304) {
    console.log('[SyncService] Remote returned 304 Not Modified (0 query execution)');
    return { pulledCount: 0, serverSeq: cursor };
  }

  // Stale Cursor Defense: If server purged tombstones beyond this cursor, reset to 0 for full resync
  if (res.status === 410) {
    console.warn('[SyncService] Sync cursor expired on server (HTTP 410). Resetting cursor for full resync.');
    await setLastSyncedSeq(0);
    return pullRemoteChanges(true);
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
        await db.runAsync(
          'UPDATE bookmarks SET is_deleted = 1, sync_seq = ? WHERE id = ? AND ? >= client_created_at',
          [b.sync_seq, b.id, b.client_created_at]
        );
      } else {
        await db.runAsync(
          `INSERT INTO bookmarks (id, book_id, cfi, title, client_created_at, is_deleted, sync_seq)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             title = excluded.title,
             cfi = excluded.cfi,
             client_created_at = excluded.client_created_at,
             is_deleted = excluded.is_deleted,
             sync_seq = excluded.sync_seq
           WHERE excluded.client_created_at >= bookmarks.client_created_at`,
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
        await db.runAsync(
          'UPDATE highlights SET is_deleted = 1, sync_seq = ? WHERE id = ? AND ? >= client_created_at',
          [h.sync_seq, h.id, h.client_created_at]
        );
      } else {
        await db.runAsync(
          `INSERT INTO highlights (id, book_id, cfi_range, text, color, note, client_created_at, is_deleted, sync_seq)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             note = excluded.note,
             color = excluded.color,
             client_created_at = excluded.client_created_at,
             is_deleted = excluded.is_deleted,
             sync_seq = excluded.sync_seq
           WHERE excluded.client_created_at >= highlights.client_created_at`,
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
        await db.runAsync(
          'UPDATE notes SET is_deleted = 1, sync_seq = ? WHERE id = ? AND ? >= client_created_at',
          [n.sync_seq, n.id, n.client_created_at]
        );
      } else {
        await db.runAsync(
          `INSERT INTO notes (id, book_id, highlight_id, content, client_created_at, is_deleted, sync_seq)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             content = excluded.content,
             client_created_at = excluded.client_created_at,
             is_deleted = excluded.is_deleted,
             sync_seq = excluded.sync_seq
           WHERE excluded.client_created_at >= notes.client_created_at`,
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

  // 5. Apply Books Metadata (LWW by updated_at)
  if (data.books && data.books.length > 0) {
    for (const b of data.books) {
      const bookUpdatedAt = typeof b.updated_at === 'number' && !isNaN(b.updated_at)
        ? b.updated_at
        : (typeof (b as any).client_updated_at === 'number' && !isNaN((b as any).client_updated_at) ? (b as any).client_updated_at : (b.deleted_at || Date.now()));
      const deletionTimestamp = b.deleted_at || bookUpdatedAt;

      if (b.is_deleted) {
        await db.runAsync(
          'UPDATE books SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ? AND ? >= updated_at',
          [deletionTimestamp, deletionTimestamp, b.id, deletionTimestamp]
        );
      } else {
        // Upsert metadata into books table with LWW guard and sync_seq
        await db.runAsync(
          `INSERT INTO books (id, user_id, title, author, cover_url, file_type, file_size, drive_file_id, created_at, updated_at, sync_seq)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             user_id = COALESCE(excluded.user_id, books.user_id),
             title = excluded.title,
             author = excluded.author,
             cover_url = COALESCE(excluded.cover_url, books.cover_url),
             file_type = excluded.file_type,
             file_size = excluded.file_size,
             drive_file_id = COALESCE(excluded.drive_file_id, books.drive_file_id),
             is_deleted = 0,
             deleted_at = NULL,
             updated_at = excluded.updated_at,
             sync_seq = excluded.sync_seq
           WHERE excluded.updated_at >= books.updated_at`,
          [
            b.id,
            b.user_id || user.id,
            b.title,
            b.author,
            b.cover_url ?? null,
            b.file_type,
            b.file_size,
            b.drive_file_id ?? null,
            b.created_at || Date.now(),
            bookUpdatedAt,
            b.sync_seq || data.server_sync_seq || 0,
          ]
        );
      }
      pulledCount++;
    }
  }

  // 6. Full Resync Reconciliation (when triggered by HTTP 410):
  // Prunes local synced entities whose server tombstones were purged by garbage collection.
  if (isFullResync) {
    await reconcileSnapshotEntities(db, data, data.server_sync_seq, user.id);
  }

  // Update server sequence cursor
  if (data.server_sync_seq > cursor) {
    await setLastSyncedSeq(data.server_sync_seq);
  }

  return { pulledCount, serverSeq: data.server_sync_seq };
}

export interface SyncDatabaseAdapter {
  getAllAsync<T = any>(sql: string, params?: any): Promise<T[]>;
  runAsync(sql: string, params?: any): Promise<any>;
}

/**
 * Pure reconciliation logic for full resync (HTTP 410):
 * Prunes local synced entities whose server tombstones were purged by garbage collection,
 * while safely preserving pending outbox mutations.
 */
export async function reconcileSnapshotEntities(
  db: SyncDatabaseAdapter,
  data: SyncPullResponse,
  serverSyncSeq: number,
  activeUserId?: string | null
): Promise<{
  prunedBooks: string[];
  prunedBookmarks: string[];
  prunedHighlights: string[];
  prunedNotes: string[];
}> {
  const activeBookIds = new Set((data.books || []).filter((b) => !b.is_deleted).map((b) => b.id));
  const activeBookmarkIds = new Set((data.bookmarks || []).filter((bm) => !bm.is_deleted).map((bm) => bm.id));
  const activeHighlightIds = new Set((data.highlights || []).filter((h) => !h.is_deleted).map((h) => h.id));
  const activeNoteIds = new Set((data.notes || []).filter((n) => !n.is_deleted).map((n) => n.id));

  // Preserve any mutations currently queued in outbox
  const outboxRows = await db.getAllAsync<{ entity_type: string; entity_id: string }>(
    'SELECT entity_type, entity_id FROM sync_outbox'
  );
  const pendingOutbox = new Set(outboxRows.map((r) => `${r.entity_type}:${r.entity_id}`));

  const now = Date.now();
  const prunedBooks: string[] = [];
  const prunedBookmarks: string[] = [];
  const prunedHighlights: string[] = [];
  const prunedNotes: string[] = [];

  // Prune orphaned local books that have been synced to cloud (sync_seq > 0 or user_id or drive_file_id)
  const bookQuery = activeUserId
    ? 'SELECT id FROM books WHERE is_deleted = 0 AND (sync_seq > 0 OR user_id = ? OR drive_file_id IS NOT NULL)'
    : 'SELECT id FROM books WHERE is_deleted = 0 AND (sync_seq > 0 OR user_id IS NOT NULL OR drive_file_id IS NOT NULL)';
  const bookParams = activeUserId ? [activeUserId] : [];
  const localBooks = await db.getAllAsync<{ id: string }>(bookQuery, bookParams);

  for (const b of localBooks) {
    if (!activeBookIds.has(b.id) && !pendingOutbox.has(`book:${b.id}`)) {
      await db.runAsync(
        'UPDATE books SET is_deleted = 1, deleted_at = ?, updated_at = ?, sync_seq = ? WHERE id = ?',
        [now, now, serverSyncSeq, b.id]
      );
      prunedBooks.push(b.id);
    }
  }

  // Prune orphaned bookmarks, highlights, and notes
  const bmQuery = activeUserId
    ? 'SELECT id FROM bookmarks WHERE is_deleted = 0 AND (sync_seq > 0 OR book_id IN (SELECT id FROM books WHERE user_id = ? OR drive_file_id IS NOT NULL))'
    : 'SELECT id FROM bookmarks WHERE is_deleted = 0 AND sync_seq > 0';
  const localBookmarks = await db.getAllAsync<{ id: string }>(bmQuery, activeUserId ? [activeUserId] : []);
  for (const bm of localBookmarks) {
    if (!activeBookmarkIds.has(bm.id) && !pendingOutbox.has(`bookmark:${bm.id}`)) {
      await db.runAsync('UPDATE bookmarks SET is_deleted = 1, sync_seq = ? WHERE id = ?', [serverSyncSeq, bm.id]);
      prunedBookmarks.push(bm.id);
    }
  }

  const hlQuery = activeUserId
    ? 'SELECT id FROM highlights WHERE is_deleted = 0 AND (sync_seq > 0 OR book_id IN (SELECT id FROM books WHERE user_id = ? OR drive_file_id IS NOT NULL))'
    : 'SELECT id FROM highlights WHERE is_deleted = 0 AND sync_seq > 0';
  const localHighlights = await db.getAllAsync<{ id: string }>(hlQuery, activeUserId ? [activeUserId] : []);
  for (const hl of localHighlights) {
    if (!activeHighlightIds.has(hl.id) && !pendingOutbox.has(`highlight:${hl.id}`)) {
      await db.runAsync('UPDATE highlights SET is_deleted = 1, sync_seq = ? WHERE id = ?', [serverSyncSeq, hl.id]);
      prunedHighlights.push(hl.id);
    }
  }

  const noteQuery = activeUserId
    ? 'SELECT id FROM notes WHERE is_deleted = 0 AND (sync_seq > 0 OR book_id IN (SELECT id FROM books WHERE user_id = ? OR drive_file_id IS NOT NULL))'
    : 'SELECT id FROM notes WHERE is_deleted = 0 AND sync_seq > 0';
  const localNotes = await db.getAllAsync<{ id: string }>(noteQuery, activeUserId ? [activeUserId] : []);
  for (const n of localNotes) {
    if (!activeNoteIds.has(n.id) && !pendingOutbox.has(`note:${n.id}`)) {
      await db.runAsync('UPDATE notes SET is_deleted = 1, sync_seq = ? WHERE id = ?', [serverSyncSeq, n.id]);
      prunedNotes.push(n.id);
    }
  }

  return { prunedBooks, prunedBookmarks, prunedHighlights, prunedNotes };
}

// ==============================================================================
//  FULL SYNC PIPELINE & EXPONENTIAL BACKOFF
// ==============================================================================

/**
 * Execute push then pull in a single atomic synchronization cycle.
 */
export async function performFullSync(): Promise<{ pushed: number; pulled: number }> {
  const user = getCurrentUser();
  if (!user || user.accessToken.startsWith('demo_')) {
    currentStatus = 'idle';
    currentErrorMessage = null;
    notifyListeners();
    return { pushed: 0, pulled: 0 };
  }

  if (isSyncing) {
    console.log('[SyncService] Sync already in progress, skipping concurrent trigger');
    return { pushed: 0, pulled: 0 };
  }

  isSyncing = true;
  currentStatus = 'syncing';
  currentErrorMessage = null;
  notifyListeners();

  try {
    // 1. Pull incremental updates from edge first to ensure local DB has latest remote state
    const pullRes = await pullRemoteChanges();

    // 2. Push pending local mutations
    const pushRes = await pushPendingMutations();

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
      currentErrorMessage = 'Device is offline';
    } else {
      console.error('[SyncService] Sync failed with error:', err);
      currentStatus = 'error';
      currentErrorMessage = err?.message || 'Sync error';
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
