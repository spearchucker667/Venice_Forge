# Changelog

All notable changes to this project will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Venice Forge uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **Content Safety Guard:** A layered child-exploitation safety guard (`src/shared/safety/`) screens every Venice API request before it leaves the app.
  - `childExploitationGuard.ts` — multi-signal detection engine: hard term lists, CSAM genre labels, minor-age extraction (digit-preserving normalisation path), fuzzy bigram matching with allowlist, cross-field combined-text pass, and image-endpoint hard-block path. Produces a `SafetyGuardDecision` without throwing or logging raw prompt text.
  - `promptPayloadExtractor.ts` — endpoint-aware field extractor that reads `prompt`, `messages[].content`, and serialised FormData entries from raw payloads.
  - `guardAudit.ts` — in-memory audit counters (`allowed`, `warned`, `blocked`, by severity and category) with no raw user content stored.
  - `index.ts` — public barrel re-exporting the full safety surface.
  - Wired at every enforcement boundary: Electron IPC (`electron/ipc/handlers.ts`), Express proxy (`server.ts`), and all prompt-sending UI modules.
  - 58 unit tests covering detection, normalization, FormData extraction, and audit counters.
- **`electron/utils/urlSecurity.ts`:** Pure-function `isTrustedExternalUrl` and `isPrivateHostname` extracted from `electron/main.ts` into a testable utility. `isTrustedExternalUrl` now also blocks RFC 1918 addresses (10.x, 192.168.x, 172.16–31.x), loopback (127.x, `localhost`, `0.0.0.0`), and IPv6 loopback (`::1`). 11 regression tests added to `electron/main.test.ts`.

### Changed
- `electron/main.ts`: `isTrustedExternalUrl` delegated to `electron/utils/urlSecurity.ts`; private-network URLs are now blocked from `shell.openExternal` even over HTTPS.
- `simpleHash` in `childExploitationGuard.ts`: truncation window widened from 256 → 1024 chars; JSDoc now marks it as "coarse, non-cryptographic — audit use only".

### Fixed
- **BUG-001:** `extractFromSerializedFormData` in `promptPayloadExtractor.ts` used `Array.isArray(entry)` — always false for the plain-object entries produced by `serializeFormData`. Safety scanner was silently blind to all FormData fields. Fixed to use `isRecord(entry)` and read `entry["name"]`/`entry["value"]`. Regression test added (`promptPayloadExtractor.test.ts`).
- **BUG-002:** `app:loadJsonFile` IPC error path returned `{ canceled: false, error }` with no `ok: false`. `desktopBridge.importJsonString()` treated the missing field as a cancel and returned `null`, swallowing the error. Now returns `{ ok: false, canceled: false, error }`, `importJsonString()` throws on error, and `importData()` surfaces the message via `setStatusError()`.
- **BUG-003:** `"shota"` existed in both `CSAM_GENRE_LABELS` and `FUZZY_ALLOWLIST`, creating a latent bypass risk. Removed from allowlist. Runtime invariant added that throws at module load if any CSAM label appears in the allowlist.
- **BUG-005:** `simpleHash` truncated to 256 chars — two prompts sharing the same 256-char leet-folded prefix produced identical audit hashes. Truncation widened to 1024 chars.
- **BUG-006:** `FUZZY_ALLOWLIST` contained 6 duplicate string literals (`"lori"` ×2, `"lore"` ×2, `"lock"` ×2). Duplicates removed.
- **BUG-007:** `server.ts` request logger called `console.warn(...)` directly instead of the imported structured `warn` from `src/shared/logger`. Replaced with `warn(...)`.
- **BUG-008:** `isTrustedExternalUrl` allowed all `https:` URLs including private-network addresses. Now blocks RFC 1918, loopback, and `::1` via pure hostname string parsing (no DNS resolution).
- **BUG-009:** `ENCRYPTED_STORES` in `storageService.ts` excluded `diagnostics` silently. Added a comment explaining the intentional omission (sanitised timing/status metadata only; no raw prompts or keys).

