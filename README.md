# Venice Forge

<p align="center">
  <img src="./assets/branding/venice-logo-lockup-red.svg" alt="Venice Forge — unofficial Venice.ai API client" width="320" />
</p>

<p align="center">
  <strong>An unofficial, third-party desktop client for the Venice API.</strong><br>
  <em>Chat, create images, batch prompts, and research the web — all powered by Venice.</em>
</p>

> [!IMPORTANT]
> **18+ Age Requirement**: You must be 18 years or older to use this application. This app connects to unrestricted AI endpoints that pose inherent risks, including the potential to generate explicit content or AI-generated images that inappropriately represent minors (CSAM). By proceeding, you confirm you are 18+ and assume all responsibility.
>
> **Venice Forge is an unofficial, third-party desktop client for the Venice API.** This project is not affiliated with, endorsed by, sponsored by, or maintained by Venice.ai, Inc. Venice names and marks are used solely for nominative identification of API compatibility. This app requires a Venice API key for live model discovery and generation. See [docs/LEGAL.md](docs/LEGAL.md) for full legal terms.

[![CI](https://github.com/spearchucker667/Venice-API-connector/actions/workflows/ci.yml/badge.svg)](https://github.com/spearchucker667/Venice-API-connector/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/spearchucker667/Venice-API-connector?include_prereleases&label=release)](https://github.com/spearchucker667/Venice-API-connector/releases)
[![Windows Release](https://img.shields.io/badge/platform-Windows-0078d4?logo=windows11)](https://github.com/spearchucker667/Venice-API-connector/releases)
[![macOS Release](https://img.shields.io/badge/platform-macOS-000000?logo=apple)](https://github.com/spearchucker667/Venice-API-connector/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node 22](https://img.shields.io/badge/node-22-339933.svg)](package.json)
[![TypeScript strict](https://img.shields.io/badge/typescript-strict-3178c6.svg)](tsconfig.json)
[![Electron 42](https://img.shields.io/badge/electron-42-47848f.svg)](package.json)
<img width="1774" height="887" alt=" " src="https://github.com/user-attachments/assets/4981bc4d-a743-4a0f-a6e7-48ddffb6edcb" />

> [!WARNING]
> **Major Overhaul in Progress (Creative Workspace Refactor)**  
> We are actively transforming Venice Forge from a collection of tabs into a cohesive local creative workspace. This includes first-class **Projects** (scoping chats, media, characters, lorebooks, research, workflows, recipes, and exports), a shared **Asset/Recipe system**, **Command Palette**, layout cohesion, model-aware controls, and deeper cross-studio integration.  
> 
> **The `main` branch may be unstable during this work.** Features may be incomplete, APIs may change, and storage migrations are likely.  
> **For a stable, production-ready experience, download the latest official release** from [GitHub Releases](https://github.com/spearchucker667/Venice-API-connector/releases). Release builds are tested, versioned, and reflect the last known-good state.

## 🚀 Quick Start

1. **Download** a release from [GitHub Releases](https://github.com/spearchucker667/Venice-API-connector/releases)
   - Windows: `Venice-Forge-<version>-x64-Setup.exe` or portable `.exe`
   - macOS: `.dmg` (Intel or Apple Silicon)

2. **Install** and launch Venice Forge

3. **Add your Venice API key** in **Config** → save it → test the connection

4. **Start chatting, creating images, or running research!**

### Local YAML config (advanced / dev)

You can also configure Venice Forge by editing a `config.yaml` file on disk. Plaintext API keys placed in it are imported into OS-level secure storage on startup and then redacted from the file. See [`docs/CONFIG.md`](docs/CONFIG.md).

```bash
npm run config:init       # Copy example templates to .config/*.local.yaml
npm run config:validate   # Validate the file without launching Electron
npm run config:print      # Print the sanitized effective config
```

For development, see [Development](#-development--setup) or [docs/ABOUT.md](docs/ABOUT.md) for architecture details.

---

## ✨ Features

Fourteen integrated tabs covering chat, media generation, research, and settings — wired into a single canonical tab registry at `src/config/tabs.ts`:

| Tab | Name | What You Can Do |
|-----|------|-----------------|
| 💬 | **Chat** | Multi-turn streaming conversations with system prompts, file/image attachments, drag & drop context reordering, memory injection, persistent history, chat forking, and Agent vs Classic toggle |
| 🖼️ | **Image Studio** | Generate images, **Edit** (single image inpainting), **Combine** (multi-image referencing), and **Upscale** (separate from video upscaling). **Model-aware** controls hide / disable negative prompt, seed, style, and steps when the selected model does not support them, and a live **Capabilities** line shows what the current model can do. |
| 🎬 | **Media Studio** | Browse, search, tag, and export every image and video Venice Forge has generated. **Power tools**: multi-select with bulk action toolbar (favorite, tag, assign to project, export, delete with confirm gate, compare), 2-4 item side-by-side compare view, lineage/derivative tree, send-to Image Studio / Image Tools / Chat / Video Studio + copy prompt/negative/seed/model, safe export bundle with metadata sidecars, stronger filters (`Has recipe` / `No recipe` / `Has seed` / `No seed` / `Unscoped`) and sorts (`Project` / `Has recipe` / `Has seed`), and selection-aware Command Palette actions. The sidebar project selector supports **All Projects** or an exact project filter; legacy/unscoped media appears only in All Projects. Generated media is attached to the active project, while imports and existing legacy records are not silently retagged. Inspector actions include **Use recipe**, a **Recipe compatibility** card (status + issues + use-with-current-model / use-original / side-by-side comparison), **Export recipe** JSON, new/same-seed regeneration, **Upscale / Edit**, **Remix**, and copy prompt / negative / seed / metadata / recipe JSON. See [`docs/MEDIA_STUDIO.md`](docs/MEDIA_STUDIO.md) |
| 📚 | **Prompts** | First-class Prompt Library. Save, version, tag, favorite, archive, and reuse prompts across Chat, Image Studio, Media Studio recipes, and Research. Each prompt has a current version and an append-only version chain; old versions remain readable. Project / global scope honours the active project. Save from existing surfaces (Image Studio prompt + negative prompt, Media Inspector recipe) and apply back (Use in Image Studio / Use in Chat) via the canonical tab registry. Safe import / export JSON envelope (`{ version: 1, app, exportedAt, prompts: [] }`) regenerates ids on import and rejects secret-like records (`sk-…` / `venice_…` / `Bearer …` / `Authorization:`) before they ever reach storage. The Command Palette adds a Prompt Library section (Open / New / Use Selected / Export / Import). |
| ♫ | **Audio Studio** | Text-to-speech with 50+ voices and formats, plus audio transcription via Whisper |
| 🎵 | **Music Studio** | AI music generation with text-to-music, optional lyrics, duration control, and instrumental mode |
| 🎬 | **Video Studio** | Asynchronously queue text-to-video, image-to-video, video-to-video, reference-to-video, and video upscale jobs. Settings are model-dependent. Video upscale uses `topaz-video-upscale` when available |
| 🔢 | **Embeddings** | Vector embeddings generation for text with selectable models and dimension display |
| 🔍 | **Research** | Web search via Venice or Jina AI, page scraping, research synthesis, and public-profile discovery. **Research Workspace**: Manage persistent research sessions (project-scoped or global), collect sources and findings, and generate citation-aware summaries. Save summaries to the Prompt Library or create multi-step Workflows from research. |
| 🎭 | **Characters** | Browse Venice hosted characters, sort/filter, and start character chats using `venice_parameters.character_slug` |
| 🎭 | **RP Studio** | Local-first character roleplay authoring + runtime: build character cards with avatars, write personas and lorebooks (keyword-triggered world info), run multi-character chats with speaker-aware turns, generate scene images linked to chat history, and inspect the prompt assembly trace. All content stays on disk; Family Safe Mode optionally runs the local filter at dispatch boundaries. See [`docs/CHARACTER_RP.md`](docs/CHARACTER_RP.md) |
| 🧩 | **Workflows** | Visual node editor for chaining models (Input → LLM → Image Gen → Output) with parallel branching |
| 🤖 | **Playground** | Conversational agent that builds and edits workflows on a live canvas using plain language |
| ⚙️ | **Config** | API key management (OS-level secure storage), theme editor (Venice Parity Dark, Graphite, Daylight, Copper, Dracula, GruvBox Dark, Rosepine) with custom YAML export/import, model defaults, data import/export, and a **Local Config** panel that surfaces the optional `config.yaml` / `themes.yaml` files (path, parse/validation warnings, key import status, Reload / Open Folder / Export Template / Clear Secure Store actions) |
| 📊 | **Status** | Transport mode, runtime info, rate-limit headers, sanitized diagnostics export, and a desktop-only “Open logs folder” action |

The catalog of available Venice models and the multi-prompt batch runner are exposed inside **Config → Models** and **Config → Batch** as sub-views (the canonical tab order is the 14 rows above; both Catalog and Batch are not separate top-level tabs).

---

## 🏗️ Architecture

**Desktop & Web Dual-Mode:**
- **Electron desktop app** (Windows/macOS) — React renderer + Electron IPC + main-process HTTPS client
- **Web mode** (development/self-hosted) — React renderer + Express proxy server
- **Unified Venice API layer** — all traffic goes through validated, safety-checked paths

**Security-first design:**
- Renderer cannot access raw API keys (stored in OS Keychain/DPAPI)
- Toggleable Family Safe Mode local filter, separate from Venice API Safe Mode
- Encrypted IndexedDB storage, secure chat history snapshots, trusted URL validation
- Zero telemetry, no external analytics

See [docs/ABOUT.md](docs/ABOUT.md) for detailed architecture and [SECURITY.md](SECURITY.md) for the full security model.

---

## 📋 Requirements

| Requirement | Version |
|-------------|---------|
| **Node.js** | 22.13 or newer (Node 22.x) |
| **npm** | 10+ |
| **Desktop OS** | Windows 10/11 or macOS 13+ |
| **Venice API Key** | From [venice.ai](https://venice.ai) |

For development, the same Node/npm versions are required. Linux development is supported but release packaging for Linux is not officially maintained.

---

## 🚀 Development & Setup

### First-Time Setup

```bash
# 1. Clone and install
git clone https://github.com/spearchucker667/Venice-API-connector.git
cd Venice-API-connector
npm install

# 2. Start the Electron app (recommended for development)
npm run dev:electron

# OR start web-mode development
npm run dev:web

# 3. Add your Venice API key in the Config tab
```

### Key Development Commands

| Command | Purpose |
|---------|---------|
| `npm run dev:electron` | Start Electron app with live reload |
| `npm run dev:web` | Start Vite (renderer) only |
| `npm run dev:server` | Start Express proxy only |
| `npm run dev` | Concurrent dev:server + dev:web |
| `npm run lint:eslint` | Lint all source code (0 warnings) |
| `npm run typecheck` | TypeScript check for renderer + Electron |
| `npm test` | Run all unit and integration tests |
| `npm run test:watch` | Watch mode for tests |
| `npm run verify:safety-guard` | **Security gate:** verify safety guard is enforced |
| `npm run verify:markdown-links` | Validate local Markdown targets and heading fragments |
| `npm run verify:workspace-contracts` | Run the complete Phase 1 workspace/project/recipe contract guard |
| `npm run verify:model-aware-recipes` | Run the Phase 2A model/recipe UI contract guard (image-view capability gating, payload stripping, media-inspector compatibility card) |
| `npm run verify:media-studio-power-tools` | Run the Phase 2B Media Studio power tools guard (selection store, bulk actions, compare, lineage, send-to, export, filters/sorts, command palette media actions) |
| `npm run verify:prompt-library` | Run the Phase 2D Prompt Library guard (data model, versioning, project/global scope, safe import/export, Prompt Library UI, save/apply integrations, command palette prompt actions) |
| `npm run verify:release-packaging-hardening` | **Release gate (VERIFY-052):** verify package scripts, CI parity, Node 22 pinning, electron-builder invariants, dist hygiene (no source maps / test files / .env / .config local config / secrets), and no tracked archive contaminants |
| `npm run verify:archive-clean` | Fail if the working tree contains any tracked archive contaminants (`node_modules/`, `dist/`, `dist-electron/`, `release/`, `coverage/`, `.env*`, `*.db`, `*.log`, `.config/*.local.yaml`, etc.) — Phase 2J hardening |
| `npm run profile:media-studio` | Profile 1,000 encrypted Media Studio records in isolated Electron |
| `npm run build` | Build production app (`dist/`, `dist-electron/`) |
| `npm run clean` | Remove all generated output |

### Environment Variables (Web Mode Only)

Copy `.env.example` to `.env`:

```bash
# Required
VENICE_API_KEY="your-venice-inference-key"

# Optional
PORT=3000                              # Server port (default: 3000)
HOST=127.0.0.1                         # Bind address (default: 127.0.0.1)
NODE_ENV=development                   # development | production | test
VENICE_FORGE_DEBUG_DEVTOOLS=false      # Allow DevTools in production
VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=false  # Linux plaintext fallback (⚠️ security warning)
```

For the full list of env vars and their purposes, see `.env.example`.

---

## 📦 Building & Packaging

### Windows Packaging

```bash
npm run dist:win
npm run checksum:release
npm run verify:dist:win
```

Outputs to `release/`:
- `Venice-Forge-<version>-x64-Setup.exe` — NSIS installer
- `Venice-Forge-<version>-x64-Portable.exe` — standalone portable executable

### macOS Packaging

```bash
npm run dist:mac
npm run checksum:release
npm run verify:dist:mac
```

Outputs to `release/`:
- `Venice-Forge-<version>-arm64.dmg` / `.zip` — Apple Silicon bundle
- `Venice-Forge-<version>-x64.dmg` / `.zip` — Intel bundle

### Signing & Notarization

- **Local builds:** Unsigned by default; may trigger SmartScreen (Windows) or Gatekeeper (macOS) warnings.
- **Official releases:** Signed only when the release workflow is supplied valid Windows and/or Apple signing credentials. Release notes must state whether each artifact is signed or unsigned.
- **macOS Gatekeeper workaround (local builds):** `xattr -dr com.apple.quarantine "/path/to/Venice Forge.app"`

For detailed signing and notarization steps, see [docs/RELEASE/signing-and-notarization.md](docs/RELEASE/signing-and-notarization.md).

**Icon Resources:** Build icons (`build/icon.ico`, `build/icon.icns`, `build/icon.png`) are required for packaging. This repo includes placeholder icons; run `npm run generate:icon` if missing, then replace with final artwork before release.

---

## 💾 Data Storage & Privacy

| Data Type | Location | Encryption |
|-----------|----------|------------|
| **API Keys** (Desktop) | OS Keychain (macOS) / DPAPI (Windows) | OS-level (encrypted at rest) |
| **Logs** | Application support dir | Plain text (disk only) |
| **Chats** (Desktop) | `chat-history/*.json` (per-conversation file, atomic write) | Plain text on disk — the file is written in the user's profile directory; see the Encryption note below. |
| **Settings, Images, Conversations, Memories, Files, Character Cards, Personas, Lorebooks, RP Chats, RP Assets** | Renderer IndexedDB | AES-GCM (browser-managed key) |
| **Exports** | User-specified location | Versioned JSON (same as storage) |

**Encryption note:** the IDB-backed stores listed above are transparently encrypted at rest by `src/services/storageService.ts` (`ENCRYPTED_STORES` allowlist) using a browser-managed AES-GCM key. The desktop `chat-history/*.json` files are written as plaintext JSON because the main process does not have a stable, cross-platform key store that is accessible at every load. If you require encrypted chat history on disk, use the **Config → Data → Export** flow to keep an AES-GCM-encrypted backup out-of-band. (See the [Known Limitations](#-known-limitations) section for the threat-model scope of browser-managed AES-GCM keys.)

**Import/Export Notes:**
- Validation: JSON schema and size checks (max 25 MB)
- Merging: By ID (never clears existing data)
- Privacy: Secret-like fields are automatically stripped before export
- Safety: A backup is always saved before import

**Web Mode (Venice key):** The Venice API key lives in the Express server `.env` and is not exposed to the browser.  
**Desktop Mode (Venice and Jina keys):** Both keys are stored via OS secure storage and are not exposed to the renderer.  
**Web Mode (optional Jina override):** Persistent Jina configuration belongs in the server `.env`. A key entered in the browser is held in memory only for the current page session and is never written to browser storage.

---

## 🔒 Security & Privacy

**Core Security Principles:**
1. **API key isolation** — Renderer cannot access raw keys (stored in OS secure storage)
2. **Venice endpoint allowlist** — Only the approved endpoints defined in `src/shared/validation.ts` are callable. The current allowlist includes chat, model discovery, search/scrape/text-parser, image generate/edit/upscale/multi-edit, and video queue/retrieve/quote/complete endpoints.
3. **Independent safety controls** — Family Safe Mode runs Venice Forge's local family filter; Adult Mode skips that local filter entirely. Venice API Safe Mode controls only the provider-side `safe_mode` parameter.
4. **No telemetry** — Venice Forge collects zero analytics or tracking data
5. **Trusted URL validation** — External links must be HTTPS with non-private hostnames

**Content Safety:**
- Advanced context detection and `negative_prompt` extraction
- Scanned at: renderer layer, Electron IPC layer, and Express proxy
- Fail-close design: errors result in 500 status (safe default)
- Raw prompt text is never logged anywhere

**For full details**, see [SECURITY.md](SECURITY.md) and [docs/legal/PRIVACY.md](docs/legal/PRIVACY.md).

### Security audit & regression guards

The codebase is protected by **52 active named regression guards** (`VERIFY-001`..`VERIFY-032` + `VERIFY-034`..`VERIFY-052`; `VERIFY-033` is retired and reserved) that lock down security-, persistence-, accessibility-, performance-, and documentation-relevant surfaces. Each guard fails CI if a future change weakens the protection:

| ID | Locks | Test file |
|----|-------|-----------|
| `VERIFY-001` | Bridge bearer token never logged to console | `electron/services/bridgeServer.test.ts` |
| `VERIFY-002` | Constant-time token compare (timing-attack safe) | `electron/services/bridgeServer.test.ts` |
| `VERIFY-003` | Bridge aborts upstream on client disconnect | `electron/services/bridgeServer.test.ts` |
| `VERIFY-004` | Bridge JSON body cap (10 MiB) | `electron/services/bridgeServer.test.ts` |
| `VERIFY-005` | Chat-store flush-on-unload (`pagehide` + `beforeunload`) | `src/stores/chat-store.flush.test.ts` |
| `VERIFY-006` | `venice()` forwards `AbortSignal` to IPC | `src/lib/venice-client.test.ts` |
| `VERIFY-007` | Zero JSX inline `style={...}` (production CSP invariant) | `tests/csp/inlineStyleInvariant.test.ts` |
| `VERIFY-008` | `listConversations({ offset, limit })` server-side pagination | `electron/services/chatStorage.test.ts` |
| `VERIFY-009` | Dual Venice client surface contract | `src/lib/venice-client.dual.test.ts` |
| `VERIFY-010` | Zero out-of-allowlist inline colors (theme token invariant) | `tests/theme/inlineColorInvariant.test.ts` |
| `VERIFY-011` | Character-card storage invariants | `tests/storage/characterCardStorage.regression.test.ts` |
| `VERIFY-012` | RP chat storage invariants | `tests/storage/rpChatStorage.regression.test.ts` |
| `VERIFY-013` | Scene-generation safety + asset persistence | `tests/safety/sceneGeneration.regression.test.ts` |
| `VERIFY-014` | Character RP safety wrapper routing | `tests/safety/characterImportSafety.routing.test.ts` |
| `VERIFY-015` | Guarded IPC pipeline | `tests/safety/guardPipeline.test.ts` |
| `VERIFY-016` | Inspector non-mutating preview | `tests/safety/inspectorPreview.test.ts` |
| `VERIFY-017` | Renderer hydration gate | `tests/safety/hydrationGate.test.ts` |
| `VERIFY-018` | Provider `safe_mode` endpoint matrix | `tests/safety/veniceSafeMode.test.ts` |
| `VERIFY-019` | Electron Jina/scrape response-body screening | `electron/ipc/handlers.test.ts` |
| `VERIFY-020` | Media Studio persistence | `src/components/image/image-tools.test.tsx` |
| `VERIFY-021` | Chat-store dirty-map persistence (active + non-active saves) | `src/stores/chat-store.dirty.test.ts` |
| `VERIFY-022` | Canonical tab registry + legacy aliases | `src/config/tabs.test.ts` |
| `VERIFY-023` | `window.__veniceMediaDev` is dev-only | `src/components/gallery/gallery-view.test.tsx` |
| `VERIFY-024` | Config-key import does not report redaction before the atomic YAML rewrite completes | `electron/services/configService.test.ts` |
| `VERIFY-025` | RP chat creation appears in UI state only after persistence succeeds | `src/stores/rp-chat-store.test.ts` |
| `VERIFY-026` | Modal focus trap, initial focus, Escape close, and trigger restoration | `src/hooks/useFocusTrap.test.tsx` |
| `VERIFY-027` | Deferred, pre-indexed full-content conversation search | `src/components/layout/sidebar.test.tsx` |
| `VERIFY-028` | Timestamp-indexed, paginated encrypted Media Studio reads | `src/services/storageService.test.ts`, `src/stores/media-store.test.ts` |
| `VERIFY-029` | Local Markdown targets and heading fragments resolve | `scripts/verify-markdown-links.test.ts` |
| `VERIFY-030` | `server.ts` accepts `/characters` and `/characters/{slug}` via the canonical `isAllowedVeniceRequest` predicate; nested paths return 403, non-GET returns 405 | `server.test.ts` |
| `VERIFY-031` | `veniceBlob` and `veniceFormData` forward `AbortSignal` to the IPC layer (extension of `VERIFY-006`) | `src/lib/venice-client.test.ts` |
| `VERIFY-032` | `useMediaStore.loadById(id)` fetches, migrates, and merges a single record from IDB so the gallery inspector resolves lineage across pages | `src/stores/media-store.test.ts` |
| `VERIFY-033` | (Retired) — original guard covered the deprecated MiniMax forward-compat scaffold (`LlmProvider` / `PROVIDER_CAPABILITIES` / `capabilitiesFor()`); the scaffold was removed wholesale in the 2026-06-06 "Venice + Jina only" scope correction. The numeric slot is reserved to keep the regression-guard sequence stable. | — |
| `VERIFY-034` | `verify:markdown-links` honours the root `.gitignore` (skips the scan root AND in-doc link targets matched by a gitignore pattern); the regression guard for the 2026-06-06 CI failure where local-only gitignored `docs/AGENTS/*` files were reported as broken | `scripts/verify-markdown-links.test.ts` |
| `VERIFY-035` | Media Studio dangling-reference recovery — the gallery inspector surfaces a one-click "Missing references" section with "Clear parent link" / "Clear N missing refs" buttons that prune stale lineage pointers in a single IDB write | `src/components/gallery/gallery-view.test.tsx` |
| `VERIFY-036` | Packaged Electron startup keeps `dist/index.html` beside its relative assets and uses a compatible self-hosted-script CSP | `tests/electron/productionStartupInvariant.test.ts` |
| `VERIFY-037` | OS-secure configured state enables Venice UI actions without copying the persisted key into renderer memory | `src/stores/auth-store.test.ts` |
| `VERIFY-038` | Web-mode Jina keys remain ephemeral and never enter browser-persistent storage | `src/services/desktopBridge.test.ts` |
| `VERIFY-039` | Web and Electron Jina proxy boundaries cancel and reject response bodies above 2 MiB before parsing/screening | `server.test.ts`, `electron/ipc/handlers.test.ts` |
| `VERIFY-040` | Production Media Studio handoffs, derivative lineage, image-tools source routing, and aspect-resolution payload exclusivity | `src/components/image/image-view.test.tsx`, `src/components/gallery/gallery-view.test.tsx`, `src/components/image/image-tools.test.tsx`, `src/stores/media-store.test.ts` |
| `VERIFY-041` | 29-role semantic theme contract, Forge Dracula WCAG AA pairs, complete runtime CSS variables, and full ThemeMaker YAML round-trip with legacy compatibility | `src/theme/contrast.test.ts`, `src/theme/applyTheme.test.ts`, `src/components/ThemeMaker.test.ts`, `src/config/configSchema.test.ts` |
| `VERIFY-042` | Phase 1 workspace contracts: nullable All Projects mode, validated project lifecycle and reference-safe delete, GenerationRecipe normalization/sanitization/handoff, explicit generated-media project tagging, exact gallery filtering, and mounted Command Palette behavior | `src/types/project.test.ts`, `src/stores/project-store.test.ts`, `src/stores/chat-store.character.test.ts`, `src/stores/media-store.test.ts`, `src/components/layout/sidebar.test.tsx`, `src/components/command-palette/CommandPalette.test.tsx`, `src/components/gallery/gallery-view.test.tsx`, `src/components/image/image-view.test.tsx` |
| `VERIFY-043` | Phase 2A model-aware recipes: capability helpers + `getRecipeCompatibilityReport` return `compatible`/`partial`/`incompatible`; `buildImagePayload` honours per-capability `supports*` flags end-to-end; image-view hides negative/seed/style/steps controls and surfaces a capability summary; media-inspector renders the `RecipeCompatibilityCard` with use-with-current-model/use-original/copy/export/compare actions; media-store `filterMedia` recognises `has-recipe`/`no-recipe`/`has-seed`; `verify:model-aware-recipes` audit passes | `src/config/image-model-capabilities.test.ts`, `src/types/project.test.ts`, `src/utils/payloadBuilders.modelAware.test.ts`, `src/components/image/image-view.test.tsx`, `src/components/gallery/recipe-compatibility-card.test.tsx`, `src/components/gallery/recipe-comparison.test.tsx`, `src/components/gallery/media-inspector.test.tsx`, `src/stores/media-store.test.ts`, `scripts/verify-model-aware-recipes.cjs` |
| `VERIFY-044` | Phase 2B Media Studio power tools: `media-selection-store` exposes `selectMedia`/`toggleMedia`/`selectRange`/`selectAllVisible`/`reconcileWithVisible`/`setVisibleMediaIds` with `MEDIA_SELECTION_MAX=4`; `media-bulk-actions` reports per-id `BulkMediaActionResult` for favorite/tag/project assignment/delete with confirm gate; `compare-view` renders 2-4 item side-by-side diff and rejects out-of-range input; `lineage-viewer` walks parent/children with cycle + missing-parent detection; `media-send-to` routes Image Studio/Image Tools/Chat/Video through the canonical stores with no payload secrets; `media-export-bundle` strips api keys/tokens/path tokens/blobs and validates re-import; media-store adds `no-seed`/`no-project` filters and `project`/`has-recipe`/`has-seed` sorts; the Command Palette renders the selection-aware Media section (8 commands) only when the gallery-view has registered handlers; `verify:media-studio-power-tools` audit passes | `src/stores/media-selection-store.test.ts`, `src/stores/media-bulk-actions.test.ts`, `src/stores/media-send-to.test.ts`, `src/stores/media-export-bundle.test.ts`, `src/components/gallery/compare-view.test.tsx`, `src/components/gallery/lineage-viewer.test.tsx`, `src/components/command-palette/CommandPalette.test.tsx`, `src/stores/media-store.test.ts`, `scripts/verify-media-studio-power-tools.cjs` |
| `VERIFY-046` | Phase 2D Prompt Library Foundation: `src/types/prompt-library.ts` exports `PromptKind` (exhaustive union), `PromptScope`, `PromptVersion`, `PromptLibraryItem`, `PromptLibraryExport`, `sanitizePromptLibraryItem`, `sanitizePromptVersion`, `exportPromptLibraryItems`, `parsePromptLibraryImport`, `isPromptSecretLike`, `redactPromptSecrets`; the `promptLibrary` store is added to `STORE_NAMES`, `ENCRYPTED_STORES`, and `dbMigrations` (toVersion 8) without deleting any prior data; `src/stores/prompt-library-store.ts` exposes the canonical `ensureLoaded`/`createPrompt`/`updatePrompt`/`addPromptVersion`/`setCurrentVersion`/`archivePrompt`/`deletePrompt`/`toggleFavorite`/`importPrompts`/`exportPrompts` actions; `src/components/prompts/PromptLibraryView.tsx` is mounted in `App.tsx` for the canonical `prompts` tab; the Image Studio and Media Inspector expose "Save to Prompt Library" actions on the prompt/negative prompt/recipe fields; the Command Palette renders the Prompt Library section (Open / New / Use / Export / Import) routed through the canonical tab registry; the export envelope (`{ version: 1, app, exportedAt, prompts: [] }`) skips records with secret-like content, the import path regenerates ids and rejects future versions, and the secret-leak heuristic blocks `sk-…` / `venice_…` / `Bearer …` / `Authorization:` payloads before they ever reach storage | `src/types/prompt-library.test.ts`, `src/stores/prompt-library-store.test.ts`, `src/components/prompts/PromptLibraryView.test.tsx`, `scripts/verify-prompt-library.cjs` |
| `VERIFY-047` | **Phase 2E Scene Composer Foundation:** canonical `SceneComponentKind` union, append-only `SceneVersion` chain, `scenes` store added to `STORE_NAMES` / `ENCRYPTED_STORES` / `dbMigrations` toVersion 9, `scene-composer-store` exposes `createScene` / `addSceneVersion` / `setCurrentVersion` / `archiveScene` / `importScenes` / `exportScenes`, `compileSceneToRecipe` combines components in canonical order, `SceneComposerView` mounted in `App.tsx`, sidebar registers a `SceneIcon`, and the Command Palette exposes a Scene Composer section. `verify:scene-composer` audit passes | `src/types/scene.test.ts`, `src/stores/scene-composer-store.test.ts`, `src/services/sceneCompiler.test.ts`, `src/components/scenes/SceneComposerView.test.tsx`, `scripts/verify-scene-composer.cjs` |
| `VERIFY-048` | **Phase 2F RP Studio Polish:** canonical `CharacterCardV1` / `LorebookV1` / `PersonaV1` / `ScenarioV1` models with secret-redaction helpers, `rpScenarios` store added at `dbMigrations` toVersion 10, `scenario-store` exposes the canonical CRUD + import / export actions, `compileRpPromptStack` builds a guard-aware RP prompt from persona / character / scenario / lorebook, `CharacterEditor` adds a Workflow section, and the Command Palette renders an RP Studio section. `verify:rp-studio-polish` audit passes | `src/stores/scenario-store.test.ts`, `src/stores/character-card-store.test.ts`, `src/services/characterCardImportExport.test.ts`, `src/services/rpPromptCompiler.test.ts`, `src/components/rp-studio/CharacterEditor.test.tsx`, `src/components/command-palette/CommandPalette.test.tsx`, `scripts/verify-rp-studio-polish.cjs` |
| `VERIFY-049` | **Phase 2G Workflow Templates:** canonical `WorkflowTemplateItem` / `WorkflowVersion` / `WorkflowStep` models, `workflowTemplates` store added at `dbMigrations` toVersion 11, `workflow-template-store` exposes `createWorkflow` / `addStep` / `reorderSteps` / `importWorkflows` / `exportWorkflows`, `compileWorkflowTemplate` produces a `WorkflowCompileResult` with aggregate warnings, `createWorkflowRunPlan` converts a compiled workflow into executable UI actions, `WorkflowTemplatesView` is mounted in `App.tsx`, and `PromptLibraryView` / `SceneComposerView` / `CharacterEditor` integrate "Create Workflow" actions. `verify:workflow-templates` audit passes | `src/types/workflow.test.ts`, `src/stores/workflow-template-store.test.ts`, `src/services/workflowCompiler.test.ts`, `src/services/workflowRunner.test.ts`, `src/components/workflows/WorkflowTemplatesView.test.tsx`, `scripts/verify-workflow-templates.cjs` |
| `VERIFY-050` | **Phase 2H Storage / Privacy Dashboard Hardening:** `StorageStoreInventoryItem` / `SafePrivacySummary` / `StorageMaintenancePlan` models, `storagePrivacyService` builds the cross-store inventory and safe privacy summary, `storageMaintenance` provides non-destructive maintenance actions with a dry-run orphans analysis, `storage-privacy-store` orchestrates the dashboard, `StoragePrivacyDashboard` is mounted in `App.tsx` for the `privacy` tab, the Command Palette integrates Phase 2H actions, the `SafeDiagnosticsSnapshot` is extended with privacy exclusions and store counts, and `verify:storage-privacy` audit passes | `src/types/storage-privacy.test.ts`, `src/services/storagePrivacyService.test.ts`, `src/services/storageMaintenance.test.ts`, `src/stores/storage-privacy-store.test.ts`, `src/components/privacy/StoragePrivacyDashboard.test.tsx`, `scripts/verify-storage-privacy.cjs` |
| `VERIFY-051` | **Phase 2I Research Workspace Polish:** `ResearchSession` / `ResearchSource` / `ResearchFinding` / `ResearchCitation` models with safe sanitization, `researchSessions` store added at `dbMigrations` toVersion 12, `research-store` provides persistent CRUD with project scoping and safe import / export, `researchService` wraps existing providers with URL safety, `researchSummaries` builds citation-preserving summaries, `ResearchWorkspaceView` is mounted under the canonical `search` tab via the `SearchScrapeView` wrapper, the Command Palette integrates research actions, and the `SafeDiagnosticsSnapshot` is extended with research session counts. `verify:research-workspace` audit passes | `src/types/research.test.ts`, `src/stores/research-store.test.ts`, `src/services/researchService.test.ts`, `src/services/researchSummaries.test.ts`, `src/components/research/ResearchWorkspaceView.test.tsx`, `scripts/verify-research-workspace.cjs` |
| `VERIFY-052` | **Phase 2J Release / Packaging Hardening:** `scripts/verify-release-packaging-hardening.cjs` is the single-source-of-truth audit that asserts canonical `package.json` scripts, `ci` chain includes the gate, `engines.node` pins Node 22, both `.github/workflows/{ci,release}.yml` pin Node 22 + run `verify:dist` + `checksum:release` + `npm run typecheck` + `npm test` + `npm run build` before packaging, `electron-builder.config.cjs` declares `appId`/`directories`/`asar: true` and excludes `.map` source maps, release + signing + building + platform-support + troubleshooting docs are present, `.gitignore` excludes the canonical contaminants, no forbidden archive paths are tracked in git (delegates to `scripts/verify-archive-clean.cjs` `BAD_PATTERNS`), and `build/icon.{ico,icns,png}` are tracked. `verify-dist.cjs` extended with `FORBIDDEN_DIST_PATTERNS` (source maps / test files / `.env` / `.config/*.local.yaml` / `*.db` / `chat-history/` / `.design-captures/` / `.integration-src/`) and `SECRET_PATTERNS` (tight regex for `venice_<40+ alnum>` / `sk-<20+ alnum>` / `Bearer <20+ chars>` that does not match internal constants like `venice_forge_traffic_logs_v1`). `verify-archive-clean.cjs` extended with Windows metadata (`Thumbs.db`, `desktop.ini`), `*.log`, `*.tmp`, `target_inventory.txt`, and explicit `.config/*.local.yaml` exclusion | `scripts/verify-release-packaging-hardening.test.ts`, `scripts/verify-archive-clean.test.ts`, `scripts/verify-dist.test.ts` |

The 2026-06-05 full-repo audit produced these fixes; see [docs/AUDIT_FOLLOWUP_2026_06_05.md](docs/AUDIT_FOLLOWUP_2026_06_05.md) for the full audit report (P0/P1/P2 status, commits, and follow-up items). The 2026-06-06 round-2 audit and 8 named bugs (BUG-001..BUG-006, BUG-008, BUG-009; BUG-007 was originally a MiniMax streaming parser and was retired on 2026-06-06 when the user corrected scope to Venice + Jina only) are documented in [docs/POST_VENICE_JINA_AUDIT_2026_06_06.md](docs/POST_VENICE_JINA_AUDIT_2026_06_06.md). The 2026-06-08 final proof audit (1905/1905 tests, all `verify:*` audits pass, **PASS verdict — safe to release v1.0.6**) is documented in [docs/REPORTS/FINAL_MASSIVE_BUG_HUNT_WITH_PROOF.md](docs/REPORTS/FINAL_MASSIVE_BUG_HUNT_WITH_PROOF.md); the 2026-06-08 documentation canonicalization pass (SUPERSEDED banner on the older BUG_HUNT_REVIEW, README guard count + version sync, expanded `VERIFY-047..051` rows) is documented in [docs/REPORTS/DOCS_CANONICALIZATION_AND_STALE_PRUNE.md](docs/REPORTS/DOCS_CANONICALIZATION_AND_STALE_PRUNE.md). Outstanding P2/P3 work is tracked in the *Open TODO Ledger* of [docs/summary_of_work.md](docs/summary_of_work.md).

---

## 🎨 Theming

Venice Forge includes a full token-based theme system:

- **4 built-in palettes:** Forge Graphite, Forge Daylight, Forge Copper, Forge Dracula
- **Live theme editor:** Open **Config** → **Appearance** → **Theme Maker** to customize in real time
- **Persistent storage:** Custom themes are saved to encrypted IndexedDB and persist across sessions

See [docs/THEME_SYSTEM.md](docs/THEME_SYSTEM.md) for complete theming guide and token reference.

---

## ❓ Troubleshooting

| Symptom | Solution |
|---------|----------|
| **Missing icon** | `npm run generate:icon && npm run verify:icon` |
| **Packaging fails** | `npm run clean && npm install && npm run build && npm run dist:win` |
| **SmartScreen/Gatekeeper warning** | Expected for unsigned local builds; sign before release |
| **No API key prompt** | Manually open **Config**, save a key, test connection |
| **Chat history not loading** | Check chat-history folder (see Storage section); corrupted files are backed up as `.backup-{timestamp}` |
| **`400` on chat/image requests** | Verify model ID is valid and all parameters are correct strings |
| **`401` / `403` errors** | Check that your API key is valid and has proper scope |
| **`429` rate limit** | Wait for reset period (shown in **Status**) |
| **Transport/connection failure** | Open **Status**, copy debug info, check logs folder |

For more help, see [docs/DEVELOPMENT/troubleshooting.md](docs/DEVELOPMENT/troubleshooting.md) or open an issue.

---

## 📚 Documentation

All documentation is in the [docs](docs/) directory. Quick index:

### Getting Started
- **[docs/ABOUT.md](docs/ABOUT.md)** — Architecture overview, dual-mode design, security model
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — How to contribute and code standards
- **[docs/FAQ.md](docs/FAQ.md)** — Frequently asked questions

### Development
- **[docs/DEVELOPMENT/building.md](docs/DEVELOPMENT/building.md)** — Build system, Vite, Electron, esbuild
- **[docs/DEVELOPMENT/platform-support.md](docs/DEVELOPMENT/platform-support.md)** — Platform requirements and support matrix
- **[docs/DEVELOPMENT/troubleshooting.md](docs/DEVELOPMENT/troubleshooting.md)** — Common dev issues
- **[docs/DEVELOPMENT/macos.md](docs/DEVELOPMENT/macos.md)** — macOS-specific notes

### Release & Deployment
- **[docs/RELEASE/release.md](docs/RELEASE/release.md)** — Release process and checklist
- **[docs/RELEASE/signing-and-notarization.md](docs/RELEASE/signing-and-notarization.md)** — Code signing for Windows/macOS
- **[CHANGELOG.md](CHANGELOG.md)** — Version history and breaking changes

### Reference
- **[docs/THEME_SYSTEM.md](docs/THEME_SYSTEM.md)** — Token-based theming architecture
- **[docs/REPOSITORY_TREE.md](docs/REPOSITORY_TREE.md)** — Full repository structure and ownership
- **[docs/RESEARCH_PROVIDERS.md](docs/RESEARCH_PROVIDERS.md)** — Web research provider guide
- **[docs/JINA_PROVIDER.md](docs/JINA_PROVIDER.md)** — Jina AI configuration and limits
- **[docs/PUBLIC_PROFILE_DISCOVERY.md](docs/PUBLIC_PROFILE_DISCOVERY.md)** — Public profile discovery feature
- **[docs/summary_of_work.md](docs/summary_of_work.md)** — Canonical AI/dev-agent session handoff ledger (read + updated by every session)

### Legal & Governance
- **[SECURITY.md](SECURITY.md)** — Security policy and vulnerability disclosure
- **[docs/LEGAL.md](docs/LEGAL.md)** — Legal terms, disclaimers, and TOS
- **[docs/legal/PRIVACY.md](docs/legal/PRIVACY.md)** — Privacy policy and data handling
- **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)** — Community standards
- **[docs/SUPPORT.md](docs/SUPPORT.md)** — Support channels and issue routing

---

## ⚖️ Legal & Trademark

**Venice Forge** is an unofficial, independent, third-party client for the Venice API and is **not affiliated with, endorsed by, or maintained by Venice.ai, Inc.**

- Venice names and marks are used solely for nominative identification of API compatibility
- Official Venice brand assets remain the property of Venice.ai, Inc.
- This project's MIT License covers only the original code and documentation herein
- It does **not** grant rights to Venice.ai trademarks, brand assets, API terms, or third-party materials

**Before using Venice Forge:**
- Review [Venice Terms of Service](https://venice.ai/legal/tos)
- Review [Venice Privacy Information](https://venice.ai/privacy)
- Review [Venice API Documentation](https://docs.venice.ai)

**Full legal terms** are in [docs/LEGAL.md](docs/LEGAL.md).

---

## ⚠️ Reporting Safety Issues & CSAM

If you encounter unsafe content, safety guard bypasses, or AI-generated material that inappropriately represents minors (CSAM):

1. **NCMEC CyberTipline** (for child exploitation): [report.cybertip.org](https://report.cybertip.org/)
2. **Venice.ai Trust & Safety**: [venice.ai/support](https://venice.ai/support)
3. **Venice Forge Maintainers** (for app vulnerabilities): Use GitHub private vulnerability reporting in this repo

---

## 📈 Known Limitations

- **Auto-updates** are fetched securely via GitHub Releases
- **Release signing** is optional for local builds
- **IndexedDB encryption** uses a browser-managed AES-GCM key (reduces casual inspection risk but does not protect against malware, XSS, browser compromise, or same-user OS malware)
- **Malware within the OS user scope** is out of scope (may access process memory)
- **Linux packaging** is produced by the release workflow (AppImage/deb/rpm for x64+arm64). Local cross-build from macOS/Windows is not supported; use the CI artifacts or build on a Linux runner.

---

## 🤝 Contributing

We welcome contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) first.

This project is actively maintained. For issues, feature requests, or security reports:
- **Issues:** [GitHub Issues](https://github.com/spearchucker667/Venice-API-connector/issues)
- **Security:** Use [GitHub private vulnerability reporting](https://github.com/spearchucker667/Venice-API-connector/security/advisories)
- **Support:** [docs/SUPPORT.md](docs/SUPPORT.md)

---

## 📋 Project Status

| Aspect | Status |
|--------|--------|
| Current Version | v1.0.6 ([Releases](https://github.com/spearchucker667/Venice-API-connector/releases)) |
| Maintenance | Actively maintained |
| Windows Support | ✅ Fully supported |
| macOS Support | ✅ Fully supported (Intel + Apple Silicon) |
| Linux Support | ✅ Supported via CI (AppImage + deb + rpm, x64 + arm64) — see release assets |
| Node.js | v20, v22 |
| TypeScript | Strict mode enforced |
| Family Safe Mode | ✅ On by default; toggleable to Adult Mode |
| Test Suite | Full Vitest suite plus 52 active named regression guards |
| License | [MIT](LICENSE) |

Latest changes: See [CHANGELOG.md](CHANGELOG.md)

---

## 🎯 Roadmap & TODO

Active development tracked in [docs/TODO.md](docs/TODO.md). Current focus:

- Fixing remaining security and robustness issues
- Expanding test coverage
- Improving documentation and UX polish
- Community contributions

See [docs/TODO.md](docs/TODO.md) for the full list of open and completed items.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

**Exception:** Venice Forge does not grant rights to Venice.ai trademarks, logos, or brand assets. For Venice brand guidelines, see [venice.ai/brand](https://venice.ai/brand).

---

## 🙏 Acknowledgments & Credits

We would like to formally credit the [openvenice](https://github.com/spearchucker667/openvenice) repository and its creator, **[nikshepsvn](https://github.com/nikshepsvn)**, for the inspiring UI enhancements, workflows, and conceptual ideas that helped guide the extension of this application. While Venice Forge continues to run on our custom codebase and integration engine rather than a direct port, their layout enhancements, studios configuration, and workflows logic provided invaluable direction and inspiration.

Built with:
- [React 19](https://react.dev/)
- [Electron 42](https://www.electronjs.org/)
- [Vite 6](https://vitejs.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)

Powered by [Venice API](https://docs.venice.ai/).

---

## 📞 Quick Links

- **Official releases:** [GitHub Releases](https://github.com/spearchucker667/Venice-API-connector/releases)
- **Issues & discussions:** [GitHub Issues](https://github.com/spearchucker667/Venice-API-connector/issues)
- **CI/CD status:** [GitHub Actions](https://github.com/spearchucker667/Venice-API-connector/actions)
- **Venice.ai:** [venice.ai](https://venice.ai) | [Docs](https://docs.venice.ai) | [API](https://api.venice.ai)

---

**Not affiliated with Venice.ai, Inc.**
