# 🔍 Venice Forge — Comprehensive Codebase Review
**Swarm Audit Report** | React 19 + TS Strict + Electron 42 + Zustand 5
**Date:** 2026-06-09
**Method:** 5 parallel agent review (Code Quality, UI/UX, Security, Architecture, Performance/Testing)

> ## ⚠️ HISTORICAL — DO NOT TREAT AS GROUND TRUTH
>
> This report is a **point-in-time snapshot from 2026-06-09** and is **partially
> superseded**. Findings have three states in this document:
>
> 1. **Fixed** — addressed in commits after 2026-06-09; check the git log and
>    `docs/summary_of_work.md` for the closure entry. The strikethrough
>    `~~P0-N — title~~` marker indicates the item was closed.
> 2. **False positive** — the original claim did not reproduce on inspection;
>    the agent hallucinated the finding. The strikethrough + `❌ FALSE POSITIVE`
>    marker indicates the claim was rejected.
> 3. **Stale / unresolved** — the original claim may still be valid but the
>    surface has changed (code path renamed, refactored, or hardened). Do not
>    act on the original line numbers without re-verifying against the
>    current tree.
>
> For the **current** canonical safety / packaging / privacy / status
> audit snapshot, see the latest entries in `docs/summary_of_work.md`
> (Session History + Open TODO Ledger) and the audit-script run results in
> the **Validation Matrix** section. The 2026-06-09 round-1 audit and the
> 2026-06-06 round-2 audit (`docs/POST_VENICE_JINA_AUDIT_2026_06_06.md`)
> remain as historical context only.

---

## 🚨 P0 — CRITICAL (Fix Immediately)

### 1. ~~Runtime Crash: Project Deletion Calls Non-Existent Method~~ ❌ FALSE POSITIVE
| | |
|---|---|
| **File** | `src/stores/project-store.ts:125` |
| **Original Claim** | `deleteProject` calls `useChatStore.getState().load()` when `_hasLoadedHistory` is false. |
| **Verification** | The code checks `_hasLoadedHistory` and returns a user-facing error string; **no `.load()` call exists**. The agent hallucinated this finding. |
| **Status** | No fix needed. **Removed from TODOs.** |

### 2. ~~Missing ApiKeyDialog Build Blocker~~ ❌ FALSE POSITIVE
| | |
|---|---|
| **File** | `src/components/layout/api-key-dialog.tsx` |
| **Original Claim** | File is missing, causing `typecheck` and `build:web` failures. |
| **Verification** | File **exists** at `src/components/layout/api-key-dialog.tsx` (4,283 bytes). Both `npm run typecheck` and `npm run build:web` **pass cleanly**. |
| **Status** | No fix needed. |

### 3. ~~Chat "Bad Request" Diagnostics~~ ✅ ALREADY FIXED
| | |
|---|---|
| **Files** | `src/shared/veniceSafeMode.ts`, `src/lib/venice-client.ts`, `src/hooks/use-chat.ts` |
| **Original Claim** | Chat 400 Bad Request from unsupported `safe_mode` on `/chat/completions`, error bodies discarded, legacy transport used. |
| **Verification** | Fixed in 2026-06-09 session: (1) `/chat/completions` removed from `ENDPOINTS_WITH_SAFE_MODE`, (2) `readVeniceErrorBody()` helper added, (3) `use-chat.ts` migrated to `veniceStreamChat()`. All tests pass. |
| **Status** | Fixed. See `docs/summary_of_work.md` 2026-06-09 entry. |

