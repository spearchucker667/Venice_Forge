# Venice Forge — Agent Guide

> Human contributors: start with [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md).
> Optional local-only agent scratch files may exist at `docs/AGENTS/AGENTS.md`
> and `docs/AGENTS/agent-reinitialization.md`. They are gitignored and are
> not part of the committed source of truth.

**Version:** 2.1.2 | **Stack:** React 19 + TS strict, Electron 42, Express 4, Vitest 4 | **Node:** 22.13+, npm 10+

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
   `docs/audits/repository-todo-roadmap-current.md`. Treat this as a
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

Equivalent instructions are also present in
`.github/copilot-instructions.md`, `CLAUDE.md`, `GEMINI.md`,
`.cursorrules`, and `.windsurfrules` so that the rule is
observed regardless of which agent surface is in use.
The `verify:agent-docs` contract enforces this parity.

---

## Commands

### Development
```bash
npm run dev:electron   # Desktop app (recommended; runs tsc for electron/ first)
npm run dev            # Concurrent server + Vite (recommended for web dev)
npm run dev:server     # Express proxy only (tsx server.ts)
npm run dev:web        # Vite only (renderer HMR)
```

**Invariant:** `dev:web` must be exactly `"vite"` (never `"npm run dev"` or a server-only command). Enforced by `package-scripts.test.ts`.

### Validation order (required before PR)
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

### Single test, single file
```bash
npx vitest run src/services/foo.test.ts
npx vitest run server.test.ts -t "test name"
npx vitest run tests/smoke/electron-smoke.test.ts   # via npm run smoke:electron
```

### Segmented test scripts
```bash
npm run test:server     # server.test.ts (Express proxy)
npm run test:electron   # electron/**/*.test.ts (main / IPC / services)
npm run test:ingestion  # src/services/ingestion/*.test.ts
npm run test:ui         # src/components/**/*.test.{ts,tsx} + tests/accessibility
npm run test:unit       # remaining src/tests/scripts unit tests (catch-all excludes)
npm run test:ci         # full suite with v8 coverage (used by CI/release workflows)
```
The union of `test:server`, `test:electron`, `test:ingestion`, `test:ui`, and `test:unit` covers every test file except `tests/smoke/electron-smoke.test.ts`, which is handled by `npm run smoke:electron`.

### Packaging
```bash
npm run dist:win         # NSIS + portable
npm run dist:mac         # DMG + ZIP (both archs)
npm run dist:mac:arm64   # Apple Silicon only
npm run dist:mac:x64      # Intel only
npm run checksum:release  # SHA-256 after packaging
# Linux (CI only in release.yml build-linux job; local requires Linux + electron-builder --linux)
```

### Misc
```bash
npm run build:electron   # Only electron main/preload → dist-electron/
npm run build:web        # Only renderer → dist/ (sets ELECTRON_BUILD=true)
npm run build:server     # Only proxy → dist/server.cjs
npm run smoke:electron   # tests/smoke/electron-smoke.test.ts (Playwright; skipped when no display)
npm run test:coverage    # v8 coverage; current enforced thresholds branches 61 / functions 68 / lines 73 / statements 70 (long-term target 70/80/80/80)
npm run test:ci          # full suite with v8 coverage (CI/release gate)
npm run profile:media-studio # Isolated Electron profile with 1,000 encrypted media records
npm run verify:dist      # Build outputs only; does not require release/
npm run verify:build-output  # Alias of verify:dist (semantically clearer name)
npm run verify:dist:win  # Windows artifacts (NSIS + portable)
npm run verify:dist:mac  # macOS artifacts (DMG + ZIP, both archs)
npm run verify:dist:linux  # Linux artifacts (AppImage + .deb + .rpm)
npm run verify:dist:portable  # Windows portable only
npm run verify:dist:release  # All three platforms in one run
npm run clean            # Remove dist/ dist-electron/ release/
```

---

## Architecture

**Two transports, one renderer.** `isElectron()` in `src/services/desktopBridge.ts` selects:
- **Electron:** renderer → `window.veniceForge` (contextBridge) → IPC → main process → `api.venice.ai` (key in `safeStorage`)
- **Web:** renderer → `fetch('/api/venice/...')` via Express proxy → `api.venice.ai` (key in `.env`)

**Single Venice entry point.** All HTTP calls go through `veniceFetch()` / `veniceStreamChat()` in `src/services/veniceClient.ts`. Modules must not `fetch('/api/venice/...')` directly and must not call `window.veniceForge.*` directly — use `src/services/desktopBridge.ts` instead.

**Canonical tab registry.** `src/config/tabs.ts` is the single source of truth for the `Tab` type, the visible tab order (`CANONICAL_TAB_ORDER`), the sidebar groups, the keyboard-shortcut numbering, and the legacy alias table. `useSettingsStore` v2→v3 migrates legacy `activeTab` values (e.g. `gallery` → `media`) so persisted user state from earlier builds continues to resolve. Add a new tab by adding a `TabId` literal to `TAB_IDS`, an entry to `TAB_REGISTRY`, and a view to `App.tsx`'s `views` map. Aliases are deprecated and preserved only for back-compat.

**Model-aware recipe contract (Phase 2A).** `src/config/image-model-capabilities.ts` is the single source of truth for which image model supports which fields. The registry exports `getImageModelCapabilities`, `buildDimensionOptions`, `isDimensionSupported`, `normalizeDimensionsForModel`, `getUnsupportedRecipeFields`, and `getRecipeCapabilityList`. `src/types/project.ts` adds `getRecipeCompatibilityReport(recipe, caps, modelIsKnown)` which returns `{ status: 'compatible' | 'partial' | 'incompatible', issues, sanitizedRecipe, unsupportedFields }`. The Image Studio (`src/components/image/image-view.tsx`) reads the live capability contract and (a) hides controls the model does not support, (b) shows a small "Capabilities" line, and (c) passes per-field `supports*` flags into `buildImagePayload` so the network boundary drops `negative_prompt` / `style_preset` / `steps` / `cfg_scale` / `seed` when the model does not accept them. The Media Inspector (`src/components/gallery/media-inspector.tsx`) renders the `RecipeCompatibilityCard` (status + issues + use-with-current-model + use-original + show/hide comparison) and an "Export recipe" button alongside the existing "Copy recipe" action. The `verify:model-aware-recipes` audit script (`scripts/verify-model-aware-recipes.cjs`) is part of the `verify:workspace-contracts` parity. See `VERIFY-043`.

