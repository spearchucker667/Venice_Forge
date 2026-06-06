# Venice Forge TODO

## Restructuring & Merge Stabilization (CURRENT FOCUS)

- [x] **Type Safety Restoration:** Fix all remaining `any` types and implicit `any` errors introduced during the DONOR UI port. (Strict compiler options now pass cleanly, and all src/lib/ files are fully typed and tested).
- [x] **UI Polish & Consistency:** Re-align the new DONOR UI shell with TARGET's graphite/copper theme engine. Ensure all studios (Audio, Video, Music) feel like part of the same app. *(Theme token system shipped in `src/theme/themes.ts` with `BUILTIN_COPPER` + `BUILTIN_DAYLIGHT` + `BUILTIN_GRAPHITE`; VERIFY-010 invariant in `tests/theme/inlineColorInvariant.test.ts` locks zero out-of-allowlist inline colors across the renderer. Commit `86262ca`.)*
- [x] **Deep Feature Verification:** Regression test all new features (Workflows, Playground, Studios) to ensure they work correctly over the Electron IPC bridge (100% unit-test file coverage achieved for all src/lib/ engine files, 753 total tests passing).
- [x] **Data Migration:** Ensure legacy `chat-history/*.json` and `IndexedDB` stores are correctly picked up by the new React components. *(Encrypted `Conversation Vault` + `vaultMigration.ts` shipped in commit `62a52226`; legacy flat `chats` auto-migrate on first load (additive only, never destructive); VERIFY regression coverage in `electron/services/conversationVault.test.ts`.)*
- [x] **Asset Sanitization:** Double-check for any remaining "OpenVenice" or "donor" references in the codebase. *(Closed as out-of-scope per `docs/AUDIT_TODO.md` (2026-06-04): the "donor" terminology is preserved in `docs/REPORTS/BUG_HUNT_REVIEW.md` and `docs/design/VENICE_UI_EXTRACTION.md` as historical traceability of the merge. The intentional attribution in `README.md` also stays.)*
- [x] **Local-first Character RP Studio:** Integrated complete authoring and runtime roleplay studio with character cards (on-disk PNG avatars), personas, lorebooks, multi-character RP chats, scoped memory, and scene image generation. Verified by regression tests `VERIFY-011` to `VERIFY-014`.
- [x] **Local Master YAML Config System:** Added configuration system via `config.yaml` / `themes.yaml` with schema validation, key import & redaction, and a dedicated local config UI in Settings.
- [x] **Family Safe Mode guard pipeline hardening (safety batch):** Centralized every Venice-touching IPC entry point behind a single guarded wrapper (`electron/services/guardPipeline.ts`). The main-process `runtimeSafetySettings` snapshot is now the single source of truth for the toggle; the renderer-supplied flag on `VeniceIpcRequest` is ignored. All blocked responses emit the canonical 451 shape. Jina and scrape return-content screening closes the request-only gap. Settings rollback, hydration-race fix, chat `safe_mode` plumbing, RP chat `appendMessage` guard, inspector telemetry, and import/export confirm modal are all shipped. Verified by regression guard `VERIFY-015` (`tests/safety/guardPipeline.test.ts`, 27 cases).


## Active Tasks

- [x] Restore the generated-image Library in the sidebar and `App.tsx` `TAB_ORDER`, add the Family Safe Mode switch below Red-Team Mode, and make Red-Team Mode open the Inspector when enabled.
- [x] Triage new audit findings from `docs/AUDIT_TODO.md` when present (None present).
- [x] Keep README, About, Legal, Repository Tree, and release docs synchronized with implemented features.
- [x] Keep security tests current for renderer, IPC, proxy, storage, and safety-guard boundaries.
- [x] Keep UI documentation synchronized with the canonical Chat/Image/Media Studio/Audio/Music/Video/Embeddings/Research/Characters/RP Studio/Workflows/Playground/Settings/Status layout.
- [x] Complete the post-audit P2 hardening pass: modal focus management, deferred/indexed sidebar history search, and paginated encrypted Media Studio reads (`VERIFY-026`..`VERIFY-028`).
- [x] Add a scoped Markdown-link CI guard for local files and heading fragments (`VERIFY-029`).
- [x] Add and run an isolated 1,000-record Electron Media Studio render/heap profile (`npm run profile:media-studio`).

