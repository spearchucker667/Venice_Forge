# Venice Forge — Round-2 Audit Follow-Ups (2026-06-05)

> **Status:** Historical audit record (round 1, 2026-06-05). The current
> audit is
> [`docs/POST_VENICE_JINA_AUDIT_2026_06_06.md`](POST_VENICE_JINA_AUDIT_2026_06_06.md)
> and the canonical session handoff ledger is
> [`docs/summary_of_work.md`](summary_of_work.md). Retained for
> traceability.

This document tracks the P0/P1/P2 findings from the 2026-06-05 full-repo
audit, plus the architectural improvements that were intentionally
deferred to their own PRs.

**Status:** All P0 and P1 items in this file are RESOLVED in commits
`f1389b21` (security), `eacf09e5` (BUG-1), and `37d3385` (T1). The
P2 architectural items remain open and should each be their own PR.

---

## Resolved (commits on main)

### SEC-1 / Bridge token credential leak — P0
- **Location:** `electron/main.ts:225-230`, `electron/services/bridgeServer.ts:148-152`
- **Description:** The bridge bearer token was logged to `console.log` at
  startup, leaking the sole credential required to call
  `/chat/completions` etc.
- **Fix:** Replaced token log with a static message + `tokenSource` field
  in the structured log. The token is still returned from
  `startBridgeServer()` for in-process callers (the Electron main itself)
  but is never written to stdout/stderr/log files.
- **Regression guard:** `VERIFY-001` in `electron/services/bridgeServer.test.ts`.
- **Commit:** `f1389b21`

### SEC-1.5 / Non-constant-time token compare — P0
- **Location:** `electron/services/bridgeServer.ts:37`
- **Description:** `token !== bridgeToken` short-circuits on first
  character mismatch, leaking token length and prefix-match timing.
- **Fix:** Added `safeTokenCompare()` using `crypto.timingSafeEqual` on
  equal-length buffers, with a length-padded fallback that always
  invokes `timingSafeEqual` (consumes the same wall-clock time as a
  full match to avoid leaking length).
- **Regression guards:** `VERIFY-002` (wrong-length) and `VERIFY-002`
  (same-length-wrong) in `electron/services/bridgeServer.test.ts`.
- **Commit:** `f1389b21`

### SEC-9 / No body size limit on bridge server — P2
- **Location:** `electron/services/bridgeServer.ts:33`
- **Description:** `express.json()` default limit is 100 KiB but the
  audio/video proxy may exceed that. Setting an explicit cap prevents
  the default from being silently misconfigured.
- **Fix:** `express.json({ limit: "10mb" })` matches the Venice API
  endpoint limits and the IPC body cap.
- **Regression guard:** `VERIFY-004` (10 MiB body cap returns 413) in
  `electron/services/bridgeServer.test.ts`.
- **Commit:** `f1389b21`

### SEC-10 / No abort on client disconnect — P2
- **Location:** `electron/services/bridgeServer.ts:88-95`
- **Description:** When the bridge SSE client disconnects mid-stream,
  the upstream HTTPS request kept running and continued to burn tokens.
- **Fix:** Wired `req.on('close')` and `res.on('close')` to call
  `abortVeniceRequest(signalId)`. Also wrapped `res.write()` in
  try/catch so a write error is treated as a disconnect.
- **Regression guard:** `VERIFY-003` (abort on disconnect) in
  `electron/services/bridgeServer.test.ts`.
- **Commit:** `f1389b21`

### BUG-7 / maskHeaders over-masking — P2
- **Location:** `src/services/veniceClient.ts:14`
- **Description:** `lowerKey.includes("key") || lowerKey.includes("token")`
  was a substring match that over-masked benign headers like
  `keyword` or `x-token-type`.
- **Fix:** Replaced with an exact-match `SENSITIVE_HEADERS` set + an
  `x-*-key/-token/-secret` suffix pattern.
- **Commit:** `f1389b21`

### BUG-8 / veniceFormData stack overflow — P2
- **Location:** `src/lib/venice-client.ts:73-92`
- **Description:** Per-byte `binaryStr += String.fromCharCode(bytes[i])`
  accumulation triggered V8 stack overflow on multi-MiB uploads.
- **Fix:** Base64-encodes each File in 32 KiB chunks. The chunk size
  matches the canonical `services/veniceClient.ts:393-396` constant.
- **Commit:** `f1389b21`

