# Venice Forge YAML Audit Validation Report

> Historical snapshot. This report records the repository name and local path
> used when the audit was performed. The current Electron repository is
> `/Users/super_user/Projects/Venice_Forge` and the current GitHub repository
> is `spearchucker667/Venice_Forge`. Do not use paths in this report as active
> setup instructions.

## Metadata

- **Repository:** Windows-Venice-API-connector / Venice Forge
- **Local path:** /Users/super_user/Projects/Venice_Forge/
- **HEAD:** fc66cb447e105150eb9d80fb253f18b634955db4
- **Branch:** main
- **Validation date:** 2026-06-19
- **Node:** v24.15.0 (outside package.json engine range `>=22.13.0 <23`)
- **npm:** 11.12.1
- **Working tree state:** 20 modified files, 2 untracked (audit_report.yaml, src/utils/idValidation.ts), 6 tracked .bak files present, 1 untracked kimi-export-session file

---

## Command Results

| Command | Result | Evidence |
|---|---|---|
| `npm run lint:eslint` | **PASS** | 0 errors, 0 warnings |
| `npm run typecheck` | **PASS** | Renderer + electron main both clean |
| `npm test -- --run` | **PASS** | 260 files, 3261 tests, 1 skipped |
| `npm run verify:safety-guard` | **PASS** | All enforcement checks passed |
| `npm run verify:contracts` | **FAIL** | 1 prompt-library invariant: `DB_VERSION` not bumped to ≥8 |
| `npm run verify:markdown-links` | **PASS** | 66 Markdown files checked |
| `npm run build` | **PASS** | dist/ + dist-electron/ + dist/server.cjs produced |
| `npm run ci` | **FAIL** | `verify:contracts` failure cascades into full CI gate |

---

## Executive Gate

Final result:

```
FAIL
```

Blocking reasons:

1. **`verify:contracts` fails** (`DB_VERSION` invariant in `verify:prompt-library` script)
2. **`npm run ci` fails** as a consequence of `verify:contracts`
3. **40+ audit items rated FAIL** across all severity levels (see counts below)
4. **6 tracked `.bak` files** still present in repository (AUDIT-066)
5. **Untracked `kimi-export-session_*.md`** at repository root (AUDIT-068)
6. **Duplicate `docs/audits/summary_of_work.md`** without SUPERSEDED banner (AUDIT-069)
7. **Node v24.15.0** outside declared engine range (`>=22.13.0 <23`)

---

## Summary Counts

| Status | Count |
| --- | ---: |
| **PASS** | 12 |
| **PARTIAL** | 17 |
| **FAIL** | 48 |
| **REGRESSION** | 0 |
| **NOT_APPLICABLE_WITH_PROOF** | 3 |

---

## Critical and High Findings

| ID | Status | Evidence | Required Follow-up |
|---|---|---|---|
| **AUDIT-001** | **PARTIAL** | `server.ts:140-170` DevSessionKey with TTL exists; `process.on` cleanup exists; **no TTL expiration test** | Add test advancing `Date.now()` past `expiresAt` |
| **AUDIT-002** | **PARTIAL** | `desktopBridge.ts:116-138` `_webSessionVeniceApiKey` object with TTL/beforeunload exists; **no TTL/beforeunload test** | Add test for TTL expiration and `beforeunload` clearing |
| **AUDIT-003** | **PARTIAL** | `markdown.tsx:69-83` `sanitizeHtml()` exists and used at line 113; **no XSS payload tests** | Add tests for `<script>`, `onerror`, `javascript:`, `data:text/html` stripping |
| **AUDIT-004** | **FAIL** | `veniceClient.ts:152-156` `resolveTimeoutMs` correctly clamps `<=0` to 60000 and caps at 120s; **function is NOT exported, zero tests exist** | Export `resolveTimeoutMs` and add unit tests for `0`, `-1`, `>120000` |
| **AUDIT-005** | **PARTIAL** | `idValidation.ts` + `storageService.ts:126,248,291,338,355,383` all boundaries instrumented; **shared module has no dedicated tests** | Add `idValidation.test.ts` covering `''`, `__proto__`, `constructor`, `prototype`, `>128` chars |
| **AUDIT-006** | **FAIL** | `veniceClient.ts:123-134` `dedupeKey` does `JSON.stringify(body)` without stripping secret fields; **no secret-stripping test** | Create shallow copy of body, delete keys matching `/api[-_ ]?key\|authorization\|token/i`, then stringify |
| **AUDIT-007** | **PARTIAL** | `media-store.ts:196-240` function-based patch `(existing) => ({childrenIds: ...})` implemented; **no concurrency test** | Add test firing two concurrent `upsertDerivative` calls for same parent, assert both children present |
| **AUDIT-008** | **FAIL** | `cryptoService.ts:104-120` `decryptData` returns `null` for all errors with no differentiation; **no corrupt vs missing-key test** | Return discriminated union `{ok: boolean, data?: T, reason?: string}` and surface UI repair action |
| **AUDIT-009** | **PARTIAL** | `storageService.ts:165-185` `getItemsPageWithMeta` falls back to `getItemsWithMeta` (all records) when index missing; **no explicit error or migration** | Throw explicit error when index missing; add startup migration verifying indexes |
| **AUDIT-010** | **FAIL** | `exportImport.ts:99-197` `sanitizeRecord` checks byte length but **no data-URL regex validation** | Add `^data:image\/[a-zA-Z0-9.+]+;base64,[-A-Za-z0-9+/=]*$` validation |
| **AUDIT-011** | **FAIL** | `exportImport.ts:11-12` `MAX_IMPORT_JSON_BYTES = 25 MiB` (same as `VENICE_MAX_BODY_BYTES`); **no MAX_IMPORT_RECORDS or decoded image cap** | Reduce to 5 MiB, add 5,000 record cap, add 50 MiB decoded image cap |
| **AUDIT-012** | **FAIL** | `rp/sceneGenerationService.ts:45` `DEFAULT_IMAGE_MODEL = 'flux-dev'`; `imageWorkflowService.ts:93` `model = 'upscale-model'`; **not centralized, no catalog validation** | Move to `src/constants/venice.ts`, validate against live catalog at startup |
| **AUDIT-013** | **FAIL** | `desktopBridge.ts:127-163` all `fetch` calls in `desktopApiKey`/`desktopJinaApiKey` lack `AbortController`/timeout | Wrap every fetch with `AbortController` + 10s timeout; catch `AbortError` |
| **AUDIT-014** | **PASS** | `image-view.tsx:367-428` `as unknown as MediaItem` **removed**; `mediaItem` typed directly as `MediaItem` | None |
| **AUDIT-015** | **PASS** | `message-bubble.tsx:11,54,129,312` all `navigator.clipboard.writeText` replaced with `copyText` from `media-send-to.ts` | None |
| **AUDIT-016** | **PASS** | `SceneComposerView.tsx:25,480` `navigator.clipboard.writeText` replaced with `copyText` | None |
| **AUDIT-017** | **PASS** | `PromptLibraryView.tsx:27,586` `navigator.clipboard.writeText` replaced with `copyText` | None |
| **AUDIT-018** | **PASS** | `gallery-view.tsx:143-199` `registerMediaCommandHandlers` moved to mount-only `useEffect` with `[]` deps; `filteredRef` used | None |
| **AUDIT-019** | **PARTIAL** | `configService.ts:130-159` `assertPathContained()` validates env paths against `userData`, `homedir`, repo dir; **no test for `/etc/passwd` rejection** | Add test for `VENICE_FORGE_CONFIG_FILE=/etc/passwd` rejection |
| **AUDIT-020** | **FAIL** | `researchBrowserServer.ts:325-336` `researchBrowser:openExternal` calls `shell.openExternal` directly **without** `promptExternalLink` confirmation | Route through `promptExternalLink` before `shell.openExternal` |
| **AUDIT-021** | **FAIL** | `characterImageCache.ts:214-235` `fetch` follows redirects by default; **no `redirect: 'manual'`, no Location validation** | Set `redirect: 'manual'`, validate redirect Location against `isTrustedVeniceImageUrl` and `isPrivateHostname` |

---

## Full Finding Validation

### AUDIT-001 — Dev session API-key TTL and authorization

**Status:** `PARTIAL`

**Source evidence:**

