# Venice Forge — Agent Guide

> Human contributors: start with [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md).
> Sibling agent docs in [docs/AGENTS/AGENTS.md](docs/AGENTS/AGENTS.md) and
> [docs/AGENTS/agent-reinitialization.md](docs/AGENTS/agent-reinitialization.md) are **gitignored** (commit `037900d`) — they are local-only handoff notes, not committed source of truth.

**Version:** 1.0.5 | **Stack:** React 19 + TS strict, Electron 42, Express 4, Vitest 4 | **Node:** 20 or 22, npm 10+

---

## Commands

### Development
```bash
npm run dev:electron   # Desktop app (recommended; runs tsc for electron/ first)
npm run dev:web        # Vite + Express proxy only
```

### Validation order (required before PR)
```bash
npm run lint:eslint          # ESLint — zero warnings enforced (--max-warnings=0)
npm run typecheck            # Renderer (tsconfig.json) + Electron main (tsconfig.electron.json)
npm test                     # Vitest, serial (--fileParallelism=false)
npm run verify:safety-guard  # Mandatory CI gate; see Security below
npm run verify:markdown-links # Local Markdown files + heading fragments
npm run build                # dist/ + dist-electron/ + dist/server.cjs
npm run ci                   # Full parity including safety + Markdown guards
```

### Single test, single file
```bash
npx vitest run src/services/foo.test.ts
npx vitest run server.test.ts -t "test name"
npx vitest run tests/smoke/electron-smoke.test.ts   # via npm run smoke:electron
```

### Packaging
```bash
npm run dist:win         # NSIS + portable
npm run dist:mac         # DMG + ZIP (both archs)
npm run dist:mac:arm64   # Apple Silicon only
npm run dist:mac:x64      # Intel only
npm run checksum:release  # SHA-256 after packaging
```

### Misc
```bash
npm run build:electron   # Only electron main/preload → dist-electron/
npm run build:web        # Only renderer → dist/ (sets ELECTRON_BUILD=true)
npm run build:server     # Only proxy → dist/server.cjs
npm run smoke:electron   # tests/smoke/electron-smoke.test.ts (Playwright; skipped when no display)
npm run test:coverage    # v8 coverage; thresholds 70/80/80/80
npm run profile:media-studio # Isolated Electron profile with 1,000 encrypted media records
npm run verify:dist      # Generic post-package check
npm run verify:dist:win  # Windows artifacts (NSIS + portable)
npm run verify:dist:mac  # macOS artifacts (DMG + ZIP, both archs)
npm run verify:dist:portable  # Windows portable only
npm run clean            # Remove dist/ dist-electron/ release/
```

---

## Architecture

**Two transports, one renderer.** `isElectron()` in `src/services/desktopBridge.ts` selects:
- **Electron:** renderer → `window.veniceForge` (contextBridge) → IPC → main process → `api.venice.ai` (key in `safeStorage`)
- **Web:** renderer → `fetch('/api/venice/...')` via Express proxy → `api.venice.ai` (key in `.env`)

**Single Venice entry point.** All HTTP calls go through `veniceFetch()` / `veniceStreamChat()` in `src/services/veniceClient.ts`. Modules must not `fetch('/api/venice/...')` directly and must not call `window.veniceForge.venice.*` directly — use `src/services/desktopBridge.ts` instead. **Exception:** `src/stores/chat-store.ts` accesses `window.veniceForge.chat.*` directly (pre-bridge legacy). Do not add new direct calls.

**Canonical tab registry.** `src/config/tabs.ts` is the single source of truth for the `Tab` type, the visible tab order (`CANONICAL_TAB_ORDER`), the sidebar groups, the keyboard-shortcut numbering, and the legacy alias table. `useSettingsStore` v2→v3 migrates legacy `activeTab` values (e.g. `gallery` → `media`) so persisted user state from earlier builds continues to resolve. Add a new tab by adding a `TabId` literal to `TAB_IDS`, an entry to `TAB_REGISTRY`, and a view to `App.tsx`'s `views` map. Aliases are deprecated and preserved only for back-compat.

