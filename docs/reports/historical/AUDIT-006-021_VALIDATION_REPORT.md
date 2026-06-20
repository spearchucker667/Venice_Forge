# AUDIT-006 through AUDIT-021 Validation Report

**Validator:** Orchestrator Agent
**Repository:** Venice Forge
**Date:** 2026-06-13
**Scope:** Read relevant files, grep for claimed fixes, report PASS / PARTIAL / FAIL / REGRESSION with concrete evidence.

---

## AUDIT-006 — dedupeKey must not materialize secrets (src/services/veniceClient.ts)

**Claim:** dedupeKey should strip apiKey/authorization/token fields before JSON.stringify.

**Evidence:**
- `src/services/veniceClient.ts:123-134` — `dedupeKey` does `JSON.stringify(body)` directly without stripping any fields.
- No key stripping, no redaction, no key filtering occurs before serialization.
- Test file `src/services/veniceClient.test.ts:25-42` tests dedupeKey for circular-body safety and undefined-body handling, but **no test exists** for secret stripping.

**Status:** ❌ **FAIL**
- `dedupeKey` does **not** strip `apiKey`, `authorization`, or `token` fields.
- The only protection is that the request body passed to `veniceFetch` typically does not contain the API key (it lives in headers or secure storage), but the dedupeKey itself has no defensive stripping.
- **Missing:** pre-stringify sanitizer and a regression test asserting that a body containing `{ apiKey: "sk-xxx" }` is redacted in the key.

---

## AUDIT-007 — upsertDerivative race condition (src/stores/media-store.ts)

**Claim:** Should use atomic transaction or function-based patch; concurrency tests required.

**Evidence:**
- `src/stores/media-store.ts:196-243` — `upsertDerivative` calls `StorageService.patchMedia(parentId, (existing) => ({ childrenIds: Array.from(new Set([...existing.childrenIds, saved.id])) }))`. This **is** a function-based patch.
- `src/services/storageService.ts:337-345` — `patchMedia` implements the function-based patch: `const patchRecord = typeof patch === "function" ? patch(existing) : patch;`.
- `src/stores/media-store.test.ts:219-235` — Tests `upsertDerivative` for idempotency (calling twice does not duplicate `childrenIds`).
- `src/stores/media-store.test.ts:237-248` — Tests rollback when parent patch fails.
- `src/stores/media-store.test.ts:308-321` — Tests rollback success path.
- **No test** simulates two concurrent `upsertDerivative` calls racing on the same parent.

**Status:** ⚠️ **PARTIAL**
- Function-based patch is implemented (reduces race window).
- Rollback on failure is tested.
- **Missing:** A concurrency test that fires two parallel `upsertDerivative` calls and asserts the final `childrenIds` is a correct set with no duplicates.

---

## AUDIT-008 — decryptData should distinguish corrupt vs missing key (src/services/cryptoService.ts)

**Claim:** Return shape, logging, and UI repair action should distinguish corruption from key loss.

**Evidence:**
- `src/services/cryptoService.ts:104-121` — `decryptData` catches **all** errors in a single `catch` block and returns `null`. No branch for "corrupt data" vs "missing/wrong key".
- Comment on line 118: `"Redacted: do not log decryption error details in production."` — no logging at all.
- No UI repair action, no structured error, no `DecryptError` subtype.
- `src/services/cryptoService.test.ts:42-46` — Test: `returns null for corrupted encrypted payload`. No test for missing-key scenario.
- `src/services/storageService.ts:65-73` — `decodeRows` logs a generic warning: `"could not be decrypted and were skipped."` but does not distinguish root cause.

**Status:** ❌ **FAIL**
- `decryptData` returns `null` for **both** corruption and missing key — no distinction.
- No structured error, no UI repair action, no diagnostic telemetry.
- **Missing:** `DecryptError` subclasses, `corrupt` vs `keyMissing` flags, and a user-facing repair flow (e.g. "Reset encryption key").

---

## AUDIT-009 — getItemsPageWithMeta should not load all records when index missing (src/services/storageService.ts)

