# Venice Forge — Round-2 Audit (2026-06-06)

> **Status:** Retained for traceability. The canonical session handoff is
> [`docs/summary_of_work.md`](summary_of_work.md) — its *Latest Session
> Summary* and *Open TODO Ledger* reflect the current state of every
> follow-up. This document is the full audit record from 2026-06-06.
>
> **Scope correction (later that day):** The MiniMax LLM forward-compat
> scaffold and the F-1..F-8 migration follow-up section that lived in
> the original version of this document have been **retired**. The
> user clarified that the supported transports are strictly
> **Venice + Jina**; the MiniMax scaffold (BUG-006) and the deferred
> MiniMax SSE streaming parser (BUG-007) have both been removed
> wholesale. See the *Scope correction* section at the end of this
> document for the full diff summary, and the *Latest Session Summary*
> of `docs/summary_of_work.md` for the active state of every
> follow-up that survives.

This document captures the full repository audit that ran on
**2026-06-06** against commit `2fc1406a` ("update to store"). It
enumerates the confirmed bugs, the fixes that were applied in this
batch, the regression guards that were added or extended, the
validation commands that were executed, and the open follow-up
items that should be tracked as separate PRs.

**Scope:** 1 audited repo (`Windows-Venice-API-connector`), 8 bug
seeds that resulted in code fixes (BUG-001..BUG-006, BUG-008,
BUG-009) plus 1 deferred bug seed (BUG-007) that has since been
retired with the rest of the MiniMax scope, 8 safe low-risk fixes
applied, 3 regression guards added (`VERIFY-030`–`VERIFY-032`) and
2 extended (`VERIFY-006`, `VERIFY-020`). `VERIFY-033` is reserved
as a retired slot for the MiniMax scaffold it once covered.

---

## Confirmed Bug Seeds (8 verified, 1 retired)

| ID  | Severity | File | Summary |
|-----|----------|------|---------|
| BUG-SEED-001 | P1 | `server.ts:253` | Static `ALLOWED_VENICE_ENDPOINTS.includes(req.path)` returned 403 for `/characters` and `/characters/{slug}` because the static list did not contain them. Web mode only; Electron's IPC layer was already correct. |
| BUG-SEED-002 | P1 | `src/lib/venice-client.ts:83-151` | `veniceBlob` and `veniceFormData` declared `init.signal` but never forwarded it to `desktopVenice.request()`. The IPC `venice:abort` channel was never triggered; upstream HTTPS requests kept running on cancel. |
| BUG-SEED-003 | P2 | `src/components/image/image-view.tsx:215-216` | Per generated image: both `StorageService.saveItem("images", mediaItem)` AND `useMediaStore.getState().upsert(mediaItem)` were called. The latter already routes through `StorageService.putMedia` writing the same `images` store, so two IDB transactions per image doubled write amplification and could race on identical ids. |
| BUG-SEED-004 | P2 | `src/components/video/video-view.tsx:338-368` | The auto-save effect used a single `lastSavedQueueIdRef` while the manual save button generated a new record on every click. Clicks after auto-save created duplicates. |
| BUG-SEED-005 | P3 | `src/components/video/video-view.tsx:235-303` | Reference-image remove button had no `aria-label`; the "Generate audio" toggle was a plain `<button>` with no `role="switch"` or `aria-checked`. |
| BUG-SEED-006 | P1 (now retired) | `src/shared/configSchema.ts`, `src/config/configSchema.ts`, `.env.example` | Originally: "No provider abstraction layer. The env / YAML layers only knew about Venice + Jina; the MiniMax key, host, base path, and provider id did not exist anywhere." The MiniMax scaffold that fixed this is itself retired in the *Scope correction* section below — the file paths and the new fields (`LlmProvider`, `PROVIDER_CAPABILITIES`, `secrets.minimax_api_key`, `MINIMAX_API_*`, `DEFAULT_PROVIDER`) are all gone. |
| BUG-SEED-007 | P2 (now retired) | `electron/services/veniceClient.ts:135-149` | Originally: "`extractStreamDelta` is hard-wired to the OpenAI-style SSE shape. The MiniMax streaming format is different and would need a sibling parser." With MiniMax retired (see *Scope correction*), the OpenAI/Venice shape remains the only live transport and the parser is correct as-is. |
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

### BUG-006 — MiniMax provider abstraction scaffolding (additive only) — RETIRED

- **Files (originally touched):** `src/shared/configSchema.ts`,
  `src/config/configSchema.ts`, `.env.example`