**Dual TypeScript build pipelines:**
- Renderer (`src/`): Vite, `tsconfig.json` (ESNext, `noEmit`, `bundler` resolution)
- Electron main (`electron/`): `tsc --project tsconfig.electron.json` → CommonJS → `dist-electron/`; then `scripts/create-cjs-package.cjs` copies `package.json` as CJS

**State:** Zustand 5 stores (`auth`, `chat`, `playground`, `settings`, `toast`, and `workflow`). Reducer-based state has been fully migrated to lightweight slice stores. Side effects live in services/modules.

**Local Family Safe Mode runtime snapshot:** The main-process `runtimeSafetySettings` module holds the canonical enabled/disabled state. Every Venice-touching IPC handler must route through `performGuardedVeniceRequest` / `checkLocalFamilyGuard` in `electron/services/guardPipeline.ts`; the renderer-supplied `localFamilySafeModeEnabled` field on `VeniceIpcRequest` is no longer trusted (kept on the type for back-compat but ignored). The 451 block shape (`{ ok: false, status: 451, body: { error, reasonCode, category, severity } }`) is canonical across all entry points. The web proxy uses the `X-Venice-Forge-Family-Safe-Mode` header, which the renderer sets from `useSettingsStore.getState().localFamilySafeModeEnabled`. Returned body screening (`screenResponseBody`) covers Jina and scrape endpoints. See VERIFY-015 in `tests/safety/guardPipeline.test.ts`.

**Conversation persistence (dual-mode):**
- Desktop: atomic JSON files under `userData/chat-history/` (temp + rename)
- Web: encrypted IndexedDB `conversations` store
- Legacy flat `chats` auto-migrate on first load — **additive only, never destructive**
- Conversation IDs must pass `VALID_ID_RE = /^[a-zA-Z0-9_.-]{1,128}$/` in main-process storage

**Theme system:** Token-based CSS variables + Tailwind v4 `@theme`. Built-in themes in `src/theme/themes.ts` and configured under `config/themes/`; user themes in ThemeMaker UI supporting custom YAML import/export; bootstrap cache in `localStorage` to prevent FOUC.

---

## Testing

- **Vitest 4**, jsdom by default. Add `// @vitest-environment node` at the top of any server/IPC/main-process test (e.g., `server.test.ts`, `electron/**/*.test.ts`).
- **Serial execution** (`--fileParallelism=false`): tests touching IndexedDB or global state must not run in parallel.
- Tests live next to source: `src/services/foo.ts` → `src/services/foo.test.ts`. Server test is `server.test.ts` at root.
- Regression guards: `// BUG-NNN regression guard` (or `// VERIFY-NNN`) comment in tests that would have caught a fixed bug.
- Node-level tests (rate-limiting, etc.): create fresh `app` in `beforeEach`, not `beforeAll`, to isolate state.
- Coverage thresholds in `vitest.config.ts`: 70% branches, 80% functions/lines/statements.

### Named regression guards (VERIFY-NNN)

Regression-sensitive surfaces are protected by named regression guards. Each
guard fails CI if a future change weakens the protection. When adding a
new guard, append it to the list below and reference the ID in the
test's comment header.