**Media Studio power tools (Phase 2B).** `src/stores/media-selection-store.ts` is a Zustand store that lifts multi-select state out of `gallery-view.tsx` so the Command Palette, compare mode, and bulk actions can read and mutate the selection without prop-drilling. The store caps selection at `MEDIA_SELECTION_MAX = 4` and exposes `setVisibleMediaIds(ids)` + `reconcileWithVisible()` so the Command Palette can run "Select all visible media" without knowing the filtered list shape. `src/stores/media-bulk-actions.ts` wraps the existing media-store actions in a uniform `BulkMediaActionResult` contract that surfaces partial failures (unknown / archived project ids, missing media records). `src/stores/media-send-to.ts` routes Image Studio / Image Tools / Chat / Video Studio through the canonical Zustand stores + `useImageWorkspaceStore` handoffs; copy helpers (prompt / negative / seed / model) use a safe clipboard shim with the `document.execCommand("copy")` fallback. `src/stores/media-export-bundle.ts` builds a safe export manifest + sidecar JSON that strips api keys / tokens / `exportedPathToken` / raw image bytes / circular references. `src/components/gallery/compare-view.tsx` renders a 2-4 item side-by-side field diff (same / different / missing) and refuses out-of-range input. `src/components/gallery/lineage-viewer.tsx` walks the existing `parentId` / `childrenIds` graph with cycle detection and missing-record handling. The Command Palette (`src/components/command-palette/CommandPalette.tsx`) renders 8 selection-aware Media Studio commands only when the gallery-view has registered handlers via `src/stores/media-command-handlers.ts`. The `verify:media-studio-power-tools` audit script (`scripts/verify-media-studio-power-tools.cjs`) is wired into the `ci` parity command. See `VERIFY-044`.

**Header Status Cluster + Diagnostics (Phase 2C).** `src/types/status.ts` defines the canonical `StatusSeverity` union (`ok | warn | error | unknown`), `AppStatusItem`, `AppStatusSnapshot` (api / apiKey / model / storage / project / safety / provider / desktop / diagnostics), and the versioned, JSON-serialisable `SafeDiagnosticsSnapshot` (no API keys, no bearer tokens, no raw prompts, no base64 blobs, no full local absolute paths). `src/services/diagnosticsService.ts` exposes `computeAppStatusSnapshot()` (worst-of aggregation via `pickWorst`), `computeSafeDiagnosticsSnapshot()` (rebuilds the safe redacted snapshot from store state), and `serialiseSafeDiagnosticsSnapshot()`. `src/stores/status-store.ts` is a thin Zustand store: `recompute` rebuilds the snapshot; `refresh` awaits `useAuthStore.checkConfiguration()` and is non-overlapping via the `isRefreshing` guard; `openDrawer(key) / closeDrawer / setFocusedSection(key)` are the only UI mutators. `src/components/status/HeaderStatusCluster.tsx` renders 8 indicators in the header, each a `<button>` that calls `useStatusStore.openDrawer(key)`. `src/components/status/StatusIndicator.tsx` maps each severity to a tone class, `data-severity` attribute, and `aria-label`. `src/components/status/DiagnosticsDrawer.tsx` mounts in `App.tsx` and renders 10 sections (Overview + 8 status categories + Repair) with per-section canonical actions (Open Config / Open Status / Refresh Models) routed through `useSettingsStore.setActiveTab()` with the `isTabId()` guard. The "Copy Safe Diagnostics" button serialises the safe snapshot only — never the raw `status` object. The Repair section is read-only. The `verify:status-diagnostics` audit script (`scripts/verify-status-diagnostics.cjs`) is wired into the `ci` parity command. See `VERIFY-045`.

**Dual TypeScript build pipelines:**
- Renderer (`src/`): Vite, `tsconfig.json` (ESNext, `noEmit`, `bundler` resolution)
- Electron main (`electron/`): `tsc --project tsconfig.electron.json` → CommonJS → `dist-electron/`; then `scripts/create-cjs-package.cjs` copies `package.json` as CJS

**State:** Zustand 5 slice stores. Core app state lives in `auth`, `chat`, `playground`, `settings`, `toast`, `workflow`, and `status`. Content libraries are managed by `media`, `project`, `prompt-library`, `scene-composer`, `scenario`, `character-card`, `character`, `persona`, `lorebook`, `rp-chat`, `scene-asset`, `workflow-template`, and `image-workspace`. Support/utility stores include `storage-privacy`, `research`, `media-selection`, `inspector`, and `config`. Reducer-based state has been fully migrated to lightweight slice stores; side effects live in services/modules.

**Prompt Library Foundation (Phase 2D).** `src/types/prompt-library.ts` defines the canonical `PromptKind` union (chat / system / image / negative / research / character / workflow / recipe / general), `PromptScope` (global / project), `PromptVersion` (append-only per-prompt version chain), `PromptLibraryItem` (id, currentVersionId, versions, scope, projectId, tags, favorite, archivedAt, modelHints, variables), and the JSON-serialisable `PromptLibraryExport` envelope. The `sanitizePromptLibraryItem` and `sanitizePromptVersion` helpers reject / redact `sk-…` / `venice_…` / `Bearer …` / `Authorization:` payloads and cap every field so a corrupt record cannot inflate the storage budget. `isPromptSecretLike` and `redactPromptSecrets` are the canonical secret-detection helpers used by the save / import / export paths. `src/stores/prompt-library-store.ts` is a thin Zustand store: `ensureLoaded` hydrates from the `promptLibrary` IndexedDB store (added by `dbMigrations` toVersion 8 and registered in `STORE_NAMES` / `ENCRYPTED_STORES`), `createPrompt` / `updatePrompt` / `addPromptVersion` / `setCurrentVersion` / `archivePrompt` / `unarchivePrompt` / `deletePrompt` / `toggleFavorite` mutate + persist atomically, and `importPrompts` / `exportPrompts` round-trip through the safe envelope. `src/components/prompts/PromptLibraryView.tsx` is mounted in `App.tsx` for the canonical `prompts` tab and lists / edits / versions / archives / deletes prompts with a confirm-gated delete flow. The Image Studio and Media Inspector expose "Save to Prompt Library" actions on the prompt / negative prompt / recipe fields; the Command Palette renders a Prompt Library section (Open / New / Use Selected / Export / Import) routed through the canonical tab registry. The `verify:prompt-library` audit script (`scripts/verify-prompt-library.cjs`) is wired into the `ci` parity command. See `VERIFY-046`.

**Scene Composer Foundation (Phase 2E).** `src/types/scene.ts` defines the canonical `SceneComponentKind` union (subject / character / location / mood / style / camera / lighting / composition / negative / note), `SceneComponent` (kind, title, content, enabled), `SceneMediaRef`, `ScenePromptRef`, `SceneVersion` (append-only version chain with components + mediaRefs + promptRefs), `SceneComposerItem` (id, scope, projectId, currentVersionId, versions, defaultModel, defaultWidth, defaultHeight, defaultAspectRatio, outputMediaIds, tags, favorite, archivedAt), and the JSON-serialisable scene export envelope. The `sanitizeSceneComposerItem`, `sanitizeSceneVersion`, and `sanitizeSceneComponent` helpers reject / redact `sk-…` / `venice_…` / `Bearer …` / `Authorization:` payloads and cap every field. `isSecretLike` and `redactSecrets` are the canonical secret-detection helpers. `src/stores/scene-composer-store.ts` is a thin Zustand store: `ensureLoaded` hydrates from the `scenes` IndexedDB store (added by `dbMigrations` toVersion 9 and registered in `STORE_NAMES` / `ENCRYPTED_STORES`), `createScene` / `updateScene` / `addSceneVersion` / `setCurrentVersion` / `archiveScene` / `unarchiveScene` / `deleteScene` / `toggleFavorite` / `addOutputMedia` / `removeOutputMedia` mutate + persist atomically, and `importScenes` / `exportScenes` round-trip through the safe envelope. `src/services/sceneCompiler.ts` exports `compileSceneToRecipe` which combines components in canonical order (subject→character→location→mood→style→camera→lighting→composition→note), extracts negative/style, maps defaults, and outputs `GenerationRecipe`. `src/components/scenes/SceneComposerView.tsx` is mounted in `App.tsx` for the canonical `scenes` tab with a split layout (list + detail), component grid, version history, compile+send-to-image-studio, copy-recipe, and confirm-gated delete. The sidebar registers a `SceneIcon` for the `scenes` tab; the Command Palette renders a Scene Composer section (Open Scene Composer / Export Scenes / Import Scenes). The `verify:scene-composer` audit script (`scripts/verify-scene-composer.cjs`) is wired into the `ci` parity command. See `VERIFY-047`.