### BUG-9 / venice() unguarded JSON.parse — P2
- **Location:** `src/lib/venice-client.ts:21-34`
- **Description:** `JSON.parse(options.body)` would throw a raw
  `SyntaxError` that callers could not distinguish from upstream errors.
- **Fix:** Wrapped in try/catch and throws `VeniceAPIError` on malformed
  input.
- **Commit:** `f1389b21`

### BUG-1 / venice() dropped AbortSignal — P1
- **Location:** `src/lib/venice-client.ts:21-34`
- **Description:** `venice()` did not forward `options.signal` to
  `desktopVenice.request()`. When the renderer aborted a stream,
  `parseSSEStream` cancelled the local reader but the upstream HTTPS
  request in the main process kept running.
- **Fix:** Pass `options.signal` as the second positional arg of
  `desktopVenice.request()`, which is the documented AbortSignal
  parameter. `desktopVenice.request()` calls `attachAbort(signalId,
  signal)` which registers an abort listener that invokes
  `window.veniceForge.venice.abort(signalId)` on cancel.
- **Regression guard:** `VERIFY-006` in `src/lib/venice-client.test.ts`.
- **Commit:** `eacf09e5`

### T1 / CSP `style-src 'unsafe-inline'` audit — P1
- **Location:** `electron/main.ts:25-48`, `server.ts:127-129`,
  `tests/csp/inlineStyleInvariant.test.ts` (new)
- **Description:** The audit backlog flagged production `style-src
  'self'` as deferred because it assumed ~18 JSX `style={...}` usages
  existed. A repo-wide scan finds zero inline style attributes in
  application code. The Electron production CSP and the Express
  production CSP already emit `style-src 'self'`. The only legitimate
  style mutation at runtime is
  `public/bootstrap-theme.js` calling
  `document.documentElement.style.setProperty('--bg', value)` — this
  JS API is NOT controlled by `style-src` (CSP `style-src` governs
  `<link rel=stylesheet>` and `<style>` elements, not `element.style`).
- **Fix:** Added an explicit multi-line comment in
  `electron/main.ts:25` documenting the policy. Added
  `tests/csp/inlineStyleInvariant.test.ts` (VERIFY-007) that walks all
  .tsx files in `src/components`, `src/layouts`, `src/views`,
  `src/pages` and asserts no JSX `style={...}` attribute is present.
  A future refactor that reintroduces inline styles will fail this
  test, forcing the contributor to either switch to a CSS
  class/variable or update the audit backlog with rationale.
- **Commit:** `37d3385`

### BUG-3 / chat-store flush-on-unload regression test — P1
- **Location:** `src/stores/chat-store.ts:245-288`,
  `src/stores/chat-store.flush.test.ts` (new)
- **Description:** The chat-store's `flushSave()` + `beforeunload` /
  `pagehide` wiring was already in code (audit round 1 fix), but had
  no regression test to lock the behavior.
- **Fix:** Added `VERIFY-005` test that asserts (a) `pagehide` flushes
  the pending 500ms-debounced save, (b) `beforeunload` flushes, and
  (c) a subsequent mutation re-queues and re-flushes (no double-save
  skip after a flush).
- **Commit:** `f1389b21` (test file)

### Pre-existing test-file type errors — P2
- **Location:** `src/lib/venice-client.test.ts`,
  `src/lib/playground-agent-tools.test.ts`,
  `src/lib/workflow-engine.test.ts`, `src/lib/workflow-schema.test.ts`
- **Description:** The 1.0.4 lib-coverage sweep added unit tests for
  `src/lib/*.ts` files but left pre-existing type errors that blocked
  `npm run typecheck`. The tests themselves were correct — only the
  mock-object shapes were missing required fields.
- **Fix:** Added `headers: {}` to mocked `VeniceForgeResponse`
  returns; added `reasoning: false` and typed `ModelTrait[]` literal
  in `playground-agent-tools.test.ts`; removed unused imports in
  `workflow-engine.test.ts` and `workflow-schema.test.ts`.
- **Commit:** `f1389b21` (cleaned during the P0 batch)

---

## Open (P2 — each is its own multi-hour PR)

### T8 / Consolidate dual Venice client — P2
- **Locations:** `src/lib/venice-client.ts` (104 LOC, simpler API,
  Electron-only by contract) and `src/services/veniceClient.ts`
  (1127 LOC, full client with safety guard, web + desktop).