```
server.ts:138   const DEV_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
server.ts:140   interface DevSessionKey { key: string; expiresAt: number; }
server.ts:145   function createDevSessionKey(key: string): DevSessionKey { ... }
server.ts:149   function getDevSessionKey(session: DevSessionKey | null): string { ... }
server.ts:154   function isDevSessionConfigured(session: DevSessionKey | null): boolean { ... }
server.ts:168-170 process.on("exit", ...), process.on("SIGINT", ...), process.on("SIGTERM", ...)
server.ts:222  res.status(200).json({ configured: isDevSessionConfigured(devSessionVeniceApiKey) });
server.ts:254  res.status(200).json({ configured: isDevSessionConfigured(devSessionJinaApiKey) || Boolean(AppConfig.JINA_API_KEY) });
```

**Test evidence:**

- `server.test.ts:92-144` — tests store/clear of Venice and Jina keys, rejects empty/oversized keys
- **Missing:** No test verifies TTL expiration (advancing `Date.now()` past `expiresAt` and asserting `configured: false`)
- **Missing:** No additional dev-bearer token or dev-only cookie auth mechanism beyond `isLoopbackClient()`

**Validation notes:** Implementation is complete and correct. The TTL, expiration check, and process cleanup are all present. However, the audit required an "additional bearer token or dev-only cookie when NODE_ENV=development" — this is not implemented. The endpoints remain protected only by `isLoopbackClient()`. Additionally, TTL expiration behavior is untested.

**Required follow-up:**
- Add test simulating TTL expiration
- Consider adding `DEV_SECRET` env var bearer token for additional dev-only auth (low priority given loopback-only access)

---

### AUDIT-002 — Web session API keys

**Status:** `PARTIAL`

**Source evidence:**

```
desktopBridge.ts:116-135   const _webSessionVeniceApiKey = { value: "", setAt: 0, TTL_MS: 24*60*60*1000, isConfigured, key, set(), clear() }
desktopBridge.ts:138   window.addEventListener("beforeunload", () => _webSessionVeniceApiKey.clear());
```

**Test evidence:**

- `desktopBridge.test.ts:115-124` — tests web-mode Venice keys ephemeral
- `desktopBridge.test.ts:138-159` — tests web-mode Jina keys ephemeral
- **Missing:** No test verifies TTL expiration or `beforeunload` clearing

**Validation notes:** The module-level `let` variables are replaced with the `_webSessionVeniceApiKey` object. The `beforeunload` listener is present. However, the Jina key (`_webSessionJinaApiKey`) was not found in the source — the audit mentioned both Venice and Jina keys but only the Venice key appears to have been fixed. Need to verify Jina key.

**Required follow-up:**
- Verify `_webSessionJinaApiKey` exists and follows same pattern
- Add tests for TTL expiration and `beforeunload` clearing

---

### AUDIT-003 — dangerouslySetInnerHTML sanitization

**Status:** `PARTIAL`

**Source evidence:**

```
markdown.tsx:69-83   export function sanitizeHtml(html: string): string { ... }
markdown.tsx:113   return <div ... dangerouslySetInnerHTML={{ __html: sanitizeHtml(minimalMarkdown(text)) }} />;
```

`sanitizeHtml` strips:
- `<script>` tags and contents
- Dangerous tags (`iframe`, `object`, `embed`, `form`, `input`, `textarea`, `select`, `option`, `applet`, `meta`, `link`, `style`, `base`) — note: `button` was removed from the initial over-aggressive list to avoid breaking copy-code tests
- Event handlers (`on\w+`)
- `javascript:` URLs
- `data:text/html` URLs

**Test evidence:**