**Claim:** Fallback behavior should not load all records; should migrate or error explicitly.

**Evidence:**
- `src/services/storageService.ts:167-238` — `getItemsPageWithMeta` checks `if (!objectStore.indexNames.contains("timestamp"))` and falls back to `await this.getItemsWithMeta<T>(store)` which loads **every record** into memory, then slices (lines 177-186).
- No explicit error is thrown, no migration prompt, no automated index creation.
- `src/services/storageService.test.ts:56-68` — Tests encrypted-media pagination with timestamp index, but **no test** exercises the missing-index fallback path.
- `src/stores/media-store.test.ts` mocks `getItemsPageWithMeta` and never tests the fallback.

**Status:** ⚠️ **PARTIAL**
- Fallback exists but is a full-table scan (`getItemsWithMeta`), which defeats the purpose of pagination for large galleries.
- **Missing:** explicit error (throw instead of fallback), on-demand index migration, or a test verifying the fallback is triggered and bounded.

---

## AUDIT-010 — sanitizeRecord should validate data-URL format (src/services/exportImport.ts)

**Claim:** Should validate `image` field with a regex for data-URL format.

**Evidence:**
- `src/services/exportImport.ts:123-128` — For `store === "images"`, it checks `typeof record.image !== "string"` and `byteLength(record.image) > MAX_IMAGE_FIELD_BYTES`, but **no regex** validating `data:image/...;base64,` prefix or structure.
- `audit_report.yaml:281-282` explicitly lists this as unaddressed: `"Add data-URL regex validation to sanitizeRecord."`
- No test file for `exportImport.ts` was found in the repository.

**Status:** ❌ **FAIL**
- No data-URL regex validation in `sanitizeRecord`.
- A malicious or malformed `image` string (e.g., `javascript:alert(1)`) could pass the current checks.
- **Missing:** `/^data:image\/[a-zA-Z0-9.+_-]+;base64,/` validation and associated regression test.

---

## AUDIT-011 — Import size limits (src/services/exportImport.ts)

**Claim:** Should enforce MAX_IMPORT_JSON_BYTES, MAX_IMPORT_RECORDS, and total decoded image cap.

**Evidence:**
- `src/services/exportImport.ts:12` — `MAX_IMPORT_JSON_BYTES = VENICE_MAX_BODY_BYTES` (25 MiB) exists.
- `src/services/exportImport.ts:290-293` — `validateImportJson` checks `byteLength(json) > MAX_IMPORT_JSON_BYTES`.
- **No `MAX_IMPORT_RECORDS` constant** exists anywhere in the codebase (grep confirmed only in `audit_report.yaml`).
- `validateImportJson` does **not** cap the number of records per store or the total decoded image bytes after base64 expansion.
- No test file found for `exportImport.ts`.

**Status:** ❌ **FAIL**
- JSON byte cap exists, but record count cap and decoded image cap are missing.
- A 25 MiB JSON with thousands of small records or one huge base64 image could still OOM the renderer.
- **Missing:** `MAX_IMPORT_RECORDS` (e.g., 5,000), per-image decoded byte cap, and total import budget test.

---

## AUDIT-012 — Hardcoded model IDs (src/services/rp/sceneGenerationService.ts, src/services/imageWorkflowService.ts)

**Claim:** `DEFAULT_IMAGE_MODEL = 'flux-dev'` and `'upscale-model'` placeholder should be centralized in constants.

**Evidence:**
- `src/services/rp/sceneGenerationService.ts:45` — `const DEFAULT_IMAGE_MODEL = "flux-dev";` (hardcoded).
- `src/services/imageWorkflowService.ts:93` — `const { model = "upscale-model" } = options;` (placeholder hardcoded).
- `src/services/characterSceneGenerationService.ts:116` — `const model = options.model || character.modelId || useSettingsStore.getState().selectedModels.image || 'flux-dev';` (another hardcoded fallback).
- `src/config/image-model-capabilities.ts` exists and covers model capabilities, but **no canonical default-model constants file** was found.
- `audit_report.yaml:295-302` lists this as unaddressed: `"Move default model IDs to src/constants/venice.ts..."`

