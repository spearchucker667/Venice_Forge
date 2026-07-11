# Audit Validation Report: AUDIT-022 through AUDIT-051

> Historical snapshot. This report records the repository name and local path
> used when the audit was performed. The current Electron repository is
> `/Users/super_user/Projects/Venice_Forge` and the current GitHub repository
> is `spearchucker667/Venice_Forge`. Do not use paths in this report as active
> setup instructions.

**Repository:** /Users/super_user/Projects/Venice_Forge/
**Validation Date:** 2026-06-17
**Method:** File inspection, grep, evidence-based pass/fail determination

---

## AUDIT-022 — CI runner tags pinned (no -latest)
**Status:** PASS
**Evidence:**
- `.github/workflows/ci.yml` lines 18, 50, 83: `ubuntu-22.04`, `windows-2022`, `macos-14`
- `.github/workflows/release.yml` lines 18, 103, 191: `macos-14`, `windows-2022`, `ubuntu-22.04`
- No `ubuntu-latest`, `windows-latest`, or `macos-latest` strings appear in either workflow file.
**Test Evidence:** None required; static file inspection is sufficient.

---

## AUDIT-023 — CI concurrency block with cancel-in-progress
**Status:** PASS
**Evidence:**
- `.github/workflows/ci.yml` lines 12-14:
  ```yaml
  concurrency:
    group: ci-${{ github.ref }}
    cancel-in-progress: true
  ```
- `.github/workflows/release.yml` lines 12-14:
  ```yaml
  concurrency:
    group: release-${{ github.ref }}
    cancel-in-progress: true
  ```
**Test Evidence:** None required; static file inspection is sufficient.

---

## AUDIT-024 — server.ts staticRateLimiter uses req.ip || req.socket.remoteAddress || 'unknown'
**Status:** FAIL
**Evidence:**
- `server.ts` line 348 (createRateLimiter): `const ip = req.ip || "unknown";`
- `server.ts` line 918 (staticRateLimiter): `const ip = req.ip || "unknown";`
- **Neither** includes `req.socket.remoteAddress` as a fallback. The only fallback is the hardcoded string `"unknown"`.
- `req.socket.remoteAddress` is used elsewhere in `server.ts` at line 39 (`isLoopbackClient`), but not in the rate limiters.
**Test Evidence:** `server.test.ts` does not appear to test this specific fallback chain; no test asserts the presence of `req.socket.remoteAddress` in rate limiter IP resolution.

---

## AUDIT-025 — project-store.ts deleteProject uses isValidId
**Status:** FAIL
**Evidence:**
- `src/stores/project-store.ts` line 122-161 (`deleteProject`): Does **not** import or call `isValidId`.
- It performs `get().projects.find((project) => project.id === projectId)` without any ID validation.
- `isValidId` exists in `src/utils/idValidation.ts` and is used in other stores (e.g., `electron/services/characterCardStorage.ts`), but not in `project-store.ts`.
**Test Evidence:** No test for `deleteProject` ID validation exists in the project-store test suite.

---

## AUDIT-026 — diagnosticsService.ts enableJina cast removed, added to SettingsState
**Status:** FAIL
**Evidence:**
- `src/services/diagnosticsService.ts` line 248 still contains the cast:
  ```ts
  const research = settings as unknown as { enableJina?: boolean };
  ```
- `src/stores/settings-store.ts` (SettingsState interface, lines 20-70): **Does not** declare `enableJina` or `setEnableJina`.
- The field is absent from the Zustand store entirely.
**Test Evidence:** No test asserts that `enableJina` is a typed field on SettingsState.

---

## AUDIT-027 — modelService.ts model cache moved from localStorage to IndexedDB
**Status:** FAIL
**Evidence:**
- `src/services/modelService.ts` lines 20-27 explicitly use `localStorage` with inline comments:
  ```ts
  const cacheStorage = {
    get: (key: string): string | null => {
      try { return localStorage.getItem(key) /* localStorage-allowed: transient model-list cache */ } catch { return null }
    },
    set: (key: string, value: string): void => {
      try { localStorage.setItem(key, value) /* localStorage-allowed: transient model-list cache */ } catch { /* noop */ }
    },
  };
  ```