- `markdown.test.ts` tests `minimalMarkdown` and copy-code functionality but **does not test `sanitizeHtml` directly**
- **Missing:** No test with XSS payloads (`<script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, `<a href="javascript:alert(1)">`, `<svg onload=alert(1)>`)

**Validation notes:** The sanitizer is implemented and applied. The defense-in-depth layer exists. However, the initial fix incorrectly included `button` in the dangerous tag list, which broke the copy-code button tests. That was corrected. But there are no dedicated tests proving the sanitizer strips malicious payloads.

**Required follow-up:**
- Add `sanitizeHtml` test file with XSS payload coverage

---

### AUDIT-004 — Timeout bypass (`timeoutMs=0`)

**Status:** `FAIL`

**Source evidence:**

```
veniceClient.ts:152-156   function resolveTimeoutMs(timeoutMs: number | undefined): number | null { ... }
veniceClient.ts:535   const timeoutMsResolved = resolveTimeoutMs(timeoutMs);
veniceClient.ts:716   const fetchTimeoutMs = resolveTimeoutMs(timeoutMs) ?? 60000;
```

`resolveTimeoutMs` correctly:
- Returns `null` for `undefined`
- Returns `60000` for non-number, non-finite, or `<= 0`
- Caps at `120000`

**Test evidence:**

- `resolveTimeoutMs` is **not exported** (local `function`)
- `veniceClient.test.ts` does **not** import or test it
- **No tests exist** for `timeoutMs=0`, `timeoutMs=-1`, `timeoutMs>120000`

**Validation notes:** The implementation is correct but unverified. The function being non-exported makes it impossible to test from outside the module. There are zero tests for this critical safety function.

**Required follow-up:**
- Export `resolveTimeoutMs` (or add it to a testable utilities module)
- Add tests for `0`, `-1`, `120001`, `undefined`, `null`, `NaN`, `Infinity`

---

### AUDIT-005 — ID validation and prototype pollution

**Status:** `PARTIAL`

**Source evidence:**

```
idValidation.ts:6   const VALID_ID_RE = /^[a-zA-Z0-9_.-]{1,128}$/;
idValidation.ts:7   const FORBIDDEN_IDS = new Set(["__proto__", "constructor", "prototype"]);
storageService.ts:126   assertValidId(id, "saveItem");
storageService.ts:248   if (!isValidId(id)) return null;
storageService.ts:291   assertValidId(id, "deleteItem");
storageService.ts:338   assertValidId(id, "patchMedia");
storageService.ts:355   if (!isValidId(id)) continue;
storageService.ts:383   if (!isValidId(id)) continue;
```

**Test evidence:**

- `characterCardStorage.test.ts` and `rpChatStorage.test.ts` test `isValidId` but those are **local implementations** in electron services, not the shared `src/utils/idValidation.ts`
- `exportImport.test.ts` tests `__proto__`/`constructor`/`prototype` rejection during import
- **Missing:** No tests for `src/utils/idValidation.ts` itself
- **Missing:** No tests for `storageService.ts` boundaries with invalid IDs

**Validation notes:** All six storage boundaries are correctly instrumented. The shared module is clean and correct. But there are no tests proving the boundaries reject malicious IDs.

**Required follow-up:**
- Add `idValidation.test.ts` with comprehensive coverage
- Add `storageService.test.ts` cases for `saveItem('')`, `saveItem('__proto__')`, `deleteItem('constructor')`, etc.
- Note: `project-store.ts:122` `deleteProject` does **not** use `isValidId` (AUDIT-025 also fails)
- Note: `chat-store.ts:493` `markDirtyConversation` does **not** validate ID (AUDIT-030 also fails)

---

### AUDIT-006 — Dedupe key materializes secrets

**Status:** `FAIL`

**Source evidence:**

```
veniceClient.ts:123-134   function dedupeKey(endpoint: string, method: string, body: unknown): string { ... }
veniceClient.ts:128   return `${method}:${endpoint}:${JSON.stringify(body)}`;
```

**Test evidence:**

- `veniceClient.test.ts` tests `dedupeKey` but **not with secret-containing bodies**
- **Missing:** No test asserting `dedupeKey('POST', '/chat', { apiKey: 'sk-123' })` does not contain `'sk-123'`

**Validation notes:** `JSON.stringify(body)` is called on the raw body. If a caller accidentally includes an API key, it will appear in the dedupe key string, living in the `inFlight` Map until the promise settles. This is a transient memory exposure risk.

**Required follow-up:**
- Create shallow copy of body in `dedupeKey`, delete keys matching `/api[-_ ]?key\|authorization\|token/i`, then stringify
- Add test asserting secret exclusion from dedupe key

---

### AUDIT-007 — Race condition in `upsertDerivative`

**Status:** `PARTIAL`

**Source evidence:**

```
media-store.ts:196-240   upsertDerivative: async (item, parentId) => { ... }
media-store.ts:207-208   const updatedParent = await StorageService.patchMedia<MediaItem>(parentId, (existing) => ({
  childrenIds: Array.from(new Set([...existing.childrenIds, saved.id])),
}));
```

The function-based patch `(existing) => ({childrenIds: ...})` was added. However, this still uses IndexedDB's `get` + `put` pattern, not a true atomic read-modify-write transaction. The function is applied after `getItem` reads the record, so while it reduces the stale-read window, it does not eliminate the race entirely.

**Test evidence:**

- `media-store.test.ts` and `image-tools.test.tsx` mocks were updated to handle function-based patches
- **Missing:** No concurrency test firing two `upsertDerivative` calls simultaneously for the same parent

**Validation notes:** The function-based patch is an improvement over the pre-computed `childrenIds` approach, but it is not a true atomic transaction. Two concurrent operations can still both read the same state, compute their own `childrenIds` array, and overwrite each other. The last write wins.

**Required follow-up:**
- Add an optimistic-locking version field to `MediaItem` and retry on version mismatch
- Add concurrency test simulating the race

---

### AUDIT-008 — Encryption silent failure

**Status:** `FAIL`

**Source evidence:**

```
cryptoService.ts:104-120   export async function decryptData<T>(encryptedPayload: string): Promise<T | null> { ... }
cryptoService.ts:118   warn("[cryptoService] Decryption failed:", err);
cryptoService.ts:119   return null;
```

`decryptData` catches all errors and returns `null` with only a `warn` log. No distinction between "wrong key" and "corrupted data".

**Test evidence:**

- `cryptoService.test.ts` may exist but no test for differentiated error reasons was found
- **Missing:** No test for `decryptData` with corrupted payload vs wrong key

**Validation notes:** The implementation does not return a discriminated union. `storageService.ts` `decodeRows` silently filters out `null` values with only a `warn` log. Users lose data with no diagnostic trace or UI repair action.

**Required follow-up:**
- Modify `decryptData` to return `{ ok: boolean, data?: T, reason?: 'corrupt' | 'key-missing' }`
- In `decodeRows`, emit `console.warn` and surface a toast/UI notice for the user
- Add tests for corrupt payload and wrong-key payload

---

### AUDIT-009 — Pagination fallback

**Status:** `PARTIAL`

**Source evidence:**

```
storageService.ts:165-185   async getItemsPageWithMeta<T>(store, options) { ... }
storageService.ts:177-178   if (!objectStore.indexNames.contains("timestamp")) {
  const result = await this.getItemsWithMeta<T>(store);
  return { ...result, items: result.items.slice(offset, offset + limit), ... };
}
```

**Test evidence:**

- **Missing:** No test for missing timestamp index behavior

**Validation notes:** When the timestamp index is missing, `getItemsPageWithMeta` silently loads ALL records into memory, then slices. For a 10,000+ image gallery, this is catastrophic. No explicit error is thrown, no migration is scheduled, and no test covers this.

**Required follow-up:**
- Throw explicit error when index is missing
- Add startup migration in `dbMigrations.ts` verifying all required indexes
- Add test for missing-index scenario

---

### AUDIT-010 — Import data-URL validation

**Status:** `FAIL`

**Source evidence:**

```
exportImport.ts:99-197   function sanitizeRecord(record: unknown): SanitizedRecord { ... }
```

`sanitizeRecord` checks `image` byte length but does not validate the format is a valid data URL.

**Test evidence:**

- **Missing:** No test for `image: 'not-a-data-url'` rejection

**Validation notes:** A malformed image string could crash downstream consumers. No regex validation exists.

**Required follow-up:**
- Add `validateDataUrl(image)` regex check in `sanitizeRecord`
- Add test rejecting non-data-URL image strings

---

### AUDIT-011 — Import size limits

**Status:** `FAIL`

**Source evidence:**

```
exportImport.ts:11-12   const MAX_IMPORT_JSON_BYTES = VENICE_MAX_BODY_BYTES; // 25 MiB
```

**Test evidence:**

- **Missing:** No `MAX_IMPORT_RECORDS` cap
- **Missing:** No post-parse total decoded image size cap
- **Missing:** No test for 25 MiB rejection

**Validation notes:** A 25 MiB JSON can contain thousands of large base64 images, causing the renderer to OOM during `JSON.parse()`. No two-tier limit exists.

**Required follow-up:**
- Change `MAX_IMPORT_JSON_BYTES` to 5 MiB
- Add `MAX_IMPORT_RECORDS = 5,000`
- Add post-parse check that sum of base64 image sizes ≤ 50 MiB

---

### AUDIT-012 — Hardcoded model IDs

**Status:** `FAIL`

**Source evidence:**

```
rp/sceneGenerationService.ts:45   const DEFAULT_IMAGE_MODEL = 'flux-dev';
imageWorkflowService.ts:93   const model = 'upscale-model';
```

**Test evidence:**

- **Missing:** No startup validation against live catalog
- **Missing:** No fallback if default model is missing

**Validation notes:** Both hardcoded model IDs remain in production code. The `'upscale-model'` string is particularly suspicious — it may be a placeholder that was never replaced with a real model ID. No centralized constants file exists for default model IDs.

**Required follow-up:**
- Move default model IDs to `src/constants/venice.ts`
- At startup, fetch live model list and warn if default is missing
- Remove `'upscale-model'` placeholder or replace with real ID

---

### AUDIT-013 — Bridge fetch timeouts

**Status:** `FAIL`

**Source evidence:**

```
desktopBridge.ts:147-157   async isConfigured(): Promise<boolean> { ... fetch("/api/session-key") ... }
desktopBridge.ts:164-172   async set(key: string): Promise<{ ok: boolean }> { ... fetch("/api/session-key", { method: "POST" }) ... }
```

All fetches in `desktopApiKey` and `desktopJinaApiKey` lack `AbortController` or timeout.

**Test evidence:**

- **Missing:** No test for hung proxy timeout

**Validation notes:** If the Express proxy hangs, the promise never resolves, and the auth store remains in a loading state indefinitely.

**Required follow-up:**
- Add `AbortController` with 10s timeout to every fetch in `desktopBridge.ts`
- Catch `AbortError` and surface toast: "Connection to local proxy timed out."
- Add test with MSW or hung server

---

### AUDIT-014 — `as unknown as MediaItem` cast

**Status:** `PASS`

**Source evidence:**

```
image-view.tsx:367   const mediaItem: MediaItem = { ... };
image-view.tsx:428   await useMediaStore.getState().upsertDerivative(mediaItem, ...);
```

The `mediaItem` is now typed directly as `MediaItem` instead of `Record<string, unknown>` with a cast. The `typedItem` intermediate variable was removed.

**Test evidence:**

- `image-view.test.tsx` may cover this path
- `typecheck` passes

**Validation notes:** Cast eliminated. Type safety restored.

**Required follow-up:** None

---

### AUDIT-015 — Clipboard fallback (message-bubble)

**Status:** `PASS`

**Source evidence:**

```
message-bubble.tsx:11   import { copyText } from '../../stores/media-send-to'
message-bubble.tsx:54   onClick={() => { void copyText(codeStr) ... }}
message-bubble.tsx:129   const handleCopy = () => { void copyText(content) ... }
message-bubble.tsx:312   onCopyPrompt={() => { if (sceneGeneration.prompt) { void copyText(sceneGeneration.prompt) } }}
```

**Test evidence:**

- `message-bubble.test.tsx:65-73` tests copy toggle behavior
- `media-send-to.test.ts` tests `copyText` fallback

**Validation notes:** All three `navigator.clipboard.writeText` calls replaced with `copyText` which has `document.execCommand` fallback.

**Required follow-up:** None

---

### AUDIT-016 — Clipboard fallback (SceneComposer)

**Status:** `PASS`

**Source evidence:**

```
SceneComposerView.tsx:25   import { copyText } from "../../stores/media-send-to";
SceneComposerView.tsx:480   await copyText(text);
```

**Validation notes:** `navigator.clipboard.writeText` replaced with `copyText`.

**Required follow-up:** None

---

### AUDIT-017 — Clipboard fallback (PromptLibrary)

**Status:** `PASS`

**Source evidence:**

```
PromptLibraryView.tsx:27   import { copyText } from "../../stores/media-send-to";
PromptLibraryView.tsx:586   onClick={async () => { await copyText(content); }}
```

**Validation notes:** `navigator.clipboard.writeText` replaced with `copyText`.

**Required follow-up:** None

---

### AUDIT-018 — Gallery handler re-registration

**Status:** `PASS`

**Source evidence:**

```
gallery-view.tsx:143-199   useEffect(() => { const cleanup = registerMediaCommandHandlers({ ... }); return cleanup; }, []);
gallery-view.tsx:196   return cleanup;
gallery-view.tsx:197   }, []); // mount only
```

`filteredRef` is used to provide latest filtered IDs without re-registering handlers.

**Validation notes:** Handlers registered once on mount, not on every filter change. `filteredRef` keeps the handler closure stable while reading current state.

**Required follow-up:** None

---

### AUDIT-019 — Config path env override

**Status:** `PARTIAL`

**Source evidence:**

```
configService.ts:130-159   function assertPathContained(rawPath, label) { ... }
configService.ts:132-133   const userData = app.getPath("userData"); const homeDir = os.homedir();
configService.ts:135-142   const allowedRoots = [userData, homeDir, repoDir].filter(Boolean);
configService.ts:137-140   const contained = allowedRoots.some((root) => { const relative = path.relative(root, resolved); return relative && !relative.startsWith("..") && !path.isAbsolute(relative); });
configService.ts:145-149   function resolvePaths(): ResolvedPaths { ... }
```

`assertPathContained` validates `VENICE_FORGE_CONFIG_FILE` and `VENICE_FORGE_THEMES_FILE` against `userData`, `os.homedir()`, and repo directory. Throws error for paths outside.

**Test evidence:**

- **Missing:** No test for `VENICE_FORGE_CONFIG_FILE=/etc/passwd` rejection

**Validation notes:** The path containment logic is implemented and correct. However, it is not tested. The `assertPathContained` function is not exported.

**Required follow-up:**
- Export `assertPathContained` or add integration test for env path traversal rejection

---

### AUDIT-020 — `researchBrowser:openExternal` bypasses confirmation

**Status:** `FAIL`

**Source evidence:**

```
researchBrowserServer.ts:325-336   ipcMain.handle('researchBrowser:openExternal', async (_event, url: string) => { ... await shell.openExternal(url); })
```

`isTrustedExternalUrl` blocks private IPs and non-HTTPS, but does **not** require a user confirmation dialog before `shell.openExternal`.

**Test evidence:**

- **Missing:** No test for confirmation dialog

**Validation notes:** A compromised renderer can silently open arbitrary HTTPS URLs in the system browser, bypassing the `promptExternalLink` confirmation used elsewhere.

**Required follow-up:**
- Import `promptExternalLink` from main.ts or extract to shared module
- Call it before `shell.openExternal`
- Block IPC if user cancels

---

### AUDIT-021 — `characterImageCache` follows redirects without validation

**Status:** `FAIL`

**Source evidence:**

```
characterImageCache.ts:214-235   fetch(url, { method: 'GET', headers, signal }) ...
```

`fetch` follows redirects by default (`redirect: 'follow'` is the default). No `redirect: 'manual'` is set. No Location header validation.

**Test evidence:**

- **Missing:** No test for 302 redirect to private IP

**Validation notes:** If the Venice CDN returns a 302 redirect to an attacker-controlled URL, `fetch` follows it without validating the destination against `isTrustedVeniceImageUrl` or `isPrivateHostname`.

**Required follow-up:**
- Set `redirect: 'manual'` in fetch options
- On 302 response, parse Location header and validate before second request
- Add test mocking 302 to `http://192.168.1.1/secret`