**Status:** ❌ **FAIL**
- Hardcoded `flux-dev` and `upscale-model` still present in production code.
- **Missing:** centralized `DEFAULT_IMAGE_MODEL` / `DEFAULT_UPSCALE_MODEL` constants in `src/constants/venice.ts` and startup validation against the live catalog.

---

## AUDIT-013 — fetch calls lack timeout in desktopBridge (src/services/desktopBridge.ts)

**Claim:** `desktopApiKey` / `desktopJinaApiKey` fetches should use AbortController/timeout.

**Evidence:**
- `src/services/desktopBridge.ts:147-157` — `desktopApiKey.isConfigured()` uses `fetch("/api/session-key")` with **no AbortController**.
- `src/services/desktopBridge.ts:164-173` — `desktopApiKey.set()` uses `fetch("/api/session-key", { method: "POST" })` with **no AbortController**.
- `src/services/desktopBridge.ts:180-186` — `desktopApiKey.delete()` uses `fetch("/api/session-key", { method: "DELETE" })` with **no AbortController**.
- `src/services/desktopBridge.ts:192-228` — `desktopApiKey.test()` uses `veniceFetch("/models", { retry: false })` — `veniceFetch` **does** have timeout, so this one is covered.
- `src/services/desktopBridge.ts:751-761` — `desktopJinaApiKey.isConfigured()` uses `fetch("/api/session-jina-key")` with **no AbortController**.
- `src/services/desktopBridge.ts:762-770` — `desktopJinaApiKey.set()` uses `fetch` with **no AbortController**.
- `src/services/desktopBridge.ts:771-775` — `desktopJinaApiKey.delete()` uses `fetch` with **no AbortController**.
- `src/services/desktopBridge.ts:776-798` — `desktopJinaApiKey.test()` uses `fetch("/api/proxy-jina")` with **no AbortController**.
- `desktopJina.request()` at line 880 **does** have AbortController/timeout (30 s default, 180 s max).

**Status:** ❌ **FAIL**
- All `desktopApiKey` and `desktopJinaApiKey` CRUD/test methods (except `desktopApiKey.test()` which uses `veniceFetch`) lack timeout/AbortController.
- A hung session-key endpoint can freeze the auth UI indefinitely.
- **Missing:** `AbortController` + timeout wrappers on every bridge `fetch` call.

---

## AUDIT-014 — `as unknown as MediaItem` cast in image-view.tsx

**Claim:** Should be removed or replaced with runtime validation.

**Evidence:**
- `src/components/image/image-view.tsx:368-403` — The `mediaItem` object is typed **directly** as `MediaItem` (no cast). All fields are explicitly populated.
- `src/components/image/image-view.tsx` grep for `as unknown` returned **zero matches**.
- `docs/summary_of_work.md:123` — confirms: `"Eliminated as unknown as MediaItem cast in src/components/image/image-view.tsx by typing the mediaItem object directly as MediaItem."`
- `src/services/characterSceneGenerationService.ts:196` still has `as unknown as MediaItem`, but that is a **different file** (not in audit scope).

**Status:** ✅ **PASS**
- Cast removed in the audited file. Direct typing with complete field population.

---

## AUDIT-015 — navigator.clipboard.writeText without fallback (src/components/chat/message-bubble.tsx)

**Claim:** Should be replaced with `copyText` helper.

**Evidence:**
- `src/components/chat/message-bubble.tsx:11` — imports `copyText` from `../../stores/media-send-to`.
- `src/components/chat/message-bubble.tsx:55` — `void copyText(codeStr)`.
- `src/components/chat/message-bubble.tsx:131` — `void copyText(content)`.
- `src/components/chat/message-bubble.tsx:314` — `void copyText(sceneGeneration.prompt)`.
- `src/stores/media-send-to.ts:64-88` — `copyText` helper tries `navigator.clipboard.writeText` and falls back to `document.execCommand("copy")`.
- `src/stores/media-send-to.test.ts:155-166` — Tests the fallback behavior.