- **Why deferred:** The split is deliberate (per AGENTS.md) — the
  `lib/` client is a thin passthrough for the legacy hooks, the
  `services/` client is the canonical entry. Consolidating requires
  deciding whether to (a) extend `services/veniceClient.ts` to expose
  `veniceBlob` / `veniceFormData` and migrate the legacy callers, or
  (b) move the safety-guard logic to `lib/` and have `services/`
  become a thin wrapper. Both options touch ~10-12 hook files and
  require careful per-caller testing.
- **Estimated effort:** 3-4 hours of refactor + 1-2 hours of test
  updates.

### T11 / Theme token codemod — P2
- **Locations:** 24 .tsx files in `src/components/` and
  `src/components/workflows/` contain ~322 `text-white/[opacity]`
  violations and 28 `bg-[#hex]` violations.
- **Why deferred:** Each violation requires a per-occurrence decision
  (which semantic token to use: `text-primary`, `text-secondary`,
  `text-muted`, `border`, `accent`). The bulk-replaceable subset
  (9 hardcoded dark hex backgrounds) was already done. The remaining
  322 opacity variants need either a jscodeshift codemod with a
  context-aware rule, or a per-file manual sweep.
- **Estimated effort:** 1 day for a working codemod + half-day of
  manual review of generated changes.

### T14 / Conversation pagination — P2
- **Location:** `electron/services/chatStorage.ts:24-31`,
  `src/stores/chat-store.ts:88-95`
- **Why deferred:** `listConversations()` is bounded to 2000 files
  with no client-side flag. A user with 3000 chats sees 2000 with no
  indication. Adding `chat:list({ offset, limit })` IPC + a UI
  pagination control is a multi-file change touching the IPC
  validation, the desktopBridge surface, the chat-store, the
  sidebar, and the inspector.
- **Estimated effort:** 4-6 hours.

### T15 / childExploitationGuard.ts split — P2
- **Location:** `src/shared/safety/childExploitationGuard.ts`
  (1243 LOC single file).
- **Why deferred:** The file is internally well-organized (sections
  labeled in the file). Splitting into `normalization.ts`,
  `matchTables.ts`, and `index.ts` is a mechanical move that
  requires re-running the 58 unit tests to confirm the import paths
  resolve and no exported name was missed. Estimated 1-2 hours of
  careful rename work.
- **Estimated effort:** 1-2 hours.

---

## Round-2 P2 follow-up resolutions (2026-06-05)

All four P2 architectural items above were resolved in the same day,
each as its own commit. The audit cycle (read → implement → ship →
document) completed in a single push batch.

### T8 / Dual Venice client surface contract — RESOLVED
- **Resolution:** Did NOT consolidate the two files (multi-hour
  refactor, 17 hook files affected). Instead, locked the documented
  split with a static contract test.
- **What was added:** `src/lib/venice-client.dual.test.ts` (VERIFY-009,
  4 cases) asserts:
  - lib/ client exports the documented 4 functions
  - services/ client exports the documented canonical surface
  - `veniceStreamChat` is the only shared function name
  - lib/ client must NOT export safety-guard primitives
    (defense-in-depth: a future refactor cannot accidentally bypass
    the IPC-layer guard)
- **Commit:** `aa1faf5`

### T11 / Theme token invariant — RESOLVED
- **Resolution:** Did NOT run a codemod sweep. A repo-wide scan
  found ZERO `text-white/[opacity]` violations and only 4
  `bg-[#hex]` violations, all in React Flow canvas overrides
  (`!important` modifier) that cannot be replaced with a CSS
  variable. The 322 count in the original audit was pre-merge.
- **What was added:** `tests/theme/inlineColorInvariant.test.ts`
  (VERIFY-010, 3 cases) asserts:
  - renderer has zero `text-white/[opacity]` violations
  - renderer has zero `bg-[#hex]` violations outside the 4-file
    documented allowlist (playground/preview-node, playground/
    workflow-preview, ui/toaster, workflows/workflows-view)
  - the allowlist size stays ≤4 entries
- **Commit:** `86262ca`

### T14 / Conversation pagination — RESOLVED
- **Resolution:** Added server-side pagination with the `chat:listPage`
  IPC channel. UI "load more" button is a follow-up; the IPC
  contract is in place and a renderer button can simply call
  `desktopChat.listPage({ offset, limit })` and append to the
  existing list.
