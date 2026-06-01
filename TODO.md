# Venice Forge — Repository TODO

> Refreshed: 2026-06-01 (CSAM audit pass: 2026-06-01)
> Scope: source, tests, docs, workflows, agent instructions, and repository hygiene
> Baseline checks this pass: `npm run typecheck`, `npm run lint:eslint`, `npm run verify:safety-guard`, `npm audit --omit=dev`, `npm test`, `npm run build`

## Audit Summary

| Category | Count |
|----------|-------|
| Critical bugs (fixed this pass) | 5 |
| High-priority bugs (fixed this pass) | 8 |
| Medium-priority bugs (all fixed) | 11 |
| Low-priority items (all resolved) | 12 |
| Documentation/config tasks (all complete) | 11 |
| Security hardening tasks (all resolved) | 7 |
| CSAM audit findings (all resolved) | 5 |
| Refactoring / tech debt (all resolved or deferred) | 12 |
| Missing tests / coverage gaps (all resolved) | 14 |
| Feature completeness checklist (all verified) | 6 |

---

## Critical Bugs — Fixed in This Pass

- [x] **[CRIT-001] XSS via innerHTML in fatal error handler** — `src/main.tsx:26`
  - `rootEl.innerHTML` was used with an interpolated error stack/message, creating a DOM XSS vector if an attacker could influence the thrown error.
  - **Fix:** Replaced `innerHTML` with safe `document.createElement` / `textContent` construction.

- [x] **[CRIT-002] SSRF bypasses in Generic HTTP provider** — `src/research/providers/genericHttpScrapeProvider.ts:39`
  - `isSafeUrl` did not block decimal IPv4 (`2130706433`), short-form IPv4 (`127.1`), hex-dotted IPv4 (`0x7f.0.0.1`), or full IPv6 loopback (`0:0:0:0:0:0:0:1`).
  - **Fix:** Added explicit rejection for `/^\d+$/`, `/^0x[0-9a-f]+(\.[0-9a-f]+){0,3}$/i`, and `0:0:0:0:0:0:0:1`/`::` hostnames.

- [x] **[CRIT-003] RangeError crash in safety guard from split surrogate pairs** — `src/shared/safety/childExploitationGuard.ts:298`
  - `normalizeBase` sliced at `MAX_SCAN_CHARS` without checking for a trailing high surrogate, causing `String.prototype.normalize("NFKC")` to throw `RangeError`.
  - **Fix:** Added surrogate-boundary guard that strips trailing lone surrogates before `normalize()`.

- [x] **[CRIT-004] Safety guard bypass for native FormData in web mode** — `src/shared/safety/promptPayloadExtractor.ts:170`
  - `extractPromptLikeFields` handled serialized FormData (`_isSerializedFormData`) but not real browser `FormData` instances, causing text fields in FormData bodies to bypass the guard entirely.
  - **Fix:** Added `instanceof FormData` branch that iterates `formData.entries()` and extracts string values.

- [x] **[CRIT-005] Arbitrary file read within home directory via `app:readLocalFile`** — `electron/ipc/handlers.ts:321`
  - The IPC handler allowed reading any file under `app.getPath("home")`, including SSH keys, shell history, and encrypted `secure-prefs.json`.
  - **Fix:** Restricted reads to `Downloads` and `Documents` directories only.

---

## High-Priority Bugs — Fixed in This Pass

- [x] **[HIGH-001] Unhandled rejection in SettingsModule update install** — `src/modules/SettingsModule.tsx:116`
  - `installUpdate()` was async but passed directly to `onClick` without try/catch.
  - **Fix:** Wrapped `desktopUpdates.installUpdate()` in try/catch with user-facing status update on failure.

- [x] **[HIGH-002] Unhandled rejection in DiagnosticsModule open logs** — `src/modules/DiagnosticsModule.tsx:72`
  - `openLogs()` was async without error handling.
  - **Fix:** Added try/catch that dispatches an error toast on failure.

- [x] **[HIGH-003] ConfirmModal delete conversation lacks async error boundary** — `src/modules/ChatModule.tsx:1412`
  - `onConfirm={() => handleDeleteConversation(deleteTarget)}` could produce an unhandled rejection.
  - **Fix:** Wrapped in async try/catch with `setError` and `setDeleteTarget(null)` in both success and error paths.