**Status:** ✅ **PASS**
- All raw `navigator.clipboard.writeText` calls replaced with the canonical `copyText` helper.

---

## AUDIT-016 — Same clipboard issue in SceneComposerView.tsx

**Claim:** Should be replaced with `copyText` helper.

**Evidence:**
- `src/components/scenes/SceneComposerView.tsx:26` — imports `copyText` from `../../stores/media-send-to`.
- `src/components/scenes/SceneComposerView.tsx:481` — `await copyText(text)` inside `handleCopyRecipe`.

**Status:** ✅ **PASS**
- Replaced with `copyText`.

---

## AUDIT-017 — Same clipboard issue in PromptLibraryView.tsx

**Claim:** Should be replaced with `copyText` helper.

**Evidence:**
- `src/components/prompts/PromptLibraryView.tsx:28` — imports `copyText` from `../../stores/media-send-to`.
- `src/components/prompts/PromptLibraryView.tsx:587` — `onClick={async () => { await copyText(content); }}`.

**Status:** ✅ **PASS**
- Replaced with `copyText`.

---

## AUDIT-018 — Gallery handlers re-register on filter change (src/components/gallery/gallery-view.tsx)

**Claim:** Dependency array should be fixed; ref should be used.

**Evidence:**
- `src/components/gallery/gallery-view.tsx:143-198` — `useEffect` with **empty dependency array** `[]` registers command handlers once on mount.
- `src/components/gallery/gallery-view.tsx:144` — `const filteredRef = useRef(filtered);` captures the latest filtered list.
- `src/components/gallery/gallery-view.tsx:146-147` — `filteredRef.current = filtered;` updates the ref on every render without triggering re-registration.
- `registerMediaCommandHandlers` receives `visibleIds: () => filteredRef.current.map(...)` so the Command Palette always sees the current visible set.
- `src/components/gallery/gallery-view.test.tsx` — No explicit test for handler re-registration, but the `useEffect([])` pattern is the canonical React fix.

**Status:** ✅ **PASS**
- Handlers registered once via `useEffect([], …)`; live filter state accessed through a ref. No re-registration leak.

---

## AUDIT-019 — VENICE_FORGE_CONFIG_FILE env override path validation (electron/services/configService.ts)

**Claim:** Paths should be validated and contained.

**Evidence:**
- `electron/services/configService.ts:134-152` — `assertPathContained(rawPath, label)` rejects paths outside `userData`, `homeDir`, or `repoDir` using `path.relative` and `path.isAbsolute` checks.
- `electron/services/configService.ts:156-188` — `resolvePaths()` calls `assertPathContained` for env overrides.
- `electron/services/configService.ts:160-161` — URL env values are explicitly rejected (`isUrl` check).
- `electron/services/configService.test.ts:112-116` — Test: `"ignores URL env overrides"`.
- `electron/services/configService.test.ts:104-110` — Test: `"honours an absolute env override"` (only tests acceptance, not traversal rejection).
- **No test** attempts to set `VENICE_FORGE_CONFIG_FILE=/etc/passwd` and asserts rejection.
- `exportConfigTemplate` tests (lines 446-472) have extensive path-traversal tests, but those are for the **export** path, not the env config path.

**Status:** ⚠️ **PARTIAL**
- `assertPathContained` is a strong containment validator and is applied to env overrides.
- **Missing:** explicit regression test for env-config path traversal (e.g., `VENICE_FORGE_CONFIG_FILE=/etc/passwd` or `../evil.yaml` should be rejected and the app should boot safely).

---

## AUDIT-020 — researchBrowser:openExternal bypasses confirmation (electron/services/researchBrowserServer.ts)

**Claim:** Should use `promptExternalLink` confirmation dialog.

**Evidence:**
- `electron/services/researchBrowserServer.ts:325-336` — `researchBrowser:openExternal` handler checks `isTrustedExternalUrl(url)` and then calls `shell.openExternal(url)` **directly**. No confirmation dialog.
- `electron/main.ts:84` — `promptExternalLink(win, url)` exists and is used in other parts of the app (e.g., `main.ts:159, 184, 383, 390`).
- `audit_report.yaml:457-461` — explicitly lists this as unaddressed: `"Route researchBrowser:openExternal through the same promptExternalLink confirmation dialog."`