| ID | What it locks | Test file |
|----|----------------|-----------|
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
| `VERIFY-011` | Character-card local storage invariants (atomic write, sidecar avatar, ID validation, corruption backup) | `tests/storage/characterCardStorage.regression.test.ts` |
| `VERIFY-012` | RP chat storage invariants (atomic write, ID validation, MAX_ACTIVE_CHARACTERS, corruption backup) | `tests/storage/rpChatStorage.regression.test.ts` |
| `VERIFY-013` | Scene-generation safety + asset persistence (assessScenePrompt always runs; assets linked by chatId) | `tests/safety/sceneGeneration.regression.test.ts` |
| `VERIFY-014` | Character RP safety wrapper routing (every wrapper produces a real guard decision; no raw prompt text in userMessage) | `tests/safety/characterImportSafety.routing.test.ts` |
| `VERIFY-015` | Guarded IPC pipeline (`performGuardedVeniceRequest` / `checkLocalFamilyGuard` / `screenResponseBody`) — runtime snapshot is the source of truth, canonical 451 block shape, return-content screening, endpoint matrix lock | `tests/safety/guardPipeline.test.ts` |
| `VERIFY-016` | Inspector non-mutating preview (`previewLocalFamilyGuard`) — never increments audit counters; Adult Mode shows "skipped"; Electron shows "electron-main-authoritative" | `tests/safety/inspectorPreview.test.ts` |
| `VERIFY-017` | Renderer hydration gate (`assertConfigHydratedForSafety` / `getEffectiveRendererLocalFamilySafeModeEnabled` / `getEffectiveRendererVeniceApiSafeMode` / `useRendererConfigHydrated`) — Electron-mode renderer-side safety preflight throws `ConfigNotHydratedError` until the main-process config snapshot hydrates; provider `safe_mode` has its own hydration-gated helper so Adult Mode and provider `safe_mode` stay independent | `tests/safety/hydrationGate.test.ts` |
| `VERIFY-018` | Provider `safe_mode` endpoint matrix (`applyVeniceApiSafeMode` / `endpointSupportsSafeMode`) — adds `safe_mode` only for endpoints in the supported set, never mutates input | `tests/safety/veniceSafeMode.test.ts` |
| `VERIFY-019` | Electron Jina/scrape response-body screening — `screenResponseBody` runs after fetch, returns 451 on block, skips in Adult Mode, never returns raw blocked body | `electron/ipc/handlers.test.ts` |
| `VERIFY-020` | Media Studio persistence — image-tools saves a migrated MediaItem to the IDB-backed `useMediaStore` with the correct `operation` (`upscale` / `background-remove` / `edit`) and the new item's image is a data URL (no raw blob leak) | `src/components/image/image-tools.test.tsx` |
| `VERIFY-021` | Chat-store dirty-map persistence — every conversation mutation (active or not) is captured in the module-level dirty map, `metadata.messageCount` matches `messages.length` after every change, `updatedAt` is bumped on every change, and `flushAllPendingSaves()` writes every dirty id on debounce + `pagehide` + `beforeunload`. Sidebar Undo persists the restored conversation via `restoreConversation()`. | `src/stores/chat-store.dirty.test.ts` |
| `VERIFY-022` | Canonical tab registry — `gallery` legacy alias resolves to the `media` descriptor, `CANONICAL_TAB_ORDER` does not contain legacy ids, unknown ids fall back to `chat`, and `isTabId` recognises both canonical and legacy ids. | `src/config/tabs.test.ts` |
| `VERIFY-023` | `window.__veniceMediaDev` is NOT attached when `import.meta.env.DEV` is `false` and `MODE === 'production'` (regression guard for the dev-only window hook in `gallery-view.tsx`). | `src/components/gallery/gallery-view.test.tsx` |
| `VERIFY-024` | Config-key import redaction is awaited and atomic; initialization cannot report successful redaction before the YAML rewrite completes. | `electron/services/configService.test.ts` |
| `VERIFY-025` | RP chat creation is persisted before it is published to Zustand/UI state; failed safety hydration or storage writes cannot leave a ghost chat. | `src/stores/rp-chat-store.test.ts` |
| `VERIFY-026` | Shared modal focus management enters the dialog, traps Tab navigation, closes on Escape, and restores the trigger. | `src/hooks/useFocusTrap.test.tsx` |
| `VERIFY-027` | Sidebar full-content history search uses a deferred query and a precomputed lowercase conversation index. | `src/components/layout/sidebar.test.tsx` |
| `VERIFY-028` | Media Studio reads encrypted records through the timestamp index in bounded pages and appends pages without duplicate records. | `src/services/storageService.test.ts`, `src/stores/media-store.test.ts` |
| `VERIFY-029` | Repository-local Markdown targets and heading fragments resolve; external URLs and GitHub routes remain out of scope. | `scripts/verify-markdown-links.test.ts` |