**RP Studio Polish (Phase 2F).** `src/types/rp.ts` defines the canonical `CharacterCardV1`, `LorebookV1`, `PersonaV1`, and `ScenarioV1` models with associated normalization and secret-redaction helpers. The `rpScenarios` store is a dedicated IndexedDB store (toVersion 10, encrypted) for scenario persistence. `src/stores/scenario-store.ts` provides the Zustand interface for scenarios. `src/services/rpPromptCompiler.ts` is the central engine for building RP prompts from the constituent parts. `src/components/rp-studio/CharacterEditor.tsx` adds a "Workflow" section for linking characters to scenes, prompts, and starting chats or creating scenarios. The Command Palette adds an RP Studio section for common tasks. The `verify:rp-studio-polish` audit script (`scripts/verify-rp-studio-polish.cjs`) is wired into the `ci` parity command. See `VERIFY-048`.

**Local Family Safe Mode runtime snapshot:** The main-process `runtimeSafetySettings` module holds the canonical enabled/disabled state. Every Venice-touching IPC handler must route through `performGuardedVeniceRequest` / `checkLocalFamilyGuard` in `electron/services/guardPipeline.ts`; the renderer-supplied `localFamilySafeModeEnabled` field on `VeniceIpcRequest` is no longer trusted (kept on the type for back-compat but ignored). The 451 block shape (`{ ok: false, status: 451, body: { error, reasonCode, category, severity } }`) is canonical across all entry points. The web proxy defaults Local Family Safe Mode to ON, ignoring the client-sent `X-Venice-Forge-Family-Safe-Mode` header unless the server-side environment variable `VENICE_FORGE_ALLOW_CLIENT_SAFETY_OVERRIDE=true` is set. The authoritative server override is the `VENICE_FORGE_LOCAL_FAMILY_SAFE_MODE_ENABLED` environment variable. Returned body screening (`screenResponseBody`) covers Jina and scrape endpoints. See VERIFY-015 in `tests/safety/guardPipeline.test.ts`.

**Conversation persistence (dual-mode):**
- Desktop: atomic JSON files under `userData/chat-history/` (temp + rename)
- Web: encrypted IndexedDB `conversations` store
- Legacy flat `chats` auto-migrate on first load — **additive only, never destructive**
- Conversation IDs must pass `VALID_ID_RE = /^[a-zA-Z0-9_.-]{1,128}$/` in main-process storage

**Theme system:** Token-based CSS variables + Tailwind v4 `@theme`. Built-in themes in `src/theme/themes.ts` and configured under `config/themes/`; user themes in ThemeMaker UI supporting full semantic YAML import/export; bootstrap cache in `localStorage` prevents FOUC. The 29-role canonical semantic contract is normalized from legacy themes and locked by `VERIFY-041`, including WCAG AA foreground/background pairs for Forge Dracula.

---

## Testing

- **Vitest 4**, jsdom by default. Add `// @vitest-environment node` at the top of any server/IPC/main-process test (e.g., `server.test.ts`, `electron/**/*.test.ts`).
- **Serial execution** (`--fileParallelism=false`): tests touching IndexedDB or global state must not run in parallel.
- Tests live next to source: `src/services/foo.ts` → `src/services/foo.test.ts`. Server test is `server.test.ts` at root.
- Regression guards: `// BUG-NNN regression guard` (or `// VERIFY-NNN`) comment in tests that would have caught a fixed bug.
- Node-level tests (rate-limiting, etc.): create fresh `app` in `beforeEach`, not `beforeAll`, to isolate state.
- Coverage thresholds in `vitest.config.ts`: current enforced baseline is branches 61%, functions 68%, lines 73%, statements 70%. The long-term target remains 70% branches and 80% functions/lines/statements.

### Named regression guards (VERIFY-NNN)

Regression-sensitive surfaces are protected by named regression guards. Each
guard fails CI if a future change weakens the protection. When adding a
new guard, append it to the list below and reference the ID in the
test's comment header.