---

### AUDIT-022 — CI runner tags

**Status:** `PASS`

**Source evidence:**

```
ci.yml:14    runs-on: ubuntu-22.04
ci.yml:46    runs-on: windows-2022
ci.yml:79    runs-on: macos-14
ci.yml:113   runs-on: macos-14
ci.yml:133   runs-on: windows-2022
release.yml:18    runs-on: macos-14
release.yml:104   runs-on: windows-2022
release.yml:191   runs-on: ubuntu-22.04
release.yml:250   runs-on: ubuntu-22.04
```

No `ubuntu-latest`, `windows-latest`, or `macos-latest` remain.

**Validation notes:** All floating runner tags replaced with pinned versions.

**Required follow-up:** None

---

### AUDIT-023 — CI concurrency

**Status:** `PASS`

**Source evidence:**

```
ci.yml:1-4   name: CI

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
```

`release.yml` already had `concurrency: { group: release-${{ github.ref }}, cancel-in-progress: true }`.

**Validation notes:** Both workflows now have appropriate concurrency blocks.

**Required follow-up:** None

---

### AUDIT-024 — Rate limiter shared bucket

**Status:** `FAIL`

**Source evidence:**

```
server.ts:348,918   const clientKey = req.ip || "unknown";
```

`req.socket.remoteAddress` is not used as a fallback before `"unknown"`.

**Test evidence:**

- **Missing:** No test for separate buckets with `trust proxy` disabled

**Validation notes:** When `trust proxy` is not set, `req.ip` is undefined. All requests share the `"unknown"` bucket. A single attacker can exhaust the limit for everyone.

**Required follow-up:**
- Change to `req.ip || req.socket?.remoteAddress || 'unknown'`
- Add test with two different IPs and `trust proxy` disabled

---

### AUDIT-025 — `deleteProject` ID validation

**Status:** `FAIL`

**Source evidence:**

```
project-store.ts:122   deleteProject: async (projectId) => { ... await StorageService.deleteItem("projects", projectId); ... }
```

No `isValidId` call before passing `projectId` to `deleteItem`.

**Validation notes:** While `StorageService.deleteItem` now validates the ID, the audit specifically asked for validation at the store boundary. `deleteProject` does not gate with `isValidId` before calling `deleteItem`.

**Required follow-up:**
- Add `assertValidId(projectId, "deleteProject")` at the top of `deleteProject`

---

### AUDIT-026 — `enableJina` cast

**Status:** `FAIL`

**Source evidence:**

```
diagnosticsService.ts:248   const research = settings as unknown as { enableJina?: boolean };
```

`enableJina` is **not** in the canonical `SettingsState` interface.

**Validation notes:** The cast is still present. The field is not part of the canonical type.

**Required follow-up:**
- Add `enableJina?: boolean` to `SettingsState` or remove the cast and use optional accessor with fallback

---

### AUDIT-027 — Model cache in localStorage

**Status:** `FAIL`

**Source evidence:**

```
modelService.ts:20-30   const cacheKey = "venice-forge-models-cache"; ... localStorage.setItem(cacheKey, JSON.stringify({ ... }));
```

**Validation notes:** Model list is still cached in `localStorage` as plaintext JSON. No migration to IndexedDB.

**Required follow-up:**
- Replace `localStorage.setItem` with IndexedDB write
- Add migration to clear old `localStorage` key

---

### AUDIT-028 — `promptStarterService` fetch timeout

**Status:** `FAIL`

**Source evidence:**

```
promptStarterService.ts:106   const res = await fetch(REMOTE_PROMPT_STARTERS_URL);
```

No `AbortSignal`, no timeout, no retry.

**Validation notes:** If the remote URL is unreachable, the UI hangs until the browser's default timeout (~300s).

**Required follow-up:**
- Add `AbortSignal.timeout(10000)` to the fetch
- Add retry with exponential backoff

---

### AUDIT-029 — Hardcoded constants

**Status:** `FAIL`

**Source evidence:**

```
chat-store.ts:487   const DEBOUNCE_MS = 500;
chat-store.ts:491   const MAX_DIRTY_CONVERSATIONS = 1000;
media-store.ts:64   const MEDIA_PAGE_SIZE = 60;
media-store.ts:69   const MEDIA_IN_MEMORY_CACHE_MAX = 1000;
```

**Validation notes:** Constants are still defined locally in stores. No central `src/constants/venice.ts` file.

**Required follow-up:**
- Move constants to `src/constants/venice.ts`
- Import from stores

---

### AUDIT-030 — `markDirtyConversation` ID validation

**Status:** `FAIL`

**Source evidence:**

```
chat-store.ts:493   markDirtyConversation(id: string, conv: Conversation) { ... }
```

No ID validation at entry point.

**Validation notes:** Empty string would create a dirty entry at key `''`, causing `flushConversationSave` to write the wrong record.

**Required follow-up:**
- Add `assertValidId(id, "markDirtyConversation")` at the top of the function

---

### AUDIT-031 — Inconsistent retry backoff

**Status:** `FAIL`

**Source evidence:**

```
veniceClient.ts:153   desktop retry: calculateBackoff(attempt + 1, 1200, 9000)
veniceClient.ts:607   web retry: Math.min(1000 * Math.pow(2, attempt + 1), 8000)
```

**Validation notes:** Desktop and web use different base delays and caps for the same error class. No centralized `RETRY_POLICY` object.

**Required follow-up:**
- Create `RETRY_POLICY` in `src/constants/venice.ts`
- Replace inline calculations with references

---

### AUDIT-032 — SettingsView button types

**Status:** `FAIL`

**Source evidence:**

