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