---

## [1.0.2] — 2026-05-29

### Added
- **Multi-Conversation Chat Persistence:** Full conversation model with sidebar management, atomic filesystem storage, and automatic legacy migration.
  - Conversation model: `id`, `title`, `createdAt`, `updatedAt`, `model`, `systemPrompt`, `messages[]`.
  - Electron main-process filesystem storage under `app.getPath("userData")/chat-history/` with atomic writes (temp file + rename) and corruption recovery (invalid files renamed to `.backup-{timestamp}`).
  - Narrow IPC channels (`chat:list`, `chat:get`, `chat:save`, `chat:delete`) with strict payload validation and path-traversal prevention (UUID-only conversation IDs).
  - Renderer unified storage abstraction: Electron → IPC; web → IndexedDB fallback.
  - `ChatModule` refactored with left sidebar for conversation list, new chat, rename (double-click), delete (× with confirm modal), and conversation switch.
  - `App.tsx` hydrates conversations on startup and auto-migrates legacy flat `chats` into a default "Migrated History" conversation.
  - Export/import updated to include `conversations` array; IndexedDB schema bumped to version 2 with `conversations` encrypted store.
  - 19 new tests across `electron/services/chatStorage.test.ts` and `src/services/chatStorage.test.ts`.
- **Packaged App White-Screen Fix:** Resolved CORS failure on `file://` protocol in production Electron builds.
  - `stripCrossorigin()` Vite plugin removes `crossorigin` attributes from `<script>` / `<link>` tags during Electron builds.
  - `backgroundColor: "#0d1117"` added to `BrowserWindow` to prevent white flash before renderer paint.
  - Production CSP expanded to allow `https://fonts.googleapis.com` and `https://fonts.gstatic.com`.
  - Added `did-fail-load` and `render-process-gone` logging to main process for easier diagnosis.
- **Theme System:** Complete token-based theming architecture with 17 semantic CSS variables mapped to Tailwind v4 utilities.
  - Built-in themes: Forge Graphite (dark), Forge Daylight (light), Forge Copper (dark).
  - ThemeMaker UI in Settings → Appearance with live preview, hex validation, and WCAG AA contrast warnings.
  - FOUC-prevention bootstrap cache in `localStorage` read by inline script before React mounts.
  - Canonical theme state persisted in encrypted IndexedDB (`app-settings` record).
  - New source directory `src/theme/` with types, built-in palettes, apply logic, and contrast utilities.
  - New components `ThemeMaker.tsx` and `ThemePreview.tsx`.
- Added dual-platform macOS + Windows packaging support.
- Added generated macOS `.icns` application icon.
- Added cross-platform checksum sidecar generation (`.sha256`) for distribution artifacts.
- Added cross-platform local testing and release verification scripts.
- Added macOS release workflow (`macos-release.yml`) for `arm64` and `x64` builds.
- Added ESLint configuration (`eslint.config.mjs`) with TypeScript-ESLint and React Hooks rules.
- Added Vitest coverage reporting via `@vitest/coverage-v8` and `npm run test:coverage`.
- Added GitHub CodeQL security analysis workflow (`.github/workflows/codeql.yml`).
- Added `npm run lint:eslint` script for static analysis.
- Added README release ribbon and badges for CI, Windows release, latest GitHub release, license, Node support, TypeScript strict mode, Electron, and Venice API.
- Added `docs/REPOSITORY_TREE.md` with a public repository map and segment ownership notes.
- Added `docs/LEGAL.md` with Venice.ai TOS/privacy/API links, affiliation notice, API key handling notes, and release disclaimers.
- Added root `SECURITY.md`, `SUPPORT.md`, GitHub issue templates, pull request template, and Dependabot configuration.
- Added `docs/Venice_swagger_api.yaml` and `docs/venice_llm_info.md` as the canonical API reference used for alignment work.

