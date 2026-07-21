# Canonical path: /Users/super_user/Projects/Venice_Forge
# Historical path Windows-Venice-API-connector must not be used.

# Venice Forge — Copilot Instructions

## Canonical Repository

- Local path: `/Users/super_user/Projects/Venice_Forge`
- GitHub: `spearchucker667/Venice_Forge`
- Application: Venice Forge Electron desktop app
- Stack: Electron 42, React 19, TypeScript strict, Zustand, Vitest
- Node: `>=22.13.0 <23.0.0`

Do not use historical repository names such as
`Windows-Venice-API-connector`. Before editing,
run the local-only repository-root bootstrap check in `AGENTS.md`. Never put
that absolute-path assertion in CI.

```bash
EXPECTED_ROOT="/Users/super_user/Projects/Venice_Forge"
if [[ "$(pwd -P)" != "$EXPECTED_ROOT" ]]; then
  echo "Wrong repository root."
  echo "Expected: $EXPECTED_ROOT"
  echo "Actual:   $(pwd -P)"
  exit 1
fi
test -f package.json
test -f AGENTS.md
test -d src
test -d electron
```

## Project Overview

Venice Forge is a **dual-platform (Windows + macOS) Electron desktop app** (also runnable as a Vite/Express web app) for the [Venice API](https://venice.ai). It provides chat, image generation, media workflows, research, characters, RP Studio, prompts, scenes, workflows, projects, and local creative asset management — all privacy-focused with no telemetry.

Stack: React 19 + TypeScript strict + Tailwind CSS v4 (Premium Dark Glass Theme) + Vite 6 (renderer), Electron 42 (desktop), Express 4 (web proxy), Vitest 4 (tests), tsc (Electron main build), esbuild (Express server bundle).

---

## Quick Start (do these before any edit)

1. Run the bootstrap check below. It is local-only — never added to CI.
2. Read `AGENTS.md` first. It is the canonical source of truth for architecture, commands, security rules, and convention. Pointer files (`CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.windsurfrules`) link to it.
3. Read `docs/summary_of_work.md` — Latest Session Summary, Open TODO Ledger, and Validation Matrix.
4. Do **not** commit or push on your own. Wait for an explicit user instruction. Stay on `main` unless told otherwise.
5. End every session by updating `docs/summary_of_work.md` (see § Mandatory Session Handoff).

---

## Commands

### Node engine pin

`package.json` declares `engines.node` as `>=22.13.0 <23.0.0`. Brew's default on host machines is Node 26 which violates the pin and breaks `vitest`/`vite`. Prefix every shell command with `PATH="/opt/homebrew/opt/node@22/bin:$PATH"`, use `nvm use 22`, or run via a `.nvmrc`-aware shell. CI workflows pin `node-version: 22` in `.github/workflows/*.yml`.

### Validation order (required before PR)

> This block intentionally mirrors the validation block in `AGENTS.md`. `verify:agent-docs` (VERIFY-122) greps both files and asserts the captured chunk matches byte-for-byte across whitespace. Keep both in lock-step.

```bash
npm run lint:eslint          # ESLint — zero warnings enforced (--max-warnings=0)
npm run typecheck            # Renderer (tsconfig.json) + Electron main (tsconfig.electron.json)
npm test                     # Vitest, serial (--fileParallelism=false)
npm run verify:safety-guard  # Mandatory CI gate; see Security below
npm run verify:markdown-links # Local Markdown files + heading fragments
npm run verify:contracts     # Comprehensive suite of all 22+ sub-verifiers/contracts
npm run build                # dist/ + dist-electron/ + dist/server.cjs
npm run ci                   # Full parity including safety, markdown, contracts, and dist verification
```

### Run scripts

```bash
npm run dev:electron    # Electron desktop (recommended for full dev)
npm run dev             # Concurrent dev:server + dev:web (web dev)
npm run dev:server      # Express proxy only
npm run dev:web         # Vite only (renderer)
npm run lint:eslint          # ESLint — zero warnings enforced (--max-warnings=0)
npm run typecheck            # Renderer (tsconfig.json) + Electron main (tsconfig.electron.json)
npm test                     # Vitest, serial (--fileParallelism=false)
npm run build                # dist/ + dist-electron/ + dist/server.cjs
npm run build:web            # Renderer build only
npm run build:server         # Express server bundle only
npm run build:electron       # Electron main/preload build only
npm run ci                   # CI parity: install + lint + typecheck + test + safety/docs guards + build
npm run clean                # Remove dist/, dist-electron/, release/
npm run profile:media-studio # Isolated 1,000-record Media Studio Electron profile
npm run smoke:electron       # Electron smoke tests in tests/smoke/
```

### Single-test quick reference

```bash
npx vitest run src/services/foo.test.ts                 # one file
npx vitest run server.test.ts -t "test name"            # one test by name
npm run test:server        # server.test.ts only
npm run test:electron      # electron/**/*.test.ts only (electron node envs)
npm run test:ingestion     # src/services/ingestion only (--fileParallelism=false)
npm run test:ui            # src/components + tests/accessibility
npm run test:unit          # catch-all unit tests
npm run test:contracts     # root/tests contract and security guards
npm run test:ci            # segmented correctness suite — release parity gate
```

Do **not** pass `--reporter=basic` — it is not registered in this environment and fails immediately with a "Cannot find module 'vitest/dist/reporters/basic'" error. Use the default reporter (no `--reporter` flag).

### Verification scripts (must be green before merge)

`verify:contracts` is the umbrella — it fans out to `verify:contracts:static` (lockfile, repository-identity, release-metadata, bundle-budget, safety-guard, markdown-links, theme-tokens, network-boundaries, custom-protocol-privileges, venice-api-docs, ci-contract, agent-docs, image-policy, work-orders, no-native-dialogs, inactive-feature-archive, provider-adapters), `verify:contracts:features` (chat / image / workflow / rp / settings sub-bundles), and `verify:contracts:release` (release-packaging-hardening). Per-feature verifiers worth knowing individually include: `verify:safety-guard`, `verify:repository-identity`, `verify:markdown-links`, `verify:workspace-contracts`, `verify:model-aware-recipes`, `verify:media-studio-power-tools`, `verify:status-diagnostics`, `verify:prompt-library`, `verify:scene-composer`, `verify:scene-references`, `verify:rp-studio-polish`, `verify:workflow-templates`, `verify:storage-privacy`, `verify:storage-policy`, `verify:backup-sync`, `verify:document-ingestion`, `verify:document-agent`, `verify:research-workspace`, `verify:character-card-{v2,png,security}`, `verify:ci-contract`, `verify:agent-docs`, `verify:inactive-feature-archive`. To enumerate every script: `node -e 'console.log(Object.keys(require("./package.json").scripts).join("\n"))'`.

Before opening a PR: `npm run lint:eslint`, `npm run typecheck`, `npm test`, `npm run verify:safety-guard`, `npm run verify:markdown-links`, `npm run verify:contracts`, and `npm run build`. `npm run verify:dist` (alias `verify:build-output`) follows `npm run build`; platform variants (`verify:dist:win` / `verify:dist:mac` / `verify:dist:linux` / `verify:dist:portable` / `verify:dist:release`) are environment-specific.

---

## Commit / Push / PR Policy

- **No auto-commits.** Wait for an explicit user instruction before staging, committing, or pushing. "Make the change" is not consent; "commit this" or "push to main" is.
- **Work on `main` locally.** Custom instruction overrides the GitHub-branch-prompt default. Do not create new branches, force-update refs, stash, reset, or rebase unless requested.
- **Commit message format:** descriptive subject, optional body, ending with the trailer `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>` (unless the user explicitly asks you to omit it).
- **PR body should be useful** — list the validation matrix actually run, the gates that passed, the deferred work, and the link to the relevant `docs/summary_of_work.md` entry. Do not paste raw prompts, secret values, or local machine paths.
- **Do not commit** `dist/`, `dist-electron/`, `release/`, `coverage/`, `.env*`, `.config/*.local.yaml`, `node_modules/`, `.node22/`, or any local Copilot session-state path. `.gitignore` enforces most of these — verify with `git status` before committing.

---

## Mandatory Session Handoff: `docs/summary_of_work.md`

At the end of every coding, audit, refactor, documentation, or test
session, the agent must update `docs/summary_of_work.md`.

Required updates:

1. Read `docs/summary_of_work.md` before starting substantive work.
2. Update `Latest Session Summary`.
3. Append a new dated entry under `Session History`.
4. Update `Open TODO Ledger` with any new, completed, or reprioritized
   tasks.
5. Update `Validation Matrix` only for commands actually run.
6. Keep `docs/DOCS_INDEX.md` current whenever a session adds, removes,
   archives, renames, or changes the authority/status of documentation,
   audit reports, TODO files, release notes, or historical evidence.
7. Keep one canonical TODO roadmap:
   `docs/ROADMAP.md`. Treat this as a
   priority documentation rule. Do not create new standalone TODO,
   roadmap, audit-status, or cross-check documents for current work when
   the canonical roadmap or this ledger can be updated instead. If a
   temporary evidence file is unavoidable, clearly mark it as temporary or
   historical, link it from `docs/DOCS_INDEX.md`, and fold durable tasks
   back into the canonical roadmap before ending the session.
8. Record failures and skipped validation honestly.
9. Do not include secrets, API keys, private machine paths, or raw
   unsafe prompt payloads.

A session is not complete until `docs/summary_of_work.md` has been
updated or the agent explicitly explains why no update was needed.
Equivalent instructions live in `AGENTS.md`, `CLAUDE.md`, and
`GEMINI.md`.

---

## Architecture

**See `AGENTS.md` (sections: Architecture, State, Canonical tab registry, Key File Locations) for the current authoritative description.** The summary below captures high-level invariants that must not regress; detailed current module names, store shapes, and tab wiring live in the single source of truth (`AGENTS.md` + `src/config/tabs.ts`, Zustand stores, `src/services/veniceClient.ts`).

### Two transports, one renderer

The renderer (`src/`) runs identically in both modes. Transport is selected at runtime by `isElectron()` in `src/services/desktopBridge.ts`:

- **Electron mode**: renderer modules call the typed services in `src/services/desktopBridge.ts`; only that boundary uses `window.veniceForge.*` from `electron/preload.ts`. Domain handlers live under `electron/ipc/handlers/`. The main process holds profile-scoped Venice, Jina, and fallback-provider keys in `safeStorage` and performs provider requests.
- **Web mode**: renderer calls the Express server in `server.ts`. Venice uses server-side `VENICE_API_KEY`; Jina uses server-side `JINA_API_KEY`. Browser Settings cannot forward provider credentials, and the Jina proxy drops renderer-supplied `Authorization` / `x-jina-api-key` headers.

All Venice API requests go through `src/services/veniceClient.ts` — `veniceFetch()` for non-streaming and `veniceStreamChat()` for chat streams. Both paths include up to 3 retries with exponential back-off for 429/500/503 responses. (See also `src/lib/venice-client.ts` for the thin Electron passthrough used by some legacy hooks.)

### State management

**Zustand 5 lightweight slice stores** (auth, chat, playground, settings, toast, workflow, media, rp-*, inspector, etc.). Reducer-based state has been fully migrated. Side effects live in services. See `AGENTS.md` "State" and the individual `src/stores/*.ts` + `src/stores/*-store.ts` files.

### Storage (current)

Renderer IndexedDB (via `src/services/storageService.ts` + `STORE_NAMES`): multiple stores including conversations, settings, images/media, memories, files, character cards, personas, lorebooks, rp-chats, rp-assets. `ENCRYPTED_STORES` use AES-GCM. Desktop chat history uses atomic JSON files under userData/chat-history/. Secrets: OS `safeStorage` (Electron) or server `.env` (web). See `AGENTS.md` and `docs/DEVELOPMENT/CONFIG.md`.

- Exports/imports are versioned JSON; secret-like fields are redacted on export; import merges by ID (additive, never destructive).
- See `src/services/exportImport.ts`, `src/services/storageService.ts`.

### IPC surface (Electron)

The renderer can only call the channels declared in `electron/preload.ts` via `window.veniceForge`. The allowed Venice endpoints and HTTP methods are enforced in both `src/shared/validation.ts` (web proxy) and `electron/ipc/validation.ts` (IPC handler). In **Electron mode**, the renderer cannot choose arbitrary Venice endpoints or read the raw API key (it lives in `safeStorage` in the main process).

### Allowed Venice endpoints

```
GET  /models
GET  /image/styles
GET  /characters
GET  /characters/{slug}
POST /chat/completions
POST /image/generate
POST /image/upscale
POST /augment/search
POST /augment/scrape
POST /augment/text-parser
POST /video/queue
POST /video/retrieve
POST /video/quote
POST /video/complete
POST /image/edit
POST /image/multi-edit
POST /embeddings
POST /audio/queue
POST /audio/retrieve
POST /audio/speech
POST /audio/transcriptions
```

### Research Subsystem

The `src/research/` directory contains a pluggable provider system for search, scrape, and public-profile discovery:

- **Providers**: `veniceResearchProvider.ts` (Venice `/augment/*`), `jinaResearchProvider.ts` (`r.jina.ai` / `s.jina.ai`), `genericHttpScrapeProvider.ts` (SSRF-safe fallback, disabled by default)
- **Agent**: `researchRunner.ts` enforces budgets (`maxQueries`, `maxPages`, `totalJobTimeoutMs`); `researchSynthesis.ts` builds evidence-only prompts; `socialDiscovery.ts` generates platform-specific `site:` queries for public-profile discovery
- **Key rule**: The renderer never sees raw API keys. Electron stores Jina keys via `safeStorage`; web mode uses only server-side `JINA_API_KEY` and rejects renderer-supplied Jina credentials.

### Theme System

`src/theme/` provides a 29-role semantic token system with seven built-in palettes and a live ThemeMaker UI. `completeThemeTokens()` preserves legacy persisted themes; ThemeMaker YAML uses the full snake_case contract. Themes persist to encrypted IndexedDB.

### Auto-Updates
Auto-updates are fetched via GitHub Releases. The `electron/ipc/updates.ts` module securely exposes `checkForUpdates`, `downloadUpdate`, and `installUpdate` to the renderer while keeping download logic in the sandboxed main process.

### Content Safety Guard

Every outgoing Venice API request routes through the guarded transport. Family Safe Mode invokes the local rules; Adult Mode skips rule evaluation entirely. Venice API Safe Mode is a separate provider-side parameter. The conditional pipeline runs at every enforcement boundary:

- **Electron IPC** (`electron/ipc/handlers/veniceHandlers.ts` plus `electron/services/guardPipeline.ts`): assessed before the main-process Venice client makes the HTTPS call.
- **Express proxy** (`server.ts`): assessed before `http-proxy-middleware` forwards the request.
- **UI call sites**: All prompt-sending paths (chat, image, audio, video, embeddings, research, RP scene/character import, etc.) route through the guard. No raw prompt text is ever logged. See `src/services/veniceClient.ts`, `electron/ipc/handlers.ts`, `server.ts`, and `src/shared/safety/characterImportSafety.ts`.

The public entry point is:

```ts
import { maybeRunLocalFamilyGuard } from "src/shared/safety";
const decision = maybeRunLocalFamilyGuard(
  { endpoint, method: "POST", payload, source: "venice-client" },
  settings.localFamilySafeModeEnabled,
);
// decision.allowed === false -> block locally; decision.skipped === true -> Adult Mode
```

`SafetyGuardDecision` never contains raw prompt text — only `promptHash` (coarse djb2, audit use only), `action`, `severity`, `category`, and `reasonCode`.

**`electron/utils/urlSecurity.ts`** provides `isTrustedExternalUrl(url)` for `shell.openExternal` — allows `https:` only and additionally blocks RFC 1918 addresses (10.x, 192.168.x, 172.16–31.x), loopback (127.x, `localhost`, `0.0.0.0`), and `::1`. Pure hostname string check — no DNS.

---

## Key Conventions

### Dual-mode guards

Any code that differs between Electron and web **must** use `isElectron()` from `src/services/desktopBridge.ts`. The `desktopBridge` module re-exports all Electron-only APIs with safe no-op fallbacks for web mode — use these rather than calling `window.veniceForge` directly.

### `veniceFetch` is the only API entry point

All Venice HTTP calls go through `veniceFetch()` or `veniceStreamChat()` in `src/services/veniceClient.ts`. Do not `fetch('/api/venice/...')` directly, and never call `window.veniceForge.venice` directly from modules.

### Diagnostics / inspector

Status and Inspector surfaces are fed by the inspector store + telemetry (see `src/stores/inspector-store.ts`, `src/services/inspectorTelemetry.ts`). Venice/Jina calls are logged with transport, timing, guard outcome, and redacted payloads (no raw prompts). The legacy dispatch-based diagnostics path has been superseded.

### Tab / View structure (current)

Canonical registry in `src/config/tabs.ts` (`TAB_IDS`, `TAB_REGISTRY`, `CANONICAL_TAB_ORDER`). 20 top-level tabs (Chat, Character Chats, History, Image Studio, Media Studio, Prompts, Scene Composer, Audio Studio, Music Studio, Video Studio, Embeddings, Research, Characters, RP Studio, Workflows, Documents, Privacy, Playground, Config, Status). Add tabs only via the registry. Legacy aliases (e.g. `gallery` → `media`) are supported only for persisted state migration. See `AGENTS.md` "Canonical tab registry" and `src/config/tabs.test.ts` (VERIFY-022).

### Electron build pipeline

`electron/` is compiled separately via `tsconfig.electron.json` (CommonJS output to `dist-electron/`) using `tsc`. The Express server is bundled via esbuild (`server.ts` → `dist/server.cjs`). Run `npm run build:electron` after any change to `electron/`. The renderer builds via Vite with `ELECTRON_BUILD=true` to set `base: "./"` for relative asset paths.

### Security constraints

- Never expose the API key to the renderer — it lives in `electron/services/secureStore.ts` (main process) or the Express server env.
- Do not add new IPC channels without adding them to `electron/preload.ts`, the appropriate module under `electron/ipc/handlers/`, and a main-process input validator.
- Do not add new Venice endpoints without updating `src/shared/validation.ts`.
- CSP is strict in production — no inline scripts, no external `connect-src`.
- Packaged startup must load `dist/index.html` in place so its relative `./assets` URLs remain valid; `VERIFY-036` locks this contract.
- macOS requires `build/icon.icns` for packaging. Never weaken `safeStorage` — macOS Keychain and Windows DPAPI parity is required. Plaintext storage is completely disabled for Windows and macOS.
- Every new prompt-sending path **must** route through `maybeRunLocalFamilyGuard()` and pass the persisted `localFamilySafeModeEnabled` value. Do not call the rule engine when Adult Mode is active. Do not log raw prompt text anywhere in the codebase.
- The `FUZZY_ALLOWLIST ∩ CSAM_GENRE_LABELS = ∅` invariant is enforced at module load — adding a term from `CSAM_GENRE_LABELS` to `FUZZY_ALLOWLIST` will throw at startup.
- Safety tests must use synthetic/redacted fixtures only — never include actual genre labels or explicit strings as test data.

---

## Image Workflow

Image data from the Venice API arrives in several shapes. **Always use `extractImages(payload)`** from `src/utils/image.ts` to normalise the response — it handles `{ data: [{ b64_json }] }`, `{ images: [] }`, bare base64 strings, and URL strings, and deduplicates results.

Generated images and videos are normalized to `MediaItem` records in the encrypted `images` IndexedDB store. Use `src/stores/media-store.ts`, `src/services/mediaMigration.ts`, and the helpers in `src/utils/mediaItem.ts`; do not reintroduce the retired reducer-driven Gallery flow.

The user-facing surface is **Media Studio** in `src/components/gallery/gallery-view.tsx`. The canonical top-level tab id is `media`; `gallery` is a legacy alias only. Keep tab behavior synchronized through `src/config/tabs.ts` (`TAB_IDS`, `TAB_REGISTRY`, and `CANONICAL_TAB_ORDER`) rather than adding parallel tab literals.

Lineage uses `parentId` / `childrenIds` on `MediaItem`. Persist image-tool outputs through the Media Studio store with the correct `operation` and durable data URL; never persist transient `blob:` URLs.

Cross-tab Media Studio actions route through the transient `src/stores/image-workspace-store.ts`; do not add production window globals. Derivative writes must use `useMediaStore.upsertDerivative()` so the child and parent lineage stay synchronized.

Media Studio reads are timestamp-indexed and paginated through `StorageService.getItemsPageWithMeta()` and `useMediaStore.loadMore()`. Keep search, batch, and lineage UI explicit that they operate on loaded records; do not replace the cursor path with `getAll()`.

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

**Pure-function tests** — most service tests (`exportImport`, `redaction`, `mediaMigration`, `payloadBuilders`, `image`) test pure functions directly with no mocking needed. Prefer this style: call the function, assert on the return value.

**Regression guards** — bugs that were fixed get a test with a `BUG-NNN` comment (e.g. `// BUG-002 regression guard`). Follow this convention when fixing a bug: add or annotate a test that would have caught it.

**Rate-limit state isolation** — `server.test.ts` creates a fresh `app` in `beforeEach` (not `beforeAll`) for rate-limit tests to prevent state from bleeding between test cases. Do the same for any test that depends on in-process mutable state.

---

## Regression Guard System (`VERIFY-NNN`)

Regression-sensitive surfaces are protected by named regression guards. The active sequence is `VERIFY-001`..`VERIFY-155` (with `VERIFY-168` as an intentional legacy bridge allowlisted by `verify:repo-handoff-hygiene`). Each guard lives in a specific test file and fails CI if the protection is weakened. When fixing a regression, add or annotate the closest `VERIFY-NNN` test with a brief comment.

- **When you find a regression**, first grep `AGENTS.md` for the table row describing `VERIFY-NNN`. The row tells you (a) which test file is the canonical guard, (b) what behavior is locked, and (c) which boundary the guarantee spans.
- **When you add a new regression guard**, append the entry to the `AGENTS.md` table with the ID, what it locks, and the test file path. Update `verify:repo-handoff-hygiene` if you intentionally assign an out-of-sequence slot.
- **Bug-fix convention**: alongside `VERIFY-NNN`, also add `// BUG-NNN regression guard` to the test that would have caught the original defect (the legacy convention retained for pre-VERIFY regressions).
- **`verify:contracts` is the umbrella** that wires most individual `VERIFY-NNN` tests into `verify:contracts:features:{chat,image,workflow,rp,settings}` plus `verify:contracts:static` and `verify:contracts:release`. If your guard does not show up in any chain yet, link it explicitly.

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
| `JINA_API_KEY` | Optional server-side Jina key for web research; renderer credentials are ignored |
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
| Renderer IndexedDB stores | `src/constants/venice.ts` (`STORE_NAMES`) via `src/services/storageService.ts` and `src/services/dbMigrations.ts`; encryption scope is `ENCRYPTED_STORES` in `src/services/storageService.ts` — `diagnostics` is unencrypted, all other stores are AES-GCM |
| Memories | Included in the encrypted renderer IndexedDB stores (`ai_memory`) |

---

## Files to Keep Current

**Mandatory every session** (the agent must update before ending the turn):
- `docs/summary_of_work.md` — Update the `Latest Session Summary`, append a dated entry under `Session History`, refresh the `Open TODO Ledger`, and refresh the `Validation Matrix` for commands actually run. Do not include secrets, API keys, private machine paths, or raw unsafe prompt payloads. `verify:repo-handoff-hygiene` enforces this contract.
- `docs/DOCS_INDEX.md` — Update when a session adds, removes, archives, renames, or changes the authority/status of documentation, audit reports, TODO files, release notes, or historical evidence.

**Updated on behavior, packaging, or storage change**:
- `docs/ROADMAP.md` — canonical TODO roadmap. Do not create new standalone TODO, roadmap, audit-status, or cross-check documents for current work when the canonical roadmap or `docs/summary_of_work.md` can hold the entry instead. `verify:roadmap-current` enforces `It contains no closed top-level sections or mirrored per-finding audit statuses`.
- `README.md` — high-level behavior, prerequisites, installation, screenshots.
- `AGENTS.md` — canonical project architecture/state/tabs/guards. Update when any file or workflow this file references materially changes.
- `.github/copilot-instructions.md` (this file) — the Copilot CLI auto-loaded variant. Mirror changes from `AGENTS.md` that affect a Copilot session's working contract (run, test, commit, review). `verify:agent-docs` enforces parity.

**Updated rarely, on relevant scope change**:
- `SECURITY.md`, `docs/ABOUT.md`, `docs/FAQ.md`, `docs/RELEASE/release.md`, `LEGAL.md`, `CONTRIBUTING.md`.
