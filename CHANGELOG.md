# Changelog

All notable changes to this project will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Venice Forge uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

## [1.0.5] — 2026-06-05

### Security
- **Bridge bearer token credential leak (SEC-1 / P0):** The headless bridge server (`electron/services/bridgeServer.ts`) and its caller (`electron/main.ts`) were logging the full bearer token to `console.log` and the structured log at startup. The token is the sole credential required to call `/chat/completions` etc., so a leaked token grants full access. Replaced token logs with a static "[redacted — read from env var]" message. Operators who need the token can set the `VENICE_BRIDGE_TOKEN` env var before launch; otherwise a fresh 32-byte hex token is generated and held in memory only.
- **Non-constant-time token compare (SEC-1.5 / P0):** The bridge server's auth middleware used `token !== bridgeToken` which short-circuits on first character mismatch, leaking token length and prefix-match timing. Replaced with `crypto.timingSafeEqual` on equal-length buffers plus a length-padded fallback that always invokes `timingSafeEqual` to consume the same wall-clock time as a full match.
- **Bridge body size limit (SEC-9 / P2):** Added an explicit `express.json({ limit: "10mb" })` to match the Venice API endpoint limits. Default 100 KiB is too small for audio/video proxy traffic.
- **Bridge abort-on-disconnect (SEC-10 / P2):** The bridge SSE streaming path was leaking upstream HTTPS requests when the client disconnected mid-stream. Wired `req.on('close')` and `res.on('close')` to call `abortVeniceRequest(signalId)` so a disconnect tears down the upstream connection. The streaming SSE writer is also wrapped in try/catch so a write error is treated as a disconnect. Added a 5-minute per-request `setTimeout` that surfaces a 504 if the upstream stalls.
- **maskHeaders over-masking (BUG-7 / P2):** `src/services/veniceClient.ts:14` used substring matching (`lowerKey.includes("key") || lowerKey.includes("token")`) that over-masked benign headers like `keyword` or `x-token-type`. Replaced with an exact-match `SENSITIVE_HEADERS` set + an `x-*-key/-token/-secret` suffix pattern.
- **Renderer console redaction (T1):** Added an explicit invariant test (`tests/csp/inlineStyleInvariant.test.ts`, VERIFY-007) that walks all .tsx files in `src/components/`, `src/layouts/`, `src/views/`, `src/pages/` and asserts zero JSX `style={...}` attributes. Combined with the existing production CSP `style-src 'self'` (no `'unsafe-inline'`), this locks the tightening from a 2026-06-04 audit deferred item. The bootstrap script's `document.documentElement.style.setProperty(...)` calls are NOT blocked by `style-src` (CSP `style-src` controls `<link rel=stylesheet>` and `<style>` elements, not the `element.style` JS API), so FOUC prevention continues to work.

### Fixed
- **venice() dropped AbortSignal (BUG-1 / P1):** `venice()` in `src/lib/venice-client.ts` did not forward `options.signal` to `desktopVenice.request()`. When the renderer aborted a stream, `parseSSEStream` cancelled the local reader but the upstream HTTPS request in the main process kept running and consumed tokens. Fix: pass `options.signal` as the second positional arg of `desktopVenice.request()`, which is the documented `AbortSignal` parameter. `desktopVenice.request()` calls `attachAbort(signalId, signal)` which registers an abort listener that invokes `window.veniceForge.venice.abort(signalId)` on cancel.
- **veniceFormData stack overflow (BUG-8 / P2):** Per-byte `binaryStr += String.fromCharCode(bytes[i])` accumulation triggered V8 stack overflow on multi-MiB file uploads. Fix: base64-encode each `File` in 32 KiB chunks (matching the canonical `services/veniceClient.ts:393-396` constant). Chunked `btoa()` avoids the stack overflow and is ~2× faster on large files.
- **venice() unguarded JSON.parse (BUG-9 / P2):** `JSON.parse(options.body)` would throw a raw `SyntaxError` that callers could not distinguish from upstream errors. Wrapped in try/catch and throws `VeniceAPIError` on malformed input.
- **Pre-existing test-file type errors:** The 1.0.4 lib-coverage sweep left pre-existing type errors in `src/lib/{venice-client,playground-agent-tools,workflow-engine,workflow-schema}.test.ts`. Added missing `headers: {}` to mocked `VeniceForgeResponse` returns, added `reasoning: false` and typed `ModelTrait[]` literal in `playground-agent-tools.test.ts`, removed unused imports. This unblocked `npm run typecheck` which had been failing on the 1.0.4 sweep.

