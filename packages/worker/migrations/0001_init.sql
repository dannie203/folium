-- ==============================================================================
--  FOLIUM D1 DATABASE SCHEMA — MIGRATION 0001
-- ==============================================================================

-- 1. Users table (prepared for Google OAuth & future Pro expansion)
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    email TEXT,
    tier TEXT DEFAULT 'free',
    created_at INTEGER NOT NULL
);

-- 2. Monotonic Sync Sequence per user
CREATE TABLE IF NOT EXISTS user_sync_sequence (
    user_id TEXT PRIMARY KEY,
    current_seq INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
);

-- 3. Books metadata
CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    cover_url TEXT,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    drive_file_id TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    sync_seq INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_books_sync ON books(user_id, sync_seq);

-- 4. Reading progress (One active progress per user & book)
CREATE TABLE IF NOT EXISTS reading_progress (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    cfi TEXT NOT NULL,
    percentage REAL NOT NULL,
    client_updated_at INTEGER NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    sync_seq INTEGER NOT NULL,
    UNIQUE(user_id, book_id)
);
CREATE INDEX IF NOT EXISTS idx_progress_sync ON reading_progress(user_id, sync_seq);

-- 5. Bookmarks
CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    cfi TEXT NOT NULL,
    title TEXT NOT NULL,
    client_created_at INTEGER NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    sync_seq INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_sync ON bookmarks(user_id, sync_seq);

-- 6. Highlights
CREATE TABLE IF NOT EXISTS highlights (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    cfi_range TEXT NOT NULL,
    text TEXT NOT NULL,
    color TEXT NOT NULL,
    note TEXT,
    client_created_at INTEGER NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    sync_seq INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_highlights_sync ON highlights(user_id, sync_seq);

-- 7. Notes
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    highlight_id TEXT,
    content TEXT NOT NULL,
    client_created_at INTEGER NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    sync_seq INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_sync ON notes(user_id, sync_seq);