---

## Security (non-negotiable)

**API keys:** Never in renderer. Electron: `safeStorage` (DPAPI on Windows, Keychain on macOS). Web: `.env` only. Never commit either. `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true` is a Linux-only fallback and emits a security warning.

**Local Family Safe Mode:** Every prompt path must route through `maybeRunLocalFamilyGuard(input, localFamilySafeModeEnabled)`. When enabled, it invokes and records the existing local guard; when disabled (Adult Mode), it must not invoke the rule engine at all. Venice API Safe Mode remains a separate provider parameter. Boundaries include renderer `veniceClient.ts`, Electron IPC, Express proxy, bridge server, research, and RP flows. **Never log raw prompt text.** Safety tests must use synthetic fixtures only.

**Allowed endpoints only** (enforced in `src/shared/validation.ts` and `electron/ipc/validation.ts`):
```
GET  /models
POST /chat/completions, /image/{generate,upscale,edit,multi-edit},
     /augment/{search,scrape,text-parser},
     /video/{queue,retrieve,quote,complete},
     /embeddings, /audio/{queue,retrieve,speech,transcriptions}
```

**Startup invariant:** `FUZZY_ALLOWLIST ∩ CSAM_GENRE_LABELS = ∅` — adding a CSAM label to the allowlist throws at module load.