- [x] **[HIGH-004] Log injection via unescaped newlines** — `electron/services/logger.ts:119`
  - Renderer console messages containing `\n` could inject forged log lines into the main-process log file.
  - **Fix:** Sanitize `\r` and `\n` to `\\n` before writing to the log file.

- [x] **[HIGH-005] Production static path bug + potential info disclosure** — `server.ts:384`
  - `distPath = path.join(getModuleDir(), "dist")` resolved to `dist/dist/`, which does not exist, causing the production server to crash. If corrected, it would also serve `server.cjs` and `server.cjs.map`.
  - **Fix:** Changed `distPath` to `getModuleDir()` directly.

- [x] **[HIGH-006] Broken test: SearchScrapeModule invalid response shape** — `src/modules/SearchScrapeModule.test.tsx:65`
  - Test mocked `veniceFetch` to resolve, bypassing the validator entirely, so `role="alert"` was never rendered.
  - **Fix:** Changed mock to `mockRejectedValueOnce` with the validation error message.

- [x] **[HIGH-007] Broken test: verify-dist CJS top-level return** — `scripts/verify-dist.cjs:35`
  - Top-level `return` inside `if (require.main !== module)` is a syntax error when Vitest imports the CJS file as ESM.
  - **Fix:** Refactored to `if (...) { module.exports = ...; } else { ... }` pattern.

- [x] **[HIGH-008] TOCTOU symlink swap in `app:readLocalFile`** — `electron/ipc/handlers.ts:330`
  - `fs.realpath` was called to resolve the path, then `fs.stat` and `fs.readFile` were separate syscalls using that path string. A symlink or file swap between `stat` and `readFile` could bypass the "regular file" check.
  - **Fix:** Opens the file with `fs.open()` first, then `fstat()`s and reads via the same file descriptor, ensuring both operations target the same inode.

---

## Medium-Priority Open Bugs

- [x] **[MED-001] Toast fires before persistence confirmed** — `src/modules/ChatModule.tsx:414`
  - `clear()` dispatches a success toast before awaiting `saveConversation`. If persistence throws, the user sees success but data is not saved.
  - **Fix:** Wrapped persistence in try/catch; toast only on success, error toast on failure.

- [x] **[MED-002] `handleNewChat` lacks error handling** — `src/modules/ChatModule.tsx:427`
  - `saveConversation` is awaited without try/catch. A persistence failure leaves the user with no feedback.
  - **Fix:** Wrapped in try/catch with error toast dispatch on failure.

- [x] **[MED-003] `handleSwitchConversation` lacks error handling** — `src/modules/ChatModule.tsx:444`
  - `persistMessages` can throw without catch.
  - **Fix:** Added try/catch around `persistMessages` and surfaced the error via toast.

- [x] **[MED-004] `handleImportMessages` lacks error handling** — `src/modules/ChatModule.tsx:572`
  - If `persistMessages` throws, modal state is never reset, leaving the UI stuck.
  - **Fix:** Wrapped persistence in try/catch and moved state reset to `finally`.

- [x] **[MED-005] Silent failure for memory loading** — `src/modules/ChatModule.tsx:239`
  - `selectMemoriesForInjection` errors are swallowed with an empty catch. If IndexedDB is corrupted, memory injection breaks silently.
  - **Fix:** Added warning toast: "Memory injection unavailable. Continuing without it."

- [x] **[MED-006] Dead ternary logic in Markdown rendering** — `src/modules/ChatModule.tsx:1055`
  - `<Markdown text={m.content || (loading && idx === messages.length - 1 ? "" : "")} />` always evaluates to `""` on the right side of `||`.
  - **Fix:** Simplified to `<Markdown text={m.content || ""} />`.

- [x] **[MED-007] Duplicate array filtering in JSX** — `src/modules/ChatModule.tsx:1344`
  - `conversations.filter((c) => c.id !== activeId)` is computed twice.
  - **Fix:** Computed `const otherConversations = conversations.filter(c => c.id !== activeId);` once via IIFE.

- [x] **[MED-008] Stale effect dependency in ImageActionModal** — `src/modules/ImageModule.tsx:44`
  - `useEffect` dependency is `!!image` (boolean). If the modal is open and `image` changes from one object to another (both truthy), the effect does not re-run.
  - **Fix:** Changed dependency to `image` itself.