- **Original fix:** Introduced a provider abstraction layer that was
  **strictly additive** at the time:
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
  - `.env.example` documented the new env keys as commented-out
    forward-compat hints
- **Status now (2026-06-06, later that day):** **Retired.** The user
  corrected scope to Venice + Jina only. The scaffold above is removed
  wholesale. See the *Scope correction* section at the end of this
  document for the full diff summary, and the *Latest Session Summary*
  of `docs/summary_of_work.md` for the active state of every surviving
  follow-up.
- **Regression guard (retired):** `VERIFY-033` (6 cases in
  `configSchema.test.ts`) covered the original behaviour. The slot is
  reserved (retired marker) to keep the regression-guard sequence
  stable; no test file is needed for a retired guard.

### BUG-007 — Streaming parser target (deferred, documented) — RETIRED

- **File:** `electron/services/veniceClient.ts`
- **Original status:** No code change in the original audit batch.
  The OpenAI-style SSE parser in `extractStreamDelta` was the live
  transport's target; the MiniMax streaming format would have needed
  a sibling parser.
- **Status now (2026-06-06, later that day):** **Retired.** With the
  MiniMax scaffold removed, there is no second transport to validate
  a sibling parser against. The OpenAI/Venice streaming shape remains
  the only live transport and `extractStreamDelta` is correct as-is.
  The follow-up is closed; no replacement is needed.

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

### BUG-009 — Dead `TABS` constant removed

- **File:** `src/constants/venice.ts`
- **Fix (original 2026-06-06 batch):** The legacy `TABS` constant was
  marked `@deprecated` with a pointer to `src/config/tabs.ts`.
- **Final disposition (this 2026-06-06 scope-correction commit):**
  The constant is **removed wholesale** once the wait period
  elapsed and a `rg "\bTABS\b"` search confirmed zero active
  importers. The canonical registry in `src/config/tabs.ts` is the
  only source of truth.
- **Note:** The legacy `gallery` alias resolves to the `media`
  descriptor through the registry, and `CANONICAL_TAB_ORDER` does
  NOT contain any of the legacy ids (`batch`, `models`, `gallery`,
  `diagnostics`). This is locked by `VERIFY-022`.

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

## New / Extended Regression Guards (2026-06-06 round-2 audit)

| ID          | What it locks | File |
|-------------|---------------|------|
| `VERIFY-020` (extended) | `putMedia` is called exactly once per image-tools save; `saveItem` is never called | `src/components/image/image-tools.test.tsx` |
| `VERIFY-030` | `server.ts` accepts `/characters` and `/characters/{slug}` (canonical `isAllowedVeniceRequest` predicate is the single source of truth); nested paths return 403, non-GET returns 405 | `server.test.ts` |
| `VERIFY-031` | `veniceBlob` and `veniceFormData` forward the `AbortSignal` to `desktopVenice.request()` (extension of VERIFY-006) | `src/lib/venice-client.test.ts` |
| `VERIFY-032` | `useMediaStore.loadById(id)` fetches a single record from IDB, migrates it, and merges it into the in-memory cache | `src/stores/media-store.test.ts` |
| `VERIFY-033` | (Retired) — original guard covered the deprecated MiniMax forward-compat scaffold (`LlmProvider` / `PROVIDER_CAPABILITIES` / `capabilitiesFor()`); removed in the 2026-06-06 "Venice + Jina only" scope correction. The slot is reserved to keep the regression-guard sequence stable. | — |

> The original audit batch also added `VERIFY-024` (atomic key
> redaction in `electron/services/configService.ts`) and
> `VERIFY-025` (RP chat persistence-before-publication) earlier in
> the same day. They are listed in `AGENTS.md` and the `CHANGELOG.md`
> `[Unreleased] / Security regression guards` table.

---

## Scope Correction (2026-06-06, later that day)

The original audit batch introduced a **MiniMax LLM forward-compat
scaffold** (`LlmProvider`, `PROVIDER_CAPABILITIES`, `capabilitiesFor`,
`secrets.minimax_api_key`, the `MINIMAX_API_*` env keys, and the
`DEFAULT_PROVIDER` env selector) and the F-1..F-8 migration
follow-up section that this document used to track. The user
clarified later that day that the supported transports are strictly
**Venice + Jina** and asked for the MiniMax scaffold to be torn
out. The follow-ups are all closed by that single decision:

