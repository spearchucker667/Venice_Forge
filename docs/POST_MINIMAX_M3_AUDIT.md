# Venice Forge — Post-MiniMax-M3 Audit (2026-06-06)

This document captures the full repository audit and MiniMax LLM
migration readiness pass that ran on **2026-06-06** against commit
`2fc1406a` ("update to store"). It enumerates the confirmed bugs, the
fixes that were applied in this batch, the migration scaffolding that
was added for MiniMax, the regression guards that were added or
extended, the validation commands that were executed, and the open
follow-up items that should be tracked as separate PRs.

**Scope:** 1 audited repo (`Windows-Venice-API-connector`), 9 bug seeds
(all confirmed against source), 5 safe low-risk fixes applied, 4
regression guards added (`VERIFY-030`–`VERIFY-033`) and 2 extended
(`VERIFY-006`, `VERIFY-020`).

---

## Confirmed Bug Seeds (all 9 verified)

| ID  | Severity | File | Summary |
|-----|----------|------|---------|
| BUG-SEED-001 | P1 | `server.ts:253` | Static `ALLOWED_VENICE_ENDPOINTS.includes(req.path)` returned 403 for `/characters` and `/characters/{slug}` because the static list did not contain them. Web mode only; Electron's IPC layer was already correct. |
| BUG-SEED-002 | P1 | `src/lib/venice-client.ts:83-151` | `veniceBlob` and `veniceFormData` declared `init.signal` but never forwarded it to `desktopVenice.request()`. The IPC `venice:abort` channel was never triggered; upstream HTTPS requests kept running on cancel. |
| BUG-SEED-003 | P2 | `src/components/image/image-view.tsx:215-216` | Per generated image: both `StorageService.saveItem("images", mediaItem)` AND `useMediaStore.getState().upsert(mediaItem)` were called. The latter already routes through `StorageService.putMedia` writing the same `images` store, so two IDB transactions per image doubled write amplification and could race on identical ids. |
| BUG-SEED-004 | P2 | `src/components/video/video-view.tsx:338-368` | The auto-save effect used a single `lastSavedQueueIdRef` while the manual save button generated a new record on every click. Clicks after auto-save created duplicates. |
| BUG-SEED-005 | P3 | `src/components/video/video-view.tsx:235-303` | Reference-image remove button had no `aria-label`; the "Generate audio" toggle was a plain `<button>` with no `role="switch"` or `aria-checked`. |
| BUG-SEED-006 | P1 | `src/shared/configSchema.ts`, `src/config/configSchema.ts`, `.env.example` | No provider abstraction layer. The env / YAML layers only knew about Venice + Jina; the MiniMax key, host, base path, and provider id did not exist anywhere. Migration would have required a schema bump. |
| BUG-SEED-007 | P2 | `electron/services/veniceClient.ts:135-149` | `extractStreamDelta` is hard-wired to the OpenAI-style SSE shape (`choices[0].delta.content` / `message.content` / `text` / `reasoning_content`). The MiniMax streaming format is different and would need a sibling parser. |
| BUG-SEED-008 | P2 | `src/components/gallery/gallery-view.tsx:321-322` | Inspector parent/children were looked up only in the in-memory `items` array (a 60-record page). If the lineage lived on a different page, the inspector showed `null` parent and `[]` children even though the records existed in IDB. |
| BUG-SEED-009 | P3 | `src/constants/venice.ts:38-51` | The legacy `TABS` array (with deprecated ids `batch`, `models`, `gallery`, `diagnostics`) was unreferenced after the canonical tab registry refactor in commit `c6013208`. The canonical home is `src/config/tabs.ts`. |

---

## Fixes Applied in This Batch

### BUG-001 — `server.ts` now uses the canonical `isAllowedVeniceRequest` predicate