- [x] **[MED-009] Chat cancel skips rollback** — `src/modules/ChatModule.tsx:318–430`
  - **Fixed:** `cancel()` now snapshots messages before send via `preSendMessagesRef` and restores them on cancel. `runIdRef` is incremented after abort signal so the guard still skips any stale stream handlers.

- [x] **[MED-010] `saveConversation()` `.ok` not checked in callers** — `src/modules/ChatModule.tsx:193,215`, `src/modules/SettingsModule.tsx:345`
  - **Fixed:** `ensureActiveConversation` throws on `!result.ok`; `persistMessages` throws on `!result.ok`; import path in SettingsModule collects results and throws on any failure.

- [x] **[MED-011] Memory import duplicates entries on re-import** — `src/services/memoryService.ts:35–42`, `src/modules/SettingsModule.tsx:350`
  - **Fixed:** Added `upsertMemory()` to `memoryService.ts` which preserves the original `id`/`createdAt` from the import record. SettingsModule now uses `upsertMemory` instead of `saveMemory` for imported entries.

---

## Low-Priority / Quality / Performance

- [x] **[LOW-001] Unnecessary re-computation of `lastAssistant`** — `src/modules/ChatModule.tsx:661`
  - `lastAssistant` is recalculated on every render by reversing and searching the `messages` array.
  - **Fix:** Memoized with `React.useMemo`.

- [x] **[LOW-002] Misleading AbortError check** — `src/modules/ImageModule.tsx:188`
  - `error.message !== "AbortError"` is redundant; only `error.name === "AbortError"` is reliable for `DOMException`.
  - **Fix:** Removed the message check.

- [x] **[LOW-003] Unsafe type cast in `upscaleCurrent`** — `src/modules/ImageModule.tsx:259`
  - Fallback object in the `||` chain is cast with `as GalleryImage` even though it may be missing optional fields.
  - **Fix:** Built a properly typed fallback object and removed the `as GalleryImage` cast.

- [x] **[LOW-004] Side effect inside reducer** — `src/state/appReducer.ts:182`
  - **Audit description was inaccurate.** The `SET_MODELS` case at line 182 performs pure Immer state mutation (model auto-fallback assignment). No toasts are pushed from the reducer. `draft.toasts` is only modified via `SET_TOAST`/`REMOVE_TOAST` actions dispatched externally. No fix required.

- [x] **[LOW-005] CSS injection via custom theme import** — `src/theme/applyTheme.ts` + `ThemeMaker.tsx`
  - `isValidTheme` in `exportImport.ts` already validates every token via `isValidColorValue` (rejects `url(...)`, `expression(...)`, etc.); the reducer enforces this check before applying any `customTheme` to state.
  - Status: **already resolved** — no further action required.

- [x] **[LOW-006] Feature discrepancy in web mode export/import** — `src/modules/SettingsModule.tsx:648`
  - **Audit description was inaccurate.** Export/Import buttons are shown in both modes, and `desktopFiles.exportJson`/`desktopFiles.importJsonString` already have web fallbacks: browser `URL.createObjectURL` download and `<input type="file">` picker. Both operations work correctly in web mode. No fix required.

- [x] **[LOW-007] SSRF DNS rebinding in Generic HTTP provider** — `src/research/providers/genericHttpScrapeProvider.ts:7`
  - SSRF defense is hostname-string-only (no DNS resolution). A rebinding attack or helper domain (e.g. `evil.com` resolving to `127.0.0.1`) can bypass the blocklist.
  - **Resolution:** The file header explicitly marks this provider as *disabled by default* (`enabled?: boolean` field; must be set to `true` explicitly). The "keep disabled-by-default" mitigation from the suggested fix is already implemented. No DNS resolution infrastructure is warranted while the provider is off-by-default. If the provider is ever enabled by default, DNS resolution must be added.

- [x] **[LOW-008] `readWithLimit` oversized body not cancelled** — `src/research/providers/genericHttpScrapeProvider.ts:208`
  - **Fixed:** `response.body?.cancel()` is now called when the byte limit is hit.

- [x] **[LOW-009] Atomic-write temp file not cleaned up on failure** — `electron/services/secureStore.ts:55`, `electron/services/chatStorage.ts:214`
  - **Fixed:** Both files now unlink the temp file in the error path.