The primary active sequence is `VERIFY-001` through `VERIFY-066`.
`VERIFY-168` is an intentional legacy bridge for the older T-168 storage
privacy redaction finding and is allowlisted by `verify:repo-handoff-hygiene`;
do not add new out-of-sequence IDs without updating that verifier and this
registry.

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
| `VERIFY-030` | `server.ts` accepts `/characters` and `/characters/{slug}` (canonical `isAllowedVeniceRequest` predicate is the single source of truth, replacing the static allowlist duplicate check). Nested paths return 403, non-GET returns 405, valid GETs reach the upstream proxy. | `server.test.ts` |
| `VERIFY-031` | `veniceBlob` and `veniceFormData` forward the `AbortSignal` to `desktopVenice.request()` (extension of VERIFY-006) — the IPC layer's `venice:abort` channel is triggered when the caller cancels. | `src/lib/venice-client.test.ts` |
| `VERIFY-032` | `useMediaStore.loadById(id)` fetches a single record from IDB, migrates it through `migrateGalleryImageToMediaItem`, and merges it into the in-memory cache so the gallery inspector can resolve parent/children that live on a different page. | `src/stores/media-store.test.ts` |
| `VERIFY-033` | (Retired) — original guard covered the deprecated MiniMax forward-compat scaffold (`LlmProvider` / `PROVIDER_CAPABILITIES` / `capabilitiesFor()`); the scaffold was removed wholesale in the 2026-06-06 "Venice + Jina only" scope correction. The numeric slot is reserved to keep the regression-guard sequence stable. | — |
| `VERIFY-034` | `scripts/verify-markdown-links.cjs` (and the `verifyMarkdownLinks()` exported helper) skip link targets that are matched by a pattern in the root `.gitignore` — both for the scan root and for the destination of in-doc links. This is the regression guard for the 2026-06-06 CI failure where `docs/AGENTS/AGENTS.md` and `docs/AGENTS/agent-reinitialization.md` are gitignored local-only handoff notes that never exist in CI. | `scripts/verify-markdown-links.test.ts` |
| `VERIFY-035` | Media Studio dangling-reference recovery — the gallery inspector surfaces a one-click "Missing references" section when a `parentId` or any `childrenIds` entry refers to a record the IDB has confirmed absent, instead of silently hiding the parent block. "Clear parent link" calls `patchMedia` with `{ parentId: null }`; "Clear N missing refs" calls `patchMedia` with the filtered `childrenIds`. | `src/components/gallery/gallery-view.test.tsx` |
| `VERIFY-036` | Packaged Electron startup loads `dist/index.html` in place so relative assets resolve, with a compatible self-hosted-script CSP and no mismatched runtime nonce/temp-file path. | `tests/electron/productionStartupInvariant.test.ts` |
| `VERIFY-037` | OS-secure configured state enables Venice UI actions without copying the persisted key into renderer memory. | `src/stores/auth-store.test.ts` |
| `VERIFY-038` | Web-mode Jina keys remain ephemeral and never enter `localStorage`, `sessionStorage`, or IndexedDB. | `src/services/desktopBridge.test.ts` |
| `VERIFY-039` | Jina proxy responses are capped at 2 MiB in both Express and Electron IPC, with stream cancellation and normalized 413 failures. | `server.test.ts`, `electron/ipc/handlers.test.ts` |
| `VERIFY-040` | Production-safe Media Studio handoff and image sizing — queued regenerate/remix drafts apply before generation, aspect-resolution models emit only `aspect_ratio` + `resolution`, derivatives preserve parent/child lineage, and image-tools handoffs persist the correct operation. | `src/components/image/image-view.test.tsx`, `src/components/gallery/gallery-view.test.tsx`, `src/components/image/image-tools.test.tsx`, `src/stores/media-store.test.ts` |
| `VERIFY-041` | Complete semantic theme contract — all built-ins expose 29 canonical roles, Forge Dracula foreground/background pairs meet WCAG AA, runtime CSS variables are complete, and ThemeMaker YAML round-trips snake_case semantic tokens while accepting legacy palettes. | `src/theme/contrast.test.ts`, `src/theme/applyTheme.test.ts`, `src/components/ThemeMaker.test.ts`, `src/config/configSchema.test.ts` |
| `VERIFY-042` | Phase 1 workspace contracts — All Projects is a persisted nullable selection; active IDs are validated; referenced projects are archive-only; GenerationRecipe extraction/sanitization/handoff is non-mutating; only explicit generated saves inherit the active project; project gallery filters are exact; mounted Command Palette shortcuts/routing/actions are real and recipe placeholders are absent. | `src/types/project.test.ts`, `src/stores/project-store.test.ts`, `src/stores/chat-store.character.test.ts`, `src/stores/media-store.test.ts`, `src/components/layout/sidebar.test.tsx`, `src/components/command-palette/CommandPalette.test.tsx`, `src/components/gallery/gallery-view.test.tsx`, `src/components/image/image-view.test.tsx` |
| `VERIFY-043` | Phase 2A model-aware recipes — capability helpers (`isDimensionSupported`, `normalizeDimensionsForModel`, `getUnsupportedRecipeFields`, `getRecipeCapabilityList`) exist on the registry; `getRecipeCompatibilityReport` returns `compatible`/`partial`/`incompatible` with structured issues + sanitized recipe; `buildImagePayload` honours per-capability `supports*` flags end-to-end; image-view hides negative/seed/style/steps controls and surfaces a capability summary; media-inspector renders the `RecipeCompatibilityCard` with use-with-current-model/use-original/copy/export/compare actions; media-store `filterMedia` recognises `has-recipe`/`no-recipe`/`has-seed`; `verify:model-aware-recipes` audit passes. | `src/config/image-model-capabilities.test.ts`, `src/types/project.test.ts`, `src/utils/payloadBuilders.modelAware.test.ts`, `src/components/image/image-view.test.tsx`, `src/components/gallery/recipe-compatibility-card.test.tsx`, `src/components/gallery/recipe-comparison.test.tsx`, `src/components/gallery/media-inspector.test.tsx`, `src/stores/media-store.test.ts`, `scripts/verify-model-aware-recipes.cjs` |
| `VERIFY-044` | Phase 2B Media Studio power tools — `media-selection-store` exposes `selectMedia`/`toggleMedia`/`selectRange`/`selectAllVisible`/`reconcileWithVisible`/`isCompareReady`/`setVisibleMediaIds` with `MEDIA_SELECTION_MAX=4`; `media-bulk-actions` reports per-id `BulkMediaActionResult` for favorite / tag / project assignment / delete with confirm gate; `compare-view` renders a 2-4 item side-by-side diff and rejects out-of-range input; `lineage-viewer` walks parent/children with cycle + missing-parent detection; `media-send-to` routes Image Studio / Image Tools / Chat / Video through the canonical stores with no payload secrets; `media-export-bundle` strips api keys / tokens / path tokens / blobs and validates re-import; media-store adds `no-seed`/`no-project` filters and `project`/`has-recipe`/`has-seed` sorts; the Command Palette renders the selection-aware Media section (8 commands) only when the gallery-view has registered handlers; `verify:media-studio-power-tools` audit passes. | `src/stores/media-selection-store.test.ts`, `src/stores/media-bulk-actions.test.ts`, `src/stores/media-send-to.test.ts`, `src/stores/media-export-bundle.test.ts`, `src/components/gallery/compare-view.test.tsx`, `src/components/gallery/lineage-viewer.test.tsx`, `src/components/command-palette/CommandPalette.test.tsx`, `src/stores/media-store.test.ts`, `scripts/verify-media-studio-power-tools.cjs` |
| `VERIFY-045` | Phase 2C Header Status Cluster + Diagnostics Polish — `src/types/status.ts` exports `StatusSeverity` (exhaustive union), `AppStatusItem`, `AppStatusSnapshot` (api / apiKey / model / storage / project / safety / provider / desktop / diagnostics), and `SafeDiagnosticsSnapshot` (versioned, JSON-serialisable, no secrets); `src/services/diagnosticsService.ts` exports `computeAppStatusSnapshot` (worst-of aggregation via `pickWorst`), `computeSafeDiagnosticsSnapshot` (rebuilds the safe redacted snapshot from store state), and `serialiseSafeDiagnosticsSnapshot`; `src/stores/status-store.ts` exposes the canonical `recompute` / `refresh` (non-overlapping via `isRefreshing`) / `openDrawer` / `closeDrawer` / `setFocusedSection` actions; `HeaderStatusCluster` renders 8 indicators in the header, each a `<button>` that opens the drawer with a focused section; `StatusIndicator` exposes per-severity tone class + `data-severity` + `aria-label`; `DiagnosticsDrawer` mounts in `App.tsx` with 10 sections, per-section canonical actions (Open Config / Open Status / Refresh Models) routed through `useSettingsStore.setActiveTab` with `isTabId()` guard, web-mode caveat, read-only Repair section; the "Copy Safe Diagnostics" action serialises the safe snapshot only and never includes the raw `status` object; `toast.warn()` variant exists. | `src/services/diagnosticsService.test.ts`, `src/stores/status-store.test.ts`, `src/components/status/StatusIndicator.test.tsx`, `src/components/status/HeaderStatusCluster.test.tsx`, `src/components/status/DiagnosticsDrawer.test.tsx`, `scripts/verify-status-diagnostics.cjs` |
| `VERIFY-046` | Phase 2D Prompt Library Foundation — `src/types/prompt-library.ts` exports `PromptKind` (exhaustive union), `PromptScope`, `PromptVersion`, `PromptLibraryItem`, `PromptLibraryExport`, `sanitizePromptLibraryItem`, `sanitizePromptVersion`, `exportPromptLibraryItems`, `parsePromptLibraryImport`, `isPromptSecretLike`, `redactPromptSecrets`, and the snapshot version constant; the `promptLibrary` store is added to `STORE_NAMES`, `ENCRYPTED_STORES`, and `dbMigrations` (toVersion 8) without deleting any prior data; `src/stores/prompt-library-store.ts` exposes the canonical `ensureLoaded` / `createPrompt` / `updatePrompt` / `addPromptVersion` / `setCurrentVersion` / `archivePrompt` / `deletePrompt` / `toggleFavorite` / `importPrompts` / `exportPrompts` actions; `src/components/prompts/PromptLibraryView.tsx` is mounted in `App.tsx` for the canonical `prompts` tab; the Image Studio and Media Inspector expose "Save to Prompt Library" actions on the prompt / negative prompt / recipe fields; the Command Palette renders the Prompt Library section (Open / New / Use / Export / Import) routed through the canonical tab registry; the export envelope (`{ version: 1, app, exportedAt, prompts: [] }`) skips records with secret-like content, the import path regenerates ids and rejects future versions, and the secret-leak heuristic blocks `sk-…` / `venice_…` / `Bearer …` / `Authorization:` payloads before they ever reach storage. | `src/types/prompt-library.test.ts`, `src/stores/prompt-library-store.test.ts`, `src/components/prompts/PromptLibraryView.test.tsx`, `scripts/verify-prompt-library.cjs` |
| `VERIFY-047` | Phase 2E Scene Composer Foundation — `src/types/scene.ts` exports `SceneComposerItem`, `SceneVersion`, `SceneComponent`, `SceneComponentKind`, `SceneMediaRef`, `ScenePromptRef`, `sanitizeSceneComposerItem`, `sanitizeSceneVersion`, `sanitizeSceneComponent`, `createSceneComposerItem`, `createSceneVersion`, `createSceneComponent`, `exportSceneComposerItems`, `parseSceneComposerImport`, `isSecretLike`, `redactSecrets`, and `SCENE_COMPOSER_VERSION`; the `scenes` store is added to `STORE_NAMES`, `ENCRYPTED_STORES`, and `dbMigrations` (toVersion 9) without deleting any prior data; `src/stores/scene-composer-store.ts` exposes the canonical `ensureLoaded` / `createScene` / `updateScene` / `addSceneVersion` / `setCurrentVersion` / `archiveScene` / `unarchiveScene` / `deleteScene` / `toggleFavorite` / `addOutputMedia` / `removeOutputMedia` / `importScenes` / `exportScenes` / `getScene` / `getCurrentVersion` actions; `src/services/sceneCompiler.ts` exports `compileSceneToRecipe` which combines components in canonical order (subject→character→location→mood→style→camera→lighting→composition→note), extracts negative/style, maps defaults, and outputs `GenerationRecipe`; `src/components/scenes/SceneComposerView.tsx` is mounted in `App.tsx` for the canonical `scenes` tab with split layout (list + detail), component grid, version history, compile+send-to-image-studio, copy-recipe, and confirm-gated delete; the sidebar registers a `SceneIcon` for the `scenes` tab; the Command Palette renders a Scene Composer section (Open Scene Composer / Export Scenes / Import Scenes); the `verify:scene-composer` audit script (`scripts/verify-scene-composer.cjs`) is wired into the `ci` parity command. | `src/types/scene.test.ts`, `src/stores/scene-composer-store.test.ts`, `src/services/sceneCompiler.test.ts`, `src/components/scenes/SceneComposerView.test.tsx`, `scripts/verify-scene-composer.cjs` |
| `VERIFY-048` | Phase 2F RP Studio Polish — `src/types/rp.ts` exports `CharacterCardV1`, `LorebookV1`, `PersonaV1`, `ScenarioV1`, `normalizeScenario`, `normalizeCharacter`, `normalizeLorebook`, `normalizePersona`, `isSecretLike`, `redactSecrets`, and the snapshot version constants; the `rpScenarios` store is added to `STORE_NAMES`, `ENCRYPTED_STORES`, and `dbMigrations` (toVersion 10) without deleting any prior data; `src/stores/scenario-store.ts` exposes the canonical `load` / `createBlank` / `upsert` / `remove` / `importScenarios` / `exportScenarios` actions; `src/services/rpPromptCompiler.ts` exports `compileRpPromptStack` which gathers persona, character, scenario, and lorebook entries into a single prompt string while respecting safety guards; `src/components/rp-studio/CharacterEditor.tsx` implements the workflow section (Save to Library, Attach Scene/Prompt, Start Chat, Create Scenario); the Command Palette renders an RP Studio section (Open / New Character / Start Chat / New Scenario); the `verify:rp-studio-polish` audit script (`scripts/verify-rp-studio-polish.cjs`) is wired into the `ci` parity command. | `src/stores/scenario-store.test.ts`, `src/stores/character-card-store.test.ts`, `src/services/characterCardImportExport.test.ts`, `src/services/rpPromptCompiler.test.ts`, `src/components/rp-studio/CharacterEditor.test.tsx`, `src/components/command-palette/CommandPalette.test.tsx`, `scripts/verify-rp-studio-polish.cjs` |
| `VERIFY-049` | Phase 2G Workflow Templates — `src/types/workflow.ts` exports `WorkflowTemplateItem`, `WorkflowVersion`, `WorkflowStep`, `sanitizeWorkflowTemplateItem`, `sanitizeWorkflowVersion`, `sanitizeWorkflowStep`, `exportWorkflowTemplateItems`, `parseWorkflowTemplateImport`, `isPromptSecretLike`, `redactPromptSecrets`, and `WORKFLOW_TEMPLATE_VERSION`; the `workflowTemplates` store is added to `STORE_NAMES`, `ENCRYPTED_STORES`, and `dbMigrations` (toVersion 11); `src/stores/workflow-template-store.ts` exposes the canonical `ensureWorkflowTemplatesLoaded` / `createWorkflow` / `updateWorkflow` / `addWorkflowVersion` / `setCurrentVersion` / `archiveWorkflow` / `unarchiveWorkflow` / `deleteWorkflow` / `addStep` / `updateStep` / `removeStep` / `reorderSteps` / `importWorkflows` / `exportWorkflows` actions; `src/services/workflowCompiler.ts` exports `compileWorkflowTemplate` which maps steps to a `WorkflowCompileResult` and aggregate warnings; `src/services/workflowRunner.ts` exports `createWorkflowRunPlan` which converts a compiled workflow into executable UI actions (`open_tab`, `handoff_prompt`, etc.); `src/components/workflows/workflows-view.tsx` (`WorkflowsView`) is mounted in `App.tsx` for the canonical `workflows` tab as the visual ReactFlow workflow editor; `PromptLibraryView.tsx`, `SceneComposerView.tsx`, and `CharacterEditor.tsx` integrate "Create Workflow" actions; the `verify:workflow-templates` audit script (`scripts/verify-workflow-templates.cjs`) is wired into the `ci` parity command. | `src/types/workflow.test.ts`, `src/stores/workflow-template-store.test.ts`, `src/services/workflowCompiler.test.ts`, `src/services/workflowRunner.test.ts`, `src/components/workflows/workflows-view.test.tsx`, `scripts/verify-workflow-templates.cjs` |
| `VERIFY-050` | Phase 2H Storage / Privacy Dashboard Hardening — `src/types/storage-privacy.ts` exports `StorageStoreInventoryItem`, `SafePrivacySummary`, and `StorageMaintenancePlan` models; `src/services/storagePrivacyService.ts` exports `buildStorageInventory` and `buildSafePrivacySummary` which audit stores for counts, encryption status, and secret-leak boundaries; `src/services/storageMaintenance.ts` exports `createStorageMaintenancePlan` and `applyMaintenanceAction` for non-destructive maintenance (refresh, copy summary, clear model cache) and dry-run orphans analysis; `src/stores/storage-privacy-store.ts` orchestrates cross-store inventory collection and maintenance execution; `src/components/privacy/StoragePrivacyDashboard.tsx` is mounted in `App.tsx` for the canonical `privacy` tab with inventory cards, detailed flags table, and maintenance plan UI; `CommandPalette.tsx` integrates Phase 2H management actions; `SafeDiagnosticsSnapshot` in `src/types/status.ts` and `src/services/diagnosticsService.ts` extended with privacy exclusions and store counts; `scripts/verify-storage-privacy.cjs` integrated for CI parity. | `src/types/storage-privacy.test.ts`, `src/services/storagePrivacyService.test.ts`, `src/services/storageMaintenance.test.ts`, `src/stores/storage-privacy-store.test.ts`, `src/components/privacy/StoragePrivacyDashboard.test.tsx`, `scripts/verify-storage-privacy.cjs` |
| `VERIFY-051` | Phase 2I Research Workspace Polish — `src/types/research.ts` exports `ResearchSession`, `ResearchSource`, `ResearchFinding`, and `ResearchCitation` models with safe sanitization and secret-redaction; `researchSessions` store is added to `STORE_NAMES`, `ENCRYPTED_STORES`, and `dbMigrations` (toVersion 12); `src/stores/research-store.ts` manages persistent sessions with CRUD, project scoping, and safe import/export; `src/services/researchService.ts` wraps existing providers with URL safety and normalization; `src/services/researchSummaries.ts` builds citation-preserving summaries; `src/components/research/ResearchWorkspaceView.tsx` implements the workspace UI (list, search, scrape, findings, summary) under the canonical `search` tab via `SearchScrapeView` wrapper; `CommandPalette.tsx` integrates research actions; `SafeDiagnosticsSnapshot` extended with research session counts; `verify:research-workspace` audit script integrated for CI parity. | `src/types/research.test.ts`, `src/stores/research-store.test.ts`, `src/services/researchService.test.ts`, `src/services/researchSummaries.test.ts`, `src/components/research/ResearchWorkspaceView.test.tsx`, `scripts/verify-research-workspace.cjs` |
| `VERIFY-052` | Phase 2J Release / Packaging Hardening — `scripts/verify-release-packaging-hardening.cjs` is the single-source-of-truth audit that asserts (1) the canonical `package.json` scripts (`verify:release-packaging-hardening`, `verify:archive-clean`, `verify:dist`, `verify:research-workspace`, `verify:workspace-contracts`, `checksum:release`, `lint:eslint`, `typecheck`) are present and equal to expected strings, (2) the `ci` script chain includes `verify:release-packaging-hardening` and every prior phase gate (`verify:research-workspace`), (3) `engines.node` pins Node 22, (4) `.github/workflows/ci.yml` and `.github/workflows/release.yml` both pin `node-version: 22` and run `verify:dist` + `checksum:release` + `npm run typecheck` + `npm test` + `npm run build` before packaging, (5) `electron-builder.config.cjs` declares `appId`, `directories`, `asar: true`, and excludes `.map` source maps from the packaged app, (6) `docs/RELEASE/release.md` + `docs/RELEASE/signing-and-notarization.md` + `docs/DEVELOPMENT/building.md` + `docs/DEVELOPMENT/platform-support.md` + `docs/DEVELOPMENT/troubleshooting.md` are present, (7) `.gitignore` excludes the canonical contaminants (`node_modules/`, `.node22/`, `/dist/`, `/dist-electron/`, `/release/`, `/coverage/`, `.env*` with `.env.example` allowlisted, `.config/*.yaml` with example allowlist), (8) no forbidden archive contaminants are tracked in git (delegates to `scripts/verify-archive-clean.cjs` `BAD_PATTERNS`), (9) `build/icon.{ico,icns,png}` are tracked, and (10) `README.md` references the release-readiness surface. `verify-dist.cjs` extended with `FORBIDDEN_DIST_PATTERNS` (source maps, test files, `.env`, `.config/*.local.yaml`, `*.db`, `chat-history/`, `.design-captures/`, `.integration-src/`) and `SECRET_PATTERNS` (tight regex for `venice_<40+ alnum>` / `sk-<20+ alnum>` / `Bearer <20+ chars>` that does not match internal constants like `venice_forge_traffic_logs_v1`). `verify-archive-clean.cjs` extended with Windows metadata (`.AppleDouble/`, `Thumbs.db`, `desktop.ini`), `.integration-src/`, `.vite/`, `.design-captures/`, `*.log`, `*.tmp`, `target_inventory.txt`, and explicit `.config/*.local.yaml` exclusion. `.gitignore` extended with `Thumbs.db`, `desktop.ini`, `*.tmp`. | `scripts/verify-release-packaging-hardening.test.ts`, `scripts/verify-archive-clean.test.ts`, `scripts/verify-dist.test.ts` |
| `VERIFY-053` | Phase 2J Real Venice character image resolver + desktop cache — `electron/services/characterImageCache.ts` fetches allowlisted Venice character images into `<userData>/cache/character-images/` (2 MiB/item, 100 MiB total, 7-day TTL, stale-while-revalidate, allowed content types, API-key retry on 401/403); IPC channels `app:characterImage:get` / `app:characterImage:clearCache` / `app:characterImage:inventory` route through `electron/ipc/handlers.ts` and `electron/preload.ts`; `src/services/desktopBridge.ts` exposes `desktopCharacterImage` (desktop → IPC cache; web → direct trusted URL fallback); `src/hooks/useCharacterImage.ts` resolves avatars for `src/components/CharactersView.tsx` and the active-character pill in `src/components/chat/chat-view.tsx`; `src/utils/characterImageResolver.ts` validates URLs against the 3-host SSRF allowlist and provides an optional, feature-flagged public-page metadata fallback; Storage & Privacy surfaces the cache inventory and a destructive clear action; safe diagnostics logging via `src/services/characterImageDiagnostics.ts`; renderer never receives API keys or raw upstream URLs, only `venice-character-cache://` handles or initials fallback. | `electron/services/characterImageCache.test.ts`, `src/utils/characterImageResolver.test.ts`, `src/components/CharactersView.test.tsx`, `src/services/storageMaintenance.test.ts`, `src/services/storagePrivacyService.test.ts` |
| `VERIFY-054` | Windows release signing env mapping (T-239) — `.github/workflows/release.yml` `build-windows` job must set only `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` for signing and must not map the generic/mac `CSC_LINK` / `CSC_KEY_PASSWORD` secrets into the Windows environment; `scripts/verify-release-packaging-hardening.cjs` asserts the Windows job contains neither generic signing var and contains both Windows-specific vars. | `.github/workflows/release.yml`, `scripts/verify-release-packaging-hardening.cjs`, `scripts/verify-release-packaging-hardening.test.ts` |
| `VERIFY-055` | Data & Storage export/import safe error surfacing (T-119/T-120) — `useDataStorageActions` catch blocks must toast fixed, user-facing messages (`Export failed. Please try again.` / `Import failed. Please check the file and try again.`) and must never forward raw `Error.message` text that could leak local paths, upstream errors, or secret-adjacent data. | `src/hooks/use-data-storage-actions.ts`, `src/hooks/use-data-storage-actions.test.ts` |
| `VERIFY-056` | Phase 2K Architecture, UI Polish, and Quality — Handlers are extracted (e.g. configHandlers), Storage Privacy Dashboard exposes explicit error/retry states instead of infinite loaders, Media Inspector and Embeddings viewers use the centralized copyText fallback instead of raw clipboard API, Web Crypto generates payload seeds, and image extensions match MIME types dynamically. | `electron/ipc/handlers.test.ts`, `src/stores/storage-privacy-store.test.ts`, `src/components/privacy/StoragePrivacyDashboard.test.tsx`, `src/components/gallery/media-inspector.test.tsx`, `src/utils/payloadBuilders.test.ts`, `src/components/image/image-view.test.tsx` |
| `VERIFY-057` | Phase 2I+ Research Web Expansion + Mini Browser — `electron/services/researchBrowserServer.ts` hardens the main-process WebContentsView with `setPermissionRequestHandler`, `setPermissionCheckHandler`, `webRequest.onBeforeRequest`, `will-navigate`, `will-frame-navigate`, `will-redirect`, `setWindowOpenHandler`, and `shell.openExternal` delegation; the partition is renamed to `persist:venice-forge-research-browser`; `src/types/researchBrowser.ts` adds `openExternal` to the preload API; `src/services/researchBrowserBridge.ts` is the canonical renderer-side bridge; `src/components/search/ResearchProviderStatus.tsx` renders compact Venice/Jina/Generic/Browser status indicators; `src/components/search/SearchScrapeView.tsx` integrates the `browser` sub-tab with `ResearchBrowserView`, `onCaptureWithJina`, and `researchBrowserBridge`; `src/components/search/AiResearchTab.tsx` adds `researchBudget` controls (maxQueries, maxResultsPerQuery, maxPages, maxCharsPerPage, perRequestTimeoutMs, totalJobTimeoutMs), `researchSearchProvider`, `researchScrapeProvider`, and `researchRunMode` (`retrieve-only`/`retrieve-and-synthesize`); `src/components/search/SearchTab.tsx` adds provider action buttons and Jina Search option; `src/config/configSchema.ts` extends `YamlResearch` with `default_search_provider`, `default_reader_provider`, `enable_live_browser`, `live_browser_search_provider`, `live_browser_persist_session`, `live_browser_javascript_enabled`, and `max_browser_extract_chars`; `verify:research-browser` audit script (`scripts/verify-research-browser.cjs`) is wired into the `ci` parity command via `verify:contracts`. | `src/components/search/ResearchProviderStatus.test.tsx`, `src/components/search/SearchScrapeView.test.tsx`, `src/components/search/AiResearchTab.test.tsx`, `src/components/search/SearchTab.test.tsx`, `scripts/verify-research-browser.cjs` |
| `VERIFY-058` | Universal document/image/code ingestion — `src/types/ingestion.ts` defines the attachment contract; `src/services/ingestion/*` classifies, extracts, truncates, and assembles text/code/PDF/DOCX/CSV/image attachments without storing raw secrets; unsupported legacy `.doc` and binary `.xls/.xlsx` files are blocked until a real parser exists; `ChatInput` accepts the full supported extension set and preserves image attachments while warning exactly `AI is not vision capable`; `ChatView` enforces the send-side vision gate; `message-bubble` renders Markdown/math through `remark-math`, `rehype-katex`, and `rehype-sanitize`; Research Workspace uploads files as local `manual_note` sources with provenance in metadata instead of fake local URLs; `verify:document-ingestion` is wired into `verify:contracts`. | `src/services/ingestion/fileClassifier.test.ts`, `src/services/ingestion/textIngestion.test.ts`, `src/services/ingestion/codeIngestion.test.ts`, `src/services/ingestion/pdfIngestion.test.ts`, `src/services/ingestion/docxIngestion.test.ts`, `src/services/ingestion/imageIngestion.test.ts`, `src/services/ingestion/attachmentAssembler.test.ts`, `src/components/chat/chat-input.test.tsx`, `src/components/chat/chat-view.test.tsx`, `src/components/chat/message-bubble.test.tsx`, `src/components/research/ResearchWorkspaceView.test.tsx`, `scripts/verify-document-ingestion.cjs` |
| `VERIFY-059` | Web-mode conversation persistence — `src/stores/chat-store.ts` falls back to the encrypted IndexedDB `conversations` store when `isElectron()` is false: `writeConversation` saves the record via `StorageService.saveItem`, `deleteConversations` removes via `StorageService.deleteItem`, and bootstrap hydrates via `StorageService.getItems`; `src/stores/chat-store.web.test.ts` regression-guards create/save, delete, and reload hydration. | `src/stores/chat-store.ts`, `src/stores/chat-store.web.test.ts` |
| `VERIFY-060` | Document ingestion XML escaping — every `<attached_file name="...">` wrapper built by `src/services/ingestion/{text,code,pdf,docx,veniceTextParser}Ingestion.ts` runs the file name (and kind/language where applicable) through `escapeXmlAttribute` so a malicious file name cannot close the tag, and local text/code/PDF/DOCX extracted body text runs through `escapeXmlText` so uploaded content cannot close the wrapper and inject fake structural tags; `src/services/ingestion/xmlEscape.ts` and the ingestion test suites cover malicious-name and malicious-body cases. | `src/services/ingestion/xmlEscape.ts`, `src/services/ingestion/textIngestion.ts`, `src/services/ingestion/codeIngestion.ts`, `src/services/ingestion/pdfIngestion.ts`, `src/services/ingestion/docxIngestion.ts`, `src/services/ingestion/veniceTextParserIngestion.ts`, `src/services/ingestion/*.test.ts` |
| `VERIFY-061` | Main-process logger redaction parity — `electron/services/logger.ts` uses `sanitizeErrorText` and `redactSecrets` from `src/shared/redaction.ts` so log files redact bearer tokens, `sk-…` keys, Venice keys, secret assignments, and local file paths; `setLastApiError` also sanitizes; `electron/services/logger.test.ts` covers each pattern. | `electron/services/logger.ts`, `electron/services/logger.test.ts`, `src/shared/redaction.ts` |
| `VERIFY-062` | Production CSP `img-src` hardening — the renderer CSP in `server.ts` and `electron/utils/rendererCsp.ts` allows `img-src 'self' data: blob:` plus the Electron-only `venice-character-cache:` scheme; arbitrary `https:` image sources are removed; regression tests assert the production CSP string. | `server.ts`, `server.test.ts`, `electron/main.ts`, `electron/utils/rendererCsp.ts`, `electron/utils/rendererCsp.test.ts` |
| `VERIFY-063` | Scrape proxy HTTPS-only — `server.ts` `/api/proxy-scrape` rejects `http:` URLs with "Only HTTPS URLs are allowed" before DNS lookup; `server.test.ts` regression-guards the rejection and verifies no network call is made. | `server.ts`, `server.test.ts` |
| `VERIFY-064` | Scrape proxy raw-mode Content-Type sanitization — `server.ts` `/api/proxy-scrape?raw=true` parses only the base media type, preserves only a safe `charset=utf-8` parameter, sets `X-Content-Type-Options: nosniff`, and never reflects arbitrary upstream Content-Type parameters or header-injection payloads; `server.test.ts` regression-guards sanitized output and rejected injection attempts. | `server.ts`, `server.test.ts` |
| `VERIFY-065` | Document ingestion secret redaction — `src/services/ingestion/{text,code,pdf,docx,veniceTextParser}Ingestion.ts` applies `redactSecrets()` to extracted text before XML wrapping so uploaded documents cannot leak API keys, bearer tokens, or Venice keys into chat context; covered by each ingestion test suite. | `src/services/ingestion/textIngestion.ts`, `src/services/ingestion/codeIngestion.ts`, `src/services/ingestion/pdfIngestion.ts`, `src/services/ingestion/docxIngestion.ts`, `src/services/ingestion/veniceTextParserIngestion.ts`, `src/services/ingestion/*.test.ts` |
| `VERIFY-066` | Accessible labels and skip link — header icon-only actions (e.g., New chat) expose `aria-label`; `App.tsx` renders a keyboard-accessible "Skip to main content" link targeting the `<main>` region; regression-guarded by `src/components/layout/header.test.tsx` and `src/App.skip-link.test.ts`. | `src/components/layout/header.tsx`, `src/App.tsx`, `src/components/layout/header.test.tsx`, `src/App.skip-link.test.ts` |
| `VERIFY-168` | Safe summary redacts user titles and names from issue messages | `src/services/storagePrivacyService.test.ts` |
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