### 4. Web Build Broken: Desktop-Only Client Used by ~10 Web-Facing Modules ✅ FIXED
| | |
|---|---|
| **Files** | `src/lib/venice-client.ts` (source); `src/hooks/use-image.ts`, `use-music.ts`, `use-video.ts`, `use-audio.ts`, `use-embeddings.ts`, `use-styles.ts`, `use-models.ts`, `use-model-catalog.ts`, `use-image-tools.ts`, `src/services/characterService.ts`, `src/services/prompt-enhancer-service.ts` (consumers) |
| **Issue** | `src/lib/venice-client.ts` unconditionally called `desktopVenice.request()`, which threw in web mode. Every consumer was **non-functional in the browser build**. |
| **Fix** | Added web-mode fallbacks to all exported functions (`venice`, `veniceStreamChat`, `veniceBlob`, `veniceFormData`) in `src/lib/venice-client.ts`. When `!isElectron()`, the functions now use `fetch` to the Express proxy with the same error-body extraction, `X-Venice-Forge-Family-Safe-Mode` header, and `VeniceAPIError` throwing behavior as the desktop path. |
| **Validation** | `npm run typecheck` pass; `npm run build` pass; `npx vitest run src/lib/venice-client.test.ts src/lib/venice-client.dual.test.ts` 16/16 pass; full `npm test` 1948/1948 pass. |

### 5. Data Integrity: Media Store Orphan Records & Non-Atomic Bulk Mutations ✅ FIXED
| | |
|---|---|
| **File** | `src/stores/media-store.ts:160-183` (orphans); `240-289` (bulk tags) |
| **Issue** | (a) `upsertDerivative` rollback swallows `deleteMedia` failures, leaving orphaned child records in IDB. (b) `addTagsMany` / `removeTagMany` use `Promise.all`; if one `patchMedia` fails, memory state never updates but successful patches persist in IDB, causing divergence. |
| **Fix** | (a) `upsertDerivative` now surfaces rollback failures via toast/lastError and keeps the child in memory if rollback fails (matches IDB reality). (b) `addTagsMany` / `removeTagMany` now use `Promise.allSettled`, update memory only for successes, and report failures via toast. |
| **Validation** | `npm test` — `src/stores/media-store.test.ts` 30/30 pass. |

### 6. Safety Guard Bypass: Web Proxy Trusts Client Header ✅ FIXED
| | |
|---|---|
| **File** | `server.ts:32-34` |
| **Issue** | `isLocalFamilySafeModeEnabled(req)` returns `true` unless the `X-Venice-Forge-Family-Safe-Mode` header is exactly `"false"`. A malicious HTTP client can send `false` to **bypass** the child-exploitation safety gate entirely. |
| **Fix** | Added `VENICE_FORGE_LOCAL_FAMILY_SAFE_MODE_ENABLED` env override. When set, the proxy ignores the client header and uses the server-side value as authoritative. Updated `.env.example` with secure default. |
| **Validation** | `npm test` — `server.test.ts` 24/24 pass. |

### 7. Arbitrary File Write via IPC ✅ FIXED
| | |
|---|---|
| **File** | `electron/ipc/handlers.ts:1146-1155`, `electron/services/configService.ts:785-817` |
| **Issue** | `config:exportTemplate` accepts a `targetPath` from the renderer with only non-empty/URL validation. No path traversal protection. A compromised renderer can write to any writable path (e.g., `~/.bashrc`, Startup folder). |
| **Fix** | Restricted to Downloads/Documents with `fs.realpath` + containment checks. Added path-length, null-byte, and symlink resolution validation. Added tests for traversal, empty, and null-byte rejection. |
| **Validation** | `npm test` — `electron/services/configService.test.ts` 24/24 pass. |

### 8. Performance: Whole-Store Zustand Subscriptions Cause Excessive Re-Renders
| | |
|---|---|
| **Files** | `src/components/SettingsView.tsx:24,32`, `src/components/CharactersView.tsx:194`, `src/hooks/use-chat.ts:28-41` |
| **Issue** | These components/hooks call `useAuthStore()`, `useSettingsStore()`, `useChatStore()`, `useCharacterStore()` **without selectors**, subscribing to the entire store. Any field mutation re-renders the entire heavy component tree. |
| **Fix** | Use atomic selectors: `const isConfigured = useAuthStore(s => s.isConfigured)`. |

---

## ⚠️ P1 — HIGH (Fix in Next Sprint)

### Code Quality & Bugs