### Changed
- Refactored `verify-dist` to support both Windows and macOS file validations.
- `secureStore.ts` strictly enforces macOS Keychain encryption exactly like Windows DPAPI.
- Updated all supporting documentation to match the current app status and public release process.
- CI workflow now uses `npm ci --prefer-offline` for slightly faster installs and reproducibility.
- Windows release workflow now generates and uploads SHA-256 checksum sidecar files for `.exe` artifacts.
- Updated `metadata.json` to describe Venice Forge instead of the previous empty/generated metadata.
- `readDesktopErrorBody` (`src/services/veniceClient.ts`) and `readResponseError` (`electron/services/veniceClient.ts`) both now correctly parse Venice `DetailedError` (Zod format: `{ details: { _errors, fieldName: { _errors } } }`) — previously fell through to "Unknown Venice API error" for all schema-validation failures.
- Diagnostic dispatch deduplication: failed Venice requests now emit exactly one `SET_DIAGNOSTICS` entry with the resolved error message. Previously, each failure emitted two entries — an initial empty-error entry and a second entry with the error — causing duplicate rows in the Status log.
- Web-mode diagnostics parity: non-2xx responses in the web transport now parse Venice `DetailedError` consistently and avoid catch-path duplicate diagnostics once an HTTP diagnostics entry has already been emitted.