**Renderer hardening:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`. CSP is set once globally on `session.defaultSession` in `electron/main.ts:183` (not per-window). External links route through `isTrustedExternalUrl()` in `electron/utils/urlSecurity.ts` (https-only, public IPs only — blocks RFC 1918, loopback, IPv6 link-local, IPv4-mapped IPv6, short-form IPv4 via POSIX `inet_aton`).

**Adding a new IPC surface** requires coordinated updates in: `electron/preload.ts` (contextBridge), `electron/ipc/handlers.ts` (handler), `electron/ipc/validation.ts` (Zod/allowlist), `src/services/desktopBridge.ts` (renderer surface), and a test.

**Adding a new Venice endpoint** requires updates in: `src/shared/validation.ts`, `electron/ipc/validation.ts`, and `server.ts` (proxy). The `verify-safety-guard` script enforces guard presence in the three boundary files.

**GitHub Actions pinning:** All third-party Actions in `.github/workflows/*.yml` are pinned to a commit SHA, not a tag, to prevent supply-chain attacks. The version comment is appended after the SHA for maintainer reference. When bumping an action, look up the new SHA with `gh api repos/<owner>/<repo>/git/refs/tags/<tag>` and update both the SHA and the version comment.

**CodeQL suppressions:** Use `// nosec:js/<rule-id>` (with an inline justification comment) to suppress a CodeQL finding. Suppressions are reviewed as code — if a suppression is removed, the allowlist check or clamp logic should be re-verified, not just deleted.

**Audit:** `npm audit --omit=dev --audit-level=moderate` is a release gate.

**Static analysis (CodeQL):** Every push runs CodeQL. Open alerts appear in `Security → Code Scanning`. The current set of defended false positives is documented in `SECURITY.md` and annotated at each call site.

---

## Key File Locations

| Path | Purpose |
|------|---------|
| `config/themes/` | Starter theme YAML templates (venice.yaml, dark.yaml, light.yaml, dracula.yaml, gruvbox_dark.yaml, rosepine.yaml) |
| `src/services/veniceClient.ts` | Single Venice API entry point (with safety guard) |
| `src/lib/venice-client.ts` | Electron-only thin client; safety guard is in the IPC layer — see `electron/ipc/handlers.ts:79`. Kept separate from the canonical services/veniceClient.ts because: (a) this is a passthrough that does not run the safety guard in the renderer (it lives in the IPC layer), (b) it has a simpler `venice<T>()` / `veniceBlob()` / `veniceFormData()` API the legacy hooks prefer, (c) it can be deleted in a future Electron-only refactor. |
| `src/services/desktopBridge.ts` | Electron-vs-web transport abstraction; use this instead of `window.veniceForge` |
| `src/services/storageService.ts` | IndexedDB store set controlled by `STORE_NAMES`; `ENCRYPTED_STORES` for AES-GCM |
| `src/services/chatStorage.ts` (renderer) + `electron/services/chatStorage.ts` (main) | Conversation persistence — **mirror changes across both** |
| `src/services/memoryService.ts` | AI memory layer; 2,000-char injection budget |
| `src/services/attachmentService.ts` | File/URL/image attachments; 256 KiB/file, 1 MiB total, 5-attachment cap, 1024-px image downscale |
| `src/shared/validation.ts` | Venice endpoint allowlist (single source for IPC + proxy) |
| `src/shared/safety/` | `assessChildExploitationSafety`, `recordDecision`, `promptPayloadExtractor` |
| `src/shared/limits.ts` | Shared byte/timeout constants — reuse, do not hardcode |
| `src/shared/logger.ts` | Redacting logger; `console.{log,warn}` is lint-warned |
| `src/utils/image.ts` | `extractImages()` normalises all Venice image response shapes |
| `src/utils/payloadBuilders.ts` | `buildChatPayload`, `buildImagePayload` |
| `src/research/providers/` | Venice + Jina + generic HTTP scrape (SSRF via `dns.lookup`) |
| `src/constants/venice.ts` | `FALLBACK_MODELS`, `TABS`, `modelSupportsVision()`, `DB_VERSION`, `STORE_NAMES` |
| `src/components/{chat,image,audio,music,video,embeddings,workflows,playground,layout,ui}` | Renderer UI: tab views, sidebar, header, dialog, shared primitives |
| `src/components/gallery/gallery-view.tsx` | Media Studio orchestrator backed by the local `images` store; search, filters, batch actions, detail, lineage, export, and delete |
| `electron/preload.ts` | contextBridge API surface (only place to expose IPC to renderer) |
| `electron/main.ts` | BrowserWindow + CSP + navigation guards; `requestSingleInstanceLock` |
| `electron/ipc/handlers.ts` | IPC channel handlers (incl. `venice:request`, `venice:streamChat`, `chat:*`, `app:*`) |
| `electron/services/bridgeServer.ts` | Headless Express loopback bridge server (`127.0.0.1`) enforcing bearer token auth & child exploitation safety guard |
| `src/types/rp.ts` | Local-first Character RP Studio types: `CharacterCardV1`, `UserPersonaV1`, `RpChatV1` / `RpMessageV1`, `LorebookV1`, `RpMemoryV1`, `RpAssetV1`, `PromptAssemblyTraceEntry`, `VALID_ID_RE` |
| `src/services/rp/promptBuilderService.ts` | Pure deterministic prompt assembly (safety -> model -> persona -> characters -> scenario -> lorebook -> memory -> recent -> active turn) with trace + LIFO budget enforcement |
| `src/services/rp/lorebookService.ts` | Pure lorebook entry evaluator (constant / keyword / whole-word / regex keys, insertion modes) |
| `src/services/rp/rpMemoryService.ts` | RP memory selection (pinned > character > long-term) with per-scope caps and `RP_MEMORY_MAX_CHARS=2000` budget |
| `src/services/rp/characterCardService.ts` `personaService.ts` `lorebookRendererService.ts` `rpChatService.ts` `assetService.ts` | Renderer-side wrappers (Electron IPC + web IndexedDB) for local RP storage |
| `src/services/rp/sceneGenerationService.ts` | Scene prompt extraction + `/image/generate` dispatch with hydration-gated `assessScenePrompt`; Adult Mode records a skipped local decision |
| `src/shared/safety/characterImportSafety.ts` | Thin wrappers routing character/persona/RP-context/scene-prompt inputs to the existing `assessChildExploitationSafety` with correct `source`/`endpoint` |
| `src/stores/character-card-store.ts` `persona-store.ts` `lorebook-store.ts` `rp-chat-store.ts` `scene-asset-store.ts` | Zustand stores for the RP Studio (lazy-loaded behind `'rp-studio'` tab) |
| `src/components/rp-studio/` | RP Studio UI: `RpStudioView` orchestrator + `CharacterLibrary`, `CharacterEditor`, `PersonaManager`, `LorebookManager`, `RpChatList`, `RpChatView`, `SceneGenerator`, `AssetGallery`, `PromptDebugDrawer` |
| `electron/services/characterCardStorage.ts` `rpChatStorage.ts` `rpSingleFileStore.ts` `rpStores.ts` | Main-process filesystem storage for character cards, RP chats, and single-file record stores (personas, lorebooks, rp-assets) |
| `electron/ipc/rpHandlers.ts` | Registers 20 IPC channels for the RP Studio (`characterCards:*`, `personas:*`, `lorebooks:*`, `rpChats:*`, `rpAssets:*`) |
| `src/stores/inspector-store.ts` | Zustand developer traffic logs and diagnostics store |
| `electron/ipc/validation.ts` | IPC request validation |
| `electron/services/secureStore.ts` | `safeStorage` wrapper with atomic writes (temp + rename) |
| `electron/utils/urlSecurity.ts` | `isTrustedExternalUrl`, `isPrivateHostname` |
| `server.ts` | Express proxy (`/api/venice/*`, `/api/proxy-scrape`); vite only in dev |
| `scripts/verify-safety-guard.cjs` | CI gate — see Security section |
| `scripts/verify-dist.cjs` | Post-package artifact verification (`verify:dist:win`, `verify:dist:mac`, `verify:dist:portable`) |
| `scripts/verify-markdown-links.cjs` | CI documentation-link verifier for local files and heading fragments (`verify:markdown-links`) |
| `scripts/profile-media-studio.mjs` | Opt-in Playwright Electron profile for encrypted Media Studio pagination, heap/DOM metrics, console health, and temporary screenshots |
| `src/shared/safety/childExploitationGuard.ts` | Public safety-guard API + decision orchestration (T15 split: matchTables + normalization extracted) |
| `src/shared/safety/localFamilySafeGuard.ts` | Conditional Family Safe Mode pipeline; returns a skipped decision without invoking rules in Adult Mode |
| `src/shared/safety/matchTables.ts` | Pattern/term dictionaries for the guard (T15) |
| `src/shared/safety/normalization.ts` | Text normalization + multi-view output (T15) |
| `src/lib/venice-client.test.ts` | Direct unit coverage of `venice/veniceStreamChat/veniceBlob/veniceFormData` (VERIFY-006) |
| `src/lib/venice-client.dual.test.ts` | Dual-client surface contract (VERIFY-009, T8) |
| `src/stores/chat-store.flush.test.ts` | Flush-on-unload regression guard (VERIFY-005) |
| `tests/csp/inlineStyleInvariant.test.ts` | Zero JSX inline `style={...}` invariant (VERIFY-007, T1) |
| `tests/theme/inlineColorInvariant.test.ts` | Zero out-of-allowlist inline colors (VERIFY-010, T11) |
| `tests/safety/enforcementBoundaries.test.ts` | Child-safety-guard enforcement at every boundary (renderer / IPC / web proxy) |
| `tests/storage/characterCardStorage.regression.test.ts` | Local character-card storage invariants (VERIFY-011) |
| `tests/storage/rpChatStorage.regression.test.ts` | RP chat storage invariants (VERIFY-012) |
| `tests/safety/sceneGeneration.regression.test.ts` | Scene-generation safety + assets (VERIFY-013) |
| `tests/safety/characterImportSafety.routing.test.ts` | Character RP safety wrapper routing (VERIFY-014) |
| `tests/safety/guardPipeline.test.ts` | Guarded IPC pipeline — runtime snapshot, 451 shape, return-content screening, endpoint matrix (VERIFY-015) |
| `tests/safety/inspectorPreview.test.ts` | Inspector non-mutating preview (VERIFY-016) |
| `tests/safety/hydrationGate.test.ts` | Renderer hydration gate (VERIFY-017) |
| `tests/safety/veniceSafeMode.test.ts` | Provider `safe_mode` endpoint matrix (VERIFY-018) |
| `electron/services/configService.test.ts` | Secure config import and awaited atomic key-redaction invariants (VERIFY-024) |
| `src/stores/rp-chat-store.test.ts` | RP chat creation persistence-before-publication invariant (VERIFY-025) |
| `src/safetyHydration.ts` | `assertConfigHydratedForSafety` / `getEffectiveRendererLocalFamilySafeModeEnabled` / `ConfigNotHydratedError` — renderer-side hydration gate for safety preflight |
| `src/shared/veniceSafeMode.ts` | `applyVeniceApiSafeMode` / `endpointSupportsSafeMode` / `VENICE_API_SAFE_MODE_MATRIX` — central provider-side `safe_mode` helper |
| `electron/services/guardPipeline.ts` | `performGuardedVeniceRequest` / `checkLocalFamilyGuard` / `buildGuardedBlock` — central IPC entry point combining runtime snapshot + local guard |
| `docs/AUDIT_FOLLOWUP_2026_06_05.md` | 2026-06-05 full-repo audit report — P0/P1/P2 status, commits, follow-up items |

---

## Vision / Attachment Detection

No live vision flag from Venice API. Use `modelSupportsVision(modelId)` in `src/constants/venice.ts` — checks `VISION_CAPABLE_MODEL_IDS` allowlist and `VISION_CAPABLE_PATTERNS` (`/vision/i`, `/-vl/i`, `/gemini-2\.[05]/i`). **Defaults to OFF** when unknown. Image attachments are passed as base64 `image_url` content parts only when the selected model supports vision.

---

## Update These Files

- When changing behavior, packaging, or storage, also update:
- `README.md`, `CHANGELOG.md` (under `[Unreleased]`), `AGENTS.md`, `.github/copilot-instructions.md`
- `docs/ABOUT.md`, `docs/FAQ.md`, `docs/REPOSITORY_TREE.md`, `docs/THEME_SYSTEM.md`, `SECURITY.md`, `docs/RELEASE/release.md`, `docs/LEGAL.md`
- `docs/RESEARCH_PROVIDERS.md`, `docs/JINA_PROVIDER.md`, `docs/PUBLIC_PROFILE_DISCOVERY.md` (research changes)
- `docs/THEME_SYSTEM.md` (theming changes)
- `docs/TODO.md` (audit/fix tracking)

---

## Known Gotchas

- `app.entry` writes a static `vite` import at top level → removed in 1.0.3 (C-004); vite is now dynamically imported in dev only. Don't reintroduce.
- `venice:streamChat` must generate a `signalId` if undefined, or delta routing silently breaks (C-002 fix).
- `safeSendToRenderer()` must wrap every IPC send during streaming — closing renderer mid-stream otherwise crashes the main process (C-003).
- Streaming uses `createTimeoutSignal()` (not `AbortSignal.timeout` / `AbortSignal.any`) for older browser compat.
- `indexedDB` exports to `release/`, `dist/`, `dist-electron/`, `coverage/` are gitignored. Build icons under `build/icon.{ico,icns,png}` are tracked; everything else in `build/` is ignored.
- Web-mode `.env` is read at startup; `NODE_ENV=production` is required for `npm start` (use `scripts/start-production.cjs`).
- `npm test` excludes `server.ts` from coverage (see `vitest.config.ts` exclude list); integration coverage for the proxy is via `server.test.ts` only.