**Audit:** `npm audit --audit-level=moderate` is a release gate for both production and build-time dependencies; CI workflows and the local `ci` script use the same scope.

**Static analysis (CodeQL):** CodeQL is configured through GitHub's default setup for this repository (not a tracked workflow file). Open alerts appear in `Security → Code Scanning`. The current set of defended false positives is documented in `SECURITY.md` and annotated at each call site.

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
| `src/stores/image-workspace-store.ts` | Transient, non-persisted production handoff queue between Media Studio and Image Studio generation/tools surfaces |
| `electron/preload.ts` | contextBridge API surface (only place to expose IPC to renderer) |
| `electron/main.ts` | BrowserWindow + CSP + navigation guards; `requestSingleInstanceLock` |
| `electron/ipc/handlers.ts` | IPC channel handlers (incl. `venice:request`, `venice:streamChat`, `chat:*`, `app:*`) |
| `electron/ipc/configHandlers.ts` | Registers config-related IPC channels (extracted from handlers.ts to resolve size warnings) |
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
| `scripts/verify-dist.cjs` | Build-output verification by default (`verify:dist` / `verify:build-output`); explicit platform modes verify packaged release artifacts (`verify:dist:win`, `verify:dist:mac`, `verify:dist:linux`, `verify:dist:portable`, `verify:dist:release`) |
| `scripts/verify-markdown-links.cjs` | CI documentation-link verifier for local files and heading fragments (`verify:markdown-links`) |
| `scripts/verify-venice-api-docs.cjs` | Verifies Swagger spec and reference document synchronization (CWE-020 URL check) |
| `scripts/verify-no-native-dialogs.cjs` | Confirms dialog hooks and components don't bypass CSS theme bounds (VERIFY-056) |
| `scripts/verify-ci-contract.cjs` | Matches CI/CD release configs against local schemas |
| `scripts/verify-agent-docs.cjs` | Assures documentation sync and handoff parity |
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