- [x] **[LOW-010] `importJsonString` Promise never settles on file-picker cancel** — `src/services/desktopBridge.ts:223`
  - In web mode, if the user opens the file picker and closes it without selecting a file, the `change` event never fires, leaving the caller's `await` hanging forever. The import button appears permanently stuck.
  - **Fixed:** Added `cancel` event listener on the `<input>` element (Chrome 113+/Firefox 91+). DOM element and reader are cleaned up immediately in both success and cancel paths.

- [x] **[LOW-011] `getModuleDir` uses `URL.pathname` instead of `fileURLToPath`** — `server.ts:38`
  - On Windows, `new URL(import.meta.url).pathname` produces `/C:/path/...` which is an invalid Win32 path. `package.json` and `index.html` lookup would fail in production.
  - **Fixed:** Changed to `path.dirname(fileURLToPath(new URL(import.meta.url)))`.

- [x] **[LOW-012] ChatModule sync effect missing `activeConversation` dependency** — `src/modules/ChatModule.tsx`
  - The effect that syncs messages when the active conversation changes depends on `[activeId, ...]` but reads `activeConversation`. If the conversation object changes without `activeId` changing (e.g. after a save), the UI stays stale.
  - **Fixed:** Added `activeConversation` to the dependency array.

---

## Security Hardening

- [x] **[SEC-001] Renderer console log flooding (DoS)** — `electron/main.ts:140`
  - The `console-message` event forwards all renderer logs to the main-process log file with no length cap.
  - **Fix:** Truncate messages to 10,000 characters before passing to `logInfo`/`logError`.

- [x] **[SEC-002] `activeRequests` leak on duplicate `signalId`** — `electron/services/veniceClient.ts:298`
  - `performVeniceRequest` unconditionally overwrites `activeRequests.set(request.signalId, ...)`. If a malicious renderer reuses a `signalId`, the previous request becomes unabortable and leaks.
  - **Fix:** Abort previous request before overwriting if `activeRequests.has(request.signalId)`.

- [x] **[SEC-003] `beforeunload` may not fire for stream cleanup** — `electron/preload.ts:45`
  - Modern browsers and some Electron scenarios suppress or delay `beforeunload`.
  - **Fix:** Added `pagehide` event listener as a secondary abort signal.

- [x] **[SEC-004] Low-entropy backup suffix for corrupt chat files** — `electron/services/chatStorage.ts:68`
  - Backup suffix uses `Math.random().toString(36).slice(2, 8)` (only 6 base-36 characters).
  - **Fix:** Replaced with `crypto.randomUUID()`.

- [x] **[SEC-005] Production CSP `script-src`** — `electron/main.ts:28`
  - **Audit description was inaccurate.** Production `scriptSrc` is `"'self'"` (no `unsafe-inline` or `unsafe-eval`). Only the dev build uses `unsafe-inline`/`unsafe-eval` for Vite HMR. Production CSP is already strict. No fix required.

- [x] **[SEC-006] Express CSP `script-src`** — `server.ts:131`
  - **Audit description was inaccurate.** The Express CSP already sets `script-src 'self'` with no `unsafe-inline`. The Vite production build does not inject inline scripts. CSP is already strict. No fix required.

- [x] **[SEC-007] Update check hangs indefinitely — button permanently disabled** — `electron/ipc/updates.ts`
  - `autoUpdater.checkForUpdates()` has no timeout. If GitHub Releases is unreachable, the IPC handler never resolves, leaving `isUpdateChecking === true` and the button permanently disabled ("non-responsive").
  - In dev mode, the call threw a cryptic ENOENT error instead of a useful message.
  - **Fixed:** Added 30 s `Promise.race` timeout in the IPC handler; added `app.isPackaged` dev-mode guard returning a friendly message; added 5-minute timeout on `downloadUpdate`; improved error message stripping in renderer.

---

## Missing Tests / Coverage Gaps

### Tier 1 — Security-Critical, Must Test

- [x] Add tests for `electron/ipc/handlers.ts` — 451 safety block, `app:readLocalFile` restrictions, API key validation.
- [x] Add tests for `electron/utils/urlSecurity.ts` — private IP blocking and HTTPS enforcement (extended existing tests in `main.test.ts`).
- [x] Add tests for `electron/utils/navigation.ts` — path containment for local file access (already covered in `main.test.ts`).
- [x] Add tests for `src/shared/validation.ts` — endpoint/method allowlist (`validation.test.ts` created).

### Tier 2 — Core Functionality, Should Test