### Fixed
- **CI:** `.github/workflows/windows-release.yml` referenced non-existent `actions/checkout@v6` and `actions/setup-node@v6`. Downgraded to `@v4` to match the latest published action versions and restore the release pipeline.
- **Test:** `src/services/desktopBridge.test.ts` failed with `ReferenceError: indexedDB is not defined` because `vi.stubGlobal("window", {})` stripped the fake-indexeddb instance from jsdom. The test now stubs `window` with `{ indexedDB: global.indexedDB }` so the `isConfigured()` path can open the fake database.
- **BUG-003:** Settings auto-save had no debounce — rapid changes could race and persist out-of-order state. Added a 500 ms debounce to the save effect.
- **BUG-004:** IndexedDB init failure still marked `dbReady=true`, causing later writes to a broken database. Only sets `dbReady`/`settingsHydrated` on successful init.
- **BUG-005:** `SET_CHAT_DRAFT`, `SET_IMAGE_DRAFT`, `SET_BATCH_DRAFT` reducers crashed on `null`/`undefined` patch. Added truthy guard before `Object.assign`.
- **BUG-006:** `dedupeKey` threw unhandled `TypeError` on circular request bodies. Wrapped `JSON.stringify` in try/catch with `"[circular]"` fallback.
- **BUG-007:** Import loops over stores sequentially with `await` inside `for…of`. Store writes are now parallelised via `Promise.all`.
- **BUG-008:** Rate-limit `reqCounts` Map grew unbounded under multi-IP traffic. Added a 10,000-entry cap with FIFO eviction.
- **BUG-010:** Raw `console.error`/`console.warn` calls left in production renderer and server paths (17 occurrences). Replaced with conditional shared logger (`src/shared/logger.ts`).
- **BUG-011:** `AbortSignal.any`/`AbortSignal.timeout` may throw in older runtimes. Added `createTimeoutSignal()` helper with manual fallback.
- **BUG-013:** `veniceFetch` deduplication map could leak promises on abrupt navigation. Added `beforeunload` listener that clears `inFlight`.
- **BUG-018:** `veniceFetchDesktop` asserted `method as "GET" | "POST"` instead of narrowing. Method parameter now typed as `"GET" | "POST"`.
- **BUG-019:** `veniceFetch<T = any>` disabled TypeScript inference. Generic default changed from `any` to `unknown`.
- **BUG-022:** Log rotation overwrote the single backup file. Implemented 3-file rotation ring (`.1`, `.2`, `.3`).
- **BUG-023:** `catch (err: any)` used in 8+ production files — loose error typing masked safety. Replaced with `catch (err)` and runtime guards (`err instanceof Error`).
- **BUG-028:** `sleep` ignored already-aborted signals, allowing stale timeouts to proceed. Now rejects immediately if `signal.aborted` before setting timeout.
- **BUG-029:** `modelService` swallowed `localStorage` write failures silently. Empty catch now warns via shared logger.
- **BUG-030:** `byteLength` used `new Blob([value]).size` — slow for large strings. Replaced with `new TextEncoder().encode(value).length`.
- **BUG-036:** `SettingsModuleProps` used `state: any, dispatch: any`. Now typed with `AppState` and `AppDispatch`.
- **BUG-037:** `desktopUpdates` callbacks typed as `(info: unknown)` / `(progress: unknown)`. Now use `UpdateInfo` and `ProgressInfo` from `electron-updater`.
- **BUG-040:** `normalizeWebSearchSetting` did not warn on invalid input. Now logs a warning when coercion happens.
- **BUG-042:** `isAllowedAppNavigation` used `path.normalize` without symlink resolution. Added `fs.realpathSync` with try/catch for both target and root paths.
- **BUG-043:** `verify-dist-mac.cjs` artifact name pattern did not match `electron-builder` default zip naming. Added `zip.artifactName` to `electron-builder.config.cjs` to align naming.
- **BUG-044:** `BatchDraft` interface had wrong fields (`prompts`, `model`, `systemPrompt` instead of `promptsText`). Fixed type to match actual runtime state; removed inline cast in `BatchModule`.
- **BUG-045:** `cryptoService.keyPromise` rejection was never cleared, causing permanent cache miss on any key-init failure. Added `.catch` handler to reset latch and allow retry.
- **BUG-046:** IPC `endpoint.search` query string was forwarded without length cap, allowing pathological renderer inputs. Added 512-byte limit before building the return value.
- **BUG-047:** Web-mode export `URL.revokeObjectURL` was called synchronously after `a.click()`, causing race where download failed before browser processed the blob. Deferred revocation by 1 second.
- **BUG-048:** Circuit breaker `circuitFailures` counter never reset when `circuitOpenUntil` timeout expired. Half-open reset now clears both `circuitFailures` and `circuitOpenUntil` on recovery window re-entry.
- **BUG-049:** `setInterval` for rate-limit map cleanup leaked on each `createServerApp()` call in tests. Stored interval ID and exposed `cleanupIntervals()` method on returned `app` object.
- **BUG-050:** `AppSettings.apiKey` field declared in type but never written by `SET_SETTINGS` reducer, leading to misleading type surface. Removed unused field.
- **BUG-021:** `StorageService` and `cryptoService` exposed `any` in public APIs (4 occurrences). Added `EncryptedPayload` and `KeyRecord` types; replaced `any` with proper generics in `getOrCreateKey`, `encryptData<T>`, `decryptData<T>`, and sort comparator.
- **BUG-020:** `appReducer` and model helpers used `any` parameters and return types, causing 16+ ESLint warnings and masking type safety across the state layer. Replaced all `any` with narrow types: `classifyModel(model: ModelInfo)`, `flattenModels(payload: unknown)`, `withFallbackModels(groups: Record<string, ModelInfo[]>)`, and explicit `AppState` interface. Broke the circular type dependency between `appReducer.ts` and `types/app.ts` by extracting `AppState` into a standalone interface. Added `ChatHistoryItem` type for stored chat records.
- **BUG-042 follow-up:** Added `electron/main.test.ts` with 7 unit tests for symlink traversal blocking, path traversal, and containment checks. Extracted `checkPathContained()` into `electron/utils/navigation.ts` for testability without loading Electron APIs.
- **SEC-R001:** Added `'unsafe-inline'` to production `script-src` CSP to accommodate the inline theme bootstrap script in `index.html`.
- **SEC-R002:** Added auditable `logInfo` entry when `VENICE_FORGE_DEBUG_DEVTOOLS=true` is detected in production.
- **THEME-R004:** Added `isValidTheme()` validation in `exportImport.ts` to sanitize malformed custom themes to `null` on import. Fixed `redactSecrets` eagerly replacing `tokens` key inside theme objects. Added export/import round-trip tests for custom themes.
- **THEME-R006:** Added `prefers-contrast: more` and `prefers-contrast: less` media query overrides in `src/styles/accessibility.css`.
- **REFACTOR-001:** Extracted `useThemeLifecycle`, `useNetworkStatus`, and `useSettingsPersistence` hooks from `App.tsx` into `src/hooks/`. Reduced `App.tsx` from ~351 to ~290 lines.
- **REFACTOR-002:** Unified all module and component props to use `ModuleProps` from `src/types/app.ts`. Eight files updated to use `ModuleProps` directly or extend it.
- **REFACTOR-003:** Split `src/index.css` into `src/styles/theme.css`, `src/styles/components.css`, and `src/styles/accessibility.css`.
- **TEST-001:** Added `src/theme/applyTheme.test.ts` with 10 tests for CSS variable assignment, theme mode attribute, and fallback resolution.
- **TEST-002:** Added `src/theme/contrast.test.ts` with 10 tests for WCAG contrast ratios and `isAAPass`.
- **DOC-012:** `.env.example` labeled `VENICE_TIMEOUT_MS` as "legacy fallback" but code still actively reads it. Updated comment to "Deprecated alias for VENICE_API_TIMEOUT_MS — still accepted as fallback".
- **BUG-004 (payload):** `enable_web_search` was serialised as a boolean (`true`/`false`) instead of the required string enum (`"auto"` / `"on"` / `"off"`), causing HTTP 400 on every `/chat/completions` request. `buildChatPayload` now passes the string value directly (defaulting to `"off"`).
- **BUG-005 (payload):** Venice `DetailedError` responses (Zod validation failures) were not parsed — the error body contains a `details` object with `_errors` arrays and no top-level `error` field. Both the renderer and Electron main-process clients now extract the first `_errors` message or a field-level error when present.
- **BUG-006 (payload):** Every failed Venice request produced two entries in the diagnostics log: one with `error: ""` from the initial HTTP dispatch, and a second with the actual message from the retry/catch path. The redundant dispatch has been removed; the initial entry now carries the fully resolved error.
- **BUG-007 (payload):** Legacy persisted settings could still carry boolean `webSearch` values (`true`/`false`), which mapped to invalid API payloads and recurring `400` schema errors. Settings ingestion now coerces legacy values to `on`/`off`/`auto`, and chat payload construction enforces the same normalization.
- **BUG-008 (payload):** Desktop `/augment/text-parser` uploads were unstable because `veniceFetchDesktop` serialized `FormData` but still sent the raw body over IPC. The request now correctly sends the serialized multipart payload, restoring reliable file-upload request construction.