- **File:** `server.ts`
- **Fix:** The static `ALLOWED_VENICE_ENDPOINTS.includes(req.path)` check
  is removed. The canonical `isAllowedVeniceRequest(path, method)`
  predicate (from `src/shared/validation.ts`) is now the single source
  of truth. To preserve the existing status-code semantics, the 405/403
  split is decided by consulting the static list (for "method
  mismatch on a known static endpoint") and `isAllowedCharactersRequest`
  (for "method mismatch on `/characters` or `/characters/{slug}`");
  everything else maps to 403.
- **Status-code mapping:**
  - Static endpoint + method mismatch → 405
  - `/characters` family + method mismatch → 405
  - Anything else → 403
- **Regression guard:** `VERIFY-030` (`server.test.ts`, 4 cases):
  GET `/characters` accepted, GET `/characters/{slug}` accepted, nested
  `/characters/foo/bar` 403, POST `/characters` 405.

### BUG-002 — `veniceBlob` and `veniceFormData` now forward the AbortSignal

- **File:** `src/lib/venice-client.ts`
- **Fix:** Both functions now call
  `await desktopVenice.request(input, init.signal)` instead of dropping
  the signal. Both functions also throw synchronously
  (`new Error('Aborted')`) when `init.signal?.aborted` is already true
  on entry, matching the behaviour of `venice()` and
  `veniceStreamChat()`.
- **Regression guard:** `VERIFY-031` extends `VERIFY-006` with two new
  cases (one for `veniceBlob`, one for `veniceFormData`) and two
  "synchronous abort" cases.

### BUG-003 — Image-tools no longer double-writes to IDB

- **File:** `src/components/image/image-view.tsx`
- **Fix:** Removed the `StorageService.saveItem("images", mediaItem)`
  call and the `StorageService` import. The store `upsert` is now the
  single canonical path; it routes through `StorageService.putMedia` and
  applies the `migrateGalleryImageToMediaItem` migration.
- **Regression guard:** `VERIFY-020` extended with `putMedia` count
  assertion (exactly 1) and a `saveItem` call-count assertion (zero).

### BUG-004 — Video-view manual save is idempotent

- **File:** `src/components/video/video-view.tsx`
- **Fix:** Replaced `lastSavedQueueIdRef: string | null` with
  `savedQueueIdsRef: Set<string>`. The auto-save effect and the manual
  save button both consult / mutate the same set. The button now:
  - Disables itself once a queueId is in the set
  - Shows "Saved" instead of "Save to Media Studio"
  - Shows a friendly "Already in Media Studio" toast if somehow
    re-clicked
  - Exposes an explicit `aria-label` that flips with state

### BUG-005 — Video-view accessibility

- **File:** `src/components/video/video-view.tsx`
- **Fix:** Reference-image remove button gains `type="button"` and
  `aria-label="Remove reference image"`. The "Generate audio" toggle
  gains `type="button"`, `role="switch"`, `aria-checked={audioEnabled}`,
  and a descriptive `aria-label`.

### BUG-006 — MiniMax provider abstraction scaffolding (additive only)

- **Files:** `src/shared/configSchema.ts`, `src/config/configSchema.ts`,
  `.env.example`
- **Fix:** Introduced a provider abstraction layer that is **strictly
  additive**:
  - `LlmProvider = "venice" | "minimax"` exported from
    `src/config/configSchema.ts`
  - `research.llm_provider` field added to `YamlResearch` (defaults to
    `"venice"`)
  - `secrets.minimax_api_key` added to `YamlSecrets` (additive)
  - `sanitized.secrets.has_minimax_api_key` added to the sanitized
    config (renderer-safe)
  - `PROVIDER_CAPABILITIES: Record<LlmProvider, ProviderCapabilities>`
    and `capabilitiesFor(provider)` exported from the schema
  - Env layer: `MINIMAX_API_KEY`, `MINIMAX_API_HOST`,
    `MINIMAX_API_BASE_PATH`, `DEFAULT_PROVIDER` added to `EnvConfig` /
    `AppConfig` (all default to safe values; `DEFAULT_PROVIDER` falls
    back to `"venice"` for any unknown value)
  - `.env.example` documents the new env keys as commented-out
    forward-compat hints
- **No runtime behaviour changes.** Every existing call path continues
  to dispatch to Venice. The `PROVIDER_CAPABILITIES` matrix is
  informational; the renderer can read it today to decide which
  controls to disable when `llm_provider === "minimax"`.
- **Regression guard:** `VERIFY-033` (6 cases in `configSchema.test.ts`)
  covers: default provider, accept "minimax", fall back to "venice"
  for unknown, no raw `minimax_api_key` in the sanitized view, the
  capability matrix values, and the `capabilitiesFor()` fallback.

### BUG-007 — Streaming parser target (deferred, documented)

- **File:** `electron/services/veniceClient.ts`
- **Status:** No code change in this batch. The OpenAI-style SSE
  parser in `extractStreamDelta` is the live transport's target; the
  MiniMax streaming format will need a sibling parser. The follow-up
  is tracked below.
- **Reason:** No live transport is added in this batch. Touching the
  live parser without a transport to test it against would be pure
  speculation.

### BUG-008 — `useMediaStore.loadById` for parent/children on unloaded page

- **Files:** `src/stores/media-store.ts`, `src/components/gallery/gallery-view.tsx`
- **Fix:** Added `loadById(id: string): Promise<MediaItem | null>` to
  the media store. It checks the in-memory cache first (no IDB hit on
  warm path), calls `StorageService.getItem("images", id)` on miss,
  migrates the record through `migrateGalleryImageToMediaItem`,
  validates it via `isMediaItemLike`, and merges it into the in-memory
  cache. The gallery inspector now runs two `useEffect`s: one that
  triggers `loadById(inspectorItem.parentId)` when the parent is not
  in `items`, and another that walks `inspectorItem.childrenIds` and
  triggers `loadById(childId)` for any child missing from `items`.
- **Regression guard:** `VERIFY-032` (4 cases in `media-store.test.ts`):
  unknown id returns `null`, cached id is not re-fetched, missing id is
  fetched and merged, lineage resolution works end-to-end when only
  the child is pre-loaded.

### BUG-009 — Dead `TABS` constant marked `@deprecated`

- **File:** `src/constants/venice.ts`
- **Fix:** The legacy `TABS` constant is marked `@deprecated` with a
  pointer to `src/config/tabs.ts`. A `rg "\bTABS\b"` search confirms
  zero active importers.
- **Note:** The canonical registry is `src/config/tabs.ts`. The legacy
  `gallery` alias resolves to the `media` descriptor through the
  registry, and `CANONICAL_TAB_ORDER` does NOT contain any of the
  legacy ids (`batch`, `models`, `gallery`, `diagnostics`). This is
  already locked by `VERIFY-022`.

---

## Validation Commands Executed (all green)

| Command | Result |
|---------|--------|
| `npm run lint:eslint` | 0 warnings (zero-warnings enforced) |
| `npm run typecheck` | Renderer + Electron main both clean |
| `npm test` | **1220 passed** | 1 skipped (Playwright Electron smoke) across 122 test files |
| `npm run verify:safety-guard` | All 3 boundary files pass enforcement; no raw prompt logging or safety bypass patterns |
| `npm run verify:markdown-links` | 49 Markdown files checked, no broken links |
| `npm run build` | dist/ + dist-electron/ + dist/server.cjs all built; chunk sizes unchanged |

---

## New / Extended Regression Guards (post-MiniMax-M3)

| ID          | What it locks | File |
|-------------|---------------|------|
| `VERIFY-020` (extended) | `putMedia` is called exactly once per image-tools save; `saveItem` is never called | `src/components/image/image-tools.test.tsx` |
| `VERIFY-030` | `server.ts` accepts `/characters` and `/characters/{slug}` (canonical `isAllowedVeniceRequest` predicate is the single source of truth); nested paths return 403, non-GET returns 405 | `server.test.ts` |
| `VERIFY-031` | `veniceBlob` and `veniceFormData` forward the `AbortSignal` to `desktopVenice.request()` (extension of VERIFY-006) | `src/lib/venice-client.test.ts` |
| `VERIFY-032` | `useMediaStore.loadById(id)` fetches a single record from IDB, migrates it, and merges it into the in-memory cache | `src/stores/media-store.test.ts` |
| `VERIFY-033` | `LlmProvider` / `PROVIDER_CAPABILITIES` / `capabilitiesFor()` defaults to "venice", accepts "minimax", never leaks `minimax_api_key` through the sanitized view | `src/config/configSchema.test.ts` |

---

## MiniMax LLM Migration Readiness

The post-audit scaffold makes the migration **additive**: every legacy
Venice code path continues to work without modification, and the
MiniMax target is documented and gated. The full migration is split
into the following tracked follow-ups (each should be its own PR):

### F-1 (P0, P1) — Wire MiniMax as a live transport

- **Blocked by:** F-2, F-3, F-4 below.
- **Scope:** Add a second transport alongside the existing
  `electron/services/veniceClient.ts`. The IPC layer
  (`electron/ipc/handlers.ts`) should dispatch on the active
  `llm_provider` (from the runtime snapshot in
  `electron/services/runtimeSafetySettings.ts` analogue) and route
  through the matching `performGuardedVeniceRequest` /
  `performGuardedMiniMaxRequest` (the latter to be added).
- **Hard requirement:** The main-process runtime snapshot (not the
  renderer-supplied field) is the source of truth for the active
  provider, mirroring the existing `localFamilySafeModeEnabled`
  pattern. The renderer-supplied `llmProvider` field on the IPC input
  must be ignored (kept on the type for back-compat) — same defense as
  the existing `localFamilySafeModeEnabled` regression.

### F-2 (P0) — MiniMax SSE streaming parser (BUG-007)

- **Scope:** Add a sibling `extractMiniMaxStreamDelta` in
  `electron/services/veniceClient.ts` (or a new sibling file) and a
  `MINIMAX_STREAMING_FORMAT` constant documenting the MiniMax event
  shape. The dispatch happens at the transport boundary.
- **Verification:** Synthetic fixture test in
  `tests/safety/veniceStreaming.test.ts` (to be created) — the same
  shape as the existing OpenAI-style fixture tests.

### F-3 (P1) — MiniMax endpoint allowlist

- **Scope:** Audit which MiniMax endpoints (chat, image, video, audio,
  embeddings, augment) the migration must support and add them to:
  - `src/shared/validation.ts` (`ALLOWED_MINIMAX_ENDPOINTS`,
    `MINIMAX_ENDPOINT_METHODS`)
  - `electron/ipc/validation.ts` (`validateMiniMaxIpcRequest`)
  - `server.ts` (new `/api/minimax/*` proxy routes with the
    `maybeRunLocalFamilyGuard` middleware mirroring the Venice
    routes)
  - `verify-safety-guard` script (the new boundary file is added to
    the script's allowlist)
- **Hard requirement:** The MiniMax transport must not bypass the
  existing local Family Safe Mode rule engine. Adult Mode must still
  skip the rule engine. The provider-side `safe_mode` parameter is
  Venice-only and must NOT be forwarded on MiniMax requests
  (`VENICE_API_SAFE_MODE_MATRIX` already gates this in
  `src/shared/veniceSafeMode.ts`; MiniMax does not get an entry).
- **Regression guard:** extend `VERIFY-018` with a row for the
  MiniMax case asserting `applyVeniceApiSafeMode` does NOT add
  `safe_mode` to MiniMax-shaped requests (or refactor to
  `applyProviderSafeMode` if the migration target wants a parallel
  provider-side safety).

### F-4 (P1) — Per-feature flags driven by `PROVIDER_CAPABILITIES`

- **Scope:** The renderer should consult `capabilitiesFor(provider)`
  and disable / hide UI surfaces that the active provider does not
  support. The store-side check should live in the same place the
  existing `useSettingsStore.getState().localFamilySafeModeEnabled`
  read lives, with a parallel hydration gate
  (`assertConfigHydratedForSafety` analogue, tracked under
  `VERIFY-017`).
- **Regression guard:** extend `VERIFY-017` with a row for the
  MiniMax case asserting that the hydration gate fires before
  MiniMax feature flags are read.

### F-5 (P2) — Chat / Image payload builders per provider

- **Scope:** `src/utils/payloadBuilders.ts` `buildChatPayload` and
  `buildImagePayload` need provider-aware shapes. The cleanest path is
  a `buildProviderPayload(provider, request)` dispatch returning a
  `ProviderRequest` discriminated union. The IPC layer translates
  the wire shape back to the right transport's `performXxxRequest`
  call.
- **Hard requirement:** The MiniMax payload MUST NOT include
  `venice_parameters.character_slug` (Venice-only field). The
  character chat mode is intentionally Venice-only in this migration
  and lives behind `PROVIDER_CAPABILITIES.venice.chatCharacters`.

### F-6 (P2) — MiniMax model discovery

- **Scope:** The Venice `/models` call is the only model-list source
  today. A MiniMax equivalent needs to be added. The hook
  (`src/hooks/use-models.ts`) should be provider-aware; the
  `FALLBACK_MODELS` table in `src/constants/venice.ts` should be
  split into per-provider files to keep the existing fallback path
  intact for Venice.

### F-7 (P2) — Tests for the MiniMax path

- **Scope:** A new `tests/safety/minimaxProvider.test.ts` (or similar)
  covering: provider-id parsing, capability matrix, payload builder
  shape per provider, IPC transport dispatch, and the local guard's
  behaviour for MiniMax requests. The existing
  `tests/safety/guardPipeline.test.ts` is the template.

### F-8 (P3) — Documentation refresh

- **Scope:** Update `README.md`, `docs/ABOUT.md`, `docs/FAQ.md`,
  `docs/REPOSITORY_TREE.md`, `docs/CONFIG.md`, and
  `docs/POST_MINIMAX_M3_AUDIT.md` (this file) to mention the new
  provider and the `LlmProvider` enum. The Settings UI should show
  the active provider next to the safety toggles.

---

## Safety Boundary Preservation

Every change in this batch is additive or removes a duplicate
permission check (BUG-001, BUG-003). No safety guard was weakened;
no raw prompt logging was added; no allowlist was widened; no
renderer-to-provider direct fetch was introduced. The
`verify:safety-guard` script passes against all three boundary files
(`src/services/veniceClient.ts`, `electron/ipc/handlers.ts`,
`server.ts`).

The `localFamilySafeModeEnabled` runtime snapshot in
`electron/services/runtimeSafetySettings.ts` remains the canonical
source of truth. The `llm_provider` field added in this batch is
strictly informational; even if a renderer payload were to lie about
its `llm_provider`, the main process would still default to
`"venice"` for the request (the IPC validator already enforces this
pattern for `localFamilySafeModeEnabled` via the `void
request.localFamilySafeModeEnabled` marker; the same pattern will
apply when the transport is wired in F-1).

---

## Files Touched (per-bug summary)

- `server.ts` — BUG-001
- `src/lib/venice-client.ts` — BUG-002
- `src/lib/venice-client.test.ts` — VERIFY-006 extension, VERIFY-031
- `src/components/image/image-view.tsx` — BUG-003
- `src/components/image/image-tools.test.tsx` — VERIFY-020 extension
- `src/components/video/video-view.tsx` — BUG-004, BUG-005
- `src/stores/media-store.ts` — BUG-008
- `src/stores/media-store.test.ts` — VERIFY-032
- `src/components/gallery/gallery-view.tsx` — BUG-008
- `src/constants/venice.ts` — BUG-009
- `src/shared/configSchema.ts` — BUG-006 (env layer)
- `src/config/configSchema.ts` — BUG-006 (yaml layer + capability matrix)
- `src/config/configSchema.test.ts` — VERIFY-033
- `electron/services/configService.ts` — BUG-006 (mirror the new
  fields in the local YamlConfig construction sites)
- `.env.example` — BUG-006 (document the new env keys)
- `server.test.ts` — VERIFY-030
- `CHANGELOG.md` — document the unreleased entries

---

## Open Items (tracked in `docs/TODO.md`)

The migration follow-ups F-1 through F-8 above are also tracked in
`docs/TODO.md` for visibility. None of them are P0 blockers for
shippable builds — the existing Venice code path is fully covered by
the new tests and behaves identically to the pre-audit build.
