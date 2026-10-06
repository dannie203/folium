export const INIT_SQL = `
-- Books table
CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    cover_url TEXT,
    file_type TEXT NOT NULL, -- 'epub' | 'pdf'
    file_size INTEGER NOT NULL,
    local_path TEXT,
    drive_file_id TEXT,
    locations_cache TEXT,
    shelf TEXT DEFAULT 'Inbox',
    tags TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    sync_seq INTEGER NOT NULL DEFAULT 0
);

-- Reading progress
CREATE TABLE IF NOT EXISTS reading_progress (
    id TEXT PRIMARY KEY,
    book_id TEXT UNIQUE NOT NULL,
    cfi TEXT NOT NULL,
    percentage REAL NOT NULL,
    client_updated_at INTEGER NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    sync_seq INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
);

-- Bookmarks
CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    cfi TEXT NOT NULL,
    title TEXT NOT NULL,
    client_created_at INTEGER NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    sync_seq INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
);

-- Highlights
CREATE TABLE IF NOT EXISTS highlights (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    cfi_range TEXT NOT NULL,
    text TEXT NOT NULL,
    color TEXT NOT NULL,
    note TEXT,
    client_created_at INTEGER NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    sync_seq INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
);

-- Notes
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    highlight_id TEXT,
    content TEXT NOT NULL,
    client_created_at INTEGER NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    sync_seq INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
);

-- Sync Outbox (Pending offline mutations to push to Cloudflare D1)
CREATE TABLE IF NOT EXISTS sync_outbox (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL, -- 'progress' | 'bookmark' | 'highlight' | 'note'
    entity_id TEXT NOT NULL,
    payload TEXT NOT NULL, -- JSON string
    created_at INTEGER NOT NULL
);

-- Sync Metadata (Tracks server sequence cursor and Drive tokens)
CREATE TABLE IF NOT EXISTS sync_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
`;