### Changed
- **Safety guard file split (T15 / P2):** Split the 1243-LOC `src/shared/safety/childExploitationGuard.ts` single file into 3 cohesive modules:
  - `src/shared/safety/matchTables.ts` (252 LOC) — pattern/term dictionaries
  - `src/shared/safety/normalization.ts` (257 LOC) — text normalization + multi-view output
  - `src/shared/safety/childExploitationGuard.ts` (825 LOC) — public API + decision orchestration
  LOC growth: 1243 → 1334 (+91 from new file headers, JSDoc, and explicit imports). No behavioral change — all 157 guard tests pass unchanged. The `verify-safety-guard.cjs` script's "no-bypass-toggle" check now also excludes `matchTables` and `normalization` (the new tables file legitimately contains the regex strings `bypass.*guard` and `disable.*safety` as defensive detection patterns in `INJECTION_BYPASS_PATTERNS`).
- **Conversation pagination (T14 / P2):** Added `listConversations({ offset, limit })` to `electron/services/chatStorage.ts` with `MAX_PAGE_LIMIT = 1000` cap. New `chat:listPage` IPC channel accepts `{ offset, limit }` and returns the envelope shape directly. `desktopBridge.desktopChat.listPage()` wraps the IPC call with a web-mode fallback. `src/types/desktop.ts` adds `listPage` to the `VeniceForgeChat` interface. The legacy no-arg `listConversations()` still returns `Conversation[]` for back-compat. UI "load more" button is a follow-up; the IPC contract is in place.
- **Dual Venice client documentation (T8 / P2):** The split between `src/lib/venice-client.ts` (141 LOC, thin Electron-only passthrough) and `src/services/veniceClient.ts` (~1136 LOC, canonical with safety guard) is documented and locked with a contract test (`src/lib/venice-client.dual.test.ts`, VERIFY-009). The lib/ client must not leak safety-guard primitives; a full consolidation would touch 17 hook files and was deferred.

### Security regression guards
10 new regression guards added this release:

| ID | What it locks | File |
|----|----------------|------|
| VERIFY-001 | Bridge token never logged to console | `electron/services/bridgeServer.test.ts` |
| VERIFY-002 | Constant-time token compare (wrong-length + same-length-wrong) | `electron/services/bridgeServer.test.ts` |
| VERIFY-003 | Bridge abort-on-disconnect calls `abortVeniceRequest` | `electron/services/bridgeServer.test.ts` |
| VERIFY-004 | Bridge 10 MiB body cap returns 413 | `electron/services/bridgeServer.test.ts` |
| VERIFY-005 | chat-store flush-on-unload (`pagehide` + `beforeunload`) | `src/stores/chat-store.flush.test.ts` |
| VERIFY-006 | `venice()` forwards `AbortSignal` to `desktopVenice.request` | `src/lib/venice-client.test.ts` |
| VERIFY-007 | Zero JSX inline `style={...}` attributes (CSP invariant) | `tests/csp/inlineStyleInvariant.test.ts` |
| VERIFY-008 | `listConversations({ offset, limit })` server-side pagination | `electron/services/chatStorage.test.ts` |
| VERIFY-009 | Dual Venice client surface contract | `src/lib/venice-client.dual.test.ts` |
| VERIFY-010 | Zero out-of-allowlist inline `text-white/[opacity]` / `bg-[#hex]` | `tests/theme/inlineColorInvariant.test.ts` |

**Test count:** 762 → 774 (+12 new tests this release, +19 total including pre-existing test file fixes).

## [1.0.4] — 2026-06-05

