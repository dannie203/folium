-- ==============================================================================
--  FOLIUM D1 DATABASE SCHEMA — MIGRATION 0004: BOOK LWW CONFLICT RESOLUTION
-- ==============================================================================

-- Add client_updated_at to books table to support strict LWW timestamp enforcement
ALTER TABLE books ADD COLUMN client_updated_at INTEGER NOT NULL DEFAULT 0;
