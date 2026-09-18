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

## 🗺️ Master Roadmap: 11-Phase Implementation Plan

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
│  PHASE 8: Google Drive Large File Sync   ⏳  │ <── [ CURRENT STAGE ]
├──────────────────────────────────────────────┤
│  PHASE 9: Mobile Release Train & Stores  ⏳  │
├──────────────────────────────────────────────┤
│  PHASE 10: TTS Audio & Accessibility     ⏳  │
├──────────────────────────────────────────────┤
│  PHASE 11: Freemium, E2EE & Self-Hosting 🔮  │
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

### Phase 6: Bookmarks, Highlights, Notes & Full-Text Search (FTS5) ✅
*Status: Completed (`ee315f4`)*

- [x] **Reader Annotation UI**:
  - Selection toolbar on text highlight with 4 distinct color palettes (Yellow, Green, Blue, Pink).
  - Inline sticky notes linked to EPUB CFI coordinates and PDF text positions.
- [x] **Visual Bookmark Manager**:
  - Instant bookmark toggle (`Ctrl+D` / ribbon button).
  - Drawer list of bookmarks with snippet quotes and timestamp history.
- [x] **On-Device SQLite FTS5 Search**:
  - Indexing user notes, highlights, and book metadata into SQLite FTS5 virtual tables.
  - Instant sub-millisecond search across the entire personal annotation library.
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

### Phase 8: Google Drive Storage & Large Book File Sync ⏳
*Status: Planned*

- [ ] **Google OAuth Integration**:
  - Mobile authentication using `expo-auth-session`.
  - Web authentication via Google Identity Services.
- [ ] **Google Drive Storage Sync**:
  - Scope: `drive.file` creating a dedicated `/Folium` folder (or hidden `appDataFolder`).
  - Upload newly imported local books to personal Google Drive.
  - Download missing books when opening library on a secondary device.
- [ ] **Delta Changes Polling**:
  - Query Google Drive Changes API to detect newly added or deleted book files across devices.
- [ ] **Chunked Large File Streaming**:
  - Resumable upload/download protocol for massive EPUBs (100MB+) and PDFs (500MB+).

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

### Phase 10: Audio Narration (TTS) & Accessibility ⏳
*Status: Planned*

- [ ] **On-Device Text-to-Speech (TTS)**:
  - Integration with `expo-speech` on mobile (utilizing local system voices for English, Vietnamese, Japanese, etc.).
  - Integration with Web Speech Synthesis API on desktop browsers.
- [ ] **Synchronized Reading UI**:
  - Real-time sentence-by-sentence highlight tracking audio voice playback.
  - Play, pause, speed control (0.75x - 2.0x), and skip sentence shortcuts.
- [ ] **Background Audio & Media Notification**:
  - Lock-screen media playback controls on iOS and Android.
- [ ] **Enhanced Accessibility**:
  - Dyslexia-friendly font toggles (OpenDyslexic).
  - Bionic reading mode and high-contrast color schemes.

---

### Phase 11: Freemium Gating, E2E Encryption & Self-Hosting 🔮
*Status: Future Vision*

- [ ] **Freemium Tier Separation**:
  - **Free Tier (100% Free Core)**: Full offline reader, local SQLite, unlimited offline books, local annotations.
  - **Pro Tier**: Multi-device cloud sync, unlimited Google Drive syncing, cross-device full-text note search, advanced TTS voices.
- [ ] **In-App Subscriptions & Billing**:
  - RevenueCat integration for Android / iOS in-app purchases.
  - Stripe / LemonSqueezy integration for Web payments.
- [ ] **Zero-Knowledge End-to-End Encryption (E2EE)**:
  - Client-side encryption of reading progress, notes, and bookmarks before leaving the device.
  - Edge worker stores only encrypted ciphertext blocks.
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
| **Bookmarks, Highlights & Notes** | 6 | ⏳ Next | ⏳ Next | ⏳ Next | ⏳ Next |
| **FTS5 Full-Text Search** | 6 | ⏳ Next | ⏳ Next | ⏳ Next | N/A |
| **D1 Sync & Quota Defense** | 7 | ⏳ In Progress | ⏳ In Progress | ⏳ In Progress | ✅ Live |
| **Google Drive File Sync** | 8 | 📋 Planned | 📋 Planned | 📋 Planned | N/A |
| **EAS Build & Store Release** | 9 | N/A | 📋 Planned | 📋 Planned | N/A |
| **EAS OTA Updates** | 9 | N/A | 📋 Planned | 📋 Planned | N/A |
| **Text-to-Speech (TTS)** | 10 | 📋 Planned | 📋 Planned | 📋 Planned | N/A |
| **Freemium & In-App Purchase** | 11 | 🔮 Future | 🔮 Future | 🔮 Future | 🔮 Future |
| **E2E Encryption & Self-Host** | 11 | 🔮 Future | 🔮 Future | 🔮 Future | 🔮 Future |