- [x] Add tests for `src/modules/BatchModule.tsx` — rendering, validation, fallback model blocking.
- [x] Add tests for `src/modules/ModelsModule.tsx` — rendering, error display, model selects.
- [x] Add FormData coverage to `src/shared/safety/promptPayloadExtractor.test.ts` for the bypass scenario fixed in CRIT-004.
- [x] Add tests for `src/services/veniceClient.ts` edge cases: `computeRateLimitWait` with HTTP-date format `Retry-After` header.

### Tier 3 — UI / Component / Hook Tests

- [x] Add component tests for `ErrorBoundary.tsx` and `ToastHost.tsx`.
- [x] Add tests for `useFocusTrap.ts` — focus cycling, Escape handling.
- [x] Add tests for `useNetworkStatus.ts` — online/offline dispatch.
- [x] Add tests for `useThemeLifecycle.ts` — theme application, localStorage persistence.
- [x] Add tests for `useSettingsPersistence.ts` — debounced save, error toast.
- [x] Add tests for `scripts/verify-safety-guard.cjs` — the safety verification script itself should be tested.

### Tier 4 — Electron Environment Correctness

- [x] Add `// @vitest-environment node` to all Electron test files for semantic correctness.

---

## Documentation Gaps

- [x] Fixed stale `--max-warnings=96` references across `docs/FAQ.md`, `docs/ABOUT.md`, `docs/DEVELOPMENT/troubleshooting.md`, `docs/AGENTS/*.md`.
- [x] Fixed `npm audit` inconsistency between `SECURITY.md`/`AGENTS.md` and CI (`--audit-level=moderate`).
- [x] Fixed broken `[todo.md]` link in `docs/HQE_AUDIT_REPORT.md`.
- [x] Added memory and vision/attachment FAQ entries.
- [x] Updated `docs/RELEASE/release.md` smoke-test checklist with memory/attachment items.
- [x] Updated `docs/REPOSITORY_TREE.md` with missing script files.
- [x] Linux packaging status documented — `docs/DEVELOPMENT/platform-support.md` already states the AppImage target is present but not officially supported or smoke-tested. No change needed.
- [x] `build/icon.png` documented — `docs/REPOSITORY_TREE.md` already lists it as "Linux/AppImage icon" in the build/ section. No change needed.
- [x] `docs/REPOSITORY_TREE.md` updated — added `public/assets/branding/` entry for Venice brand SVG assets.
- [x] Added maintainer note for `docs/AGENTS/` in `docs/REPOSITORY_TREE.md` — explains that the directory is gitignored, locally generated, and should not be committed.
- [x] Added update-trigger note to `docs/RELEASE/release.md` and `SECURITY.md` — maintainers are reminded to update these docs when artifact layout, signing steps, allowed endpoints, or safety boundaries change.

---

## Refactoring / Tech Debt

- [x] Fixed `matchesPatterns` shared regex `lastIndex` mutation risk — now clones regexes before testing.
- [x] Fixed `escapeXml` incomplete single-quote escaping — added `&apos;`.
- [x] Fixed O(n²) deduplication in `socialDiscovery.ts:313` — replaced with `Set`.
- [x] Fixed `trimContent` off-by-13 in `researchRunner.ts:110` — slices to `maxChars - suffix.length`.
- [x] Fixed `ResearchBudgetExceededError` misuse for non-budget errors — now uses generic `Error`.
- [x] Fixed renderer `logger.ts` never detecting production — now uses `import.meta.env.MODE` fallback.
- [x] Fixed `React` namespace used without import — `src/types/app.ts:111` now uses `import("react").Dispatch`.
- [x] Removed dead `ModelGroups` interface — `src/types/venice.ts:24`.
- [x] **[DEFERRED] Chat send orchestration extraction** — ChatModule.tsx is 1612 lines. Extracting `handleSend`, cancel/rollback, and streaming logic is a meaningful refactor sprint, not a hygiene-pass change. Deferring to avoid regression risk.
- [x] **[DEFERRED] Persistence schema module** — Centralizing IndexedDB schema across settings, conversations, gallery images, and imports is a structural refactor. Deferring to avoid breaking the export/import pipeline.
- [x] `ImageDraft` / `GalleryImage` dimension types investigated — types are intentionally different: `ImageDraft.width/height: number` (form state, must be numeric), `GalleryImage.width/height?: number | string` (API compatibility). Added JSDoc comments to both types documenting the intent. No unification needed.
- [x] Deepened `customTheme` validation in `validateAppSettings` — `src/shared/configSchema.ts`. Previously accepted any non-null object. Now validates `id`, `name`, `mode`, `tokens` structure, and each token value via `isValidColorValue` (blocks CSS injection). Added 6 new tests in `configSchema.test.ts`.