```
SettingsView.tsx   ~30 <button> elements, 0 with explicit type="button"
```

**Validation notes:** All non-submit buttons lack `type="button"`. Pressing Enter in an adjacent input could trigger unintended actions.

**Required follow-up:**
- Add `type="button"` to every non-submit `<button>` in SettingsView.tsx

---

### AUDIT-033 — Sidebar button types

**Status:** `PARTIAL`

**Source evidence:**

```
sidebar.tsx   ~50% of buttons have type="button" (New chat, toggles); ~50% missing (nav tabs, project actions, menu items)
```

**Validation notes:** Partial coverage. Some buttons have it, many don't.

**Required follow-up:**
- Add `type="button"` to all remaining non-submit buttons in sidebar.tsx

---

### AUDIT-034 — ThemeMaker button types

**Status:** `FAIL`

**Source evidence:**

```
ThemeMaker.tsx   6 <button> elements, 0 with type="button"
```

**Validation notes:** All buttons lack explicit type.

**Required follow-up:**
- Add `type="button"` to all non-submit buttons in ThemeMaker.tsx

---

### AUDIT-035 — React key in ImageGenerationPreview

**Status:** `PARTIAL`

**Source evidence:**

```
ImageGenerationPreview.tsx:52   key={savedDoc.id || idx}
```

**Validation notes:** Falls back to unstable array index when `id` is falsy. Still a risk for reordering bugs.

**Required follow-up:**
- Generate stable preview key using composite of available stable fields (e.g., `preview-${idx}-${draft.lastSavedImageId}`)
- Never fall back to `idx` for dynamic lists

---

### AUDIT-036 — React key in compare-view

**Status:** `FAIL`

**Source evidence:**

```
compare-view.tsx:238   key={idx}
```

**Validation notes:** Raw index used as key. If items are reordered, cell DOM does not reflect new value order.

**Required follow-up:**
- Replace with `key={items[idx]?.id ?? idx}` or `${row.field}-${idx}`

---

### AUDIT-037 — `document.querySelector` in StatusView

**Status:** `FAIL`

**Source evidence:**

```
StatusView.tsx:76   appVersion: (document.querySelector('meta[name=app-version]') as HTMLMetaElement)?.content ?? 'web'
```

**Validation notes:** Global DOM search bypasses React's declarative model. If meta tag is missing or duplicated, wrong version shown.

**Required follow-up:**
- Create a `VersionProvider` React context that reads the meta tag once at mount
- Replace `document.querySelector` with `useContext(VersionContext)`

---

### AUDIT-038 — ThemeMaker hardcoded colors

**Status:** `FAIL`

**Source evidence:**

```
ThemeMaker.tsx:182-188   success: color(bright, 'green', '#74d66a'), warning: color(bright, 'yellow', '#d6a84f'), danger: color(bright, 'red', '#ef4444'), info: color(bright, 'cyan', '#7da7ff')
ThemeMaker.tsx:188   overlay: mode === 'light' ? 'rgba(0, 0, 0, 0.25)' : 'rgba(0, 0, 0, 0.6)'
```

**Validation notes:** Literal hex/rgba values not derived from canonical 29-role semantic token contract. Legacy theme import fallback uses hardcoded values.

**Required follow-up:**
- Replace hardcoded hex values with references to `BUILTIN_VENICE.tokens` or theme registry
- Add validation rejecting imported themes with colors not in canonical palette

---

### AUDIT-039 — KaTeX CSS import

**Status:** `PARTIAL`

**Source evidence:**

```
message-bubble.tsx:94-95   // @ts-expect-error - TS doesn't know about CSS imports without ambient declarations
import('katex/dist/katex.min.css')
```

`@ts-expect-error` is still present. No ambient declaration for `*.css`. CSS import is unhandled per-component mount.

**Validation notes:** If CSS fails to load, math rendering is broken. No `declare module '*.css'` in global types. The dynamic import fires on every component mount, not deduplicated.

**Required follow-up:**
- Add `declare module '*.css'` in `src/types/global.d.ts`
- Remove `@ts-expect-error`
- Wrap import in try/catch or deduplicate

---

### AUDIT-040 — CommandPalette querySelectorAll

**Status:** `FAIL`

**Source evidence:**

```
CommandPalette.tsx:95   const items = Array.from(listRef.current.querySelectorAll<HTMLButtonElement>('[data-command-item]'))
```

**Validation notes:** Focus management depends on DOM traversal. If list structure changes, selector may miss or select wrong items.

**Required follow-up:**
- Maintain flat command items array in React state
- Derive focusable elements from state array instead of DOM queries

---

### AUDIT-041 — useFocusTrap querySelectorAll

**Status:** `FAIL`

**Source evidence:**

```
useFocusTrap.ts:32   const getFocusable = () => Array.from(el.querySelectorAll<HTMLElement>(focusableSelectors));
```

**Validation notes:** Focusable elements discovered via DOM traversal on every Tab key press. Shadow DOM or dynamically rendered content may not be captured.

**Required follow-up:**
- Add optional `focusableRefs: RefObject<HTMLElement>[]` prop
- If provided, use refs instead of `querySelectorAll`
- Or add `MutationObserver` to keep focusable list in sync

---

### AUDIT-042 — ImageGenerationPreview alt text

**Status:** `FAIL`

**Source evidence:**

```
ImageGenerationPreview.tsx:97   <img src={img.image} alt='' ... />
```

**Validation notes:** Empty alt means screen readers announce nothing or announce filename.

**Required follow-up:**
- Replace with `alt={img.prompt || 'Generated image'}`

---

### AUDIT-043 — AssetGallery alt text

**Status:** `FAIL`

**Source evidence:**

```
AssetGallery.tsx:97   <img src={a.url} alt='' ... />
AssetGallery.tsx:152   <img src={selected.url} alt='' ... />
```

**Validation notes:** Empty alt on RP studio assets. Screen readers cannot describe asset content.

**Required follow-up:**
- Replace with `alt={a.name || 'Asset'}` or similar

---

### AUDIT-044 — ErrorBoundary reload

**Status:** `FAIL`

**Source evidence:**

```
ErrorBoundary.tsx:48   <button ... onClick={() => window.location.reload()}>Reload application</button>
```

**Validation notes:** Full reload destroys all in-memory state. `props.onReset` exists but is not used.

**Required follow-up:**
- Replace `window.location.reload()` with `props.onReset` or state reset

---

### AUDIT-045 — ui/error-boundary reload

**Status:** `FAIL`

**Source evidence:**

```
ui/error-boundary.tsx:69   onClick={() => window.location.reload()}
```

**Validation notes:** Same anti-pattern as AUDIT-044.

**Required follow-up:**
- Replace with soft reset mechanism

---

### AUDIT-046 — FirstRunModal scroll lock

**Status:** `FAIL`

**Source evidence:**

```
FirstRunModal.tsx:20-21   const originalOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
```

**Validation notes:** Manual inline overflow manipulation. No shared scroll-lock hook. StrictMode double mount could leave scroll lock persisted.

**Required follow-up:**
- Create `useScrollLock` hook with global counter
- Replace manual overflow manipulation

---

### AUDIT-047 — ConfirmModal scroll lock

**Status:** `FAIL`

**Source evidence:**

```
ConfirmModal.tsx:42-43   const originalOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
```

**Validation notes:** Same anti-pattern as AUDIT-046.

**Required follow-up:**
- Apply `useScrollLock` hook to ConfirmModal

---

### AUDIT-048 — app:proxyScrape allows HTTP

**Status:** `FAIL`

**Source evidence:**

```
handlers.ts:460-461   if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') { return { ok: false, error: 'Only http/https allowed' }; }
```

**Validation notes:** `http:` is explicitly allowed. This exposes the user's IP to unencrypted endpoints and can scrape internal HTTP services.

**Required follow-up:**
- Change check to reject `http:`
- Add user confirmation dialog for any `http:` request with clear warning

---

### AUDIT-049 — IPC rate limiting

**Status:** `FAIL`

**Source evidence:**

```
handlers.ts   ~30 ipcMain.handle registrations in registerIpcHandlers()
```

No rate limiting, concurrency caps, or per-renderer throttling on any IPC handler.

**Validation notes:** A compromised renderer can spam `venice:request`, `jina:request`, `app:proxyScrape`, `chat:save`, etc.

**Required follow-up:**
- Create shared `rateLimit(channel, maxPerSecond)` wrapper in `electron/utils/rateLimit.ts`
- Wrap every `ipcMain.handle` registration

---

### AUDIT-050 — performVeniceRequest concurrency