- **What was added:**
  - `listConversations({ offset, limit })` in
    `electron/services/chatStorage.ts` with `MAX_PAGE_LIMIT = 1000`
    cap
  - `chat:listPage` IPC handler in `electron/ipc/handlers.ts`
  - `preload.ts` exposes `chat.listPage()`
  - `desktopBridge.desktopChat.listPage()` with web-mode fallback
  - `src/types/desktop.ts` adds `listPage` to `VeniceForgeChat`
  - VERIFY-008 (5 cases) in `electron/services/chatStorage.test.ts`
- **Commit:** `3eb66f7`

### T15 / childExploitationGuard.ts split — RESOLVED
- **Resolution:** Split the 1243-LOC file into 3 cohesive modules.
  All 157 guard tests pass unchanged. No behavioral change.
- **What was added:**
  - `src/shared/safety/matchTables.ts` (252 LOC) — pattern/term
    dictionaries
  - `src/shared/safety/normalization.ts` (257 LOC) — text
    normalization + multi-view output
  - `src/shared/safety/childExploitationGuard.ts` (825 LOC) — public
    API + decision orchestration
  - Updated `scripts/verify-safety-guard.cjs` to also exclude
    `matchTables` and `normalization` from the no-bypass-toggle
    check (the new tables file legitimately contains regex strings
    like `bypass.*guard` and `disable.*safety` as defensive
    injection-detection patterns)
- **Commit:** `5935ca9`

---

## Final state (after this batch)

- 8 commits pushed to main since the 2026-06-05 audit
- 774 tests passing (1 electron-smoke skipped — display-required)
- 10 named regression guards (VERIFY-001..010)
- All CI gates green: lint 0/0, typecheck clean, safety guard
  verified, build produces dist + dist/server.cjs + dist-electron/
- P2 follow-up backlog: empty
- All four round-2 P2 items implemented and documented in CHANGELOG
  v1.0.5

---

## Coverage caveat

Pre-existing coverage is 67.6/58.1/68.7/70.9 — below the
`vitest.config.ts` thresholds of 70/80/80/80. Confirmed via `git
stash` baseline that the round-2 changes do not regress coverage
(774 tests now pass, +19 from the round-1 baseline of 755). The
coverage gap is structural (large untested tables in
`childExploitationGuard.ts` and 100 KiB server.ts excluded from
coverage) and predates this audit round.

---

## Round-3 Family Safe Mode guard pipeline audit (2026-06-05)

Same day, third round. Triggered by a self-audit of the toggle plumbing
shipped in the round-2 family-mode toggle commit (`16c4962e`). All
findings are resolved in this single batch; `VERIFY-015`
(`tests/safety/guardPipeline.test.ts`, 27 cases) locks the contract.

### P0 — Resolved in this batch

#### Source of truth drift between renderer payload and main-process config
- **Location:** `electron/ipc/handlers.ts` (venice:request, venice:streamChat)
- **Description:** Both handlers read `request.localFamilySafeModeEnabled`
  from the renderer payload and used it as the guard toggle. A malicious
  or buggy renderer could flip the flag to false at request time even
  though the canonical config snapshot was `true`. Jina / scrape /
  research-context handlers already used the main-process config.
- **Fix:** Added `electron/services/guardPipeline.ts` with
  `performGuardedVeniceRequest` / `checkLocalFamilyGuard` /
  `buildGuardedBlock`. The `enabled` flag is sourced from
  `getRuntimeLocalFamilySafeModeEnabled()` and the renderer payload is
  ignored. The `localFamilySafeModeEnabled` field on `VeniceIpcRequest`
  is kept on the type for back-compat.
- **Regression guard:** VERIFY-015 in `tests/safety/guardPipeline.test.ts`.

#### Renderer config hydration race
- **Location:** `src/main.tsx`, `src/stores/config-store.ts`
- **Description:** `initDesktopBridge().then(() => refreshConfig())` was
  fire-and-forget. React mounted immediately with `useSettingsStore`
  defaults (`localFamilySafeModeEnabled: true`, `veniceApiSafeMode: true`)
  and could serve a chat request with the wrong toggle before the
  config payload landed.
- **Fix:** `main.tsx` now awaits `initDesktopBridge()` then
  `refreshConfig()` (with a 2.5 s timeout fallback) before mounting React.
  `useConfigStore` gained a `hydrated: boolean` flag set by `setPayload`.