| `docs/summary_of_work.md` | Canonical AI/dev-agent session handoff ledger — *Latest Session Summary*, *Session History*, *Open TODO Ledger*, *Validation Matrix* |

---

## Vision / Attachment Detection

No live vision flag from Venice API. Use `modelSupportsVision(modelId)` in `src/constants/venice.ts` — checks `VISION_CAPABLE_MODEL_IDS` allowlist and `VISION_CAPABLE_PATTERNS` (`/vision/i`, `/-vl/i`, `/gemini-2\.[05]/i`). **Defaults to OFF** when unknown. Image attachments are passed as base64 `image_url` content parts only when the selected model supports vision.

---

## Update These Files

- When changing behavior, packaging, or storage, also update:
- `README.md`, `docs/audits/CHANGELOG.md` (under `[Unreleased]`), `AGENTS.md`, `.github/copilot-instructions.md`
- `docs/summary_of_work.md` — the canonical AI/dev-agent session handoff ledger. See § *Mandatory Session Handoff* above.
- `docs/ABOUT.md`, `docs/FAQ.md`, `SECURITY.md`, `docs/RELEASE/release.md`, `docs/LEGAL.md`

---

## Known Gotchas

- `app.entry` writes a static `vite` import at top level → removed in 1.0.3 (C-004); vite is now dynamically imported in dev only. Don't reintroduce.
- `venice:streamChat` must generate a `signalId` if undefined, or delta routing silently breaks (C-002 fix).
- `safeSendToRenderer()` must wrap every IPC send during streaming — closing renderer mid-stream otherwise crashes the main process (C-003).
- Streaming uses `createTimeoutSignal()` (not `AbortSignal.timeout` / `AbortSignal.any`) for older browser compat.
- `indexedDB` exports to `release/`, `dist/`, `dist-electron/`, `coverage/` are gitignored. Build icons under `build/icon.{ico,icns,png}` are tracked; everything else in `build/` is ignored.
- Web-mode `.env` is read at startup; `NODE_ENV=production` is required for `npm start` (use `scripts/start-production.cjs`).
- `npm run test:coverage` includes `server.ts`; proxy behavior is exercised by `server.test.ts`.