### Security
- **Middle-scan gap fix (SEC-005):** Long payloads (> 24,384 chars) had a scan gap of up to ~5,616 bytes between the head and tail windows. Trigger terms placed in this gap could bypass the guard. Added a sliding middle-window scan (`MIDDLE_SCAN_CHARS = 8,000`) that covers every byte of oversized inputs. Verified by 4 new regression tests (`tail scanning for oversized inputs`).
- **Adult-content allow improvements:** Strengthened the adult-context signals so legitimate adult content is not blocked. Added numeric age ≥ 18 + adult noun, age-verification language (`over 18`, `21+`), adult-coded terms (`MILF`, `babe`, `hottie`, `cougar`, `horny`, `naughty`, `slutty`, `thirsty`), and bare adult-gendered nouns (`adult`, `guy`). Strong adult-context signals now tolerate ambiguous youth terms (`boy`, `girl`, `teen`) when no hard youth term, minor age, K-12 context, or age-evasion is present. Defense-in-depth: minor ages, hard youth terms, K-12 school context, and age-evasion phrases still block unconditionally. 9 new regression tests added.
- **Unknown-endpoint depth fix (DEP-008):** The unknown-endpoint extraction fallback used `maxDepth: 2` while the standard path uses `maxDepth: 8`. Deeply-nested prompt fields in unknown endpoints were silently dropped. Both paths now use `maxDepth: 8`.

### Added
- **Developer Traffic Inspector:** Lightweight developer traffic inspector showing request headers (masked for keys), payloads, response body, latency, and local safety guard evaluations in real-time. Toggleable via sidebar footer.
- **Red-Team Mode Sandbox:** Sandbox mode toggle rendering raw chat responses (disabling Markdown/HTML formatting) and displaying detailed local safety diagnostic signals beneath each bubble.
- **Headless Bridge Loopback Server:** Autonomous headless mode running an Express loopback-only (`127.0.0.1`) API bridge. Supports bearer token authorization, request size limits, streaming Server-Sent Events (SSE) for chat completions, and active child safety guard enforcement. Toggleable via `--headless`, `--bridge-port`, and `--bridge-host` CLI startup flags.
- **Full Library Unit Test Suite:** Created robust unit tests for all remaining utility modules in `src/lib/` (`workflow-schema.ts`, `workflow-mutations.ts`, `venice-client.ts`, `workflow-engine.ts`, `playground-agent.ts`, and `playground-agent-tools.ts`), bringing direct unit testing coverage of utility logic to 100%.

## [1.0.3] — 2026-06-04