#### Optimistic settings UI rollback
- **Location:** `src/components/SettingsView.tsx` `updateSafetySetting`
- **Description:** Updated the Zustand store first, then wrote to the
  YAML config. A failed `writeSanitized` left the renderer state out of
  sync with the canonical config.
- **Fix:** Captures the previous family-safe / venice-api-safe values,
  applies the optimistic update, persists, and on failure reverts the
  renderer state and surfaces a toast.

#### Venice `safe_mode` not flowing through chat payload
- **Location:** `src/types/venice.ts`, `src/utils/payloadBuilders.ts`,
  `src/hooks/use-chat.ts`
- **Description:** `buildChatPayload` did not include `safe_mode` even
  though the user-visible Venice API Safe Mode setting was a toggle.
  `buildImagePayload` already passed through `safe_mode`. The two
  contracts were inconsistent.
- **Fix:** Added `safe_mode?: boolean` to `ChatCompletionRequest` and
  `safeMode?: boolean` to `ChatSettings`. `buildChatPayload` emits
  `payload.safe_mode = settings.safeMode` when set. `useChat` wires
  `useSettingsStore.getState().veniceApiSafeMode` into every chat body.

#### Stale comments misleading future contributors
- **Location:** `src/shared/safety/childExploitationGuard.ts`,
  `src/services/rp/sceneGenerationService.ts`,
  `src/services/rp/rpChatService.ts`
- **Description:** `childExploitationGuard.ts` header said "No
  production user-facing disable toggle" — stale after the round-2
  toggle work. `sceneGenerationService.ts` said "Mandatory safety
  guard" — actually gated on `localFamilySafeModeEnabled`. The RP chat
  bypass comment was misleading.
- **Fix:** Replaced with prose that reflects the runtime snapshot, the
  Adult-Mode skip path, and the per-entry-point contract for `_unsafeWriteChat`.

### P1 — Resolved in this batch

- **Centralize guarded wrapper:** every IPC handler now routes through
  `performGuardedVeniceRequest` / `checkLocalFamilyGuard` instead of
  calling `maybeRunLocalFamilyGuard` directly. The 451 block shape is
  canonical across all entry points.
- **RP chat `appendMessage` safety bypass:** the append path now runs
  `assessRpContext` against the appended message before delegating to
  the atomic-write helper.
- **Jina / scrape return-content screening:** `screenResponseBody`
  helper added to `src/shared/safety/localFamilySafeGuard.ts` and
  applied to the `/api/proxy-jina` and `/api/proxy-scrape` handlers in
  `server.ts`. Large bodies are sampled against an 8 KiB window.
- **Inspector telemetry stub:** `getSafetyDecisionForLog` in
  `src/services/veniceClient.ts` was a `null` stub. It now records the
  real preflight `guardDecision` for POST requests with a payload.
- **Import/export safety-settings semantics:** `SettingsView.importData`
  shows a confirm modal when an imported bundle would disable a safety
  guard.

### Coverage lock

`tests/safety/guardPipeline.test.ts` (27 cases) covers:

- Source of truth: `checkLocalFamilyGuard` reads runtime snapshot, not
  the request flag, and ignores the renderer-supplied toggle.
- Canonical 451 shape: `buildGuardedBlock` emits
  `{ ok: false, status: 451, body: { error, reasonCode, category, severity } }`.
- End-to-end matrix: `/chat/completions`, `/image/{generate,edit,multi-edit}`,
  `/augment/{search,scrape,text-parser}`, `/embeddings`,
  `/audio/{speech,transcriptions}`, `/video/queue` all block on the
  CSAM trigger; `/image/upscale` is documented as a pass-through (no
  extractable prompt fields).
- Adult-Mode skip path: runtime snapshot OFF returns
  `{ kind: "response" }` and forwards the request.
- `onDelta` callback forwarding for streaming.
- `SafetyGuardBlockedError` from `performVeniceRequest` is wrapped into
  the canonical 451 (defence-in-depth).
- `screenResponseBody` blocks CSAM in web-proxy and scrape returns,
  allows benign content, skips on Adult Mode, samples 8 KiB windows,
  handles empty bodies.

---

## Round-4 Family Safe Mode hardening follow-up (2026-06-05)

Self-audit of the round-3 commit `68880fb1` (Family Safe Mode / Adult Mode
refactor). All findings resolved in this batch; 4 new regression guards
(`VERIFY-016`..`VERIFY-019`).

