# Folium Product & Engineering Roadmap 🍃

> **Confidential & Proprietary**  
> Strategic direction, technical milestones, and architectural progression for Folium.

---

## 🧭 Core Philosophy & Guiding Principles

1. **Local-First Supremacy**: Every core interaction (opening a book, turning pages, highlighting, searching, changing settings) must function with 100% fidelity without an internet connection.
2. **Zero-CDN Dependency**: No runtime remote script tags, no external fonts or CDN dependencies. Everything is self-contained and bundled.
3. **Frugal Cloud Architecture**: Edge synchronization is an eventual consistency layer. Operations are optimized to respect free-tier boundaries (specifically Cloudflare D1's 100,000 writes/day quota) through local debouncing, batching, and CR-SQLite changesets.
4. **Non-Breaking Release Contracts**: Backend and database schemas always practice the **Expand & Contract** pattern to guarantee unupdated mobile clients are never broken by edge deployments.

---

## 🗺️ Milestones & Phases

```text
┌────────────────────────┐     ┌────────────────────────┐     ┌────────────────────────┐
│  Phase 1: Foundation   │ ──> │   Phase 2: Edge Sync   │ ──> │ Phase 3: Rich Reading  │
│  Offline Engines & Web │     │  CRDT & Quota Defense  │     │   Notes, TOC & Audio   │
│       [ COMPLETED ]    │     │     [ IN PROGRESS ]    │     │       [ PLANNED ]      │
└────────────────────────┘     └────────────────────────┘     └────────────────────────┘
                                                                           │
┌────────────────────────┐     ┌────────────────────────┐                  │
│    Phase 5: Cloud      │ <── │   Phase 4: Mobile OS   │ <────────────────┘
│   E2EE, Auth & OPDS    │     │   EAS, Stores & OTA    │
│       [ FUTURE ]       │     │       [ PLANNED ]      │
└────────────────────────┘     └────────────────────────┘
```

---

### Phase 1: Core Offline Foundation & Web Release ✅
*Status: Completed (September 2026)*

- [x] **Monorepo Inception**: pnpm workspace architecture isolating `apps/mobile`, `packages/shared`, and `apps/sync-worker`.
- [x] **Zero-CDN EPUB Engine**: Inlined `epub.js` with CFI-based location tracking, multi-theme engine (Dark, Sepia, Light), and dynamic font sizing.
- [x] **Zero-CDN PDF Engine**: Inlined `pdf.js` with client-side blob worker rendering and high-DPI canvas viewport scaling.
- [x] **Desktop Reading Ergonomics**: Keyboard navigation (`←`/`→`, `Space`, `PageUp`/`PageDown`, `+`/`-`, `T` immersion mode, `Esc`).
- [x] **Web Storage Engine**: IndexedDB-backed SQLite persistent storage for browser environments.
- [x] **Production Web Hosting**: Deployed to `https://aki.is-a.dev` with automated GitHub Actions CI/CD triggered strictly on `main`.

---

### Phase 2: Edge Synchronization & Cloudflare D1 Quota Defense 🟡
*Status: In Progress*

- [x] **Edge Worker Setup**: Cloudflare Worker built with Hono, interfacing with Cloudflare D1 (`folium-d1`).
- [x] **Sync Contract Design**: Schema definitions for sync changesets, client mutations, and device registry.
- [ ] **Adaptive Sync Debounce Engine**:
  - Local-first write queue that defers cloud synchronization until:
    - User closes the reader or navigates to library.
    - Idle debounce threshold (30s without reader activity).
    - Application lifecycle transitions (`background` / `beforeunload`).
- [ ] **Bi-directional Conflict Resolution**:
  - Deterministic timestamp-based Last-Write-Wins (LWW) with CR-SQLite changeset primitives.
  - Guarding against clock skew via Lamport / hybrid logical clocks.
- [ ] **Offline Sync Queue & Reconnection**:
  - Persistent queue in SQLite for failed network sync requests.
  - Exponential backoff with jitter on reconnect.

---

### Phase 3: Rich Reading Experience & Annotations 📋
*Status: Planned (Q4 2026)*

- [ ] **Annotations & Highlighting**:
  - Text selection popup with multi-color highlights (Yellow, Green, Blue, Pink).
  - Inline note-taking tied to EPUB CFI coordinates and PDF text positions.
  - Local SQLite full-text search indexing of all user highlights and notes.
- [ ] **Interactive Navigation**:
  - Hierarchical Table of Contents (TOC) drawer with chapter reading progress indicators.
  - Visual bookmark manager with thumbnail preview / snippet preview.
- [ ] **Text Search Engine**:
  - In-book full-text search using SQLite `FTS5` virtual tables.
- [ ] **Audio & Accessibility**:
  - On-device Text-to-Speech (TTS) integration with sentence-level highlighting.
  - Bionic reading mode and Dyslexic-friendly font options.

---

### Phase 4: Native Mobile Production & Store Distribution 📋
*Status: Planned (Q1 2027)*

- [ ] **EAS Build Hardening**:
  - Android production release pipeline (AAB with ProGuard optimization).
  - iOS production release pipeline (IPA with Swift / Xcode optimization).
- [ ] **Native File System & Large Book Handling**:
  - Direct sandboxed file system streaming (`expo-file-system`) for large EPUBs (100MB+) and PDFs (500MB+).
  - Memory-efficient chunked streaming to prevent OOM crashes on budget devices.
- [ ] **Expo EAS Update (OTA) Deployment**:
  - Setup OTA release channels (`production`, `staging`) for instant JS/TS bug fixes and UI updates without App Store delays.
- [ ] **App Version Gatekeeping**:
  - `X-App-Version` header exchange with edge worker.
  - Enforce `426 Upgrade Required` fallback dialogs when breaking protocol changes are unavoidable.
- [ ] **Store Submissions**:
  - Apple App Store submission & review compliance.
  - Google Play Store submission & review compliance.

---

### Phase 5: Cloud Ecosystem, Privacy & Self-Hosting 🔮
*Status: Future Vision*

- [ ] **End-to-End Encryption (E2EE)**:
  - Zero-knowledge encryption of reading positions, bookmarks, and notes before leaving client device.
  - Edge worker and D1 store only encrypted ciphertext blocks.
- [ ] **Decentralized & Multi-tenant Identity**:
  - Passkeys (WebAuthn) / Magic Link auth via Cloudflare Workers.
- [ ] **OPDS & Cloud Storage Import**:
  - OPDS catalog ingestion (import directly from personal Calibre servers).
  - WebDAV / Google Drive / Dropbox direct cloud file import.
- [ ] **One-Click Self-Host Deployment**:
  - Open-source self-hostable Wrangler / Docker package for users wishing to run their own private Folium Sync Worker and D1/PostgreSQL database.

---

## 📊 Feature Progression Matrix

| Feature Domain | Web Client (`aki.is-a.dev`) | Android (Expo) | iOS (Expo) | Sync Worker |
| :--- | :---: | :---: | :---: | :---: |
| **Offline EPUB Reader** | ✅ Production | 🟡 Internal Dev | 🟡 Internal Dev | N/A |
| **Offline PDF Reader** | ✅ Production | 🟡 Internal Dev | 🟡 Internal Dev | N/A |
| **Local SQLite Database** | ✅ IndexedDB | 🟡 Native SQLite | 🟡 Native SQLite | N/A |
| **Cloud Sync Engine** | 🟡 Prototype | 🟡 Prototype | 🟡 Prototype | ✅ Production |
| **Annotations & Notes** | 📋 Planned | 📋 Planned | 📋 Planned | 📋 Planned |
| **EAS OTA Updates** | N/A | 📋 Planned | 📋 Planned | N/A |
| **E2E Encryption** | 🔮 Future | 🔮 Future | 🔮 Future | 🔮 Future |