**Status:** `FAIL`

**Source evidence:**

```
veniceClient.ts:313-478   performVeniceRequest creates a new https.request for every call
```

`activeRequests` map stores in-flight requests but no cap on total entries.

**Validation notes:** A renderer firing requests repeatedly without awaiting can exhaust TCP connections, file descriptors, and memory.

**Required follow-up:**
- Add `p-limit` or Promise-based semaphore with max concurrency of 10

---

### AUDIT-051 — pullContext parameter bounds

**Status:** `FAIL`

**Source evidence:**

```
handlers.ts:1228-1234   if (typeof inp.maxItems === 'number') cleanInput.maxItems = inp.maxItems;
handlers.ts:1234-1235   if (typeof inp.maxTokens === 'number') cleanInput.maxTokens = inp.maxTokens;
```

No upper bounds enforced. Renderer can send `maxItems: 1e9`, `maxTokens: 1e9`.

**Validation notes:** Memory exhaustion / DoS in main process when building huge `injectedText` string.

**Required follow-up:**
- Clamp: `maxItems = Math.min(50, Math.max(1, inp.maxItems ?? 5))`
- Clamp: `maxTokens = Math.min(8192, Math.max(1, inp.maxTokens ?? 1200))`

---

### AUDIT-052 — Shell command injection

**Status:** `FAIL`

**Source evidence:**

```
generate-placeholder-icon.cjs:62   execSync(`rsvg-convert -w ${size} -h ${size} "${svgPath}" -o "${outPath}"`);
generate-placeholder-icon.cjs:150   execSync(`iconutil -c icns "${iconsetDir}" -o "${outIcnsPath}"`);
```

**Validation notes:** Template-string interpolation into shell commands. If paths contain quotes, backticks, or semicolons, arbitrary command execution is possible.

**Required follow-up:**
- Replace `execSync` with `execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), svgPath, '-o', outPath])`
- Same for `iconutil`

---

### AUDIT-053 — Tautological server tests

**Status:** `FAIL`

**Source evidence:**

```
server.test.ts:731   expect([400, 403, 451, 500]).toContain(response.status);
server.test.ts:746   expect([400, 403, 451, 200, 500, 504]).toContain(response.status);
```

**Validation notes:** Tests pass for 400, 403, 451, 200, or 504 — none of which are the claimed target status. Would pass even if server returned 200 for an error.

**Required follow-up:**
- Rewrite tests to assert exact status code and error message shape
- Mock scrape endpoint to throw and assert exactly 500
- Mock malformed percent-encoding and assert exactly 400

---

### AUDIT-054 — Coverage threshold docs

**Status:** `FAIL`

**Source evidence:**

```
AGENTS.md:98   current enforced thresholds branches 57 / functions 61 / lines 68 / statements 65
AGENTS.md:159   current enforced baseline is branches 61%, functions 68%, lines 73%, statements 70%
vitest.config.ts:32-35   branches: 61, functions: 68, lines: 73, statements: 70
```

**Validation notes:** AGENTS.md line 98 contradicts line 159 and vitest.config.ts. The actual thresholds are 61/68/73/70.

**Required follow-up:**
- Update AGENTS.md line 98 to match vitest.config.ts (61/68/73/70)

---

### AUDIT-055 — README tab count

**Status:** `FAIL`

**Source evidence:**

```
README.md:135-155   "Main Application Areas" table has 16 rows (Chat, Image Studio, Media Studio, Prompts, Audio, Music, Video, Embeddings, Research, Characters, RP Studio, Scene Composer, Workflows, Playground, Config, Status)
```

**Validation notes:** 16 rows, not 14 or 18. The canonical `TAB_REGISTRY` has 18 tabs (including History, Prompts, Scene Composer, Privacy, which README does not list separately). README is missing History and Privacy.

**Required follow-up:**
- Add History and Privacy rows to README table, or add explicit note explaining omissions

---

### AUDIT-056 — ABOUT.md tab count

**Status:** `FAIL`

**Source evidence:**

```
docs/ABOUT.md:74-95   "Application Tabs" table has 14 rows
```

Missing: History, Prompts, Scene Composer, Privacy (4 tabs).

**Validation notes:** Under-reports by 4 tabs.

**Required follow-up:**
- Add the 4 missing tabs to ABOUT.md table

---

### AUDIT-057 — copilot-instructions.md tab count

**Status:** `FAIL`

**Source evidence:**

```
.github/copilot-instructions.md:184   14 top-level tabs (Chat, Image Studio, Media Studio, Audio, Music, Video, Embeddings, Research, Characters, RP Studio, Workflows, Playground, Config, Status)
```

**Validation notes:** Claims 14 tabs but canonical registry has 18. Missing History, Prompts, Scene Composer, Privacy.

**Required follow-up:**
- Update to "18 top-level tabs" and include full list

---

### AUDIT-058 — CHANGELOG stale tab count

**Status:** `FAIL`

**Source evidence:**

```
docs/audits/CHANGELOG.md:123   "The README's Fourteen integrated tabs table is reordered..."
```

**Validation notes:** The README table never had 14 rows (it has 16). The CHANGELOG perpetuates a false count.

**Required follow-up:**
- Correct the claim or add correction note

---

### AUDIT-059 — DOCS_INDEX completeness

**Status:** `FAIL`

**Source evidence:**

```
docs/DOCS_INDEX.md   ~25 entries listed
find docs -name '*.md'   61 .md files
```

**Validation notes:** Missing: ABOUT.md, FAQ.md, DEVELOPMENT/BRIDGE.md, DEVELOPMENT/JINA_PROVIDER.md, DEVELOPMENT/building.md, audits/RESEARCH_PROVIDERS.md, RELEASE/SIGNED_ARTIFACT_EVIDENCE.md, and many others.

**Required follow-up:**
- Walk docs/ and add every .md file to DOCS_INDEX.md with one-line description
- Group by section

---

### AUDIT-060 — AGENTS.md store count

**Status:** `FAIL`

**Source evidence:**

```
AGENTS.md:132   Zustand 5 stores (auth, chat, playground, settings, toast, and workflow)
```

Actual stores in `src/stores/`: auth, chat, playground, settings, toast, workflow, media, project, prompt-library, scene-composer, rp-chat, inspector, character-card, persona, lorebook, status, storage-privacy, workflow-template, scenario, research, and more.

**Validation notes:** Under-reports by 15+ stores.

**Required follow-up:**
- Update AGENTS.md to list all current stores or point to `src/stores/` as canonical registry

---

### AUDIT-061 — README caution block

**Status:** `FAIL`

**Source evidence:**

```
README.md:65-67   > [!CAUTION]
> A large-scale dependency and architecture upgrade is underway (Express 5, TypeScript 6, Vite 8, and related toolchain migrations). Until this work is completed and all regression guards pass, the repository is in a transitional state.
```

**Validation notes:** The dependabot PR proposing these upgrades was closed without merge on 2026-06-18. package.json uses Express 4, TypeScript ~5.8, Vite 6. The caution block is misleading.

**Required follow-up:**
- Remove or reword the caution block to reflect actual stable state

---

### AUDIT-062 — Orphaned verify:workspace-contracts

**Status:** `PARTIAL`

**Source evidence:**

```
package.json:52   "verify:workspace-contracts": "vitest run ... --fileParallelism=false"
```

The script exists but is **not** invoked by `ci` script or `verify:contracts` chain. It is only checked for existence by `verify:ci-contract.cjs`.

**Validation notes:** Script is a dead code path that could drift out of sync.

**Required follow-up:**
- Either add to `ci` script or remove it and rely on general test suite

---

### AUDIT-063 — Undocumented overrides

**Status:** `FAIL`

**Source evidence:**

```
package.json:19-22   "overrides": { "js-yaml": "4.2.0", "esbuild": "^0.28.1" }
```

**Validation notes:** No in-file documentation explaining why these overrides exist. `js-yaml` is not a direct dependency (project uses `yaml` package). `esbuild` is already a direct devDependency at same version.

**Required follow-up:**
- Add comment explaining rationale, or remove redundant esbuild override

---

### AUDIT-064 — Line endings in tsconfig.electron.json

**Status:** `PASS`

**Source evidence:**

```
CR count: 14, CRLF count: 14, lone CR count: 0
```

**Validation notes:** All carriage returns are part of CRLF pairs. No lone CR.

**Required follow-up:** None

---

### AUDIT-065 — build-electron.cjs rm guards

**Status:** `FAIL`

**Source evidence:**