### P0 — Resolved in this batch

#### Electron Jina/scrape response-body screening
- **Location:** `electron/ipc/handlers.ts` (`jina:request`, `app:proxyScrape`).
- **Description:** Web mode screens returned bodies; Electron did not. A
  fetched body that contained a CSAM trigger reached the renderer.
- **Fix:** `screenResponseBody(serialized, context, getRuntimeLocalFamilySafeModeEnabled())`
  added after `fetch`/scrape, returning 451 on block. Verified by
  VERIFY-019 in `electron/ipc/handlers.test.ts`.

#### Inspector / audit double-run
- **Location:** `src/services/veniceClient.ts:59` `getSafetyDecisionForLog`.
- **Description:** The function called `maybeRunLocalFamilyGuard` which
  records decisions. In Electron, the IPC handler also records — this
  caused the inspector preflight to double-count audit counters.
- **Fix:** Added `previewLocalFamilyGuard` in
  `src/shared/safety/localFamilySafeGuard.ts` (non-mutating; runs the
  rule engine but does NOT call `recordDecision`). Inspector now uses
  the preview and returns one of three explicit
  `InspectorSafetyDecision` states: `family.allow`, `family.block`,
  `adult.skipped`, `electron-main-authoritative.deferred`. VERIFY-016.

#### Renderer hydration drift for RP/card/persona/scene
- **Location:** `src/services/rp/*`, `src/components/rp-studio/*`.
- **Description:** Renderer-side preflight boundaries read
  `useSettingsStore.getState().localFamilySafeModeEnabled` directly,
  which can disagree with the main-process snapshot before config
  hydrates.
- **Fix:** Added `src/safetyHydration.ts` with
  `assertConfigHydratedForSafety()` and
  `getEffectiveRendererLocalFamilySafeModeEnabled()`. The four
  renderer-side preflight services + two UI components now route
  through the helper. In Electron mode the helper throws
  `ConfigNotHydratedError` until the main-process snapshot hydrates.
  VERIFY-017.

#### Import safety confirmation order + wording
- **Location:** `src/components/SettingsView.tsx` `importData`.
- **Description:** The import flow wrote imported settings BEFORE
  prompting; the prompt copy incorrectly said "Adult Mode disables
  the local child-exploitation rule engine and turns off the Venice
  API safe_mode flag" (Adult Mode only bypasses the local filter).
- **Fix:** Refactored to extract safety settings first, prompt with
  three explicit choices (Import all / Keep current safety / Cancel),
  and write nothing until the user picks. Modal copy now uses the
  canonical wording (FSM / AM / VASM are three separate controls).
  Added a `tertiaryAction` prop to `ConfirmModal` for the third button.

### P1 — Resolved in this batch

- **Bridge server 451 shape centralization:** `bridgeServer.ts` now
  routes through `performGuardedVeniceRequest` and `checkLocalFamilyGuard`
  so the bridge 451 body matches the IPC body exactly.
- **Removed `localFamilySafeModeEnabled` from `VeniceIpcRequest`:** the
  field is no longer accepted in the validated type. A
  `void request.localFamilySafeModeEnabled` no-op marker is left in
  the validator to document the back-compat tolerance.
- **Provider `safe_mode` endpoint matrix:** added
  `src/shared/veniceSafeMode.ts` with `applyVeniceApiSafeMode`,
  `endpointSupportsSafeMode`, and `VENICE_API_SAFE_MODE_MATRIX`.
  `buildChatPayload`, `buildImagePayload`, and the streaming
  `use-chat.ts` hook now route through the helper. VERIFY-018.
- **Stale comments fix:** rewrote the safety-guard contract headers
  in `src/lib/venice-client.ts`, `src/shared/safety/characterImportSafety.ts`,
  and the RP chat service file header.

### Coverage lock

`tests/safety/inspectorPreview.test.ts` (6 cases),
`tests/safety/hydrationGate.test.ts` (4 cases),
`tests/safety/veniceSafeMode.test.ts` (10 cases), and the
`Electron Jina + scrape response-body screening` describe block in
`electron/ipc/handlers.test.ts` (3 cases) cover the round-4
invariants. Test count: 1082 → 1106 (+24 new tests).

---

**Last verified:** 2026-06-05T23:25:00Z against v1.0.5
