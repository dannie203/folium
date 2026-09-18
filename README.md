# Folium 🍃

A modern, offline-first cross-platform reader for **EPUB** and **PDF** ebooks, built with **React Native / Expo SDK 52**, **Cloudflare Workers**, and **Cloudflare D1**.

---

## ✨ Features

- 📖 **Dual Reader Engines**:
  - **EPUB Engine**: Standalone offline `epub.js` with reflowable text, pagination, CFI location tracking, and table of contents.
  - **PDF Engine**: Zero-CDN offline Mozilla `pdf.js` with canvas rendering and page navigation.
- ⌨️ **Desktop & Keyboard-First Experience**:
  - Full keyboard navigation: `←` / `→` or `Space` (page flip), `PageUp` / `PageDown`, `j` / `k` (vim shortcuts).
  - Quick font scaling: `+` / `-` (adjust text size from 70% up to 200%).
  - Interface shortcuts: `T` (toggle top/bottom toolbars), `Esc` (close dialogs & menus).
  - Centered book-like reading column with `maxWidth: 840px` and refined typography.
- 🎨 **Reader Customization**:
  - Themes: Dark (`#121214`), Sepia (`#F4ECD8`), Light (`#FFFFFF`).
  - Adjustable font scale and line spacing.
- ⚡ **Local-First Architecture**:
  - Fast offline reading via local SQLite on iOS/Android and IndexedDB-backed SQLite on Web.
  - Zero cloud dependency for reading; reading progress is cached locally.
- ☁️ **Cloudflare Edge Sync Backend**:
  - Hono-powered API running on Cloudflare Workers.
  - Metadata and progress synchronization powered by Cloudflare D1 with write-quota optimization.

---

## 🏗️ Project Structure

```text
folium/
├── apps/
│   └── mobile/           # Expo React Native App (iOS, Android, Web)
│       ├── app/          # Expo Router file-based routes
│       └── src/          # Reader engines, SQLite DB, services
└── packages/
    ├── shared/           # Shared TypeScript types & schemas
    └── worker/           # Cloudflare Worker API + D1 migrations
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- [pnpm](https://pnpm.io/) (`corepack enable pnpm`)

### Installation

```bash
git clone https://github.com/dannie203/folium.git
cd folium
pnpm install
```

### Running Locally

```bash
# Run Web Reader
pnpm dev:web

# Run Mobile (Expo Go / Dev Client)
pnpm dev:mobile

# Run Cloudflare Worker API locally
pnpm dev:worker
```

### Typecheck

```bash
pnpm typecheck
```

---

## 📄 License

MIT