- Cache key is `venice-forge-models-cache` (line 30). No IndexedDB usage in this file.
**Test Evidence:** No test verifies IndexedDB as the model cache backend.

---

## AUDIT-028 — promptStarterService.ts remote fetch has AbortSignal timeout
**Status:** FAIL
**Evidence:**
- `src/services/promptStarterService.ts` lines 101-115 (`fetchRemotePromptStarters`):
  ```ts
  const res = await fetch(REMOTE_PROMPT_STARTERS_URL);
  ```
- No `AbortSignal` or timeout is passed to `fetch`. The function is also disabled by default (`ENABLE_REMOTE_PROMPT_STARTERS = false`).
**Test Evidence:** No test exercises the remote fetch path with timeout/abort.

---

## AUDIT-029 — chat-store.ts / media-store.ts hardcoded constants moved to central file
**Status:** FAIL
**Evidence:**
- `src/stores/chat-store.ts` lines 487, 491: `const DEBOUNCE_MS = 500` and `const MAX_DIRTY_CONVERSATIONS = 1000` are module-level hardcoded constants.
- `src/stores/media-store.ts` lines 64, 69: `export const MEDIA_PAGE_SIZE = 60` and `export const MEDIA_IN_MEMORY_CACHE_MAX = 1000` are module-level hardcoded constants.
- No central constants file (e.g., `src/constants/store.ts`) exists that exports these values.
**Test Evidence:** Tests reference these constants directly (e.g., `chat-store.dirty.test.ts` line 153 mentions `MAX_DIRTY_CONVERSATIONS`, `media-store.test.ts` imports `MEDIA_IN_MEMORY_CACHE_MAX`), confirming they are local to each module.

---

## AUDIT-030 — chat-store.ts markDirtyConversation validates id
**Status:** FAIL
**Evidence:**
- `src/stores/chat-store.ts` line 493-504 (`markDirtyConversation`):
  ```ts
  function markDirtyConversation(id: string, conv: Conversation): void {
    dirtyConversations.set(id, conv)
    if (dirtyConversations.size > MAX_DIRTY_CONVERSATIONS) {
  ```
- Accepts any `string` id without length checks, format validation, or null/empty guards.
- `isValidId` from `src/utils/idValidation.ts` is not imported or used.
**Test Evidence:** `src/stores/chat-store.dirty.test.ts` tests dirty tracking and flush behavior, but no test case asserts ID validation (e.g., empty string, invalid format, or too-long id).

---

## AUDIT-031 — veniceClient.ts retry backoff centralized
**Status:** FAIL
**Evidence:**
- `src/services/veniceClient.ts` line 159 defines `calculateBackoff(attempt, baseMs = 1000, maxMs = 8000)`.
- **Desktop path** uses `calculateBackoff` at lines 571, 614, and 653.
- **Web path** (`_veniceFetch`, line ~786) uses **inline** backoff for HTTP retryable errors:
  ```ts
  await sleep(
    response.status === 429
      ? computeRateLimitWait(diagHeaders, attempt)
      : Math.min(1000 * Math.pow(2, attempt + 1), 8000),
    signal
  );
  ```
- The web retry path does **not** call `calculateBackoff`. The `audit_report.yaml` (line 664) explicitly flags this discrepancy.
**Test Evidence:** `src/lib/venice-client.test.ts` (VERIFY-006/VERIFY-031) tests abort forwarding, but no test asserts that all retry paths use the shared `calculateBackoff` helper.

---

## AUDIT-032 — SettingsView.tsx buttons have type='button'
**Status:** FAIL
**Evidence:**
- `src/components/SettingsView.tsx` contains ~30 `<button>` elements; **zero** have `type="button"`.
- Examples at lines 317, 320, 323, 379, 395, 402, 435, 451, 458, 645, 651, 666, 672, 711, 741, 749, 894, 901, 908, 944, 968.
- All are navigation/action buttons without explicit `type` attributes, which makes them default to `type="submit"` if placed inside a form.
**Test Evidence:** No test asserts `type="button"` on SettingsView buttons.