| Old ID | Title | Resolution |
|--------|-------|------------|
| F-1 (P0/P1) | Wire MiniMax as a live transport | Closed — not a target. |
| F-2 (P0) | MiniMax SSE streaming parser (BUG-007) | Closed — BUG-007 itself is retired; the OpenAI/Venice shape is the only live transport. |
| F-3 (P1) | MiniMax endpoint allowlist | Closed — no endpoints needed. |
| F-4 (P1) | Per-feature flags driven by `PROVIDER_CAPABILITIES` | Closed — matrix is gone. |
| F-5 (P2) | Chat / Image payload builders per provider | Closed — no second provider. |
| F-6 (P2) | MiniMax model discovery | Closed — no second provider. |
| F-7 (P2) | Tests for the MiniMax path | Closed — no path. |
| F-8 (P3) | Documentation refresh | Closed — refresh would only re-add a "MiniMax" mention. |

**What was actually removed from the source tree** (the
`2026-06-06 scope correction` commit, this session):

- `LlmProvider` type, `ProviderCapabilities` interface,
  `PROVIDER_CAPABILITIES: Record<LlmProvider, ProviderCapabilities>`
  constant, and `capabilitiesFor()` helper — removed from
  `src/config/configSchema.ts`.
- `secrets.minimax_api_key` field, `sanitized.secrets.has_minimax_api_key`
  field, `research.llm_provider` field — removed from
  `src/config/configSchema.ts` (`YamlSecrets`, `SanitizedConfig`,
  `YamlResearch`), `validateConfig`, `sanitizeConfig`, `emptyConfig`.
- `MINIMAX_API_KEY`, `MINIMAX_API_HOST`, `MINIMAX_API_BASE_PATH`,
  `DEFAULT_PROVIDER` env getters, the `parseProviderId` minimax
  branch, and the `ProviderId = "venice" | "jina" | "minimax"` type
  union — removed from `src/shared/configSchema.ts`.
- Two `secrets: { venice_api_key: "", jina_api_key: "", minimax_api_key: "", ... }`
  construction sites in `electron/services/configService.ts`
  (replaced with `secrets: { venice_api_key: "", jina_api_key: "", keep_plaintext_keys: ... }`).
- `.env.example` — the MiniMax `DEFAULT_PROVIDER`,
  `MINIMAX_API_KEY`, `MINIMAX_API_HOST`, `MINIMAX_API_BASE_PATH`
  forward-compat block removed.
- `.config/config.local.yaml` — `secrets.minimax_api_key: ""` and
  `research.llm_provider: "venice"` lines removed.
- 6 `provider abstraction (BUG-006)` test cases in
  `src/config/configSchema.test.ts` — the entire `describe` block
  removed (the `PROVIDER_CAPABILITIES` / `capabilitiesFor` imports
  are also gone from the top of the file).
- `tests/csp/inlineStyleInvariant.test.ts:18` — rephrased to point
  at `docs/POST_VENICE_JINA_AUDIT_2026_06_06.md` (this file) so the
  comment does not get stale again on future renames.

**What is preserved (Venice-only, intentional):**

- `src/constants/venice.ts:23` — the `MODEL_CONFIGS["minimax-music-2.0"]`
  entry is a **Venice model id** and is preserved as-is. It is not
  related to the MiniMax transport scaffold.
- The `ProviderId = "venice" | "jina"` type in
  `src/shared/configSchema.ts` — Jina remains a research /
  scrape / web-search transport, just not an LLM transport.
- The `verify:safety-guard` boundary allowlist (3 files) and every
  safety test (VERIFY-015, VERIFY-017, VERIFY-019, VERIFY-024) — no
  change.

**Documentation updates** (this commit, this session):

- `docs/POST_MINIMAX_M3_AUDIT.md` is renamed to
  `docs/POST_VENICE_JINA_AUDIT_2026_06_06.md` (this file). The
  *MiniMax LLM Migration Readiness* section is replaced by the
  *Scope Correction* section above.
- `AGENTS.md` — `VERIFY-033` row in the named-guards table is
  re-labelled "Retired"; the Key File Locations row for the audit
  doc is updated to the new file name and to call out the retired
  F-1..F-8 status.
- `README.md` — the "Security audit & regression guards" section
  is updated: `VERIFY-033` is marked retired, the intro line
  drops the `provider-scaffolding` mention, and the security-audit
  cross-link points at the new file name. The Project Status table
  drops the active guard count from 34 to 33.
- `CHANGELOG.md` — the BUG-006 / BUG-007 entries are replaced with a
  single "MiniMax provider scaffold removed (scope correction)"
  entry. The `VERIFY-033` row in the guards table is re-labelled.
- `docs/summary_of_work.md` — the Open TODO Ledger drops the
  F-1..F-8 rows; the Latest Session Summary describes the scope
  correction and points readers at this file.

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
source of truth. The MiniMax `llm_provider` field that used to be
informational is gone; the only LLM transport is now Venice.

