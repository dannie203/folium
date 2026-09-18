# Folium 🍃

> **Confidential & Proprietary**  
> Internal engineering and architectural documentation for Folium — an offline-first cross-platform ebook ecosystem.

---

## 🏛️ System Architecture

Folium is architected around a **Local-First, Zero-CDN, Edge-Synchronized** paradigm designed for high performance, complete offline autonomy, and optimal cloud quota consumption.

```text
┌──────────────────────────────────────────────────────────┐
│                   Folium Monorepo                        │
├──────────────────────────┬───────────────────────────────┤
│ apps/mobile              │ Cross-platform Client         │
│                          │ • iOS & Android (Native Expo) │
│                          │ • Web (IndexedDB + SQLite)    │
│                          │ • Offline EPUB/PDF Engines    │
├──────────────────────────┼───────────────────────────────┤
│ packages/shared          │ Contracts & Schemas           │
│                          │ • Types, Enums, D1 Models     │
├──────────────────────────┼───────────────────────────────┤
│ packages/worker          │ Edge Sync Backend             │
│                          │ • Cloudflare Workers + Hono   │
│                          │ • Cloudflare D1 (Rate-safe)   │
└──────────────────────────┴───────────────────────────────┘
```

---

## ⚡ Core Engineering Highlights

### 1. Reader Engines (Zero External Dependencies)
- **EPUB Engine (`apps/mobile/src/reader/EpubReader.tsx`)**:
  - Offline inlined `epub.js` with reflowable layout, CFI location tracking, custom theme engine (Dark, Sepia, Light), and bidirectional iframe bridge.
- **PDF Engine (`apps/mobile/src/reader/PdfReader.tsx`)**:
  - Inlined Mozilla `pdf.js` with client-side blob worker rendering.
  - High-DPI canvas rendering with automatic viewport scaling.
- **Desktop & Keyboard Navigation**:
  - `←` / `→` or `Space` / `PageUp` / `PageDown`: Instant page turning.
  - `+` / `-`: Dynamic font scaling (70% - 200%).
  - `T`: Toggle chrome / immersion mode.
  - `Esc`: Close modals and navigation drawers.
  - Centered reading column (`maxWidth: 840px`) with justified book typography.

### 2. Local-First Data Layer
- **iOS / Android**: Native `expo-sqlite` with FTS (Full Text Search).
- **Web**: Custom IndexedDB-backed SQLite persistent adapter with binary storage for books.
- **Sync Model**: Write-quota protected. Sync requests are debounced and triggered on reader exit/app backgrounding to preserve Cloudflare D1's 100k rows/day write tier.

---

## 🛠️ Internal Operations & Workflows

### Development
```bash
# Start Web client with Metro bundler
pnpm dev:web

# Start Mobile dev client
pnpm dev:mobile

# Run Cloudflare Worker edge backend locally
pnpm dev:worker

# Run full monorepo typecheck
pnpm typecheck
```

### Production Build & Deploy
```bash
# Export static web client for hosting (Cloudflare Pages / Vercel)
pnpm --filter @folium/mobile exec expo export --platform web

# Build Android Production APK / AAB (via EAS)
eas build --platform android --profile production

# Deploy Edge Worker & apply D1 schema to production
pnpm --filter @folium/worker deploy
pnpm --filter @folium/worker d1:migrate:prod
```

---

## 🔒 Copyright

Copyright © 2026. All rights reserved.  
Unauthorized copying, distribution, or deployment of this codebase is strictly prohibited.