---

## AUDIT-033 — sidebar.tsx buttons have type='button'
**Status:** PARTIAL
**Evidence:**
- `src/components/layout/sidebar.tsx` has mixed coverage:
  - **Has `type="button"`:** lines 349 (New chat), 461 (History expand), 486 (Chat options), 572 (Red-Team toggle), 597 (Family Safe toggle), 681 (Conversation select).
  - **Missing `type="button"`:** lines 292 (mobile close), 309 (New project), 360 (Rename), 378 (Archive), 394 (Delete), 432 (Nav tabs), 499-515 (Menu items), 616 (Inspector toggle), 690 (Export), 699 (Confirm delete), 707 (Delete).
- Approximately 50% of buttons are missing the attribute.
**Test Evidence:** No test asserts `type="button"` on sidebar buttons.

---

## AUDIT-034 — ThemeMaker.tsx buttons have type='button'
**Status:** FAIL
**Evidence:**
- `src/components/ThemeMaker.tsx` has 6 `<button>` elements; **zero** have `type="button"`.
- Lines 330 (theme selector), 385 (Save), 388 (Reset), 391 (Import), 394 (Export), 397 (Restore defaults) all lack `type="button"`.
**Test Evidence:** No test asserts `type="button"` on ThemeMaker buttons.

---

## AUDIT-035 — ImageGenerationPreview.tsx React key uses stable id not index
**Status:** PARTIAL
**Evidence:**
- `src/components/ImageGenerationPreview.tsx` line 52:
  ```tsx
  key={savedDoc.id || idx}
  ```
- Uses `savedDoc.id` (stable) when present, but **falls back to `idx`** (unstable index) when id is missing.
- The audit requires using stable id **not** index. The fallback violates this.
**Test Evidence:** No test asserts key stability in ImageGenerationPreview.

---

## AUDIT-036 — compare-view.tsx React key uses composite key
**Status:** FAIL
**Evidence:**
- `src/components/gallery/compare-view.tsx` line 216:
  ```tsx
  <th key={items[idx]?.id ?? idx}>
  ```
- Uses item id with fallback to index; not a composite key (e.g., `${item.id}-${idx}`).
- Line 237 (`<td key={idx}>`) uses raw index for table cells, which is also not composite.
**Test Evidence:** `src/components/gallery/compare-view.test.tsx` does not appear to test key composition specifically.

---

## AUDIT-037 — StatusView.tsx document.querySelector removed
**Status:** FAIL
**Evidence:**
- `src/components/StatusView.tsx` line 76 still contains:
  ```ts
  appVersion: (document.querySelector('meta[name="app-version"]') as HTMLMetaElement)?.content ?? 'web',
  ```
- `document.querySelector` is used directly inside a `useEffect`.
**Test Evidence:** No test asserts the absence of `document.querySelector` in StatusView.

---

## AUDIT-038 — ThemeMaker.tsx hardcoded colors derive from tokens
**Status:** FAIL
**Evidence:**
- `src/components/ThemeMaker.tsx` lines 182-188 contain hardcoded hex values in the legacy theme import fallback:
  ```ts
  accentHover: color(bright, "blue", accent),
  success: color(bright, "green", "#74d66a"),
  warning: color(bright, "yellow", "#d6a84f"),
  danger: color(bright, "red", "#ef4444"),
  info: color(bright, "cyan", "#7da7ff"),
  ```
- These are literal hex strings in the fallback path, not derived from the current theme token system.
**Test Evidence:** No test asserts that all legacy import fallbacks are token-derived.

---

## AUDIT-039 — message-bubble.tsx katex CSS import handled
**Status:** PARTIAL
**Evidence:**
- `src/components/chat/message-bubble.tsx` lines 93-97:
  ```ts
  useEffect(() => {
    import('katex/dist/katex.min.css')
  }, [])
  ```
