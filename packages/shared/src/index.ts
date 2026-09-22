// ==============================================================================
//  FOLIUM SHARED DATA MODELS & PROTOCOLS
// ==============================================================================

export type BookFormat = 'epub' | 'pdf';

export interface Book {
  id: string; // Client-generated UUID
  user_id?: string;
  title: string;
  author: string;
  cover_url?: string | null;
  file_type: BookFormat;
  file_size: number;
  local_path?: string | null;
  drive_file_id?: string | null;
  locations_cache?: string | null; // Cached epub.js CFI locations JSON
  shelf?: string | null; // e.g. 'Inbox', 'Văn Học', 'Kỹ Thuật'
  tags?: string[] | null;
  created_at: number;
  updated_at: number;
  is_deleted?: boolean;
  deleted_at?: number | null;
  sync_seq?: number;
}

export interface ReadingProgress {
  id: string; // UUID
  user_id: string;
  book_id: string;
  cfi: string; // epub.js CFI or PDF page number
  percentage: number; // 0.0 - 100.0
  client_updated_at: number; // UTC unix timestamp ms
  is_deleted: boolean;
  deleted_at?: number | null;
  sync_seq: number;
}

export interface Bookmark {
  id: string;
  user_id: string;
  book_id: string;
  cfi: string;
  title: string;
  client_created_at: number;
  is_deleted: boolean;
  deleted_at?: number | null;
  sync_seq: number;
}

export interface Highlight {
  id: string;
  user_id: string;
  book_id: string;
  cfi_range: string;
  text: string;
  color: 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
  note?: string | null;
  client_created_at: number;
  is_deleted: boolean;
  deleted_at?: number | null;
  sync_seq: number;
}

export interface Note {
  id: string;
  user_id: string;
  book_id: string;
  highlight_id?: string | null;
  content: string;
  client_created_at: number;
  is_deleted: boolean;
  deleted_at?: number | null;
  sync_seq: number;
}

// ------------------------------------------------------------------------------
// Sync Protocols (LWW with Monotonic sync_seq)
// ------------------------------------------------------------------------------

export interface SyncPushPayload {
  books?: Book[];
  progress?: ReadingProgress[];
  bookmarks?: Bookmark[];
  highlights?: Highlight[];
  notes?: Note[];
}

export interface SyncPullResponse {
  server_sync_seq: number;
  books?: Book[];
  progress: ReadingProgress[];
  bookmarks: Bookmark[];
  highlights: Highlight[];
  notes: Note[];
}

export interface SyncPushResponse {
  committed_sync_seq: number;
  accepted_count: number;
}

// ------------------------------------------------------------------------------
// Reader Bridge Protocol (WebView / iframe <-> React Native App)
// ------------------------------------------------------------------------------

export type ReaderTheme = 'light' | 'dark' | 'sepia';

export interface ReaderSettings {
  theme: ReaderTheme;
  fontSize: number; // percentage (e.g. 100 = default)
  fontFamily: string;
  lineHeight: number;
  spread: 'auto' | 'none'; // single page vs two-page spread
}

export type ReaderToAppMessage =
  | { type: 'READY' }
  | { type: 'LOCATION_CHANGED'; cfi: string; percentage: number; page?: number; totalPages?: number }
  | { type: 'SELECTION_MADE'; text: string; cfiRange: string; rect: { x: number; y: number; width: number; height: number } }
  | { type: 'TOC_LOADED'; toc: Array<{ label: string; href: string }> }
  | { type: 'ERROR'; message: string };

export type AppToReaderMessage =
  | { type: 'LOAD_BOOK'; format: BookFormat; dataBase64?: string; dataUrl?: string; initialCfi?: string }
  | { type: 'GO_TO'; cfi: string }
  | { type: 'PREV_PAGE' }
  | { type: 'NEXT_PAGE' }
  | { type: 'APPLY_SETTINGS'; settings: Partial<ReaderSettings> }
  | { type: 'ADD_HIGHLIGHT'; id: string; cfiRange: string; color: string }
  | { type: 'REMOVE_HIGHLIGHT'; cfiRange: string };

// ------------------------------------------------------------------------------
// Phase 8: Google OAuth, Google Drive Sync & Zero-Knowledge Vault Types
// ------------------------------------------------------------------------------

export interface AuthUser {
  id: string; // Google subject ID
  email: string;
  name: string;
  picture?: string;
  accessToken: string;
  idToken?: string;
  expiresAt: number; // UTC ms
}

export interface DriveFileMetadata {
  id: string; // Google Drive file ID
  name: string;
  size: number;
  mimeType: string;
  modifiedTime: string;
  foliumBookId?: string;
  shelf?: string;
  foliumTitle?: string;
}

export interface DriveSyncResult {
  uploadedCount: number;
  downloadedCount: number;
  syncedCount: number;
  deletedCount?: number;
  errors: string[];
}

export interface EncryptedVaultPayload {
  version: 1;
  algorithm: 'AES-GCM-256';
  salt: string; // Base64
  iv: string; // Base64
  ciphertext: string; // Base64
  createdAt: number;
}

// ------------------------------------------------------------------------------
// Phase 8.5: OPDS & Community Catalog Models
// ------------------------------------------------------------------------------

export interface OpdsBookEntry {
  id: string;
  title: string;
  author: string;
  summary?: string;
  coverUrl?: string;
  downloadUrl: string;
  format: BookFormat;
  source: 'standard_ebooks' | 'gutenberg' | 'vietnamese_classics' | 'custom_opds';
  fileSize?: number;
}

export interface CommunityCatalogSource {
  id: string;
  name: string;
  description: string;
  url: string;
  icon?: string;
  type: 'opds' | 'google_drive';
}