---

## Feature Completeness Checklist

- [x] **Chat**: cancellation (AbortController, cancel rollback in `ChatModule.tsx`), retry diagnostics (`veniceClient.ts` retries + `SET_DIAGNOSTICS`), memory injection (`payloadBuilders.test.ts`, `memoryService.test.ts`), attachment handling (`attachmentService.test.ts`), and conversation persistence (`chatStorage.test.ts`, both renderer + Electron). Documented in README, AGENTS.md, FAQ.md.
- [x] **Image generation**: batch generation and abort (`BatchModule.test.tsx`), watermark fallback (`imageWorkflowService.test.ts`), gallery save (`imageWorkflowService.test.ts`), upscale (unit-tested in `ImageModule.test.tsx` + `imageWorkflowService`). Documented in README, AGENTS.md.
- [x] **Research**: Venice (`veniceResearchProvider.test.ts`), Jina (`jinaResearchProvider.test.ts`), Generic HTTP (`genericHttpScrapeProvider.test.ts`), synthesis (`researchSynthesis.test.ts`), profile discovery (`socialDiscovery.test.ts`), runner/budget (`researchRunner.test.ts`). Documented in `docs/RESEARCH_PROVIDERS.md`, `docs/JINA_PROVIDER.md`, `docs/PUBLIC_PROFILE_DISCOVERY.md`.
- [x] **Settings**: API key management (`SettingsModule.test.tsx`), import/export (`SettingsModule.test.tsx`, `exportImport.test.ts`), update controls (`SettingsModule.test.tsx` — check, not-available, error flows). Documented in README, AGENTS.md.
- [x] **Diagnostics**: Clipboard copy and fallback textarea (`DiagnosticsModule.test.tsx`), Electron log path (`desktopBridge.test.ts`). Documented in README, FAQ.md.
- [x] **Release**: Artifact selection, platform targeting, regression guard (`verify-dist.test.ts`, `scripts/verify-safety-guard.cjs`), artifact verification commands. Documented in `docs/RELEASE/release.md`, `docs/RELEASE/signing-and-notarization.md`.

---

## CSAM Safety Guard Audit (June 2026)

A comprehensive anti-CSAM safety guard audit was conducted in June 2026. All findings were resolved.

- [x] **[ENFORCE-002] Jina research path missing renderer-layer guard** — `src/modules/SearchScrapeModule.tsx:runAiResearch()`
  - `runAiResearch()` dispatched directly to the Jina provider (which uses direct `fetch()` outside the Venice transport chain) without first running the safety guard. This left the Jina path unguarded at the renderer layer.
  - **Fix:** Added `assessChildExploitationSafety()` + `recordDecision()` call at the top of `runAiResearch()` before provider dispatch.

- [x] **[ENFORCE-003] Profile discovery missing renderer-layer guard** — `src/modules/SearchScrapeModule.tsx:runProfileDiscovery()`
  - `runProfileDiscovery()` had no renderer-level guard before passing the target name to social discovery queries.
  - **Fix:** Added `assessChildExploitationSafety()` + `recordDecision()` call at the top of `runProfileDiscovery()` for defense-in-depth.

- [x] **[VERIFY-002] SearchScrapeModule not in verify-safety-guard enforcement map** — `scripts/verify-safety-guard.cjs`
  - The CI gate checked only `veniceClient.ts`, `handlers.ts`, and `server.ts`. The new renderer-layer guard paths in `SearchScrapeModule.tsx` were not verified.
  - **Fix:** Added `SearchScrapeModule.tsx` to the enforcement map with a count check of ≥ 3 guard calls.

- [x] **[VERIFY-003] Per-file exclusion logic allowed false negatives** — `scripts/verify-safety-guard.cjs`
  - The log-scan exclusion (`promptHash`, `promptTouched`) was evaluated at the file level: a file containing a real prompt log AND the word `promptHash` would silently pass.
  - **Fix:** Changed exclusion to per-match filtering so each line is independently evaluated.