## Extensive Roadmap & Future TODOs

### 1. Venice API Integrations
- [x] **Character Discovery + Character Chat:** New "Characters" sidebar tab browses the official `/api/v1/characters` and `/api/v1/characters/{slug}` endpoints (no scraping, no DOM walking). Search, sort, filter, paginated load-more, and per-character "Chat" action. Character chats send `venice_parameters.character_slug` on every streaming call. Character identity is conversation-scoped: changing the global selected character in the Characters tab does not retroactively swap a persisted character conversation's slug.
- [ ] **Live Vision Flags:** Wait for and implement the live capability flag from the Venice API for model vision capabilities (currently relies on regex heuristics and allowlist).
- [ ] **WebSockets/Streaming Enhancements:** Ensure the desktop bridge uses native streaming or WebSockets for chat and video queues if Venice adds explicit support.
- [ ] **Account Syncing:** Explore potential integration with Venice Cloud syncing (if they launch OAuth-based data sync APIs) while preserving the current offline-first architecture.

### 2. Frontend / UI Improvements
- [x] **Memory Management Overhaul:** Enhance the UI for adding, editing, and categorizing AI memories. Add a "Search AI Memory" modal.
- [x] **Gallery Bulk Actions:** The Library has been rebuilt as Media Studio — multi-select bulk favorite/unstar/delete, filterable by Image/Video/Favorites/Upscaled/Edited, lineage (parent + children) tracking, per-model capability hints, and a tagged/notes inspector. See [`MEDIA_STUDIO.md`](MEDIA_STUDIO.md).
- [x] **Theme Customization Panel:** Allow exporting and importing custom themes as standalone JSON files.
- [x] **Drag & Drop Reordering:** Allow users to drag and drop uploaded files in the Chat attachment tray to dictate context order.

### 3. Architecture & Security
- [x] **CSP Hardening:** Per-request script nonces added to both Electron (`electron/main.ts` — `generateNonce()` + `rendererCsp(nonce?)` + `onHeadersReceived`) and web server (`server.ts` — nonce generated per request, stored in `res.locals.cspNonce`, injected into `<script>` tags in served `index.html`). Production `script-src` now uses `'nonce-<value>' 'strict-dynamic'`. Dev mode preserves `'unsafe-inline' 'unsafe-eval'` for Vite HMR.
- [x] **Database Migration System:** `src/services/dbMigrations.ts` provides a versioned `MIGRATIONS[]` array with one `MigrationStep` per historical `DB_VERSION`, an `applyMigrations(db, tx, oldVersion, newVersion)` function, and `getMigrationHistory()`. `storageService.ts` now calls `applyMigrations()` from `onupgradeneeded`. 14 unit tests in `src/services/dbMigrations.test.ts`.
- [ ] **Native Dependencies Audit:** Re-audit all native Node dependencies in the Electron build for vulnerability surface reduction.


### 4. Advanced Research Features
- [x] **PDF Parsing & OCR:** `src/services/pdfParserService.ts` provides local-first PDF text extraction via `pdfjs-dist` (dynamic import, zero bundle cost until first PDF). `attachmentService.ts` routes `.pdf` files through `readPdfAttachment()`. Scanned PDFs surface a guidance message pointing to the Research tab's Venice cloud OCR. Size cap: 25 MiB. Unit tests in `src/services/pdfParserService.test.ts`.
- [ ] **Recursive Search:** Allow the Research agent to conduct multi-depth autonomous recursive searches for complex queries.
- [ ] **Custom Scrape Providers:** Allow users to input custom proxy endpoint configurations for the generic HTTP scrape provider.


## Resolved Defects

### Critical Severity