| # | File | Issue | Fix |
|---|------|-------|-----|
| 7 | `src/services/rp/sceneGenerationService.ts:141` | Direct `fetch("/api/venice/image/generate")` bypasses canonical `veniceFetch()`, skipping safety logging, telemetry, and retry logic. | Route through `veniceFetch()`. |
| 8 | `src/hooks/use-chat.ts`, `src/components/image/image-view.tsx`, `StatusView.tsx`, `memory-panel.tsx`, `chat-view.tsx` | **~40+ direct `window.veniceForge.*` calls** outside `desktopBridge.ts` (AGENTS.md violation). | Route through `desktopBridge.ts` exports. |
| 9 | `src/services/veniceClient.ts:876-877` | Dedupe path uses unsafe `as` cast; mismatched generics can cause runtime type violations. | Remove dedupe or add runtime validation. |
| 10 | `src/services/veniceClient.ts:1056-1111` | Streaming web mode uses two independent 5-min timeouts → ~10 min total stall possible. | Use a single shared deadline. |
| 11 | `electron/services/bridgeServer.ts:108-117` | 5-min bridge timeout unconditionally calls `res.end()` on active SSE streams, cutting them off mid-response. | Disable/reset timeout for streaming routes. |
| 12 | `src/hooks/use-music.ts:37-65`, `use-video.ts:39-67` | Polling race: slow `setInterval` callback can overwrite successful state with a later error. | Track latest request ID; ignore stale responses. |
| 13 | `src/utils/timeout.ts:27-39` | `createTimeoutSignal` leaks `parentSignal` listener when timeout fires first. | Explicitly `removeEventListener` in timeout handler. |
| 14 | `src/stores/chat-store.ts:75-89` | `touchConversation` uses explicit allowlist for metadata, silently dropping any new fields added to `Conversation` type. | Spread `...conv.metadata` first, then override computed fields. |
| 15 | `src/stores/media-store.ts:434-436`, `477-483` | Unchecked `a.image.length` and `item.prompt.toLowerCase()` can crash on malformed records. | Add runtime type guards. |
| 16 | `src/stores/media-bulk-actions.ts:218` | Unsafe `undefined as unknown as string` cast to represent "unassign project". | Widen `MediaItemPatch.projectId` to `string \| null \| undefined`. |

### Security

| # | File | Issue | Fix |
|---|------|-------|-----|
| 17 | `server.ts:401-493`, `496-634` | **No rate limiting** on `/api/proxy-jina` and `/api/proxy-scrape`. Open to resource abuse and SSRF amplification. | Mount shared rate-limiter on these endpoints. |
| 18 | `electron/main.ts:248-255` | `--bridge-host` CLI arg is passed unvalidated to `startBridgeServer()`. `0.0.0.0` expands attack surface. | Allowlist host to `["127.0.0.1", "localhost", "::1"]`. |
| 19 | `electron/services/bridgeServer.ts:233` | Catch-all error handler returns raw `err.message`, potentially leaking internal details. | Return generic `"Internal server error"`. |
| 20 | `electron/services/veniceClient.ts:223-225` | `logError("Failed to prepare Venice request body", err)` could leak unredacted body fragments in pathological cases. | Explicitly redact error message before logging. |
| 21 | `electron/ipc/handlers.ts:557-595` | `app:saveRoutedImage` does not restrict file extensions. Renderer can write `.exe`, `.bat`, `.sh`, etc. | Whitelist safe image extensions only. |

### UI/UX & Accessibility