**Status:** ❌ **FAIL**
- `researchBrowser:openExternal` opens URLs without user confirmation, bypassing the `promptExternalLink` safety gate.
- **Missing:** call to `promptExternalLink` before `shell.openExternal`.

---

## AUDIT-021 — Redirect validation in characterImageCache (electron/services/characterImageCache.ts)

**Claim:** Should set `redirect: 'manual'` and validate `Location` header.

**Evidence:**
- `electron/services/characterImageCache.ts:224-228` — `fetch(url, { method: "GET", headers, signal })` has **no `redirect` option**. Default is `follow`, which follows redirects automatically.
- No `Location` header validation logic exists.
- No check for open-redirect or SSRF via redirect chains.
- The URL is validated via `isTrustedVeniceImageUrl(url)` **before** the fetch, but a redirect could send the request to an untrusted domain.
- `electron/services/characterImageCache.ts` grep for `redirect` returned zero matches.

**Status:** ❌ **FAIL**
- `redirect: 'manual'` is not set; untrusted redirects are not intercepted.
- **Missing:** `redirect: 'manual'`, `Location` header allowlist validation, and redirect-chain depth limit.

---

## Summary Table

| Audit | File | Status | Core Issue |
|-------|------|--------|------------|
| AUDIT-006 | `src/services/veniceClient.ts` | ❌ FAIL | `dedupeKey` does not strip secrets before `JSON.stringify`; no test for it. |
| AUDIT-007 | `src/stores/media-store.ts` | ⚠️ PARTIAL | Function-based patch exists; no concurrency/race test. |
| AUDIT-008 | `src/services/cryptoService.ts` | ❌ FAIL | `decryptData` returns `null` for all errors; no corrupt vs missing-key distinction. |
| AUDIT-009 | `src/services/storageService.ts` | ⚠️ PARTIAL | Missing-index fallback loads all records; no explicit error or migration. |
| AUDIT-010 | `src/services/exportImport.ts` | ❌ FAIL | No data-URL regex validation in `sanitizeRecord`. |
| AUDIT-011 | `src/services/exportImport.ts` | ❌ FAIL | No `MAX_IMPORT_RECORDS` or decoded-image cap; only JSON byte limit. |
| AUDIT-012 | `src/services/rp/sceneGenerationService.ts`, `src/services/imageWorkflowService.ts` | ❌ FAIL | Hardcoded `flux-dev` and `upscale-model` still present; not centralized. |
| AUDIT-013 | `src/services/desktopBridge.ts` | ❌ FAIL | `desktopApiKey`/`desktopJinaApiKey` fetches lack timeout/AbortController. |
| AUDIT-014 | `src/components/image/image-view.tsx` | ✅ PASS | `as unknown as MediaItem` cast removed. |
| AUDIT-015 | `src/components/chat/message-bubble.tsx` | ✅ PASS | Replaced with `copyText` helper. |
| AUDIT-016 | `src/components/scenes/SceneComposerView.tsx` | ✅ PASS | Replaced with `copyText` helper. |
| AUDIT-017 | `src/components/prompts/PromptLibraryView.tsx` | ✅ PASS | Replaced with `copyText` helper. |
| AUDIT-018 | `src/components/gallery/gallery-view.tsx` | ✅ PASS | `filteredRef` + empty-deps `useEffect` prevents re-registration. |
| AUDIT-019 | `electron/services/configService.ts` | ⚠️ PARTIAL | `assertPathContained` validates env paths; missing explicit env-traversal test. |
| AUDIT-020 | `electron/services/researchBrowserServer.ts` | ❌ FAIL | `openExternal` skips `promptExternalLink` confirmation dialog. |
| AUDIT-021 | `electron/services/characterImageCache.ts` | ❌ FAIL | No `redirect: 'manual'`; no `Location` header validation. |

**Pass:** 5 / 16
**Partial:** 3 / 16
**Fail:** 8 / 16
**Regression:** 0 / 16