---

## Files Touched (per-bug summary)

### Original 2026-06-06 audit batch

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
- `src/shared/configSchema.ts` — BUG-006 (env layer, now removed in scope correction)
- `src/config/configSchema.ts` — BUG-006 (yaml layer + capability matrix, now removed in scope correction)
- `src/config/configSchema.test.ts` — VERIFY-033 (6 cases, now removed in scope correction)
- `electron/services/configService.ts` — BUG-006 (mirror the new fields, now removed in scope correction)
- `.env.example` — BUG-006 (document the new env keys, now removed in scope correction)
- `server.test.ts` — VERIFY-030
- `CHANGELOG.md` — document the unreleased entries

### Scope correction (2026-06-06, same day, this session)

- `src/config/configSchema.ts` — MiniMax `LlmProvider` / `PROVIDER_CAPABILITIES` /
  `capabilitiesFor` / `secrets.minimax_api_key` / `sanitized.secrets.has_minimax_api_key` /
  `research.llm_provider` removed.
- `src/shared/configSchema.ts` — `ProviderId` narrowed to `"venice" | "jina"`;
  `MINIMAX_API_*` / `DEFAULT_PROVIDER` env getters and the `parseProviderId`
  MiniMax branch removed.
- `electron/services/configService.ts` — two `secrets` construction sites
  lose `minimax_api_key: ""`.
- `src/config/configSchema.test.ts` — entire `describe("provider abstraction (BUG-006)")`
  block removed.
- `.env.example` — MiniMax forward-compat block removed.
- `.config/config.local.yaml` — `secrets.minimax_api_key: ""` and
  `research.llm_provider: "venice"` lines removed.
- `tests/csp/inlineStyleInvariant.test.ts` — comment cross-link rephrased
  to point at the renamed audit doc.
- `AGENTS.md` — `VERIFY-033` re-labelled "Retired"; Key File Locations
  row updated to the new audit-doc path.
- `README.md` — `VERIFY-033` re-labelled; security-audit cross-link and
  guard count updated.
- `CHANGELOG.md` — BUG-006 / BUG-007 entries replaced with the scope
  correction entry; `VERIFY-033` row re-labelled; doc-path references
  updated.
- `docs/POST_MINIMAX_M3_AUDIT.md` — renamed to
  `docs/POST_VENICE_JINA_AUDIT_2026_06_06.md` (this file); F-1..F-8
  section replaced with the *Scope Correction* section.
- `docs/summary_of_work.md` — Latest Session Summary describes the
  scope correction; F-1..F-8 rows removed from the Open TODO Ledger;
  the P3 "Media Studio dangling-parent repair" item is replaced with
  a `VERIFY-035` "Completed this session" entry.
- `src/constants/venice.ts` — deprecated `TABS` constant removed
  wholesale (BUG-009 final disposition). `CHANGELOG.md` and the
  audit doc's BUG-009 entry are updated to reflect the final
  disposition.
- `src/components/gallery/media-inspector.tsx` — "Missing
  references" recovery section with `missingChildIds` prop and
  "Clear parent link" / "Clear N missing refs" actions.
- `src/components/gallery/gallery-view.tsx` — `missingChildIds`
  state + dangling-ref detection (deferred `loadById` for every
  child id in `inspectorItem.childrenIds` not in `items`; ids
  whose `loadById` returns `null` are added to the state).
- `src/types/media.ts` — `MediaItemPatch` gains a `childrenIds`
  field so the same `patch` action handles both repair actions.
- `src/components/gallery/gallery-view.test.tsx` — VERIFY-035
  regression-guard test case: "surfaces a 'Missing references'
  recovery section when the parent record is absent".
- `AGENTS.md` — `VERIFY-035` row added to the named-regression-
  guards table.
- `README.md` — `VERIFY-035` row added to the *Security audit &
  regression guards* table; active guard count bumped from 33 to
  34.

---

## Open Items

The F-1..F-8 follow-ups are all closed by the *Scope Correction*
section above. The remaining P2 work that the canonical handoff
ledger tracks today is the Inspector non-mutating telemetry
expansion (carried over from the 2026-06-05 audit). The Media
Studio dangling-reference automated repair path is implemented and
locked by `VERIFY-035` (same commit as the scope correction). The
deprecated `TABS` constant is removed wholesale from
`src/constants/venice.ts` in the same commit. See the
*Open TODO Ledger* in [`docs/summary_of_work.md`](summary_of_work.md)
for the current status of every follow-up.