| # | File | Issue | Fix |
|---|------|-------|-----|
| 22 | `src/components/command-palette/CommandPalette.tsx` | **No focus trap**. Tab navigation escapes the modal, focus is not restored on close. | Apply `useFocusTrap` hook. |
| 23 | `src/components/status/DiagnosticsDrawer.tsx` | **No focus trap**. Keyboard users can Tab out of the drawer into the underlying page. | Apply `useFocusTrap`. |
| 24 | `src/components/gallery/gallery-view.tsx` (modals) | Compare/lineage/export modals lack focus trapping. | Apply `useFocusTrap` to all modals. |
| 25 | `src/components/ui/select.tsx` (or equivalent) | Select component lacks ARIA `listbox` pattern, `aria-expanded`, `aria-selected`, keyboard navigation. | Implement full ARIA listbox pattern. |
| 26 | `src/components/chat/message-bubble.tsx` | Assistant avatar SVG lacks `role="img"` and `aria-label`/`aria-hidden`. | Mark as decorative with `aria-hidden="true"` or add label. |
| 27 | Multiple | Many range inputs, selects, and textareas lack associated `<label>` or `aria-label`. | Audit forms in ImageView, VideoView, AudioView, SettingsView. |
| 28 | `src/components/video/video-view.tsx`, `audio/audio-view.tsx` | Toggle buttons lack `aria-pressed`. | Add `aria-pressed={isActive}`. |
| 29 | `src/components/video/video-view.tsx` | Dropzone is not keyboard accessible (no `tabIndex`, no Enter/Space handler). | Add keyboard activation. |

### Performance & Memory Leaks

| # | File | Issue | Fix |
|---|------|-------|-----|
| 30 | `src/stores/chat-store.ts:473-479` | Module-level `window.addEventListener("beforeunload", ...)` and `"pagehide"` registered at import time; **never removed**. | Move into mountable `init()` with cleanup. |
| 31 | `src/services/veniceClient.ts:100` | Module-level `window.addEventListener("beforeunload", ...)` for `inFlight.clear()`; **never removed**. | Provide `dispose()` / `removeEventListener`. |
| 32 | `src/hooks/use-chat.ts:166-177`, `198-209` | `AbortController` created during `send()`/`regenerate()` is not aborted if component unmounts mid-stream. | Add `useEffect` cleanup that calls `abortRef.current?.abort()`. |
| 33 | `src/main.tsx:19-22` | Module-level `window.addEventListener("unhandledrejection")` and `"error"`; **never removed**. | Wrap in React effect or provide cleanup. |
| 34 | `src/components/playground/playground-view.tsx:73,80` | `setTimeout` for toast dismissal stored nowhere; leaks on unmount. | Store timeout ID in `useRef`; clear in cleanup. |
| 35 | `src/components/chat/message-bubble.tsx:39,95` | `setTimeout` for copy feedback not tracked; leaks on unmount. | Store timeout IDs in refs; clear in cleanup. |
| 36 | `src/components/gallery/gallery-view.tsx:423`, `media-inspector.tsx:228` | `setTimeout(() => URL.revokeObjectURL(url), 0)` leaks if component unmounts before microtask drains. | Revoke synchronously in effect cleanup. |
| 37 | `src/components/gallery/media-detail-dialog.tsx:180` | Filmstrip renders `allItems.map(...)` unconditionally with no virtualization. | Use `@tanstack/react-virtual` or paginate. |
| 38 | `src/components/chat/chat-view.tsx:229-231` | Inline arrow functions passed to `MessageBubble` cause re-render of every message on any parent update. | Wrap `MessageBubble` in `React.memo` + stable `useCallback` handlers. |
| 39 | Codebase-wide | **Zero** usage of `React.memo` in `src/components/`. | Wrap pure presentational components (`Badge`, `Avatar`, `MediaCard`, icons) in `React.memo`. |
| 40 | `src/App.tsx` | `SettingsView` (1,147 lines), `SearchScrapeView` (789 lines), `MediaStudioView` (927 lines) eagerly imported. | Wrap in `React.lazy()` + `Suspense`. |

### Architecture & Patterns

| # | File | Issue | Fix |
|---|------|-------|-----|
| 41 | 7+ files | **~40+ direct `window.veniceForge` calls** outside `desktopBridge.ts` and `chat-store.ts`. | Enforce with ESLint rule; refactor to canonical bridge. |
| 42 | 1 file | Direct `fetch('/api/venice/...')` outside `veniceClient.ts` / `server.ts`. | Route through canonical client. |
| 43 | 8+ stores | Stores cross-import each other (e.g., `storage-privacy-store.ts` imports many stores), creating tight coupling. | Invert dependencies via events or a registry. |
| 44 | Codebase-wide | **599+ `as` type assertions** in `.ts/.tsx`. Many defeat strict mode. | Audit top 50; replace with runtime validators. |
| 45 | 19 files | Files > 400 lines; 8 files > 700 lines. | Split into container + presentational sub-components. |