- The CSS is dynamically imported with an empty dependency array. However, `MessageBubble` is rendered per-message, so mounting 100 messages triggers 100 dynamic imports of the same CSS file. This is inefficient and could cause FOUC/race issues.
- The import is not deduplicated or hoisted to a higher-level component.
**Test Evidence:** No test asserts CSS import deduplication or single-load behavior.

---

## AUDIT-040 — CommandPalette.tsx querySelectorAll replaced with state array
**Status:** FAIL
**Evidence:**
- `src/components/command-palette/CommandPalette.tsx` uses `querySelectorAll` in three places:
  - Line 95: `const items = Array.from(listRef.current.querySelectorAll<HTMLButtonElement>('[data-command-item]'))`
  - Line 106: `const items = Array.from(listRef.current.querySelectorAll<HTMLButtonElement>('[data-command-item]'))`
  - Line 195: `const items = Array.from(listRef.current.querySelectorAll<HTMLButtonElement>('[data-command-item]'))`
- No state-based array of command items is used for keyboard navigation; DOM traversal is the primary mechanism.
**Test Evidence:** `src/components/command-palette/CommandPalette.test.tsx` tests command actions, but no test asserts that `querySelectorAll` has been replaced with a state array.

---

## AUDIT-041 — useFocusTrap.ts querySelectorAll replaced with refs or MutationObserver
**Status:** FAIL
**Evidence:**
- `src/hooks/useFocusTrap.ts` line 32:
  ```ts
  const getFocusable = () => Array.from(el.querySelectorAll<HTMLElement>(focusableSelectors));
  ```
- Uses `querySelectorAll` on every `Tab` key press to find focusable elements. No `MutationObserver` or ref-based tracking is used.
**Test Evidence:** `src/hooks/useFocusTrap.test.tsx` (VERIFY-026) tests focus trapping, Escape, and trigger restoration, but does not assert that `querySelectorAll` has been replaced.

---

## AUDIT-042 — ImageGenerationPreview.tsx img alt not empty
**Status:** FAIL
**Evidence:**
- `src/components/ImageGenerationPreview.tsx` line 97:
  ```tsx
  <img src={img.image} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
  ```
- The `alt` attribute is explicitly empty (`""`) for recent-history thumbnails.
- Line 59 (`alt={`Generated by Venice ${idx + 1}`}`) and line 74 (`alt="Generated by Venice"`) are non-empty, but the history thumbnail at line 97 is empty.
**Test Evidence:** No test asserts non-empty alt text on the history thumbnail image.

---

## AUDIT-043 — AssetGallery.tsx img alt not empty
**Status:** FAIL
**Evidence:**
- `src/components/rp-studio/AssetGallery.tsx` line 97:
  ```tsx
  <img src={a.url} alt="" className="w-full h-full object-cover" />
  ```
- Line 152:
  ```tsx
  <img src={selected.url} alt="" className="w-full h-full object-contain" />
  ```
- Both gallery images have empty `alt=""` attributes.
**Test Evidence:** No test asserts non-empty alt text on AssetGallery images.

---

## AUDIT-044 — ErrorBoundary.tsx window.location.reload removed
**Status:** FAIL
**Evidence:**
- `src/components/ErrorBoundary.tsx` line 48:
  ```tsx
  <button className="btn" onClick={() => window.location.reload()}>Reload application</button>
  ```
- `window.location.reload()` is present and callable.
**Test Evidence:** No test asserts the absence of `window.location.reload` in ErrorBoundary.

---

## AUDIT-045 — ui/error-boundary.tsx window.location.reload removed
**Status:** FAIL
**Evidence:**
- `src/components/ui/error-boundary.tsx` line 69:
  ```tsx
  <button onClick={() => window.location.reload()}>Reload page</button>
  ```
- `window.location.reload()` is present and callable.
**Test Evidence:** No test asserts the absence of `window.location.reload` in the UI error boundary.

---

