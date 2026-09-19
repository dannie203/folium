-- ==============================================================================
--  FOLIUM D1 DATABASE SCHEMA — MIGRATION 0002: 30-DAY TOMBSTONE RETENTION & GC
-- ==============================================================================

-- Add deleted_at column to track deletion timestamp for tombstone lifecycle
ALTER TABLE books ADD COLUMN deleted_at INTEGER;
ALTER TABLE reading_progress ADD COLUMN deleted_at INTEGER;
ALTER TABLE bookmarks ADD COLUMN deleted_at INTEGER;
ALTER TABLE highlights ADD COLUMN deleted_at INTEGER;
ALTER TABLE notes ADD COLUMN deleted_at INTEGER;

-- Index tombstoned rows for ultra-fast garbage collection sweeps (<10ms)
CREATE INDEX IF NOT EXISTS idx_books_deleted_at ON books(deleted_at) WHERE is_deleted = 1;
CREATE INDEX IF NOT EXISTS idx_progress_deleted_at ON reading_progress(deleted_at) WHERE is_deleted = 1;
CREATE INDEX IF NOT EXISTS idx_bookmarks_deleted_at ON bookmarks(deleted_at) WHERE is_deleted = 1;
CREATE INDEX IF NOT EXISTS idx_highlights_deleted_at ON highlights(deleted_at) WHERE is_deleted = 1;
CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes(deleted_at) WHERE is_deleted = 1;