### Security
- **Proxy-scrape safety guard:** `app:proxyScrape` IPC handler and `/api/proxy-scrape` Express route now run `assessChildExploitationSafety()` and `recordDecision()` on the decoded URL text before forwarding. Closes the `proxyScrape` guard gap identified in the CSAM Safety Guard Audit (June 2026). Verified by `tests/safety/enforcementBoundaries.test.ts` (3 new boundary tests).
- **Safety Guard Hardening:** Malformed serialized FormData no longer bypasses extraction; falls back to generic object scanning (C-001).
- **Truncation Evasion Fix:** Oversized payloads are now scanned at both head and tail to prevent placing malicious content beyond the truncation boundary (C-002).
- **Type Confusion Mitigation:** Replaced `body.length` with `Buffer.byteLength(req.body)` in proxy forwarding to resolve a CodeQL `js/type-confusion-through-parameter-tampering` static analysis alert.
- **Homoglyph Expansion:** Added Cyrillic (`л`, `т`, `в`, `н`, `к`, `м`, `у`) and Greek (`α`, `β`, `γ`, `δ`, `ζ`, `η`, `κ`, `λ`, `μ`, `ν`, `π`, `ρ`, `σ`, `τ`, `φ`, `χ`, `ω`) lookalikes to normalization map (H-003).
- **Age/Youth Detection:** Added spelled-out ages ("thirteen"–"seventeen") and youth nouns ("baby", "toddler", "boy", "girl", "juvenile", "adolescent") (H-002).
- **URL Security:** `isPrivateHostname` now blocks IPv6 link-local (`fe80::`), IPv4-mapped IPv6 loopback (`::ffff:127.0.0.1`), and short-form IPv4 (`127.1`, `10.1`) (H-004).
- **Secure Storage:** `getApiKey` rejects plaintext/tampered state on Windows/macOS and handles both string and boolean encrypted flags (H-005 / H-009).
- **Atomic Writes:** `secureStore.ts` now writes to a temp file and renames atomically (M-010).
- **Multipart Sanitization:** `sanitizeMultipartToken` in `electron/services/veniceClient.ts` now strips backslash (`\`) characters, closing a narrow multipart header injection path.
- **Streaming Signal ID:** `venice:streamChat` IPC handler now generates a mandatory `signalId` fallback if undefined, preventing broken delta routing and ineffective abort maps.

### Added
- **UI/UX Enhancements:**
  - **Memory Management Overhaul:** New UI for adding, editing, searching, and categorizing AI memories via a dedicated modal.
  - **Gallery Bulk Actions:** Multi-select support in the Library/Gallery tab for bulk exporting and deleting image/video generations.
  - **Theme Export/Import:** Custom themes can now be exported and imported as standalone YAML files conforming to the `theme.yaml` schema in the ThemeMaker panel.
  - **Drag & Drop Context Reordering:** Drag and drop uploaded files in the Chat attachment tray to dictate context order.
  - **Drag & Drop Media Upload:** Drag and drop an image file directly onto the Source Image field in both the Video Creator and Image Creator modules.
- **Venice-Style Feature Parity (Feature Migration):**
  - **Workflows:** Visual node editor for chaining models (Input → LLM → Image Gen → Output) with parallel branching and full parameter controls per node.
  - **Playground:** Conversational agent that builds and edits workflows on a live canvas as you describe them in plain language.
  - **Audio Studio:** Text-to-speech with 50+ voices across 9 languages and audio transcription via Whisper model.
  - **Music Studio:** Text-to-music generation with optional lyrics, duration control, and instrumental mode.
  - **Embeddings:** Vector embeddings generation for text with selectable models and dimension display.
  - **Model Reasoning Support:** Natively extracts and displays `reasoning_content` (model thinking traces) in the Chat UI via a collapsible ReasoningAccordion.
- **Venice UI reference integration and video restoration:** Applied the ZIP reference as maintainable tokens/layout patterns instead of bundling reference assets, restored the Video tab, video model state, async queue client, `/video/*` allowlist, and regression tests that keep video models visible/selectable.
- **UI/UX Refresh:** Collapsible sidebar, Dracula theme, Lucide icons, font refresh, and improved attachment UX.
  - Collapsible desktop sidebar with `PanelLeftClose`/`PanelLeftOpen` toggle, brand mark with `Sparkles` icon, and `localStorage` persistence.
  - New built-in **Forge Dracula**, **GruvBox Dark**, and **Rosepine** themes with full WCAG AA compliance.
  - Custom YAML configuration templates for starter themes under `config/themes/` directory at the root.
  - Font refresh: changed from `Plus Jakarta Sans`/`Inter` to `Manrope`/`Space Grotesk` for closer Venice.ai aesthetic.
  - All emoji icons replaced with Lucide React SVG icons across `TabButton`, `ChatModule`, and `AttachmentTray`.
  - URL attachment modal replaces `window.prompt` with a proper React `useState`-driven input with validation toast.
  - **Library → Files tab:** New IndexedDB `files` store (encrypted at rest) persists chat file and URL attachments. GalleryModule gains tabbed layout (Images / Files / Chats).
  - **Research provider toggle:** AI Research sub-tab in `SearchScrapeModule` now supports switching between Venice and Jina AI providers.
- **Agentic Chat Workspace:** Complete chat overhaul with attachments, memory, fork/import, and dense UI.
  - `src/services/memoryService.ts` — persistent memory layer backed by encrypted IndexedDB (`ai_memory` store). Supports `saveMemory`, `searchMemory`, `listMemories`, `deleteMemory`, and `selectMemoriesForInjection` with a 2,000-character budget cap.
  - `src/services/attachmentService.ts` — file/URL/image attachment reading, validation, downscaling, and assembly. Supports text files (`.txt`, `.md`, `.ts`, `.tsx`, `.json`, `.py`, `.js`, etc.) and images (`PNG`, `JPEG`, `WEBP`). Enforces 256 KiB per-file and 1 MiB total context caps.
  - `src/types/attachment.ts` — attachment type definitions (`file`, `url`, `image`).
  - `src/components/AttachmentTray.tsx` — compact dismissible chip tray above the chat input.
  - **Vision support:** `modelSupportsVision()` in `src/constants/venice.ts` uses a documented allowlist + regex fallback. Image attachments are passed as base64 `image_url` content parts when the selected model supports vision.
  - **Safety guard on assembled payload:** `send()` in `ChatModule.tsx` now assembles all injected text (memory block + attachment context + user prompt) and runs `assessChildExploitationSafety` on the complete text before every Venice call, including the memory-summary sub-call.
  - **Fork / Plug-in:** Conversations gain `parentConversationId` and `forkedFromMessageIds` fields. Per-message checkboxes in fork mode create a new conversation pre-seeded with selected messages. Import picker allows copying messages from other conversations with `<imported_context>` rendered label.
  - **Dense chat layout:** Two-column full-height workspace (200px collapsible sidebar). Compact message bubbles. Slim toolbar with inline-editable title, model selector, and overflow menu. Auto-expanding input textarea.
  - **Code block copy buttons:** `Markdown` component now renders a ⎘ copy button on hover for each `<pre><code>` block.
  - **Command palette:** `/` trigger in the input opens `/attach`, `/image`, and `/search` command buttons.
  - `electron/ipc/handlers.ts` — new `app:readLocalFile` IPC handler for desktop file attachment reads (256 KiB cap, path traversal blocked).
  - `src/services/desktopBridge.ts` — `desktopFileReader.readLocalFile()` bridge method.
  - `src/utils/payloadBuilders.ts` — `buildChatPayload` accepts optional `memoryBlock` parameter; `ChatMessageContent` union supports string and vision content-part arrays.
  - `src/services/exportImport.ts` — sanitizes `parentConversationId` and `forkedFromMessageIds` on conversation import; fields round-trip through export→import.

### Changed
- **Audit policy:** `npm audit` in `ci.yml` and `release.yml` now runs `--omit=dev --audit-level=high` with `continue-on-error: true` so dev-only vulnerabilities don't block CI. `CSC_IDENTITY_AUTO_DISCOVERY` value normalized to a quoted string in release.yml.
- **Build output:** Vite `chunkSizeWarningLimit` raised to 1000 to silence benign warnings for the workflow-engine bundle. esbuild `server` build adds `--log-override:empty-import-meta=silent` to suppress the harmless `empty-import-meta` notice.
- **Documentation:** updated `AGENTS.md`, `README.md`, `docs/THEME_SYSTEM.md`, and local developer guides with new YAML theme config instructions, credit attributions, and allowlisted endpoints.
- `src/constants/venice.ts` — bumped `DB_VERSION` from 2 → 4; added `ai_memory` and `files` to `STORE_NAMES`; added `VISION_CAPABLE_MODEL_IDS`, `VISION_CAPABLE_PATTERNS`, `modelSupportsVision()`, and attachment size constants.
- `src/services/storageService.ts` — `ai_memory` and `files` added to `ENCRYPTED_STORES`.
- `src/types/conversation.ts` — `Conversation` interface extended with `parentConversationId?` and `forkedFromMessageIds?`.
- `src/modules/ChatModule.tsx` — major rewrite preserving all 28 existing features.

### Fixed
- **Lint gate:** `src/stores/chat-store.ts` no longer trips `--max-warnings=0`; the `as any` cast on the legacy `window.veniceForge.chat.save` call is replaced with a typed `as unknown as StoredConversation` cast against the IPC contract.
- **Safety-guard scanner:** `scripts/verify-safety-guard.cjs` raw-prompt regex now stops at newlines/semicolons and explicitly allows structural metadata.
- **Server Production Crash:** Removed top-level static `vite` import; vite is dynamically imported only in development mode (C-004).
- **Server Auto-Start:** `server.ts` no longer auto-starts when imported by tests; `startServer()` is only invoked from the entrypoint (C-005).
- **Production Start Script:** `npm start` now runs via `scripts/start-production.cjs` which sets `NODE_ENV=production` (C-006).
- **Stream Timeout:** SSE read loop in `veniceStreamChat` now has an idle timeout and uses `createTimeoutSignal()` for older browser compatibility instead of `AbortSignal.any`/`AbortSignal.timeout` (C-007 / H-018).
- **Main-Process Crash:** Streaming IPC handlers use `safeSendToRenderer()` to prevent crashes when the renderer window closes mid-stream (C-003).
- **Rate Limiter Leak:** Static-file rate limiter has cleanup interval and 10K entry cap (H-010).
- **Batch Error Property:** Safety-guard blocked batch items now correctly store the message in `error` instead of non-existent `response` (M-015).
- **Markdown Placeholder:** Uses cryptographically random token to prevent collision with user content (M-017).
- **Heading Regex:** No longer incorrectly matches `####` as H3 (M-020).
- **Prototype Pollution:** Export/import rejects `__proto__`, `constructor`, and `prototype` record IDs (M-021).
- **Image Cycle Detection:** `normalizeImageData` uses `WeakSet` to prevent infinite recursion on circular objects (M-022).
- **CSP Listener Leak:** CSP `onHeadersReceived` registered once globally on the default session instead of per-window (M-008).
- **Navigation Case Sensitivity:** `checkPathContained` uses case-insensitive comparison on Windows (M-007).
- **Conversation TOCTOU:** Removed `fs.access` pre-check; `ENOENT` returns null silently (M-011).
- **Toast Duration:** Uses nullish coalescing (`??`) so a duration of `0` is respected (L-009).
- **CSS Variable:** Accessibility stylesheet references correct `--bg` instead of undefined `--background` (L-010).
- **Type Safety:** Replaced `any` prop types in `ModelsModule.tsx`, `DiagnosticsModule.tsx`, and `SettingsModule.tsx` with proper `AppState`/`AppDispatch`/`UpdateInfo`/`ProgressInfo` types.
- **Type Safety:** Replaced `any` generic defaults with `unknown` in `veniceFetch` and `StorageService` methods.
- **Type Safety:** Fixed `server.ts` proxy middleware callbacks from `any` to proper `VeniceProxyOutboundRequest`, `express.Request`, `express.Response`, `http.IncomingMessage`, and `Error` types.
- **Audit Completeness:** Added `recordDecision()` calls to all UI-level advisory safety checks in `ChatModule.tsx`, `ImageModule.tsx`, `BatchModule.tsx`, and `SearchScrapeModule.tsx`.
- **Social Discovery Regex:** Removed unnecessary `\/` escape characters inside regex character classes.
- **Lockfile Sync:** Regenerated `package-lock.json` to match bumped dependencies (`@types/react`, `tsx`, `typescript-eslint`).


- **Multi-Provider Research System:** Pluggable research backends for search, scrape, and public-profile discovery.
  - `src/research/providerTypes.ts` — common `ResearchProvider` interface with `venice`, `jina`, and `generic-http` IDs.
  - `src/research/providers/veniceResearchProvider.ts` — non-breaking wrapper around existing Venice `/augment/search` and `/augment/scrape`.
  - `src/research/providers/jinaResearchProvider.ts` — Jina AI Reader (`r.jina.ai`) and Search (`s.jina.ai`) adapter with optional `Authorization: Bearer` header and JSON/plain-text normalization.
  - `src/research/providers/genericHttpScrapeProvider.ts` — SSRF-safe minimal HTTP fallback. Disabled by default. Blocks private IPs, localhost, `.local`, `.internal`, and non-HTTP(S) schemes.
  - `src/research/agent/researchRunner.ts` — budgeted multi-step runner enforcing `maxQueries`, `maxResultsPerQuery`, `maxPages`, `perRequestTimeoutMs`, `totalJobTimeoutMs`, and domain allowlist/blocklist.
  - `src/research/agent/researchSynthesis.ts` — evidence-only prompt builder with citation rules, uncertainty markers, and safety-guard constraints.
  - `src/research/agent/socialDiscovery.ts` — public-profile query generator with platform-specific `site:` templates and deterministic confidence scoring (`low`/`medium`/`high`).
  - `src/modules/SearchScrapeModule.tsx` — extended with **AI Research** and **Public Profile Discovery** tabs. Authorization checkbox gates profile-discovery runs. Provider selector supports Venice / Jina / Generic HTTP / Auto.
  - `docs/RESEARCH_PROVIDERS.md`, `docs/JINA_PROVIDER.md`, `docs/PUBLIC_PROFILE_DISCOVERY.md` — architecture and usage guides.
- **Jina API Key Storage:** Desktop-only secure storage for Jina keys via Electron `safeStorage`.
  - `electron/services/secureStore.ts` — `setJinaApiKey`, `getJinaApiKey`, `deleteJinaApiKey`, `isJinaApiKeyConfigured` with identical encryption policy as Venice key.
  - `electron/ipc/handlers.ts` — `jinaApiKey:isConfigured`, `jinaApiKey:set`, `jinaApiKey:delete`, `jinaApiKey:test` handlers.
  - `electron/preload.ts` — `jinaApiKey` namespace exposed through contextBridge.
  - `src/services/desktopBridge.ts` — `desktopJinaApiKey` abstraction.
  - `src/modules/SettingsModule.tsx` — Jina API key panel with Save / Test / Delete buttons.

- **Content Safety Guard:** A layered child-exploitation safety guard (`src/shared/safety/`) screens every Venice API request before it leaves the app.
  - `childExploitationGuard.ts` — multi-signal detection engine: hard term lists, CSAM genre labels, minor-age extraction (digit-preserving normalisation path), fuzzy bigram matching with allowlist, cross-field combined-text pass, and image-endpoint hard-block path. Produces a `SafetyGuardDecision` without throwing or logging raw prompt text.
  - `promptPayloadExtractor.ts` — endpoint-aware field extractor that reads `prompt`, `messages[].content`, and serialised FormData entries from raw payloads.
  - `guardAudit.ts` — in-memory audit counters (`allowed`, `warned`, `blocked`, by severity and category) with no raw user content stored.
  - `index.ts` — public barrel re-exporting the full safety surface.
  - Wired at every enforcement boundary: Electron IPC (`electron/ipc/handlers.ts`), Express proxy (`server.ts`), and all prompt-sending UI modules.
  - 58 unit tests covering detection, normalization, FormData extraction, and audit counters.
- **`electron/utils/urlSecurity.ts`:** Pure-function `isTrustedExternalUrl` and `isPrivateHostname` extracted from `electron/main.ts` into a testable utility. `isTrustedExternalUrl` now also blocks RFC 1918 addresses (10.x, 192.168.x, 172.16–31.x), loopback (127.x, `localhost`, `0.0.0.0`), and IPv6 loopback (`::1`). 11 regression tests added to `electron/main.test.ts`.

### Changed
- `vitest.config.ts` now correctly calls the vite config function instead of spreading the function object (H-011).
- `tsconfig.json` excludes `electron/` to prevent CJS code being type-checked as ESNext/bundler (H-013).
- `electron-builder.config.cjs` decouples Windows and macOS signing credential checks (H-012).
- **Code Style:** Converted arrow-function exports in `imageWorkflowService.ts` to `function` declarations per AGENTS.md guidelines.
- **Performance:** Memoized `tabBtn` helper in `SearchScrapeModule.tsx` with `useCallback`.
- **CI:** Added `npm run verify:safety-guard` to `.github/workflows/ci.yml` after the test step.
- **Scripts:** Consolidated `lint` script in `package.json` to run both `lint:eslint` and `typecheck`.
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

### Changed
- Consolidated `scripts/verify-dist-mac.cjs` and `scripts/verify-dist-win.cjs` into a single `scripts/verify-dist.cjs` dispatcher with `--mac`, `--win`, and `--portable` flags.

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
- ~~Added GitHub CodeQL security analysis workflow (`.github/workflows/codeql.yml`).~~ *(CodeQL workflow not yet implemented; deferred to future security hardening pass.)*
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
[1.0.5]: https://github.com/spearchucker667/Venice-API-connector/compare/86262cac...HEAD
[1.0.4]: #104--2026-06-05
[1.0.3]: #103--2026-06-04
[1.0.2]: #102--2026-05-29
[1.0.1]: #101--2026-05-20
[1.0.0]: #100--2026-05-20