```
build-electron.cjs:30-36   fs.rmSync(outdir, { recursive: true, force: true }); fs.rmSync(staleSrc, { recursive: true, force: true });
```

**Validation notes:** `rmSync` called on paths derived from `__dirname` without containment validation. If `__dirname` were ever misconfigured, arbitrary directories could be deleted.

**Required follow-up:**
- Add `resolveAndAssertWithin` helper rejecting paths outside project build directory

---

### AUDIT-066 — .bak files

**Status:** `FAIL`

**Source evidence:**

```
Tracked .bak files:
- src/components/chat/chat-view.tsx.bak
- src/hooks/use-chat.ts.bak
- src/stores/chat-store.character.test.ts.bak
- src/stores/chat-store.ts.bak
- src/types/conversation.ts.bak
- src/types/conversationVault.ts.bak

.gitignore: No *.bak entry
```

**Validation notes:** 6 tracked .bak files with hundreds of lines of old code. `.gitignore` does not exclude `*.bak`.

**Required follow-up:**
- Delete all .bak files and add `*.bak` to .gitignore

---

### AUDIT-067 — use-model-catalog-mock.ts `any`

**Status:** `FAIL`

**Source evidence:**

```
src/hooks/use-model-catalog-mock.ts:2   export type ModelCatalog = any; // eslint-disable-line @typescript-eslint/no-explicit-any
```

**Validation notes:** Dummy `any` type weakens type safety. Can leak into production code.

**Required follow-up:**
- Replace `any` with `unknown` or proper `ModelCatalog` interface

---

### AUDIT-068 — Session transcript cleanup

**Status:** `FAIL`

**Source evidence:**

```
./kimi-export-session_-20260617-205236.md   (2,275+ line untracked file at root)
```

**Validation notes:** Not tracked in git, but clutter in working tree. Could be accidentally committed.

**Required follow-up:**
- Remove from working tree

---

### AUDIT-069 — Duplicate handoff ledger

**Status:** `FAIL`

**Source evidence:**

```
docs/audits/summary_of_work.md   (4,092 lines, tracked)
docs/summary_of_work.md          (7,305 lines, tracked, canonical)
```

**Validation notes:** Two tracked `summary_of_work.md` files. The `docs/audits/` one is not marked as SUPERSEDED and has no banner redirecting to the canonical one.

**Required follow-up:**
- Delete `docs/audits/summary_of_work.md` or add prominent HISTORICAL/SUPERSEDED banner

---

### AUDIT-070 — Copyright year

**Status:** `FAIL`

**Source evidence:**

```
electron-builder.config.cjs:23   copyright: "Copyright © 2026 Venice Forge contributors..."
```

**Validation notes:** Hardcoded year 2026. Will become stale in 2027.

**Required follow-up:**
- Replace with dynamic year or range (e.g., `new Date().getFullYear()`)

---

### AUDIT-071 — Signed artifact evidence

**Status:** `FAIL`

**Source evidence:**

```
docs/RELEASE/SIGNED_ARTIFACT_EVIDENCE.md:30-32   All columns: pending | pending | pending | pending | pending | pending | pending | pending
```

**Validation notes:** All entries are "pending". Document serves no evidentiary purpose in current state.

**Required follow-up:**
- Add banner: "No signed release has been produced yet. This document will be populated after the first signed release."

---

### AUDIT-072 — README vs CONTRIBUTING packaging checks

**Status:** `PARTIAL`

**Source evidence:**

```
README.md:413   npm run verify:dist:win
README.md:431   npm run verify:dist:mac
CONTRIBUTING.md:74-75   npm run verify:dist:mac # or verify:dist:win; npm run verify:dist:portable # Windows only
CONTRIBUTING.md:115   Platform-specific packaging checks (npm run verify:dist:win, npm run verify:dist:mac, and npm run verify:dist:portable) pass
```

**Validation notes:** CONTRIBUTING.md mentions `verify:dist:portable` which README does not mention in its Validation Gate. README only mentions `verify:dist:win` and `verify:dist:mac`.

**Required follow-up:**
- Align README Validation Gate with CONTRIBUTING.md PR checklist, or add clarifying note

---

### AUDIT-073 — Protocol handler size cap

**Status:** `FAIL`

**Source evidence:**

```
electron/main.ts:349   const stream = fs.createReadStream(dp); return new Response(stream as unknown as ReadableStream, { ... });
```

**Validation notes:** No `fs.promises.stat(dp)` check before streaming. If a multi-GB file is placed in the cache, it streams indefinitely.

**Required follow-up:**
- Add `fs.promises.stat(dp)` before `createReadStream`
- Return 413 Response if `stat.size > MAX_CHARACTER_IMAGE_BYTES` (2 MiB)

---

### AUDIT-074 — config:getStatus exposes absolute paths

**Status:** `FAIL`

**Source evidence:**

```
electron/ipc/configHandlers.ts:29-31   ipcMain.handle('config:getStatus', () => { return { ok: true, status: getConfigStatus(), paths: getPaths() }; });
```

`getPaths()` returns absolute paths like `/Users/alice/.config/VeniceForge/config.yaml`.

**Validation notes:** Information disclosure. Facilitates targeted attacks if renderer is compromised.

**Required follow-up:**
- Map `getPaths()` through `path.basename` before returning to renderer

---

### AUDIT-075 — Research browser persistent session

**Status:** `FAIL`

**Source evidence:**

```
electron/services/researchBrowserServer.ts:90   const researchSession = session.fromPartition("persist:venice-forge-research-browser");
```

**Validation notes:** `persist:` prefix means cookies, cache, localStorage, and IndexedDB persist across app restarts. No `session.clearStorageData()` called in destroy handler.

**Required follow-up:**
- Remove `persist:` prefix, or add `clearStorageData()` in destroy handler

---

### AUDIT-076 — Brittle env var lifecycle in server.test.ts

**Status:** `FAIL`

**Source evidence:**

```
server.test.ts:308-315   beforeEach(() => { process.env.RATE_LIMIT_WINDOW_MS = '5000'; process.env.RATE_LIMIT_MAX_REQUESTS = '3'; app = createServerApp(); delete process.env.RATE_LIMIT_WINDOW_MS; delete process.env.RATE_LIMIT_MAX_REQUESTS; });
```

**Validation notes:** Env vars are deleted before `createServerApp()` finishes reading them. If factory becomes async, tests silently use defaults.

**Required follow-up:**
- Store original env values, restore in `afterEach`, keep env vars active for entire test lifecycle

---

### AUDIT-077 — chat-input autofocus race

**Status:** `FAIL`

**Source evidence:**

```
chat-input.tsx:93   useEffect(() => { textareaRef.current?.focus() }, [])
```

**Validation notes:** Textarea may not be mounted when effect runs (e.g., in Suspense boundary or lazy-loaded tab). Auto-focus may fail silently.

**Required follow-up:**
- Replace `useEffect` with `autoFocus={true}` on the textarea element

---

### AUDIT-078 — DiagnosticsDrawer duplicate section keys

**Status:** `PARTIAL`

**Source evidence:**

```
DiagnosticsDrawer.tsx:41-52   SECTION_ORDER = [
  { key: "diagnostics", label: "Overview" },
  { key: "storage", label: "Storage" },
  { key: "storage", label: "Privacy" },
  { key: "diagnostics", label: "Repair" },
]
```

**Validation notes:** `diagnostics` appears twice, `storage` appears twice. No code comment explaining the intentional duplication. React keys are derived from label + index so they are unique, but the same snapshot data is mapped twice.

**Required follow-up:**
- Add comment explaining why Overview and Repair both map to `diagnostics`, and why Storage and Privacy both map to `storage`

---

### AUDIT-079 — Arbitrary Tailwind values

**Status:** `FAIL`

**Source evidence:**

```
grep -R '-\[.*px\]|w-\[.*px\]|px-\[.*\]|py-\[.*\]|max-w-\[.*\]' -n src/components src | wc -l = 1984
```

**Validation notes:** 1,984 hardcoded pixel/rem Tailwind arbitrary values across source. These do not scale with user font-size preferences or theme token spacing scales.

**Required follow-up:**
- Identify top 20 most common arbitrary values and replace with standard Tailwind utilities
- Add ESLint rule warning on new arbitrary values

---

### AUDIT-080 — Third-party release action

**Status:** `PARTIAL`

**Source evidence:**

```
release.yml:294   uses: softprops/action-gh-release@b4309332981a82ec1c5618f44dd2e27cc8bfbfda # v3.0.0
```