1. [FIXED] Jina API Key is Configured but Never Transmitted
   - **Location:** `src/modules/SearchScrapeModule.tsx`, `src/services/desktopBridge.ts`, and `electron/preload.ts`
   - **Description:** Missing IPC exposure in `preload.ts` meant the configured Jina API Key couldn't be loaded on startup in the React renderer.
   - **Remediation:** Added `jinaApiKey:get` IPC handler to `preload.ts` and `desktopBridge.ts`.

2. [FIXED] Generic HTTP Scrape Provider Vulnerable to SSRF via DNS Resolution
   - **Location:** `src/research/providers/genericHttpScrapeProvider.ts`, `server.ts`, and `electron/ipc/handlers.ts`
   - **Description:** The string-only check for private IPs allowed an attacker to bypass SSRF protection by using a custom domain that resolves to a private IP (DNS rebinding).
   - **Remediation:** Migrated the scrape functionality to dedicated backend proxies (`app:proxyScrape` for Electron, `/api/proxy-scrape` for Express) that enforce `dns.lookup` before executing the request.

3. [FIXED] Child Exploitation Safety Bypass via Base64 `_isSerializedFormData`
   - **Location:** `src/shared/safety/promptPayloadExtractor.ts`
   - **Description:** During IPC transmission, `veniceClient.ts` serialized `FormData` `File` blobs into Base64 strings. The safety guard attempted to run text-based regex on these raw Base64 strings, failing to identify CSAM content embedded in uploaded text files.
   - **Remediation:** Updated `extractFromSerializedFormData` to decode the Base64 string to UTF-8 before applying the safety analysis.

## High Severity (Bypasses, Major Functional Issues)

4. [FIXED] Rate Limiter LRU Eviction Logic Allows Attacker Bypass
   - **Location:** `server.ts`
   - **Description:** Logic errors in the `reqCounts` mapping allowed attackers to continuously flood the proxy and evade the rate limit by manipulating the `lastSeen` timestamp and triggering LRU eviction.
   - **Remediation:** Standardized the `lastSeen` tracking and corrected the LRU eviction algorithms for both the main and static rate limiters.

5. [FIXED] `isTrustedExternalUrl` IPv4 Short-Form Normalization is Mathematically Incorrect
   - **Location:** `electron/utils/urlSecurity.ts`
   - **Description:** The custom `normalizeShortIpv4` handled integer IP representations incorrectly, causing IP addresses like `127.12345` to evade the security check while actually resolving to `127.0.48.57` (a private IP).
   - **Remediation:** Replaced the incorrect short-form IPv4 padding logic with a compliant POSIX `inet_aton` algorithm to accurately identify private IPs.

6. [FIXED] Proxy Circuit Breaker Failure Count Reset Logic
   - **Location:** `server.ts`
   - **Description:** Circuit breaker incorrectly reset its failure count instantly without waiting for a successful probe request in the `HALF-OPEN` state.
   - **Remediation:** Implemented `circuitHalfOpen` state that only resets failure counts after a successful probe request.

## Medium Severity (UI/UX, Mild Edge Cases)

7. [FIXED] `desktopJinaApiKey.set` Throws Unhandled Error in Web Mode
   - **Location:** `src/services/desktopBridge.ts`
   - **Description:** Setting the Jina API key crashed the application when running in the Web Server environment.
   - **Remediation:** Added `localStorage` fallback functionality in `desktopBridge.ts` for developers running the app outside Electron.

8. [FIXED] `veniceClient.ts` Model Extraction Misses Deeply Nested Values
   - **Location:** `src/services/veniceClient.ts`
   - **Description:** Nested `{ model: "..." }` properties evaded extraction telemetry.
   - **Remediation:** Added `findModelRecursively` to safely parse deeply nested response models.
## Family Safe Mode / Adult Mode

- [x] Add independent persisted `localFamilySafeModeEnabled` and `veniceApiSafeMode` settings, central conditional guard routing, Adult Mode skip regression tests, UI controls, YAML config support, and documentation.