---

## 📋 P2 — MEDIUM (Address in Following Sprint)

### Testing Gaps & Quality

| # | File | Issue | Fix |
|---|------|-------|-----|
| 46 | `src/components/SettingsView.tsx` (1,147 lines) | **Zero tests** for API key dialogs, import/export, safety toggles, theme picker, Electron updates. | Create `SettingsView.test.tsx`. |
| 47 | `src/components/SearchScrapeView.tsx` (789 lines) | **Zero tests** for research/scrape/social-discovery UI. | Create `SearchScrapeView.test.tsx`. |
| 48 | `src/data/promptStarters.ts` (936 lines) | **Zero tests** for data integrity. | Add shape validation tests. |
| 49 | `src/types/rp.ts` (501 lines) | No dedicated tests for `isValidRpId` or constants. | Add `rp.test.ts`. |
| 50 | `src/services/cryptoService.test.ts:56` | Uses `Math.random()` for test data → non-deterministic / potentially flaky. | Use fixed seeded values. |
| 51 | `src/services/veniceClient.test.ts:55-57` | Timing assertion `expect(Date.now() - start).toBeGreaterThanOrEqual(40)` without mocked clock. | Mock timers or loosen threshold. |
| 52 | `src/components/gallery/gallery-view.test.tsx:137` | `await new Promise(r => setTimeout(r, 0))` relies on real event loop ordering. | Use `vi.advanceTimersByTimeAsync(0)`. |
| 53 | `src/utils/timeout.test.ts:7,21` | `vi.useFakeTimers()` in `it` but `vi.useRealTimers()` at end of block; throws before restore → cascade failures. | Move restore to `afterEach` or `finally`. |
| 54 | Many test files | Widespread `expect(...).toBe(true)` / `.toBe(false)` tautologies. | Replace with semantic matchers. |
| 55 | `src/components/scenes/SceneComposerView.test.tsx` | ~20 consecutive `waitFor` calls with **no error messages**. | Add `{ message: "..." }` to every `waitFor`. |

### UI/UX Polish

| # | File | Issue | Fix |
|---|------|-------|-----|
| 56 | Codebase-wide | Missing `prefers-reduced-motion` support for animations. | Add Tailwind `motion-reduce:` prefixes. |
| 57 | `src/components/gallery/lineage-viewer.tsx` | Cycle warning not announced to screen readers. | Add `role="alert"` / `aria-live="polite"`. |
| 58 | Scrollable containers | Many scrollable regions lack `tabIndex={0}`. | Add to all overflow-auto/scroll containers. |
| 59 | `src/components/layout/sidebar.tsx:238` | `setTimeout(() => URL.revokeObjectURL(url), 1000)` — 1s delay increases leak risk. | Revoke immediately or track in ref. |

### Security Defense-in-Depth

| # | File | Issue | Fix |
|---|------|-------|-----|
| 60 | `src/services/desktopBridge.ts:82,108` | Renderer still sends ignored `localFamilySafeModeEnabled` field in IPC payload (regression risk). | Remove dead field from renderer payload. |

---

## 🛠️ Quick-Win Priority List