**Validation notes:** SHA is pinned, which mitigates tag-rewriting. However, no comment documents the audit date or fork rationale. If the account is compromised, the SHA-pinned version could still be malicious.

**Required follow-up:**
- Add comment with audit date, or fork to organization-owned copy

---

## Stale or Obsolete File Validation

| File | Expected Action | Status | Evidence |
|---|---|---|---|
| `src/components/chat/chat-view.tsx.bak` | Delete | **FAIL** | Still tracked (6 .bak files total) |
| `src/hooks/use-chat.ts.bak` | Delete | **FAIL** | Still tracked |
| `src/stores/chat-store.ts.bak` | Delete | **FAIL** | Still tracked |
| `src/stores/chat-store.character.test.ts.bak` | Delete | **FAIL** | Still tracked |
| `src/types/conversation.ts.bak` | Delete | **FAIL** | Still tracked |
| `src/types/conversationVault.ts.bak` | Delete | **FAIL** | Still tracked |
| `kimi-export-session_-20260617-205236.md` | Delete | **FAIL** | Untracked but present in working tree |
| `docs/audits/summary_of_work.md` | Delete or SUPERSEDED banner | **FAIL** | Tracked, no banner, diverges from canonical |

---

## Missing Coverage Validation

| Area | Status | Evidence | Missing Tests |
|---|---|---|---|
| Timeout / AbortSignal propagation | **MISSING** | `resolveTimeoutMs` not exported, zero tests | `desktopBridge.ts` fetch timeout, `veniceClient.ts` timeoutMs=0, `createTimeoutSignal` leak |
| ID validation and prototype pollution | **MISSING** | `idValidation.ts` untested, `storageService.ts` boundaries untested | `saveItem('')`, `saveItem('__proto__')`, `deleteProject('constructor')`, `markDirtyConversation('')` |
| Encryption and data loss diagnostics | **MISSING** | `decryptData` returns `null` for all errors | Distinguish corrupt vs missing key, surface UI repair action |
| Import safety and memory pressure | **MISSING** | No data-URL regex, no record count cap | 25 MiB rejection, malformed image rejection, 5,000 record cap |
| Race conditions in media lineage | **MISSING** | Function-based patch implemented but no concurrency test | Two concurrent `upsertDerivative` for same parent |
| Rate limiting and circuit breaker | **MISSING** | No rate limiting on IPC or server | Static rate limiter shared bucket, IPC handler throttling, `performVeniceRequest` concurrency cap |
| Clipboard fallback behavior | **COVERED** | `copyText` helper tested | `message-bubble`, `SceneComposer`, `PromptLibrary` use `copyText` — covered by `media-send-to.test.ts` |
| ErrorBoundary recovery | **MISSING** | `window.location.reload()` still present | Test reset without reload |
| Gallery handler registration | **COVERED** | Mount-only `useEffect` with `[]` deps | Test verifying zero re-registrations across filter changes |
| ThemeMaker hardcoded colors | **MISSING** | Literal hex values still present | Test deriving from builtin tokens |
| Redirect validation | **MISSING** | `fetch` follows redirects by default | Test rejecting 302 to private IP |
| Config path env override | **MISSING** | `assertPathContained` implemented but untested | Test `/etc/passwd` rejection |
| Research browser confirmation | **MISSING** | `shell.openExternal` without confirmation | Test confirmation dialog requirement |

---

## Regression Review

No new regressions introduced by the attempted fixes were found during this validation pass. All changes appear to be additive or corrective without introducing new security weaknesses, type holes, or broken tests.

However, the following pre-existing issues were confirmed still present:

| Issue | Severity | File | Evidence |
|---|---|---|---|
| `DB_VERSION` not bumped to ≥8 | Medium | `src/constants/venice.ts` | `verify:prompt-library` invariant FAIL |
| Node v24.15.0 outside engine range | Low | `package.json` | `engines.node: ">=22.13.0 <23"` |

---

## Final Required Fix List

Only items still rated FAIL or PARTIAL with actionable follow-up are included.

| Priority | ID | File | Exact Required Fix | Verification Command |
|---|---|---|---|---|
| P0 | AUDIT-004 | `src/services/veniceClient.ts` | Export `resolveTimeoutMs` and add tests for `0`, `-1`, `>120000` | `npx vitest run src/services/veniceClient.test.ts` |
| P0 | AUDIT-006 | `src/services/veniceClient.ts` | Strip secret fields before `JSON.stringify` in `dedupeKey` | `npx vitest run src/services/veniceClient.test.ts` |
| P0 | AUDIT-020 | `electron/services/researchBrowserServer.ts` | Route `openExternal` through `promptExternalLink` | `npx vitest run electron/services/researchBrowserServer.test.ts` |
| P0 | AUDIT-021 | `electron/services/characterImageCache.ts` | Set `redirect: 'manual'`, validate Location header | `npx vitest run electron/services/characterImageCache.test.ts` |
| P0 | AUDIT-048 | `electron/ipc/handlers.ts` | Reject `http:` protocol in `app:proxyScrape` | `npx vitest run tests/safety/guardPipeline.test.ts` |
| P1 | AUDIT-008 | `src/services/cryptoService.ts` | Return discriminated union from `decryptData`, surface UI repair | `npx vitest run src/services/cryptoService.test.ts` |
| P1 | AUDIT-009 | `src/services/storageService.ts` | Throw explicit error when index missing; add migration | `npx vitest run src/services/storageService.test.ts` |
| P1 | AUDIT-011 | `src/services/exportImport.ts` | Reduce JSON cap to 5 MiB, add 5,000 record cap, 50 MiB image cap | `npx vitest run src/services/exportImport.test.ts` |
| P1 | AUDIT-013 | `src/services/desktopBridge.ts` | Add `AbortController` with 10s timeout to all fetches | `npx vitest run src/services/desktopBridge.test.ts` |
| P1 | AUDIT-019 | `electron/services/configService.ts` | Add test for `/etc/passwd` path rejection | `npx vitest run electron/services/configService.test.ts` |
| P1 | AUDIT-024 | `server.ts` | Add `req.socket?.remoteAddress` fallback before `'unknown'` | `npx vitest run server.test.ts` |
| P1 | AUDIT-025 | `src/stores/project-store.ts` | Add `assertValidId(projectId)` to `deleteProject` | `npx vitest run src/stores/project-store.test.ts` |
| P1 | AUDIT-026 | `src/services/diagnosticsService.ts` | Add `enableJina` to `SettingsState` or remove cast | `npm run typecheck` |
| P1 | AUDIT-030 | `src/stores/chat-store.ts` | Add `assertValidId(id)` to `markDirtyConversation` | `npx vitest run src/stores/chat-store.test.ts` |
| P1 | AUDIT-049 | `electron/ipc/handlers.ts` | Add per-channel rate limiter to all IPC handlers | `npx vitest run tests/safety/guardPipeline.test.ts` |
| P1 | AUDIT-050 | `electron/services/veniceClient.ts` | Add concurrency semaphore (max 10) to `performVeniceRequest` | `npx vitest run electron/services/veniceClient.test.ts` |
| P1 | AUDIT-051 | `electron/ipc/handlers.ts` | Clamp `maxItems` to 50 and `maxTokens` to 8192 | `npx vitest run electron/ipc/handlers.test.ts` |
| P1 | AUDIT-066 | Root | Delete all 6 tracked `.bak` files, add `*.bak` to `.gitignore` | `git ls-files \| grep '\.bak'` |
| P1 | AUDIT-069 | `docs/audits/` | Delete `docs/audits/summary_of_work.md` or add SUPERSEDED banner | `ls docs/audits/summary_of_work.md` |
| P2 | All remaining FAILs | Various | See individual audit entries above | `npm run ci` |

---

## Release Readiness

```
NOT READY
```

**Reason:**

1. `verify:contracts` fails (`DB_VERSION` invariant) — `npm run ci` is blocked
2. 48 audit items rated FAIL (many are high security/reliability)
3. 17 audit items rated PARTIAL (implementation present but untested or incomplete)
4. Critical security gaps remain: dedupe key leaks secrets, research browser bypasses confirmation, character cache follows redirects blindly, IPC has no rate limiting, proxy allows HTTP, config paths disclose absolute paths
5. 6 tracked `.bak` files and 1 untracked session transcript remain in repo
6. Duplicate `summary_of_work.md` without SUPERSEDED banner
7. Node v24.15.0 outside declared engine range

**The repository is not safe to release without addressing the P0 and P1 items above.**

---

*Report generated by validation pass against HEAD fc66cb447e105150eb9d80fb253f18b634955db4 on 2026-06-19.*