## AUDIT-046 — FirstRunModal.tsx scroll lock uses shared hook
**Status:** FAIL
**Evidence:**
- `src/components/FirstRunModal.tsx` lines 16-31 manually manages scroll lock:
  ```ts
  const originalOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  return () => {
    document.body.style.overflow = originalOverflow;
  };
  ```
- No shared `useScrollLock` or `useBodyLock` hook is imported or used.
**Test Evidence:** No test asserts that a shared scroll-lock hook is used.

---

## AUDIT-047 — ConfirmModal.tsx scroll lock uses shared hook
**Status:** FAIL
**Evidence:**
- `src/components/ConfirmModal.tsx` lines 38-55 manually manages scroll lock with the exact same inline pattern as FirstRunModal:
  ```ts
  const originalOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  return () => {
    document.body.style.overflow = originalOverflow;
  };
  ```
- No shared scroll-lock hook is imported or used.
**Test Evidence:** No test asserts that a shared scroll-lock hook is used.

---

## AUDIT-048 — electron/ipc/handlers.ts app:proxyScrape rejects http:
**Status:** FAIL
**Evidence:**
- `electron/ipc/handlers.ts` line 460:
  ```ts
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http/https allowed" };
  }
  ```
- The handler **allows** both `http:` and `https:`. It does **not** reject `http:`.
- The audit claims it should reject `http:` (likely for security, forcing HTTPS only).
**Test Evidence:** `electron/ipc/handlers.test.ts` does not appear to test this specific protocol rejection.

---

## AUDIT-049 — electron/ipc/handlers.ts IPC handlers have rate limiting
**Status:** FAIL
**Evidence:**
- `electron/ipc/handlers.ts` `registerIpcHandlers()` (lines 209-1322) registers ~30 IPC handlers including:
  - `venice:request`, `venice:streamChat`, `venice:abort`
  - `jina:request`, `jinaApiKey:test`
  - `app:proxyScrape`, `app:media:export`, `app:media:import`
  - `chat:list`, `chat:save`, `chat:delete`, `conversations:pullContext`
- **None** of these handlers implement rate limiting (no token bucket, no request counter, no timestamp tracking).
**Test Evidence:** No test asserts IPC handler rate limiting.

---

## AUDIT-050 — electron/services/veniceClient.ts performVeniceRequest concurrency cap
**Status:** FAIL
**Evidence:**
- `electron/services/veniceClient.ts` lines 435-443 track active requests by `signalId`:
  ```ts
  if (request.signalId) {
    const previous = activeRequests.get(request.signalId);
    if (previous) { previous.destroy(); }
    activeRequests.set(request.signalId, { destroy: () => req.destroy(...) });
  }
  ```
- This only prevents **duplicate signal IDs** (one request per signalId). It does **not** cap total concurrent requests globally (e.g., max 5 simultaneous HTTPS requests).
- No `MAX_CONCURRENT_REQUESTS` constant or global semaphore exists.
**Test Evidence:** No test asserts a global concurrency cap on `performVeniceRequest`.

---

## AUDIT-051 — electron/ipc/handlers.ts pullContext clamps maxItems/maxTokens
**Status:** FAIL
**Evidence:**
- `electron/ipc/handlers.ts` lines 1228-1234 (inside `conversations:pullContext` handler):
  ```ts
  if (typeof inp.maxItems === "number") cleanInput.maxItems = inp.maxItems;
  if (typeof inp.maxTokens === "number") cleanInput.maxTokens = inp.maxTokens;
  ```
- Values are passed through **without clamping**.
- `electron/services/memoryPuller.ts` lines 324-325 (`pullContext`):
  ```ts
  const maxItems = input.maxItems ?? 5;
  const maxTokens = input.maxTokens ?? 1200;
  ```
- Also no clamping; a caller can pass `maxItems: 1000000` or `maxTokens: 100000000` and it will be accepted.
**Test Evidence:** No test asserts clamping behavior for `maxItems` or `maxTokens` in the pullContext handler or memoryPuller.

---

## Summary Table