| Priority | Action | Status | Estimated Time |
|----------|--------|--------|----------------|
| **P0** | ~~Fix `project-store.ts` missing `load()` call~~ | ❌ False positive | — |
| **P0** | ~~Fix missing `ApiKeyDialog`~~ | ❌ False positive (file exists, build passes) | — |
| **P0** | ~~Fix chat "Bad Request" diagnostics/payload~~ | ✅ Already fixed (2026-06-09) | — |
| **P0** | Fix web-mode `src/lib/venice-client.ts` desktop-only breakage | 🔄 In progress | 2-4 hours |
| **P0** | Fix media-store atomicity / orphan issues | ✅ Fixed | — |
| **P0** | Fix web proxy safety guard bypass (server-side config) | ✅ Fixed | — |
| **P0** | Add path containment to `config:exportTemplate` | ✅ Fixed | — |
| **P0** | Fix archive/source-drop hygiene | ✅ Passes (`verify:archive-clean` OK) | — |
| **P1** | Add focus traps to CommandPalette, DiagnosticsDrawer, Gallery modals | ⏳ Pending | 1 hour |
| **P1** | Fix whole-store Zustand subscriptions (SettingsView, CharactersView, useChat) | ⏳ Pending | 30 min |
| **P1** | Move module-level event listeners into mountable/cleanable functions | ⏳ Pending | 1 hour |
| **P1** | Abort `AbortController` on unmount in `use-chat.ts` | ⏳ Pending | 10 min |
| **P1** | Add rate limiting to Jina/scrape proxies | ⏳ Pending | 30 min |
| **P1** | Fix `createTimeoutSignal` parentSignal leak | ⏳ Pending | 15 min |
| **P2** | Add `React.memo` to `MessageBubble` + stable callbacks | ⏳ Pending | 15 min |
| **P2** | Add `waitFor` error messages to flaky tests | ⏳ Pending | 20 min |
| **P2** | Lazy-load heavy views in `App.tsx` | ⏳ Pending | 20 min |

---

## ✅ Verified Protections (Working Correctly)

The audit confirmed these security/safety mechanisms are **properly implemented and not vulnerable**:

- ✅ Secret redaction (`redactSecrets`, `redactErrorMessage`, logger redaction)
- ✅ IPC input validation (most handlers validate `VALID_ID_RE`, reject null bytes, cap lengths)
- ✅ Path traversal protection on `app:readLocalFile`, `app:media:export/import/reveal/meta` (`fs.realpath` + containment checks)
- ✅ Safety guard pipeline (`performGuardedVeniceRequest`, `checkLocalFamilyGuard`) — correctly ignores renderer-supplied flag
- ✅ CSP strict (`script-src 'self'`, no `unsafe-eval`, no inline scripts)
- ✅ Renderer hardening (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`)
- ✅ Storage encryption (`ENCRYPTED_STORES` covers all user content; AES-256-GCM for conversation vault)
- ✅ SSRF protection (`isPrivateHostname`, `isSafeUrl` cover IPv4/IPv6/short-form/IPv4-mapped IPv6)
- ✅ Bridge token (`crypto.randomBytes(32)`, constant-time `timingSafeEqual`, never logged)
- ✅ Atomic file writes (temp + rename pattern throughout)

---

## Action Log

| Date | Items Fixed | Validation |
|------|-------------|------------|
| 2026-06-09 | Report created | — |
| 2026-06-09 | Web-mode fallback in `src/lib/venice-client.ts` (`venice`, `veniceStreamChat`, `veniceBlob`, `veniceFormData`) | typecheck ✅, build ✅, 16/16 venice-client tests ✅, full suite 1948/1948 ✅ |
| 2026-06-09 | Server-side safety override in `server.ts` (`VENICE_FORGE_LOCAL_FAMILY_SAFE_MODE_ENABLED`); `.env.example` updated | server.test.ts 24/24 ✅, full suite 1948/1948 ✅ |
| 2026-06-09 | Path containment in `electron/services/configService.ts` (`exportConfigTemplate`) + 2 new tests | configService.test.ts 24/24 ✅, full suite 1948/1948 ✅ |
| 2026-06-09 | Media store atomicity (`upsertDerivative` rollback surfacing, `addTagsMany`/`removeTagMany` `Promise.allSettled`) | media-store.test.ts 30/30 ✅, full suite 1948/1948 ✅ |
| 2026-06-09 | Report corrected (removed 2 false positives, marked 4 fixes ✅, updated quick-win table) | — |
| 2026-06-09 | `docs/summary_of_work.md` updated with new session summary | — |

