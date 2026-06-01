# Venice Forge — Copilot Instructions

## Project Overview

Venice Forge is a **dual-platform (Windows + macOS) Electron desktop app** (also runnable as a Vite/Express web app) for the [Venice API](https://venice.ai). It provides chat, image generation, batch prompting, web research, model discovery, and a local image gallery — all privacy-focused with no telemetry.

Stack: React 19 + TypeScript strict + Tailwind CSS v4 (Premium Dark Glass Theme) + Vite 6 (renderer), Electron 42 (desktop), Express 4 (web proxy), Vitest 4 (tests), tsc (Electron main build), esbuild (Express server bundle).

---

## Commands

```bash
npm run dev:electron    # Electron desktop (recommended for full dev)
npm run dev:web         # Web mode only (Vite + Express)
npm run typecheck       # Type-check renderer AND Electron main (both tsconfigs)
npm run lint            # Runs ESLint + TypeScript type-check
npm run lint:eslint     # ESLint for src/, electron/, server.ts, and scripts/
npm test                # Vitest unit + integration tests (single run)
npm run test:watch      # Vitest in watch mode
npx vitest run src/services/veniceClient.test.ts   # Run a single test file
npx vitest run server.test.ts -t "should block disallowed endpoints"  # Run one test case
npm run test:coverage   # Vitest with coverage report
npm run build           # Full build: web (dist/) + Electron main (dist-electron/)
npm run build:web       # Renderer build only
npm run build:server    # Express server bundle only
npm run build:electron  # Electron main/preload build only
npm run ci              # CI parity: npm ci + lint:eslint + typecheck + test + verify:safety-guard + build
npm run clean           # Remove dist/, dist-electron/, release/
npm run dist:win        # Build Windows NSIS + portable installers
npm run dist:mac        # Build macOS DMG + ZIP archives
npm run verify:safety-guard  # Mandatory safety guard compliance check (also runs in CI)
npm run smoke:electron  # Electron smoke tests in tests/smoke/
```

Before opening a PR: `npm run lint:eslint`, `npm run typecheck`, `npm test`, `npm run verify:safety-guard`, and `npm run build`.

---

## Architecture

### Two transports, one renderer

The renderer (`src/`) runs identically in both modes. Transport is selected at runtime by `isElectron()` in `src/services/desktopBridge.ts`:

- **Electron mode**: renderer calls `window.veniceForge.*` (the contextBridge API exposed by `electron/preload.ts`), which invokes IPC channels handled in `electron/ipc/handlers.ts`. The main process holds API keys (Venice + optional Jina) in `safeStorage` and makes HTTPS calls directly to `api.venice.ai` (and optionally to Jina endpoints).
- **Web mode**: renderer calls `fetch('/api/venice/...')`, proxied by the Express server in `server.ts` to `api.venice.ai`. The server injects `Authorization` from `VENICE_API_KEY` in `.env`; browser Settings cannot save or forward an API key.

All Venice API requests go through `src/services/veniceClient.ts` — `veniceFetch()` for non-streaming and `veniceStreamChat()` for chat streams. Both paths include up to 3 retries with exponential back-off for 429/500/503 responses.

### State management

Single global `useReducer` in `App.tsx` using `appReducer` from `src/state/appReducer.ts`. State is mutated with **Immer** (`produce`). All action types are defined in `src/types/app.ts` as a discriminated union (`AppAction`). Every module receives `{ state, dispatch }` props.

### Storage

- **IndexedDB** (`src/services/storageService.ts`): `images`, `chats`, `settings`, `diagnostics`, `conversations`. Encrypted-at-rest stores are `images`, `chats`, `settings`, and `conversations` via `src/services/cryptoService.ts` (AES-GCM).
- **Electron `safeStorage`** (`electron/services/secureStore.ts`): Venice and Jina API keys — encrypted by the OS keychain, never in plaintext.
- **Exports**: versioned JSON with `{ version, exportedAt, appVersion, data }`. Import merges by ID, never clears; strips secret-like fields; validates schema and size.

### IPC surface (Electron)

The renderer can only call the channels declared in `electron/preload.ts` via `window.veniceForge`. The allowed Venice endpoints and HTTP methods are enforced in both `src/shared/validation.ts` (web proxy) and `electron/ipc/validation.ts` (IPC handler). In **Electron mode**, the renderer cannot choose arbitrary Venice endpoints or read the raw API key (it lives in `safeStorage` in the main process).

### Allowed Venice endpoints

```
GET  /models
POST /chat/completions
POST /image/generate
POST /image/upscale
POST /augment/search
POST /augment/scrape
POST /augment/text-parser
```

### Research Subsystem

The `src/research/` directory contains a pluggable provider system for search, scrape, and public-profile discovery:

- **Providers**: `veniceResearchProvider.ts` (Venice `/augment/*`), `jinaResearchProvider.ts` (`r.jina.ai` / `s.jina.ai`), `genericHttpScrapeProvider.ts` (SSRF-safe fallback, disabled by default)
- **Agent**: `researchRunner.ts` enforces budgets (`maxQueries`, `maxPages`, `totalJobTimeoutMs`); `researchSynthesis.ts` builds evidence-only prompts; `socialDiscovery.ts` generates platform-specific `site:` queries for public-profile discovery
- **Key rule**: The renderer never sees raw API keys. Jina keys are stored via `safeStorage` alongside Venice keys.

### Theme System

`src/theme/` provides a token-based theme system with three built-in palettes (Forge Graphite, Forge Daylight, Forge Copper) and a live ThemeMaker UI. Themes persist to encrypted IndexedDB. See `docs/THEME_SYSTEM.md` for full token reference.

### Auto-Updates
Auto-updates are fetched via GitHub Releases. The `electron/ipc/updates.ts` module securely exposes `checkForUpdates`, `downloadUpdate`, and `installUpdate` to the renderer while keeping download logic in the sandboxed main process.

### Content Safety Guard

Every outgoing Venice API request is screened by `assessChildExploitationSafety()` from `src/shared/safety/` **before** the payload leaves the app. This runs at every enforcement boundary:

- **Electron IPC** (`electron/ipc/handlers.ts`): assessed before the main-process Venice client makes the HTTPS call.
- **Express proxy** (`server.ts`): assessed before `http-proxy-middleware` forwards the request.
- **UI modules**: prompt-sending modules (`ChatModule`, `ImageModule`, `BatchModule`, `SearchScrapeModule`) call the guard and surface advisory UI when the decision is `warn`.

The public entry point is:

```ts
import { assessChildExploitationSafety, recordDecision } from "src/shared/safety";
const decision = assessChildExploitationSafety({ endpoint, payload, text? });
// decision.allow === false → block or warn
recordDecision(decision); // updates in-memory audit counters
```

`SafetyGuardDecision` never contains raw prompt text — only `promptHash` (coarse djb2, audit use only), `action`, `severity`, `category`, and `reasonCode`.

**`electron/utils/urlSecurity.ts`** provides `isTrustedExternalUrl(url)` for `shell.openExternal` — allows `https:` only and additionally blocks RFC 1918 addresses (10.x, 192.168.x, 172.16–31.x), loopback (127.x, `localhost`, `0.0.0.0`), and `::1`. Pure hostname string check — no DNS.

---

## Key Conventions

### Dual-mode guards

Any code that differs between Electron and web **must** use `isElectron()` from `src/services/desktopBridge.ts`. The `desktopBridge` module re-exports all Electron-only APIs with safe no-op fallbacks for web mode — use these rather than calling `window.veniceForge` directly.

### `veniceFetch` is the only API entry point

All Venice HTTP calls go through `veniceFetch()` or `veniceStreamChat()` in `src/services/veniceClient.ts`. Do not `fetch('/api/venice/...')` directly, and never call `window.veniceForge.venice` directly from modules.

### Action dispatch carries diagnostics

Every `veniceFetch`/`veniceStreamChat` call accepts a `dispatch` parameter. Passing the app `dispatch` causes the function to emit `SET_DIAGNOSTICS` actions automatically, updating the Status tab. Always pass `dispatch` when calling from a module.

### Module structure

Each tab is a self-contained module file in `src/modules/`. Modules receive `{ state: AppState, dispatch: AppDispatch }` props. Shared UI primitives (buttons, chips, fields) live in `src/components/`.

### Type files

- `src/types/app.ts` — `AppState`, `AppAction`, `AppDispatch`, `ToastMessage`, drafts
- `src/types/venice.ts` — `ModelInfo`, `DiagnosticsEntry`, Venice API shapes
- `src/types/storage.ts` — `GalleryImage` and other IndexedDB record types
- `src/types/desktop.ts` — `window.veniceForge` type augmentation

### Electron build pipeline

`electron/` is compiled separately via `tsconfig.electron.json` (CommonJS output to `dist-electron/`) using `tsc`. The Express server is bundled via esbuild (`server.ts` → `dist/server.cjs`). Run `npm run build:electron` after any change to `electron/`. The renderer builds via Vite with `ELECTRON_BUILD=true` to set `base: "./"` for relative asset paths.

### Security constraints

- Never expose the API key to the renderer — it lives in `electron/services/secureStore.ts` (main process) or the Express server env.
- Do not add new IPC channels without adding them to `electron/preload.ts` and `electron/ipc/handlers.ts`, and validating inputs in `electron/ipc/validation.ts`.
- Do not add new Venice endpoints without updating `src/shared/validation.ts`.
- CSP is strict in production — no inline scripts, no external `connect-src`.
- macOS requires `build/icon.icns` for packaging. Never weaken `safeStorage` — macOS Keychain and Windows DPAPI parity is required. Plaintext storage is completely disabled for Windows and macOS.
- Every new prompt-sending path **must** call `assessChildExploitationSafety()` before forwarding to Venice. Never bypass the guard. Do not log raw prompt text anywhere in the codebase.
- The `FUZZY_ALLOWLIST ∩ CSAM_GENRE_LABELS = ∅` invariant is enforced at module load — adding a term from `CSAM_GENRE_LABELS` to `FUZZY_ALLOWLIST` will throw at startup.
- Safety tests must use synthetic/redacted fixtures only — never include actual genre labels or explicit strings as test data.

---

## Image Workflow

Image data from the Venice API arrives in several shapes. **Always use `extractImages(payload)`** from `src/utils/image.ts` to normalise the response — it handles `{ data: [{ b64_json }] }`, `{ images: [] }`, bare base64 strings, and URL strings, and deduplicates results.

`GalleryImage` records (defined in `src/types/storage.ts`) are saved via `saveImageRecord()` in `src/services/imageWorkflowService.ts`, which calls `StorageService.saveItem("images", ...)` and then dispatches `SET_GALLERY` to refresh state. Pass `skipRefresh: true` when saving multiple images in a loop, then call `refreshGallery(dispatch)` once at the end.

Upscaled images are linked to their source via `parentId` on the `GalleryImage` record. The upscale model field defaults to `"upscale-model"`; pass the actual model string in `UpscaleOptions`.

Bulk gallery download is capped at 50 images with a 300 ms inter-item delay to avoid freezing the UI. Filenames are built via `galleryFilename(item)` — sanitises model/id to `[a-z0-9_-]` and produces `<model>-<id>.png`.

---

## Export / Import

Export format is versioned: `{ version: 1, exportedAt, appVersion, data: { images, chats, settings, conversations } }`. The current version constant is `EXPORT_SCHEMA_VERSION` in `src/services/exportImport.ts`.

**Key rules enforced by `validateImportJson` and `createExportPayload`:**

- Max payload: 25 MB (`MAX_IMPORT_JSON_BYTES`)
- Only `images`, `chats`, `settings`, and `conversations` stores are allowed — unknown stores cause a hard rejection
- Every record must have a valid `id` (string) and `timestamp` (number); missing values are auto-generated
- Store-specific shape requirements: `images` must have `image` (string); `chats` must have `prompt` or `response`; `settings` must have a plain-object `value`; `conversations` must include `title` (string), `messages` (array), and `model` (string)
- Import **merges by ID** — it never clears existing IndexedDB data
- **API keys are never exported or imported** — both `createExportPayload` and `validateImportJson` run `redactSecrets()` (from `src/services/redaction.ts`) and strip any key whose name matches `/api[-_ ]?key|authorization|password|secret|token/i`

`redactSecrets()` also scrubs Bearer tokens and Venice key patterns (`vn-...`) from string values recursively — use it whenever logging or surfacing user-supplied content.

---

## Testing

### Test environment and tooling

- Framework: **Vitest 4** with `@testing-library/react` and `supertest`
- Default environment: `jsdom` (browser APIs available)
- Server-side tests must opt in with the file-level directive `// @vitest-environment node` (see `server.test.ts`)
- Run a single file: `npx vitest run <path>` (e.g. `npx vitest run src/services/exportImport.test.ts`)

### Test file locations

Tests live next to the source files they cover: `src/services/foo.ts` → `src/services/foo.test.ts`. The one exception is `server.test.ts` at the repo root (tests `server.ts`).

### Key patterns

**Mocking the proxy** — `server.test.ts` stubs `http-proxy-middleware` with `vi.mock(...)` before importing `server.ts` so tests can assert validation behaviour (403/405) without real network calls. Import the module under test _after_ `vi.mock` calls.

**Stubbing `window.veniceForge`** — `desktopBridge.test.ts` uses `vi.stubGlobal("window", {})` to simulate browser (non-Electron) mode and verify the no-op fallbacks. Use the same pattern for any code guarded by `isElectron()`.

**Pure-function tests** — most service tests (`exportImport`, `redaction`, `appReducer`, `image`) test pure functions directly with no mocking needed. Prefer this style: call the function, assert on the return value.

**Regression guards** — bugs that were fixed get a test with a `BUG-NNN` comment (e.g. `// BUG-002 regression guard`). Follow this convention when fixing a bug: add or annotate a test that would have caught it.

**Rate-limit state isolation** — `server.test.ts` creates a fresh `app` in `beforeEach` (not `beforeAll`) for rate-limit tests to prevent state from bleeding between test cases. Do the same for any test that depends on in-process mutable state.

---

## Chat Workspace Architecture

### Memory Service

`src/services/memoryService.ts` — persistent memory layer stored in encrypted IndexedDB (`ai_memory` store, AES-GCM).
- Schema: `{ id, content: string, createdAt, tags: string[], conversationId?: string }`
- API: `saveMemory()`, `listMemories()`, `deleteMemory()`, `searchMemory()`, `selectMemoriesForInjection()`
- Injection: up to 5 memories (conversation-tagged first, then by recency), capped at 2,000 chars total, injected as a `<memory>` system block via `buildChatPayload`

### Attachment System

`src/services/attachmentService.ts` — file/URL/image attachments:
- **Text files**: `.txt`, `.md`, `.ts`, `.tsx`, `.json`, `.py`, `.js`, etc. Capped at 256 KiB per file.
- **Images**: PNG/JPEG/WEBP, downscaled to ≤1024 px if over 2 MiB. Only passed to the API when `modelSupportsVision(modelId)` returns true.
- **URLs**: scraped via `veniceResearchProvider.scrape()`, injected as `<doc url="…">…</doc>`.
- `assembleAttachmentContext()` enforces 1 MiB total text budget + 5 attachment cap.

### Model Capability Detection

Venice API has no live vision flag. `modelSupportsVision(modelId)` checks `VISION_CAPABLE_MODEL_IDS` (allowlist) and `VISION_CAPABLE_PATTERNS` (`/vision/i`, `/-vl/i`, `/gemini-2\.[05]/i`). **Defaults to OFF** when capability is unknown.

### Fork / Import Schema

Conversation objects carry `parentConversationId?: string` and `forkedFromMessageIds?: string[]`. Imported messages display an `<imported_context from="Title">` label in UI (not sent to API).

---

## Environment Variables

Copy `.env.example` to `.env` for web-mode dev:

| Variable | Purpose |
|----------|---------|
| `VENICE_API_KEY` | Venice API key (required for web mode) |
| `PORT` | Express port (default: 3000) |
| `HOST` | Express bind host (default: 127.0.0.1) |
| `VENICE_API_HOST` | Upstream API host (default: api.venice.ai) |
| `VENICE_API_BASE_PATH` | Upstream base path (default: /api/v1) |
| `VENICE_API_TIMEOUT_MS` | Request timeout ms (default: 60000) |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window (default: 60000) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window (default: 60) |
| `MAX_PROXY_BODY_BYTES` | Max proxy body (default: 26214400) |
| `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE` | Plaintext key fallback (Linux/non-GNOME only — reduces security) |
| `VENICE_FORGE_DEBUG_DEVTOOLS` | Enable DevTools in packaged builds (debug only) |

---

## Data Storage Locations

| Data | Location |
|------|----------|
| API keys (desktop) | `safeStorage` → `%APPDATA%\Venice Forge\secure-prefs.json` (Win) / `~/Library/Application Support/Venice Forge/secure-prefs.json` (Mac) |
| Logs (desktop) | Same app data dir under `logs/venice-forge.log` |
| Conversations (desktop) | `chat-history/*.json` in app data dir (atomic writes, corruption recovery) |
| Images, chats, settings, conversations, diagnostics | Renderer IndexedDB (5 stores; `diagnostics` unencrypted, rest AES-GCM) |
| Memories | Renderer IndexedDB `ai_memory` (AES-GCM encrypted) |

---

## Files to Keep Current

When changing behavior, packaging, or storage, also update:
- `README.md`, `CHANGELOG.md`, `AGENTS.md`, `.github/copilot-instructions.md`
- `docs/ABOUT.md`, `SECURITY.md`, `docs/RELEASE/release.md`, `docs/LEGAL.md`
- `docs/RESEARCH_PROVIDERS.md`, `docs/JINA_PROVIDER.md`, `docs/PUBLIC_PROFILE_DISCOVERY.md` (research provider changes)
- `docs/THEME_SYSTEM.md` (theming/token changes)