### Security
- Explicitly disabled plaintext API-key fallback on macOS.
- Documented web proxy forbidden-header stripping and proxy-root rejection.
- Added Venice.ai TOS, privacy, and API documentation coverage for public releases.

---

## [1.0.1] — 2026-05-20

### Security
- **SEC-001:** Added `/augment/search`, `/augment/scrape`, `/augment/text-parser` to the IPC and web-proxy endpoint allowlist. These endpoints were previously blocked, making the Research tab non-functional in both Electron and web modes.
- **SEC-002:** Added `safeHref()` sanitization to search result anchor tags. Only `http:` and `https:` scheme URLs are allowed; `javascript:`, `data:`, and other schemes are replaced with `#` to prevent XSS.
- **SEC-003 (web proxy):** Added security response headers — `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and `Content-Security-Policy` — to all web-proxy responses.

### Fixed
- **BUG-001:** `galleryFilename` was called with a plain string instead of the item object in bulk gallery download, producing `venice-undefined-undefined.png` filenames for all downloads.
- **BUG-002:** Import backup was constructed in memory but never written to disk before import records were applied, misleading the user with a "backup prepared" message.
- **BUG-003:** Removed dead `const endedAt = nowIso()` variable captured before `fetch()` was called in `veniceClient.ts`.

### Changed
- `upscaleGalleryImage` now accepts a `model` parameter (default `"upscale-model"`); `GalleryModule` passes `state.selectedImageModel` so the currently selected model is used.
- Express `trust proxy` is configurable through `TRUST_PROXY`; removed deprecated `req.connection.remoteAddress` fallback so rate limiting uses the correct client IP behind a configured reverse proxy.
- Excluded `vite.config.ts` and test files from `tsconfig.json`; `npm run typecheck` now exits with zero errors.

### Added
- 25 new tests across `server.test.ts`, `src/utils/image.test.ts`, `src/utils/markdown.test.ts` — total 41 tests (was 16). Coverage includes: augment endpoint validation, rate limiter enforcement, security header assertions, `galleryFilename` regression guard, `normalizeImageData`, `extractImages`, markdown XSS safety, and `escapeHtml`.

---

## [1.0.0] — 2026-05-20

### Added

**Core features**
- Dual-mode application: Electron desktop (Windows) and Vite/Express web development mode.
- **Prompt tab:** Streaming chat completions with system-prompt control, model selection, stop/abort, and conversation history stored in IndexedDB.
- **Create tab:** Single and batch image generation with configurable dimensions, steps, guidance scale, negative prompt, seed, and watermark control. One-click upscaling via Venice upscale endpoint. Images saved to local gallery.
- **Batch tab:** Run one prompt across multiple inputs, or run many prompts in sequence, with live progress, abort, and per-result download.
- **Research tab:** Venice-augmented web search (Brave and Google providers), page scraping, and document text extraction via Venice augment endpoints.
- **Catalog tab:** Live Venice model browser showing model ID, type, traits, and capabilities; falls back to built-in model list on network error.
- **Library tab:** Local image gallery with individual download, upscale, delete, and bulk-download (up to 50 images at a time).
- **Config tab:** API key save/test/delete (desktop), theme selection, image/chat model defaults, JSON data import/export with schema validation and ID-merge (not overwrite).
- **Status tab:** Diagnostics panel showing transport mode, runtime/app versions, storage info, API key state, rate-limit headers, and one-click log folder access.

**Architecture and security**
- Electron main process with strict IPC validation (`validateVeniceIpcRequest`), sandboxed renderer, context isolation, and preload bridge (`window.veniceForge`).
- API key stored via Electron `safeStorage`; plaintext fallback disabled unless `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true`.
- Restrictive production CSP; navigation blocked to non-app URLs; external HTTPS links open in OS browser.
- Express web proxy with endpoint allowlist, method validation, rate limiting, circuit breaker, and `express.raw` body passthrough.
- Log redaction for authorization headers, API keys, bearer tokens, and secret-like field values.
- Versioned JSON export/import with size validation, store validation, and secret field stripping.

**Developer experience**
- TypeScript strict mode throughout renderer and Electron main.
- Vitest test suite with supertest integration tests for the Express proxy.
- CI matrix (Node 20 + 22) via GitHub Actions.
- Windows release workflow with NSIS installer and portable exe, upload to GitHub Releases.
- Placeholder icon generation and verification scripts.
- `npm run clean`, `npm run typecheck`, `npm run verify:dist` convenience scripts.
- `.env.example` with all configurable environment variables documented.

[Unreleased]: #unreleased
[1.0.1]: #101--2026-05-20
[1.0.0]: #100--2026-05-20
