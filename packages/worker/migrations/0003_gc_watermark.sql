-- ==============================================================================
--  FOLIUM D1 DATABASE SCHEMA — MIGRATION 0003: GC WATERMARK & STALE CURSOR DEFENSE
-- ==============================================================================

-- Add gc_watermark_seq to track maximum sequence up to which tombstones were purged.
-- Clients pulling with a cursor older than this watermark receive HTTP 410 Gone.
ALTER TABLE user_sync_sequence ADD COLUMN gc_watermark_seq INTEGER NOT NULL DEFAULT 0;
