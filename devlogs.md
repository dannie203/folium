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
