<div align="center">

# 🍃 Folio (`aki.is-a.dev`)

**Official Web Application & Production Deployment for Folium E-Reader**

[![Live Web](https://img.shields.io/badge/Live%20App-aki.is--a.dev-6366F1?style=for-the-badge&logo=google-chrome&logoColor=white)](https://aki.is-a.dev)
[![Platform](https://img.shields.io/badge/Platform-Web%20PWA-3B82F6?style=for-the-badge&logo=pwa&logoColor=white)](https://aki.is-a.dev)
[![Hosting](https://img.shields.io/badge/Hosted%20On-GitHub%20Pages-181717?style=for-the-badge&logo=githubpages&logoColor=white)](https://pages.github.com)
[![Privacy Vault](https://img.shields.io/badge/Privacy-AES--256--GCM-A855F7?style=for-the-badge&logo=shield&logoColor=white)](https://aki.is-a.dev/security)

<p align="center">
  <a href="#-about-folio">About</a> •
  <a href="#-live-web-services--portals">Live Portals</a> •
  <a href="#-key-features">Key Features</a> •
  <a href="#-privacy--security-architecture">Security & Privacy</a> •
  <a href="#-feedback--issues">Feedback</a>
</p>

---

</div>

## 📖 About Folio

**Folio** is the official web deployment of the **Folium E-Reader** — a local-first, zero-CDN ebook reading platform running entirely inside modern web browsers at **[https://aki.is-a.dev](https://aki.is-a.dev)**.

Designed for distraction-free, privacy-conscious reading, Folio allows you to read your personal EPUB and PDF library anywhere with **100% offline autonomy**, zero tracking telemetry, and zero reliance on external CDNs.

---

## 🔗 Live Web Services & Portals

The application is deployed with pre-rendered static routes and client-side offline storage:

| Route | Function & Statutory Role |
| :--- | :--- |
| **[`/`](https://aki.is-a.dev)** | **Folium Web Reader**: Bookshelf, reading progress, high-DPI PDF & inlined EPUB reader. |
| **[`/community`](https://aki.is-a.dev/community)** | **Community Bookshelf**: Public domain OPDS catalogs (Standard Ebooks, Project Gutenberg, Vietnamese literature) & shared Drive libraries. |
| **[`/privacy`](https://aki.is-a.dev/privacy)** | **Privacy Policy**: Local-first storage declaration and Google OAuth `drive.file` scope transparency. |
| **[`/terms`](https://aki.is-a.dev/terms)** | **Terms & DMCA**: Formal Safe Harbor statutory declaration (DMCA § 512 / OCILLA) and designated copyright takedown agent. |
| **[`/security`](https://aki.is-a.dev/security)** | **Security & Cryptographic Proof**: Interactive client-side AES-256-GCM verification snippet (Kerckhoffs's Principle). |

---

## ✨ Key Features

- **🏠 100% Local-First Autonomy**: Your books, highlights, and reading positions are stored directly on your device via an IndexedDB-backed SQLite database. The app functions completely without internet connectivity.
- **🛡️ Zero-CDN Isolation**: Reader engines (`epub.js`, Mozilla `pdf.js`) are inlined directly into the app bundle with blob-based workers. No external scripts or remote font trackers are ever requested.
- **📖 Dual Reader Engines**:
  - **EPUB Engine**: Canonical Fragment Identifier (CFI) precision tracking, Light / Sepia / Dark themes, and customizable font scaling (70% - 200%).
  - **PDF Engine**: High-DPI canvas rendering with automatic viewport compensation, centered reading column, and distraction-free immersion mode (`T` key).
- **⌨️ Desktop Keyboard Ergonomics**: Quick page navigation using `←` / `→` or `Space` / `PageUp` / `PageDown`.
- **☁️ Decoupled Google Drive Sync**: Connect personal Google Drive with two-way **Folder-as-a-Shelf** organization (folders inside `/Folium` automatically map to Shelves in your library).
- **🌐 Open OPDS Catalogs**: Browse and download thousands of public domain classics in 1 tap, or connect your own Calibre OPDS server.

---

## 🔒 Privacy & Security Architecture

Folio operates on a strict **Zero-Knowledge** model:

- **Client-Side Encryption**: Reading progress, bookmarks, private notes, and shelf metadata are encrypted directly on your device using hardware-accelerated **AES-256-GCM** (PBKDF2 with 100,000 SHA-256 rounds).
- **Zero Server Exposure**: Cloud synchronization layers receive only blind Base64 ciphertext. Even in the event of a server breach or legal subpoena, your reading activity cannot be deciphered.
- **Independent Verification**: Anyone can verify the cryptographic handshake locally by running our standalone audit script on the [/security](https://aki.is-a.dev/security) page.

---

## 💬 Feedback & Bug Reports

If you encounter an issue, have a feature suggestion, or wish to report a bug while using **Folio** at `aki.is-a.dev`, please open an issue in this repository:

👉 **[Submit an Issue](../../issues)**

---

## 📄 Copyright & Legal Notice

Copyright © 2026 **Nguyễn Trần Duy Hưng ([@dannie203](https://github.com/dannie203))**. All rights reserved.

All ebook files and documents opened, stored, or synced via Folio remain the exclusive property and responsibility of the user. Folio complies with statutory DMCA Safe Harbor provisions (17 U.S.C. § 512).