| Audit | Status | File:Line Evidence |
|-------|--------|-------------------|
| AUDIT-022 | PASS | `.github/workflows/ci.yml:18,50,83`; `.github/workflows/release.yml:18,103,191` |
| AUDIT-023 | PASS | `.github/workflows/ci.yml:12-14`; `.github/workflows/release.yml:12-14` |
| AUDIT-024 | FAIL | `server.ts:348,918` — missing `req.socket.remoteAddress` fallback |
| AUDIT-025 | FAIL | `src/stores/project-store.ts:122` — no `isValidId` usage |
| AUDIT-026 | FAIL | `src/services/diagnosticsService.ts:248` — cast still present; `enableJina` not in SettingsState |
| AUDIT-027 | FAIL | `src/services/modelService.ts:20-30` — still uses `localStorage` |
| AUDIT-028 | FAIL | `src/services/promptStarterService.ts:106` — no `AbortSignal` timeout |
| AUDIT-029 | FAIL | `src/stores/chat-store.ts:487,491`; `src/stores/media-store.ts:64,69` — hardcoded, no central file |
| AUDIT-030 | FAIL | `src/stores/chat-store.ts:493` — `markDirtyConversation` accepts any string id |
| AUDIT-031 | FAIL | `src/services/veniceClient.ts:786` — web retry uses inline backoff, not `calculateBackoff` |
| AUDIT-032 | FAIL | `src/components/SettingsView.tsx` — 0 of ~30 buttons have `type="button"` |
| AUDIT-033 | PARTIAL | `src/components/layout/sidebar.tsx` — some buttons have it, many do not |
| AUDIT-034 | FAIL | `src/components/ThemeMaker.tsx` — 0 of 6 buttons have `type="button"` |
| AUDIT-035 | PARTIAL | `src/components/ImageGenerationPreview.tsx:52` — falls back to `idx` |
| AUDIT-036 | FAIL | `src/components/gallery/compare-view.tsx:216,237` — uses index, not composite key |
| AUDIT-037 | FAIL | `src/components/StatusView.tsx:76` — `document.querySelector` still present |
| AUDIT-038 | FAIL | `src/components/ThemeMaker.tsx:182-188` — hardcoded hex fallbacks |
| AUDIT-039 | PARTIAL | `src/components/chat/message-bubble.tsx:96` — dynamic import per mount, not deduped |
| AUDIT-040 | FAIL | `src/components/command-palette/CommandPalette.tsx:95,106,195` — `querySelectorAll` still used |
| AUDIT-041 | FAIL | `src/hooks/useFocusTrap.ts:32` — `querySelectorAll` still used |
| AUDIT-042 | FAIL | `src/components/ImageGenerationPreview.tsx:97` — `alt=""` on history thumbnail |
| AUDIT-043 | FAIL | `src/components/rp-studio/AssetGallery.tsx:97,152` — `alt=""` on both images |
| AUDIT-044 | FAIL | `src/components/ErrorBoundary.tsx:48` — `window.location.reload()` present |
| AUDIT-045 | FAIL | `src/components/ui/error-boundary.tsx:69` — `window.location.reload()` present |
| AUDIT-046 | FAIL | `src/components/FirstRunModal.tsx:16-31` — manual scroll lock, no shared hook |
| AUDIT-047 | FAIL | `src/components/ConfirmModal.tsx:38-55` — manual scroll lock, no shared hook |
| AUDIT-048 | FAIL | `electron/ipc/handlers.ts:460` — allows `http:` and `https:` |
| AUDIT-049 | FAIL | `electron/ipc/handlers.ts:209-1322` — no rate limiting on any IPC handler |
| AUDIT-050 | FAIL | `electron/services/veniceClient.ts:435-443` — per-signalId dedup only, no global cap |
| AUDIT-051 | FAIL | `electron/ipc/handlers.ts:1228-1234`; `electron/services/memoryPuller.ts:324-325` — no clamping |

---

**Pass Rate:** 2/30 (6.7%)
**Partial Rate:** 3/30 (10.0%)
**Fail Rate:** 25/30 (83.3%)