- [x] **[VERIFY-004] IPC handler check brittle to formatting** — `scripts/verify-safety-guard.cjs`
  - The enforcement check for `handlers.ts` used a string-split on `});` which would silently pass on any minor formatting change.
  - **Fix:** Replaced with a regex-based scan that counts guard call occurrences, independent of formatting.

- [x] **[TEST-001] No fixture builder module; tests used natural-language unsafe strings** — `tests/safety/`
  - Safety tests lacked a shared placeholder fixture scheme, creating risk of natural-language unsafe content in test files.
  - **Fix:** Created `tests/safety/fixtureBuilders.ts` with `triggerInput()`, `obfuscatedInput()`, `benignInput()`, `crossSentenceInput()`, `benignYouthContextInput()` functions. Created `tests/safety/enforcementBoundaries.test.ts` with 29 new tests (obfuscation, false-positive regressions, decision content-freedom, audit counter content-freedom, payload extraction).

---



- [x] **[RESOLVED] Embedded adversarial research synthesis prompt removed** — `src/research/agent/researchSynthesis.ts`
- [x] **[RESOLVED] Generic HTTP provider rejects redirects** — `src/research/providers/genericHttpScrapeProvider.ts`
- [x] **[RESOLVED] `verify-dist` no longer defaults Linux to Windows artifacts** — `scripts/verify-dist.cjs`
- [x] **[RESOLVED] Generic HTTP SSRF trailing-dot and all-zero hostnames blocked** — `src/research/providers/genericHttpScrapeProvider.ts`
- [x] **[RESOLVED] Social discovery forwards signal/timeout** — `src/research/agent/socialDiscovery.ts`
- [x] **[RESOLVED] Proxy writes non-Buffer bodies instead of silently dropping them** — `server.ts`
- [x] **[RESOLVED] Electron Venice multipart preparation errors are caught and logged** — `electron/services/veniceClient.ts`
- [x] **[RESOLVED] Conversation writes use unique temp files** — `electron/services/chatStorage.ts`
- [x] **[RESOLVED] Conversation validation allows tool role and array content** — `electron/services/chatStorage.ts`
- [x] **[RESOLVED] Batch abort refreshes persisted state before returning** — `src/modules/BatchModule.tsx`
- [x] **[RESOLVED] Toast warn style and stable timer deps added** — `src/components/ToastHost.tsx`
- [x] **[RESOLVED] Image generation normalizes draft before request and protects cleanup refresh** — `src/modules/ImageModule.tsx`
- [x] **[RESOLVED] Jina timeout header uses top-level input timeout** — `src/research/providers/jinaResearchProvider.ts`
- [x] **[RESOLVED] ESLint warning budget reduced from 96 to 0** — `package.json`, `docs/*`
- [x] **[RESOLVED] `npm run ci` now includes `verify:safety-guard`** — `package.json`
- [x] **[RESOLVED] `app:readLocalFile` TOCTOU closed via fd-based stat+read** — `electron/ipc/handlers.ts`
- [x] **[RESOLVED] Electron response stream error handler added** — `electron/services/veniceClient.ts`
- [x] **[RESOLVED] `readWithLimit` cancels body stream on limit hit** — `src/research/providers/genericHttpScrapeProvider.ts`
- [x] **[RESOLVED] `secureStore.writeStore` unlinks temp file on failure** — `electron/services/secureStore.ts`
- [x] **[RESOLVED] `chatStorage.saveConversation` unlinks temp file on failure** — `electron/services/chatStorage.ts`
- [x] **[RESOLVED] HTTP-date format `Retry-After` header path tested** — `src/services/veniceClient.edge.test.ts`
- [x] **[RESOLVED] Chat history and export files written with `0o600` permissions** — `electron/services/chatStorage.ts`, `electron/ipc/handlers.ts`
- [x] **[RESOLVED] `isPrivateHostname` blocks `0`, `::`, and `0:0:0:0:0:0:0:1`** — `electron/utils/urlSecurity.ts`
- [x] **[RESOLVED] `broadcast` wrapped in try/catch and `installUpdate` requires downloaded flag** — `electron/ipc/updates.ts`
- [x] **[RESOLVED] Double rate-limiting removed from SPA catch-all** — `server.ts`
- [x] **[RESOLVED] Express HOST validated against allowlist** — `server.ts`
