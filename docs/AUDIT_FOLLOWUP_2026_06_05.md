# Venice Forge — Round-2 Audit Follow-Ups (2026-06-05)

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

## Coverage caveat

Pre-existing coverage is 67.6/58.1/68.7/70.9 — below the
`vitest.config.ts` thresholds of 70/80/80/80. Confirmed via `git
stash` baseline that the round-2 changes do not regress coverage
(762 tests now pass, +7 from the round-1 baseline of 755). The
coverage gap is structural (large untested tables in
`childExploitationGuard.ts` and 100 KiB server.ts excluded from
coverage) and predates this audit round.

---

**Last verified:** 2026-06-05T02:00:00Z against v1.0.4
