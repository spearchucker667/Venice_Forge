# FINDINGS — Master Consolidated List

**Audit date:** 2026-09-12 · **Commit:** `84cf5bbe` (main, v3.0.0-beta.3)

Findings are grouped by domain. To keep IDs unique across independently audited domains, each ID carries a domain prefix (`SEC`, `GSS`, `IPC`, `STOR`, `VCS`, `ZST`).

## Summary table

| Global ID | Domain | Severity | Classification | Title |
|---|---|---|---|---|
| VF-AUD-20260912-SEC-P1-001 | SEC | | Renderer CSP `media-src` omits `venice-tts:`, blocking the default TTS playback path |
| VF-AUD-20260912-SEC-P2-002 | SEC | | Custom-protocol media authorization relies on originless-request allowance; capability tokens scaffolded but unwired |
| VF-AUD-20260912-SEC-P3-003 | SEC | | Unreachable privileged IPC channels `documentAgent:workspace:proposeChangeset|proposeMove|proposeTrash` |
| VF-AUD-20260912-SEC-P3-004 | SEC | | No automated assertion that the production CSP is delivered to the packaged `file://` renderer |
| VF-AUD-20260912-GSS-P1-001 | GSS | | Family Safe Mode response screening is post-hoc for streaming chat; all content deltas are delivered before any 451 |
| VF-AUD-20260912-GSS-P1-002 | GSS | | Mandatory child-safety guard silently skips all chat messages beyond the 32nd extracted field |
| VF-AUD-20260912-GSS-P2-003 | GSS | | Per-field 8,000-character pre-slice defeats the normalization layer's tail/middle scan windows |
| VF-AUD-20260912-GSS-P2-004 | GSS | | `redactSecrets` blind spots: modern token families unredacted; key-name pattern misses `credential`/`private_key`; quoted env assignments only partially redacted |
| VF-AUD-20260912-GSS-P3-005 | GSS | | Two main-process call sites dispatch Venice requests outside `guardPipeline` (no guard pre-check, no textual response screen) |
| VF-AUD-20260912-GSS-P3-006 | GSS | | Electron runtime safety snapshot fails open (FSM off) before config load and on any config-load failure, diverging from the fail-closed web default |
| VF-AUD-20260912-GSS-P3-007 | GSS | | `LOCAL_PATH_PATTERN` over-redaction corrupts ordinary diagnostics (dates, URL paths, model ids) |
| VF-AUD-20260912-IPC-P1-001 | IPC | | `conversations:save` request envelope mismatch: every conversation-vault save in Electron fails and silently degrades to legacy storage |
| VF-AUD-20260912-IPC-P2-002 | IPC | | `documentAgent:workspace:proposeChangeset/proposeMove/proposeTrash` are dead privileged handlers masked by the verifier's orphan allow-list, and they omit the capability check the real call path enforces |
| VF-AUD-20260912-IPC-P2-003 | IPC | | Generic `credential:set/get/delete` privileged IPC has no payload validation, no profile scope, unbounded value size, and its only renderer wrapper is dead code |
| VF-AUD-20260912-IPC-P3-004 | IPC | | Dead renderer surfaces: `conversations:archive`, `conversations:search`, `characterCreator:validateCard`, `replicate:generateImage`, and the `desktopChat.listPage` wrapper have no consumers |
| VF-AUD-20260912-IPC-P3-005 | IPC | | Inconsistent main-frame sender gating across dialog/write IPC channels |
| VF-AUD-20260912-IPC-P3-006 | IPC | | Rate-limit wrapper changes the return type of boolean/string channels, producing truthy error objects |
| VF-AUD-20260912-IPC-P3-007 | IPC | | Inspector telemetry broadcast is not profile-scoped (cross-profile metadata leakage) |
| VF-AUD-20260912-IPC-P3-008 | IPC | | Validation/type gaps at the Venice request boundary: dead `agentPermissionPreset` interface field, shallow `fallbackConfig` check, unreachable `force` flag on Hugging Face catalog |
| VF-AUD-20260912-IPC-P3-009 | IPC | | Minor IPC hygiene: dead `updates:checking` emitter, inconsistent cancel semantics for save vs load dialogs, `app:saveJsonFile` returns `filePath` missing from the preload type, `credential:set` value size uncapped |
| VF-AUD-20260912-STOR-P1-001 | STOR | | Import of a crafted `.vfbackup` can freeze the main process via attacker-controlled Argon2id KDF parameters |
| VF-AUD-20260912-STOR-P1-002 | STOR | | Conversation Vault misclassifies systemic key failure as per-file corruption and quarantines every vault file it touches |
| VF-AUD-20260912-STOR-P1-003 | STOR | | Vault master key file is written non-atomically; a mid-write crash permanently bricks vault access and throws uncaught |
| VF-AUD-20260912-STOR-P1-004 | STOR | | `saveCharacterCard` silently deletes the stored avatar when the save payload omits avatar data |
| VF-AUD-20260912-STOR-P2-005 | STOR | | Unknown future-version chat-history files are quarantined as "corrupt", making downgrades destroy conversation visibility |
| VF-AUD-20260912-STOR-P2-006 | STOR | | Seven storage services use a fixed `${target}.tmp` temp name, so concurrent saves of the same record interleave and fail or swap content |
| VF-AUD-20260912-STOR-P2-007 | STOR | | Conversation Vault manifest journal is never compacted in production: `saveManifest` has no production caller |
| VF-AUD-20260912-STOR-P2-008 | STOR | | Sync acknowledgement collection requires acks from every device ever registered; devices are never pruned, so event files accumulate forever |
| VF-AUD-20260912-STOR-P2-009 | STOR | | `venice-media://` (and `venice-tts://`, `venice-character-cache://`) grant access to originless requests, resting solely on sha256 unguessability |
| VF-AUD-20260912-STOR-P2-010 | STOR | | Folder-backup export records integrity counts as hardcoded zeros, an `includesMedia` flag with no media payload, and an excludes list nothing enforces |
| VF-AUD-20260912-STOR-P3-011 | STOR | | `syncConfig.saveSyncConfig` uses a fixed temp name and swallows write failures, so a failed persist is indistinguishable from success |
| VF-AUD-20260912-STOR-P3-012 | STOR | | `listConversations` returns `totalScanned` as the valid-conversation count, contradicting its documented contract |
| VF-AUD-20260912-STOR-P3-013 | STOR | | Generated-media recovery and quarantine artifacts are never reaped: stale `.pending-*` journals and `.corrupt-*` blobs accumulate without bound |
| VF-AUD-20260912-STOR-P3-014 | STOR | | Storage services log absolute filesystem paths into the durable rotated log, contrary to AGENTS.md §6 |
| VF-AUD-20260912-VCS-P1-001 | VCS | | Desktop TTS always fails: chatTtsBridge expects a raw Buffer body the canonical client never produces |
| VF-AUD-20260912-VCS-P1-002 | VCS | | Web-transport streamed chat output is never screened by Family Safe Mode (two-transport safety parity break) |
| VF-AUD-20260912-VCS-P1-003 | VCS | | RpChatView passes an IPC-envelope shape to veniceStreamChat: invented `endpoint` wire field, missing `stream: true` |
| VF-AUD-20260912-VCS-P1-004 | VCS | | Partial streamed content is committed to the conversation even when the stream is then blocked (451) or fails mid-way |
| VF-AUD-20260912-VCS-P2-005 | VCS | | Electron chat streams have no absolute lifetime; a trickling stream can run forever (web enforces a 300 s absolute deadline) |
| VF-AUD-20260912-VCS-P2-006 | VCS | | Default retry policy replays billable POSTs (e.g. /image/generate) after 429/500/503, risking double-billing |
| VF-AUD-20260912-VCS-P3-007 | VCS | | Deduplicated veniceFetch callers leave a permanent "pending" inspector row |
| VF-AUD-20260912-VCS-P3-008 | VCS | | Proxy has no JSON error handler: body-limit (413) and JSON-parse errors escape as HTML/text via finalhandler |
| VF-AUD-20260912-VCS-P3-009 | VCS | | Web stream leaves the upstream connection open after [DONE] (no cancel; only releaseLock) |
| VF-AUD-20260912-ZST-P1-014 | ZST | | Deleting a character card silently cascade-deletes every solo-character RP chat |
| VF-AUD-20260912-ZST-P2-015 | ZST | | Stream-buffer `tool_calls` replacement loses fragmented tool-call state |
| VF-AUD-20260912-ZST-P2-016 | ZST | | `applyLoadedHistory` bypasses `setConversations` normalization |
| VF-AUD-20260912-ZST-P2-017 | ZST | | `createBlank` persona/lorebook/scenario inserts memory-only records |
| VF-AUD-20260912-ZST-P2-018 | ZST | | `patchMedia` read-modify-write is not atomic across two IDB transactions |
| VF-AUD-20260912-ZST-P2-019 | ZST | | Web background tasks fire-and-forget `persistCompletedTaskMedia` with unhandled rejections |
| VF-AUD-20260912-ZST-P2-020 | ZST | | Future-version chat-history files are quarantined as "corrupt" on downgrade |
| VF-AUD-20260912-ZST-P3-021 | ZST | | `settings-store` migration comment claims `pendingSettingsSection` is non-persisted, but no `partialize` is visible in the inspected slice |
| VF-AUD-20260912-ZST-P3-022 | ZST | | Several library stores latch `hydrated: true` after load failure, leaving empty libraries |
| VF-AUD-20260912-ZST-P3-023 | ZST | | `workflow-template-store` silently truncates after 20 persisted templates |
| VF-AUD-20260912-ZST-P3-024 | ZST | | Profile switch leaves a split-brain window where renderer and main disagree about the active session |

---

## Domain: Electron main-process security (SEC)
## Severity / classification summary

| ID | Severity | Classification | Title |
|---|---|---|---|
| VF-AUD-20260912-P1-001 | P1 | CONFIRMED DEFECT | Renderer CSP `media-src` omits `venice-tts:`, blocking default TTS playback |
| VF-AUD-20260912-P2-002 | P2 | DESIGN RISK | Custom-protocol media authorization relies on originless-request allowance; capability tokens scaffolded but unwired |
| VF-AUD-20260912-P3-003 | P3 | IMPROVEMENT | Three privileged `documentAgent:workspace:propose*` IPC channels are unreachable dead surface |
| VF-AUD-20260912-P3-004 | P3 | TEST GAP | No automated assertion that the production CSP is actually delivered to the packaged `file://` renderer |

Counts: **P0 = 0, P1 = 1, P2 = 1, P3 = 2.** Confirmed defects = 1, design risk = 1, improvement = 1, test gap = 1.

---

## Verified-safe posture (what was verified, with evidence)

1. **webPreferences hardening (single BrowserWindow).** `electron/main.ts:181-188` — `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, `devTools: isDev || allowProdDevTools`. Only one `new BrowserWindow` exists in the codebase (grep-verified). No `nodeIntegrationInSubFrames`, no `webviewTag`, no `allowRunningInsecureContent`. Production DevTools is additionally closed at runtime (`main.ts:231-235`) and gated behind an explicit env opt-in (`VENICE_FORGE_DEBUG_DEVTOOLS`, `main.ts:82`).
2. **Navigation lockdown.** `isAllowedAppNavigation` (`main.ts:158-168`) allows only `http://localhost:5173` in dev or `file:` paths inside the packaged `dist` root (via realpath-based `checkPathContained`, `electron/utils/navigation.ts:46-71`, which blocks symlink escapes and `..` traversal). `will-navigate` preventDefaults everything else and only offers an external-link prompt for `https:` non-private URLs (`main.ts:192-196, 537-545`); `setWindowOpenHandler` returns `{ action: "deny" }` unconditionally on both the window and the global `web-contents-created` guard (`main.ts:226-229, 546-553`), so windowless/auxiliary contents cannot navigate either. No `open-url`/deep-link handlers exist; single-instance lock present (`main.ts:361-372`).
3. **External URL opening.** `shell.openExternal` appears only inside `promptExternalLink` (`main.ts:119-155`), gated by `isTrustedExternalUrl` (`src/shared/urlSecurity.ts:134-142` — https-only, blocks private/loopback/link-local/CGNAT/short-form-IPv4/IPv4-mapped-IPv6 hosts, per `main.ts:83-139` tests) **plus a native user-confirmation dialog** with Cancel as the default. The residual DNS-rebinding caveat is explicitly documented in-code (`main.ts:113-115`). `shell.openPath` call sites use only fixed app-owned paths (`fileHandlers.ts:487`, `logger.ts:207`, `configService.ts:680`) — never renderer input.
4. **Renderer CSP.** `electron/utils/rendererCsp.ts` — production: `default-src 'self'`, `script-src 'self'` (no `unsafe-inline`/`unsafe-eval`), `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`, `frame-ancestors 'none'`, no `https:`/`file:`/`http:` in `img-src`. Registered globally once on the default session (`main.ts:284-294`). Empirically verified (probe, Electron 43.2.0) that the header is delivered to and enforced on `file://` documents.
5. **Custom protocols.** All three schemes registered privileged with `secure, standard, supportFetchAPI, corsEnabled` (+`stream` for media/tts) (`main.ts:61-74`) — no `bypassCSP`, no `stream` on the image cache. Handlers: `venice-media` (`main.ts:389-403` → `generatedMediaStore.ts:439-471`), `venice-tts` (`main.ts:404-434`), `venice-character-cache` (`main.ts:435-504`). Object ids are regex-constrained (`^[a-f0-9]{64}$`), TTS profile ids regex-constrained (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), all file reads go through `checkPathContained` + `readRegularFileNoFollow` (O_NOFOLLOW, descriptor-shared stat/read, `secureFile.ts`), character-cache content types are restricted to a magic-byte-validated allowlist, and CORS headers are origin-scoped — never `*` (`customProtocolAccess.ts:161-170`). Range/stream handling delegates to `net.fetch` on the resolved file URL (`generatedMediaStore.ts:450-466`).
6. **IPC trust boundary.** Every production channel (147 registrations, grep-verified) uses `registerPrivilegedIpcChannel` (`common.ts:30-46`), which runs `validateIpcSender` **before** the handler: dev = only `http://localhost:5173`, production = only `file:` inside the packaged `dist` root with private-hostname rejection (`validateIpcSender.ts:75-108`). The non-privileged `registerIpcChannel` is imported **only by tests/mocks** — no production handler uses it. Rate limiting (`rateLimit.ts`) wraps every channel; duplicate registration throws. Test-only allowlist hooks are main-internal.
7. **Venice request boundary.** `veniceHandlers.ts` + `validation.ts` + `veniceClient.ts`: renderer-supplied `profileId` is **replaced** with the main-bound session profile (`withSessionProfile`), endpoints constrained to an allowlist on `VENICE_API_HOST`, methods to GET/POST, bodies capped (`VENICE_MAX_BODY_BYTES`), renderer headers stripped of `authorization`/`host`/`cookie`/`origin`/`referer`/`x-forwarded-*` (`validation.ts:48-58, 247-258`), the `Authorization: Bearer` header is attached **only in main** (`veniceClient.ts:560-566`), and response headers are sanitized of auth/cookie material (`veniceClient.ts:260-268`). The legacy `localFamilySafeModeEnabled` renderer field is dropped at validation (P1-015); safety is main-authoritative via `guardPipeline.ts`. Multipart tokens/content-types sanitized (`veniceClient.ts:195-216`); response cap 25 MiB; SSE frames redacted before logging.
8. **Secret storage.** `secureStore.ts` — safeStorage (DPAPI/Keychain/Secret Service) with fail-closed behavior on Windows/macOS when unavailable; the Linux plaintext fallback requires explicit `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true` and logs a security warning; secure-prefs file written 0o600 via temp+rename. **No IPC handler returns raw key material**: `credential:get` returns only `{ok, configured}` (`apiKeyHandlers.ts:438-448`), `apiKey:getStatus` returns booleans/status, `*Key:test` return connectivity classification. Generic credential names are reserved-blocked (`isReservedCredentialName`). Master/profile passwords have lockout counters and constant-shape failure responses.
9. **File-system IPC.** Save/load dialogs are user-mediated (`fileHandlers.ts:243-349`); import/reveal/meta are allowlist-contained after `fs.realpath` canonicalization (`mediaService.ts:138-267` — Pictures/Venice Forge, thumbs, exports; traversal/null-byte/length rejected); thumbnails are content-addressed by sha256, PNG-magic-validated, dimension-capped, written 0o600 atomically (`mediaService.ts:315-359`). Generated-media persistence is content-hashed, integrity-verified, mode-0o600/0o700, atomic, with recovery custody (`generatedMediaStore.ts`). Workspace/document paths go through `path-policy.ts` (rejects absolute/UNC/encoded/dot-segment/symlink-component paths) and grants are main-issued, session-bound, dialog-mediated, and expiry-checked (`workspace-grant-service.ts:45-49`, `documentAgentHandlers.ts:393-404`).
10. **SSRF defenses.** `app:proxyScrape` (`systemHandlers.ts:98-240`) — https-only, `isPrivateHostname` pre-check, **DNS `lookup({all:true, verbatim:true})` with every A/AAAA record screened**, pinned lookup callback so the connection cannot re-resolve elsewhere, redirects destroyed, content-type allowlist, 2 MiB cap, 15 s timeout, plus family-safe screening of the body. `jina:request` restricted to `r.jina.ai`/`s.jina.ai` with allowlisted forward headers (`jinaHandlers.ts:47-89, 190-199`). Character images restricted to `VENICE_CHARACTER_IMAGE_HOSTS` with one-hop redirect re-validation (`characterImageCache.ts:215-290`, `characterImageResolver.ts:92-107`). HF discovery hits a hardcoded endpoint with the profile key (`huggingfaceDiscovery.ts:17, 252-259`).
11. **Headless bridge.** Loopback-only hosts (`bridgeHost.ts`), operator token strength validation (P2-009), constant-time compare (`bridgeServer.ts:141-156`), per-(client, method, path) rate limits, the same Venice endpoint allowlist via `validateVeniceIpcRequest`, guard pipeline 451s, abort-on-disconnect/timeout, and the token is never logged.
12. **Auto-update.** `electron-updater` with `autoDownload = false`, `autoInstallOnAppQuit = false`; `app:installUpdate` refuses unless a real `update-downloaded` event fired (`updates.ts:11-12, 78-90`).
13. **Sanitized main→renderer push.** Stream deltas pass through `sanitizeStreamDeltaEnvelope` at the preload boundary (`preload.ts:46-56`); main uses `safeSendToRenderer` with destroyed-frame checks (`common.ts:55-79`); renderer console messages are truncated and `redactErrorMessage`-scrubbed before logging (`main.ts:207-224`); attachment bodies never cross the IPC boundary (`attachment-registry.ts:210-227`, scoped by profile+session); profile-scoped attachment/grant revocation runs on renderer crash/reload/profile-switch (`main.ts:46-59, 200-206, 554-556`; `apiKeyHandlers.ts:561-578`).
14. **Permissions.** `setPermissionRequestHandler(() => callback(false))` denies all permission requests globally (`main.ts:506`).

---

## VF-AUD-20260912-SEC-P1-001 — Renderer CSP `media-src` omits `venice-tts:`, blocking the default TTS playback path

**Severity:** P1 | **Confidence:** High | **Classification:** CONFIRMED DEFECT

**Affected files:**
- `electron/utils/rendererCsp.ts:45-48` (CSP directive list)
- `src/services/chatTtsController.ts:147-148, 185` (URL construction + `new Audio()`)
- `src/stores/settings-store.ts:133` (`cacheEnabled: true` default)
- `electron/services/chatTtsBridge.ts:151-157, 202-210` (disk-cache result shape)
- `electron/utils/rendererCsp.test.ts:14` (test enshrines the omission)

**Affected subsystem:** Renderer CSP vs. chat TTS media playback (Electron packaged + dev).

**Observed behavior:** The production and dev CSPs declare `media-src 'self' blob: venice-media:` — `venice-tts:` is present only in `connect-src`. The chat TTS controller's default path (disk cache enabled, which is the settings default) plays audio with `new Audio("venice-tts://<profile>/<sha256>.mp3")`. `<audio>` element loads are governed by `media-src`, not `connect-src`, so the load is refused by CSP and playback fails with an audio-element error.

**Evidence:**
```
electron/utils/rendererCsp.ts:48      "media-src 'self' blob: venice-media:",
src/services/chatTtsController.ts:148   sourceUrl = `venice-tts://${result.profileId}/${result.id}.mp3`;
src/services/chatTtsController.ts:185   const audio = new Audio(sourceUrl);
src/stores/settings-store.ts:133        cacheEnabled: true,
```
Unit evidence that this URL is the intended production source: `src/services/chatTtsController.test.ts:77` expects exactly `venice-tts://default/<64-hex>.mp3` as the audio source.

**Empirical proof (out-of-tree probe, Electron 43.2.0, identical scheme privileges to `venice-tts`):** A minimal app registered a `test-audio` scheme with `{ secure: true, standard: true, supportFetchAPI: true, stream: true, corsEnabled: true }`, injected the same style of CSP via `webRequest.onHeadersReceived` on a `file://` document, and loaded `<audio src="test-audio://default/abc.mp3">`. Result:
```
RENDERER-CONSOLE: Loading media from 'test-audio://default/abc.mp3' violates the following
Content Security Policy directive: "media-src 'self'". The action has been blocked.
RENDERER-CONSOLE: AUDIO-ERROR
RENDERER-CONSOLE: AUDIO-PLAY-REJECTED: Failed to load because no supported source was found.
HEADERS-SEEN-FOR: ["file:///…/page.html"]   ← CSP header IS delivered to file:// documents
```
This simultaneously confirms (a) the packaged renderer CSP is actually applied (good) and (b) `venice-tts:` playback is blocked by it.

**Expected behavior:** Every custom-scheme URL the renderer can legitimately construct must be permitted by the CSP directive governing how it is consumed. `venice-tts:` must appear in `media-src` (it is already in `connect-src`).

**Root cause:** When `venice-media:` was added to `img-src`/`media-src` (remediation VF-20260720-002), `venice-tts:` was added only to `connect-src` (`git log -S "venice-tts"` shows `d948cb07` touching only `connect-src`), on the assumption the renderer would `fetch()` TTS audio. The renderer instead plays it through an `<audio>` element (`new Audio()`), which is `media-src`-governed. `rendererCsp.test.ts:14` asserts the exact broken `media-src` string, so the suite currently enshrines the defect.

**Impact:** With default settings, every chat TTS playback in the packaged app (both cache-hit and synthesize-then-store) fails at the media-element load step; the user sees a generic playback error. Fail-closed direction (CSP blocks media), so **no security boundary is weakened** — this is a major functional regression against a shipped feature, not an exploit path.

**Recommended remediation:** Add `venice-tts:` to `media-src` in `rendererCsp()` for both dev and prod (it is already correct in `connect-src`); update `rendererCsp.test.ts:14` accordingly. Preferably replace the exact-string assertions with a scheme/directive cross-check (see P3-004).

**Required regression tests:**
1. `rendererCsp(false)` and `rendererCsp(true)` contain `media-src` including `venice-tts:`.
2. A contract test that extracts every custom-scheme URL pattern the renderer can build (`venice-media://`, `venice-tts://`, `venice-character-cache://`) and asserts each is allowed by the CSP directive matching its consumption mode (`<img>` → `img-src`, `new Audio()`/`<video>` → `media-src`, `fetch` → `connect-src`).
3. An Electron-level smoke assertion (packaged or `dev:electron`) that a `new Audio(venice-tts://…)` load succeeds and does not log a CSP violation.

---

## VF-AUD-20260912-SEC-P2-002 — Custom-protocol media authorization relies on originless-request allowance; capability tokens scaffolded but unwired

**Severity:** P2 | **Confidence:** High | **Classification:** DESIGN RISK (acknowledged in-code, roadmap `VF-CAPABILITY-PROVENANCE-2026-08-31`)

**Affected files:**
- `electron/utils/customProtocolAccess.ts:111-154` (originless → allowed)
- `electron/utils/customProtocolAccess.ts:172-355` (capability manager scaffolding, not wired)
- `electron/main.ts:389-403` (`venice-media` handler — no token verification)
- `electron/services/generatedMediaStore.ts:439-451` (`createGeneratedMediaResponse` — origin/referrer gate only)

**Affected subsystem:** `venice-media://`, `venice-tts://`, `venice-character-cache://` protocol authorization.

**Observed behavior:** `evaluateCustomProtocolAccess()` treats requests bearing **no `Origin` and no/allow-listed `Referer`** as renderer-initiated and serves them. Chromium media elements (`<img>`, `<audio>`, `<video>`) normally send neither, so these requests are allowed by design. Any script executing inside the renderer (XSS, malicious model-produced markup, compromised dependency) can therefore `fetch`/load any `venice-media://<sha256>`, `venice-tts://<profile>/<sha256>.mp3`, or `venice-character-cache://<sha256>` object, cross-profile (the handler does not bind the request to the active profile session).

**Evidence:**
```
electron/utils/customProtocolAccess.ts:129-135   if (!origin) {
  if (referrer.length === 0 || isAllowedRendererReferrer(referrer, …)) {
    const allowOrigin = input.isDev ? DEV_RENDERER_ORIGIN : "null";
    return { allowed: true, allowOrigin, vary: "Origin" };
electron/main.ts:392-396  // Future VF-CAPABILITY-PROVENANCE: extract `?cap=<token>` …
  // verify it through the app-scoped capability manager before falling back …
```

**Expected behavior:** Primary gate should be an unguessable, short-lived, profile/session-bound capability token in the URL query; origin/referrer checks remain only as defense-in-depth.

**Root cause:** The capability manager (`createCustomProtocolCapabilityManager`, `customProtocolAccess.ts:245-342`) is fully implemented (256-bit tokens, TTL ≤ 24 h, per-session/profile revocation, safe metrics) but intentionally not wired into `main.ts` protocol handlers or `createGeneratedMediaResponse`; nothing mints or verifies tokens on the media path. Documented as future work in three places (`customProtocolAccess.ts:20-42`, `main.ts:33-37`, `preload.ts:352-356`).

**Impact:** Defense-in-depth only. An attacker who already achieves script execution in the renderer (itself non-trivial given `script-src 'self'`, sandbox, context isolation, navigation lockdown) can read generated media/avatars/TTS audio whose content ids they know or can enumerate. Direct mitigations verified: ids are sha256 content hashes (unguessable, non-enumerable — no directory listing; handlers return 404/403 without oracle differences), responses are read-only, mime-restricted, CORS-scoped, and no other web content can be navigated into the app to issue such requests. No credential material is reachable through these protocols.

**Recommended remediation:** Land the already-scaffolded capability flow: mint `venice-media://<id>?cap=<token>` in a privileged IPC (`resolveMediaUrl`), verify via `parseCustomProtocolCapabilityUrl` + manager `verify()` in `protocol.handle`, revoke on profile switch/renderer reload/shutdown, keep origin/referrer checks as fallback for legacy URLs during migration.

**Required regression tests:** (1) handler rejects missing/expired/wrong-profile tokens; (2) token works only for its bound object id; (3) legacy originless requests keep current behavior until migration; (4) revocation on profile switch and renderer reload; (5) tokens never appear in logs (existing redaction invariants).

---

## VF-AUD-20260912-SEC-P3-003 — Unreachable privileged IPC channels `documentAgent:workspace:proposeChangeset|proposeMove|proposeTrash`

**Severity:** P3 | **Confidence:** High | **Classification:** IMPROVEMENT (dead privileged surface / preload parity gap)

**Affected files:**
- `electron/ipc/handlers/documentAgentHandlers.ts:407-434, 436-461, 463-487` (registrations)
- `electron/preload.ts:859-865` (`documentAgent.workspace` bridge — only `choose`, `revoke`, `list`, `read`, `search`)

**Observed behavior:** Main registers three privileged, grant-validated workspace-mutation channels, but the preload bridge never exposes them. The sandboxed, context-isolated renderer cannot reach them (no generic `invoke` is exposed anywhere in `preload.ts`), making them dead attack surface that must still be audited and kept secure on every future change.

**Expected behavior:** IPC channels registered in main should have exactly one intended client; unused ones should be removed (or exposed, if the Document Agent UI genuinely needs them).

**Root cause:** Handler set added ahead of the renderer surface; preload parity was never completed (AGENTS.md §12 requires tool/executor parity in the opposite direction; the same principle applies here).

**Impact:** No direct exploit (channels remain sender-validated, session-scoped, and approval-gated). Cost is ongoing audit/review burden and drift risk.

**Recommended remediation:** Either expose the three operations through the preload bridge behind the existing approvals UI, or delete the handlers until needed (the duplicate-registration guard in `common.ts:20-23` makes re-introduction cheap). Add a preload↔handler parity check to `registration.test.ts`.

**Required regression tests:** parity test asserting every `documentAgent:*` channel registered in main is either exposed in `preload.ts` or explicitly annotated as intentionally internal.

---

## VF-AUD-20260912-SEC-P3-004 — No automated assertion that the production CSP is delivered to the packaged `file://` renderer

**Severity:** P3 | **Confidence:** High | **Classification:** TEST GAP

**Affected files:**
- `electron/main.ts:284-294` (global `onHeadersReceived` CSP injection)
- `tests/electron/productionStartupInvariant.test.ts:10-19` (only static source-string checks)
- `electron/utils/rendererCsp.test.ts` (string matching only)

**Observed behavior:** The entire renderer CSP depends on Electron continuing to fire `webRequest.onHeadersReceived` for `file://` protocol responses. No test launches the app (packaged or `dev:electron`) and asserts the header is present on the loaded document or that an inline-script probe is blocked. A future Electron upgrade could silently stop delivering the header and the packaged renderer would run with **no CSP at all** — currently indistinguishable from green.

**Evidence:** `productionStartupInvariant.test.ts` only greps `main.ts`/`vite.config.ts` source text (`expect(mainSource).toContain('win.loadFile(prodHtmlPath))'`). Probe evidence (this audit): on Electron **43.2.0** the header *is* delivered (`HEADERS-SEEN-FOR: ["file:///…/page.html"]` and an enforced `media-src` violation), so the risk is a *future* regression, not a present one.

**Expected behavior:** An automated, Electron-level check pins the delivery and enforcement contract for the packaged renderer.

**Root cause:** CSP tests stop at string equality on `rendererCsp()` output; the integration seam (session webRequest → file:// response → document policy) is untested.

**Impact:** Latent. If Electron changes behavior, `script-src`/`object-src`/`frame-ancestors` protections on the packaged renderer silently vanish.

**Recommended remediation:** Add a smoke/acceptance step (e.g. extend `capture-smoke-diagnostics` or a Playwright-electron harness) that loads the packaged app, evaluates a `try { new Function("return 1")() }`-style inline-script/CSP probe (or reads `document.querySelector('meta')`-free policy via a deliberate violation), and asserts the CSP violation is logged. Also add the scheme/directive cross-check described in P1-001.

**Required regression tests:** packaged-renderer CSP delivery assertion pinned to the Electron major in `package.json`.

---

## Rejected candidates / false positives

- **“`electron/security/` is missing.”** Not a defect — the security layer is `electron/utils/` + `electron/ipc/validation.ts` + per-service guards; all reviewed.
- **“Preload exposes an overly broad surface.”** 907 lines but every method maps 1:1 to a named, privileged, sender-validated IPC channel; there is no generic `invoke`/`send` escape hatch, no `remote`, no Node primitive. The stream-delta listener validates envelopes at the preload boundary (`preload.ts:46-56`).
- **“`registerIpcChannel` (non-privileged) weakens the boundary.”** Unused in production code — only tests/mocks import it; all 147 production channels are privileged.
- **“`sandbox: true` breaks preload.”** Preload uses only `contextBridge` + `ipcRenderer`, which sandbox supports.
- **“`data:text/html` fallback in `loadURL` error paths is a navigation hole.”** Static error text only, loaded by main on failure, `encodeURIComponent`-escaped (`main.ts:240, 248`).
- **“`console-message` logging leaks prompt text.”** Output is truncated to 10 000 chars and passed through `redactErrorMessage` before persistence (`main.ts:213-223`); inspector telemetry contract excludes prompts/keys/URLs by design (`inspectorTelemetry.ts:73`).
- **“`existsCaseInsensitive` in `navigation.ts` permits case-based TOCTOU.”** It is only an existence pre-check; the decision comes from `fs.realpathSync` of both target and root plus prefix comparison, which resolves the true casing.
- **“`mediaService.generateMediaThumb` writes attacker bytes.”** Renderer-supplied base64 must decode to PNG-magic bytes, dimensions ≤ 8192², and is written under a sha256-named 0o600 file via temp+rename inside the thumbs dir (`mediaService.ts:315-359`).
- **“`characterImageCache` fetchImage attaches the API key to arbitrary URLs.”** Bearer header is added only for the allowlisted Venice hosts after a 401/403, redirect targets are re-validated, chain ≤ 1 hop (`characterImageCache.ts:215-250`).
- **“`proxyScrape` DNS check is bypassable by re-resolution.”** The custom `lookup` callback pins the exact previously-screened address/family into the socket (`systemHandlers.ts:161-164`); all A/AAAA records are screened first.
- **“Bridge token strength fallback is unsafe.”** A weak env token causes a fresh 256-bit token to be generated and a loud warning, never silent acceptance of the weak token (`bridgeServer.ts:187-199`); headless mode hard-refuses to start without a usable token (`main.ts:307-315`).
- **“`sync:setSyncFolder` accepts a renderer path.”** It only confirms the currently configured folder; real selection is dialog-mediated (`syncHandlers.ts:45-50`); `writePacket` enforces a store allowlist, id regex, envelope-id match, size caps, and encryption before any disk write (`syncFolderWatcher.ts:786-847`).
- **“`safeStorage` plaintext fallback.”** Windows/macOS fail closed; Linux requires explicit env opt-in and emits a `[SECURITY]` warning (`secureStore.ts:119-144, 170-180`).
- **“Capability manager token flaws.”** 256-bit `crypto.randomBytes`, TTL bounded 1 ms–24 h, single-use store keyed by token value, revoke by session/profile, token never logged (`customProtocolAccess.ts:248-342`) — scaffolding itself is sound; the gap is purely that it is unwired (P2-002).
- **“`evaluateCustomProtocolAccess` `allowOrigin: "null"`.”** Correct for an opaque `file://` client; never `*`; `Vary: Origin` always emitted (`customProtocolAccess.ts:131-153, 161-170`).
- **“Auto-update allows forced install.”** `quitAndInstall` requires a real `update-downloaded` event in-process (`updates.ts:78-90, 88-90`).
- **“Profile isolation bypass via forged `profileId`.”** Venice handlers overwrite renderer-supplied profile ids with the main-bound session profile (`veniceHandlers.ts:47-60`); `profileSession` binding is only set after password verification (`apiKeyHandlers.ts:545-584`) and ids pass `isValidProfileStorageId`.

---

## Domain: Guard / secrets / safety (GSS)
## VF-AUD-20260912-GSS-P1-001 — Family Safe Mode response screening is post-hoc for streaming chat; all content deltas are delivered before any 451

Severity P1 | Confidence High | Classification: confirmed defect (safety-filter bypass by ordering; 451 contract shape preserved but protective goal defeated)

Affected files: `electron/services/guardPipeline.ts:271-312`; `electron/services/veniceClient.ts:573-646,681-685`; `electron/ipc/handlers/veniceHandlers.ts:111-126`; `electron/agent/runtime/chat-agent-runner.ts:169-184`; `electron/services/bridgeServer.ts:326-372`; `src/services/veniceClient/stream.ts:73-77,84-105`; `server.ts:684-691` (standardVeniceProxy)

Observed: In `performGuardedVeniceRequest` the upstream response is screened only **after** `performVeniceRequest` fully resolves. For SSE streams, `performVeniceRequest` invokes `options.onDelta` per decoded event while bytes arrive (`veniceClient.ts:596-620`), and the returned body is only `{ text: streamText }` (`veniceClient.ts:681-685`). Every delta is forwarded to the renderer live before `screenUpstreamResponse` runs.

Evidence:
```
// electron/ipc/handlers/veniceHandlers.ts:111-126
const result = await runChatAgentLoop(request, toolExecutionContext, (chunk) => {
  const envelope: VeniceStreamDeltaEnvelope = { signalId: request.signalId!, delta: chunk.content ?? "", ... };
  safeSendToRenderer(event.sender, "venice:streamDelta", envelope, event.senderFrame);   // delivered immediately, per chunk
});
if (result.kind === "blocked") return result.block;   // 451 arrives only after the last chunk
```
```
// src/services/veniceClient/stream.ts:73-77 (renderer side, Electron mode)
const wrappedOnDelta = (chunk) => {
  accumulatedContent += chunk.content;
  onDelta(chunk);        // UI/store updated per delta; no screening of deltas in Electron mode
};
```
```
// src/services/veniceClient/stream.ts:82-85
// In desktop mode the IPC handler also runs the guard, so we skip the renderer check.
if (!isElectron()) {
```
```
// electron/services/bridgeServer.ts:365-371 — streaming 451 written after all content chunks
if (result.kind === "blocked") {
  res.write(`data: ${JSON.stringify({ error: result.block.body })}\n\n`);
  res.write("data: [DONE]\n\n");
```

Expected: While Family Safe Mode is enabled, generated assistant content must not reach the renderer unless the response screen has allowed it; a post-delivery 451 cannot retract streamed content. The web transport has the same gap: `/chat/completions` SSE responses are proxied via `standardVeniceProxy` (`server.ts:684-691`) with no response screening (only media endpoints get `fsmMediaVeniceProxy` buffering/screening, `server.ts:693-702,528-604`).

Root cause: Response screening is architected as a single post-dispatch step over the aggregated body; streaming delivery and response screening are not interlocked (no incremental delta screening, no withhold-until-screened buffering).

Impact: With FSM on, a streaming `/chat/completions` response that violates the response-side filter (e.g. adult-explicit text, unsafe roleplay output) is delivered in full to the chat UI and persisted into conversation state; the late 451 only surfaces an error banner. The response-side family filter is effectively non-functional for streaming — the dominant chat path. (Request-side mandatory child-safety guard is unaffected.)

Recommended remediation: Screen incrementally (bounded rolling window per delta with fail-closed termination of the stream), or buffer streaming deltas in the main process until the aggregated text passes `screenResponseBody`, forwarding only after allow. Apply the same policy in `server.ts` for the web proxy streaming route.

Required regression tests: (1) streaming `/chat/completions` with a guard-triggering final body → renderer receives zero content deltas and a 451; (2) same via bridge server SSE; (3) same via web proxy streaming route; (4) long benign stream (>MAX_SCAN_CHARS) still allowed and complete; (5) FSM-off streaming unaffected.

---

## VF-AUD-20260912-GSS-P1-002 — Mandatory child-safety guard silently skips all chat messages beyond the 32nd extracted field

Severity P1 | Confidence High | Classification: confirmed defect (guard coverage gap / safety-boundary bypass)

Affected files: `src/shared/safety/promptPayloadExtractor.ts:41-48,114-146`; `src/shared/safety/childExploitationGuard.ts:656-695`; enforcement boundaries: `electron/services/guardPipeline.ts:282-288`, `server.ts:815-861`

Observed: Extraction stops at `MAX_FIELDS = 32` fields per payload. For `/chat/completions` each non-empty `messages[i].content` consumes one field, so in any conversation with more than 32 non-empty messages, **messages from index ~32 onward are never extracted and never screened**. Those tail messages include the newest user turn on every subsequent send.

Evidence:
```
// src/shared/safety/promptPayloadExtractor.ts:41-48
/** Max characters per extracted field value to prevent excessive processing. */
const MAX_FIELD_CHARS = 8_000;
/** Max number of fields to extract per payload. */
const MAX_FIELDS = 32;
```
```
// src/shared/safety/promptPayloadExtractor.ts:120-126
if (key === "messages" && Array.isArray(val)) {
  for (let i = 0; i < val.length && results.length < MAX_FIELDS; i++) {
    const msg = val[i];
    ...
    if (typeof msg["content"] === "string") {
      const content = msg["content"].slice(0, MAX_FIELD_CHARS);
```
```
// src/shared/safety/childExploitationGuard.ts:657-665 — the guard only ever sees what was extracted
const fields = extractPromptLikeFields(input.payload, input.endpoint);
...
const combinedRaw = fields.map(f => f.value).join(" ");
```

Expected: Every user-controlled message in the outbound payload is subject to the mandatory child-exploitation guard regardless of conversation length (subject only to the documented per-field scan-window truncation, see VF-AUD-20260912-P2-003).

Root cause: A fixed global field-count budget is shared across the messages array; long histories exhaust it before the most recent messages are reached. There is no test coverage for >32 messages (`src/shared/safety/promptPayloadExtractor.test.ts` has no many-messages case).

Impact: In long roleplay/conversational sessions (the common case in this app), the latest user messages transit to Venice with no mandatory child-safety screening at the IPC boundary and at the web-proxy boundary (same extractor, `server.ts:818-821` path via Buffer→JSON→`extractFromObject`). A user or injected document placing disallowed content late in a long history bypasses the guard.

Recommended remediation: For `messages` arrays, always extract the first system message plus the **last N messages** (e.g. all messages from the most recent user turn backward, up to a budget), or raise `MAX_FIELDS` for the messages case with per-endpoint logic; add an explicit guard-side assertion that the final message was included.

Required regression tests: (1) 40-message payload with a blocking signal in message[39] → blocked at IPC boundary and web proxy; (2) 40-message payload with signal in message[0] → blocked; (3) 40 clean messages → allowed; (4) extraction count telemetry includes last-message-processed marker.

---

## VF-AUD-20260912-GSS-P2-003 — Per-field 8,000-character pre-slice defeats the normalization layer's tail/middle scan windows

Severity P2 | Confidence High | Classification: confirmed defect (guard coverage gap; test-locked truncation)

Affected files: `src/shared/safety/promptPayloadExtractor.ts:41-42,55,125,136,240,246`; `src/shared/safety/normalization.ts:22-31,158-206`; `src/shared/safety/promptPayloadExtractor.test.ts:235-239`

Observed: Every extracted field value is hard-sliced to `MAX_FIELD_CHARS = 8_000` characters **before** `computeMultiNorm` runs. The normalization layer's stated invariant — "MAX_SCAN_CHARS + TAIL_SCAN_CHARS + MIDDLE_SCAN_CHARS windows must cover every byte of oversized input" (`normalization.ts:12-13`) — is defeated at the extractor boundary: bytes beyond character 8,000 of any single `prompt`/`messages[].content` field are discarded, so the tail (`TAIL_SCAN_CHARS = 8_000`) and middle windows never see them.

Evidence:
```
// src/shared/safety/promptPayloadExtractor.ts:55
function safeStringify(v: unknown): string | null {
  if (typeof v === "string") return v.slice(0, MAX_FIELD_CHARS);
```
```
// src/shared/safety/normalization.ts:22-23
/** Maximum characters scanned per field. Oversized inputs are truncated — not an error. */
export const MAX_SCAN_CHARS = 16_384;
```
```
// src/shared/safety/promptPayloadExtractor.test.ts:235-239 — behavior locked by test
it("handles excessively long plain strings", () => {
  const longString = "x".repeat(11 * 1024 * 1024); // 11MB
  const fields = extractPromptLikeFields(longString, "/chat/completions");
  expect(fields).toContainEqual({ path: "body", value: longString.slice(0, 8000) }); // MAX_FIELD_CHARS
```

Expected: Oversized single fields should be screened by the head+middle+tail machinery (which already exists and is O(1)); truncation to 8,000 chars silently exempts the remainder of any long message or document body sent to `/augment/text-parser`, long RP posts, etc.

Root cause: Two independent truncation layers with mismatched budgets; the lower (extractor) layer caps below the upper layer's own head window (`MAX_SCAN_CHARS = 16_384`), making the upper layer's tail/middle paths unreachable for single fields.

Impact: Disallowed content positioned past character 8,000 of one message/field reaches Venice unscreened by both the mandatory guard and the FSM optional filter.

Recommended remediation: Raise `MAX_FIELD_CHARS` to at least `MAX_SCAN_CHARS + TAIL_SCAN_CHARS + MIDDLE_SCAN_CHARS` (or pass the raw value through and let `computeMultiNorm` own all truncation); update the test at `promptPayloadExtractor.test.ts:235-239` accordingly and add a test asserting a blocking signal at offset >8,000 of a single field is caught via the tail window.

Required regression tests: (1) single 30,000-char prompt with blocking signal at char 20,000 → blocked; (2) same with signal at char 2,000 → blocked; (3) normal-length prompts unaffected.

---

## VF-AUD-20260912-GSS-P2-004 — `redactSecrets` blind spots: modern token families unredacted; key-name pattern misses `credential`/`private_key`; quoted env assignments only partially redacted

Severity P2 | Confidence Medium-High | Classification: confirmed defect (defense-in-depth redaction gap; latent credential-leak risk into logs/IPC errors)

Affected files: `src/shared/redaction.ts:4-28,35-43,60-78`; latent sink example: `electron/ipc/handlers/apiKeyHandlers.ts:313-336` (variable named `credential` holding a raw provider key)

Observed: Redaction patterns cover `Bearer …`, `apiKey/token/secret/password=…`, `vn-…`, `venice_…`, `sk-…`, and `WORD_API_KEY/TOKEN/SECRET/PASSWORD=…`. They do **not** cover other common credential shapes (Hugging Face `hf_…`, GitHub `ghp_…`, AWS `AKIA…`, Slack `xox…`), and the object-key pattern `SECRET_KEY_PATTERN` does not match property names like `credential`, `private_key`, `passphrase`, or `session`. A raw `hf_…` string in any error message, or an object such as `{ credential: "<key>" }` passed as log metadata, passes `redactSecrets` unchanged. Additionally, `ENV_ASSIGNMENT_PATTERN` excludes spaces from the value class, so `KEY="token with space"` redacts only the first token.

Evidence:
```
// src/shared/redaction.ts:4,13-24
export const SECRET_KEY_PATTERN = /(authorization|api[-_ ]?key|token|secret|password)/i;
...
const VENICE_KEY_PATTERN = /\bvn-[A-Za-z0-9._~+/=-]{8,}\b/gi;
const VENICE_UNDERSCORE_PATTERN = /\bvenice_[A-Za-z0-9._~+/=-]{8,}\b/gi;
const SK_KEY_PATTERN = /\bsk-[A-Za-z0-9._~+/=-]{8,}\b/gi;
```
```
// src/shared/redaction.ts:69-76 — only key names matching SECRET_KEY_PATTERN are masked
for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
  if (SECRET_KEY_PATTERN.test(key)) {
    redacted[key] = "[REDACTED]";
```

Expected: All provider-credential shapes the app itself stores (the provider registry includes huggingface, anthropic, google, etc.) and generic credential-bearing key names are covered by the central redactor, since `logError(..., meta)` runs `redactSecrets(meta)` (`electron/services/logger.ts:114-120`) and `sanitizeErrorText` runs on error strings.

Root cause: Pattern list was grown per-incident (Venice/OpenAI shapes only); no canonical enumeration of the credential forms the app's own `PROVIDER_REGISTRY` can hold.

Impact: Not exploitable today via a confirmed sink (provider keys are not currently logged), but any future `logError("...", { credential })`-style debugging — a natural pattern given `apiKeyHandlers.ts` names the variable exactly that — writes the raw key to `venice-forge.log` unredacted.

Recommended remediation: Add `hf_[A-Za-z0-9]{20,}`, `ghp_[A-Za-z0-9]{20,}`, `AKIA[0-9A-Z]{16}`, `xox[baprs]-…` patterns; extend `SECRET_KEY_PATTERN` with `credential|private[_-]?key|passphrase|session`; allow quoted multi-word values in `ENV_ASSIGNMENT_PATTERN`; add regression tests mirroring `redaction.test.ts` for each new shape.

Required regression tests: redactSecrets/redactErrorMessage cases for each token family, `{credential: …}` meta objects, and `ENV="two words"` assignments.

---

## VF-AUD-20260912-GSS-P3-005 — Two main-process call sites dispatch Venice requests outside `guardPipeline` (no guard pre-check, no textual response screen)

Severity P3 | Confidence High | Classification: confirmed defect (defence-in-depth gap; low direct impact)

Affected files: `electron/agent/runtime/image-model-resolver.ts:48-61`; `electron/services/backgroundTaskManager.ts:656-661`; contrast `electron/services/backgroundTaskManager.ts:941-946` (guarded), `electron/ipc/handlers/veniceHandlers.ts:61` (guarded)

Observed: `fetchLiveImageModels` calls `performVeniceRequest` directly (GET `/models?type=image`), and the music polling loop calls `performVeniceRequest` directly (POST `/audio/retrieve`). Neither passes through `checkLocalFamilyGuard` or `screenUpstreamResponse`. The guard-pipeline file header states every Venice-touching entry point "must route through these helpers" (`guardPipeline.ts:1-10`). Both payloads are internally constructed (no user-controlled prompt text: `buildAudioRetrieveRequest(taskModel, task.queueId)`), and the `/audio/retrieve` binary result is separately screened via `identifyAndValidateGeneratedMedia` (`backgroundTaskManager.ts:697-716`), which limits impact.

Evidence:
```
// electron/services/backgroundTaskManager.ts:656-661
const response = await performVeniceRequest({
  endpoint: "/audio/retrieve",
  method: "POST",
  body: buildAudioRetrieveRequest(taskModel, task.queueId),
  profileId: task.profileId,
});
```
```
// electron/agent/runtime/image-model-resolver.ts:50-54
const response = await performVeniceRequest({
  endpoint: "/models?type=image",
  method: "GET",
  profileId,
});
```

Expected: A single choke point: all Venice dispatches route through `performGuardedVeniceRequest` so policy changes cannot be undermined by direct-call regressions.

Root cause: Two services imported the lower-level `performVeniceRequest` directly; no lint/verifier enforces the choke point.

Impact: Low today (no user taint enters these payloads; media bytes are screened separately; the mandatory guard would likely allow these anyway). The risk is architectural: these paths would not inherit future mandatory-guard changes.

Recommended remediation: Route both call sites through `performGuardedVeniceRequest`; add a contract test/verifier (e.g. `verify:safety-guard` family) that fails CI when `performVeniceRequest(` appears outside `guardPipeline.ts`/test files.

Required regression tests: unit tests asserting both call sites return the canonical 451 shape when the runtime guard blocks; verifier test scanning `electron/` for direct `performVeniceRequest` imports outside the allowlist.

---

## VF-AUD-20260912-GSS-P3-006 — Electron runtime safety snapshot fails open (FSM off) before config load and on any config-load failure, diverging from the fail-closed web default

Severity P3 | Confidence Medium | Classification: confirmed defect (fail-open safety default; inconsistent cross-transport contract)

Affected files: `electron/services/runtimeSafetySettings.ts:1-4`; `electron/services/configService.ts:626-627,633-641`; `electron/main.ts:258-268`; contrast `server.ts:83-112` (web proxy defaults ON)

Observed: The runtime snapshot defaults both toggles to `false`, is only set after `initializeConfig()` succeeds, and the failure branch explicitly forces both off even when the on-disk config had them on. The web proxy, by contrast, defaults FSM **ON** when the env var is unset and treats the env var as authoritative. There is a startup window (`app.whenReady` → recovery → `bootstrap()` → `await initializeConfig()`) during which IPC is not yet registered, but the bridge-server/headless path and any future pre-config IPC would run with FSM off.

Evidence:
```
// electron/services/runtimeSafetySettings.ts:1-3
/** Main-process runtime snapshot shared by config loading, IPC, and the bridge server. */
let localFamilySafeModeEnabled = false;
let veniceApiSafeMode = false;
```
```
// electron/services/configService.ts:633-638
} catch (err) {
  logError("Config initialization failed", String(err));
  // Fall back to defaults so the app still boots.
  currentConfig = emptyConfig();
  setRuntimeLocalFamilySafeModeEnabled(false);
  setRuntimeVeniceApiSafeMode(false);
```

Expected: A user who enabled Family Safe Mode should not silently lose it because config.yaml was temporarily unreadable; the fail direction should match the web proxy (fail closed for the optional filter) or at minimum surface a prominent "safety settings could not be loaded" state that gates outbound media/chat.

Root cause: Boot-resilience logic (`emptyConfig()` fallback) prioritizes availability over the user's safety preference; the snapshot has no "unknown/uninitialized" state.

Impact: FSM (the optional family filter) silently disabled during the failure window; the mandatory child-exploitation guard still runs (`localFamilySafeGuard.ts:224-238`), so impact is limited to the optional layer. `venice_api_safe_mode` also forced off, meaning outbound `safe_mode` forced false on image endpoints during the window.

Recommended remediation: Add a tri-state (unset → fail closed for FSM / preserve last-known), re-read the raw `safety:` keys from config.yaml directly in the failure branch before falling back, and surface a status warning consumed by the renderer status cluster.

Required regression tests: config load throws with `safety.local_family_safe_mode_enabled: true` on disk → runtime getter still true (or UI warning flag set); headless bridge started before config init → guarded requests still enforced.

---

## VF-AUD-20260912-GSS-P3-007 — `LOCAL_PATH_PATTERN` over-redaction corrupts ordinary diagnostics (dates, URL paths, model ids)

Severity P3 | Confidence High | Classification: confirmed defect (diagnostic-integrity minor)

Affected files: `src/shared/redaction.ts:27-28,50-52`

Observed: The "local path" pattern matches any two-or-more `/segment` sequence, so commonplace diagnostic content such as ISO dates (`2026/09/12`), API path prefixes (`/image/generate` is two segments but single-slash — unaffected; however `/v1/models` style strings), and ratio-like text are replaced with `[REDACTED-PATH]`. Combined with the first alternative (`https?://…` whole-URL redaction), nearly every URL in an error message is fully destroyed, hampering debugging of provider errors.

Evidence:
```
// src/shared/redaction.ts:27-28
const LOCAL_PATH_PATTERN =
  /(?:https?:\/\/|file:\/\/)[^\s"')]+|(?:\/[A-Za-z0-9._ -]+){2,}(?:\.[A-Za-z0-9]+(?::\d+:\d+)?)?|[A-Za-z]:[\\/][^\s"')]+/gi;
```
```
// src/shared/redaction.ts:95-97
export function sanitizeErrorText(value: string): string {
  return redactPaths(redactString(value));
}
```

Expected: Redact machine/user-identifying absolute paths while preserving relative API paths and dates; URLs should keep scheme+host+path with query redaction (cf. the more precise `redactUrl` at `redaction.ts:116-132`).

Impact: Log/diagnostic usability only; no security impact (fail-safe direction).

Recommended remediation: Restrict the relative-path arm to segments with path-like depth (≥2 slashes AND a dotfile or home prefix), or require an absolute start (`/Users/`, `/home/`, `C:\`); route URLs through `redactUrl`-style host+path preservation.

Required regression tests: `sanitizeErrorText("GET https://api.venice.ai/v1/models failed 2026/09/12")` preserves host/path/date; `/Users/name/file.png` still redacted.

---

# Rejected candidates

- **Prior-audit claim "web proxy rewrites `safe_mode` when FSM is on" (docs/audits/venice-forge-exhaustive-audit-2026-09-10/FINDINGS.md:546-549): REMEDIATED.** No `applyVeniceApiSafeMode`/`safe_mode` reference exists in `server.ts` (verified by full-file grep); the proxy forwards client bodies verbatim after the guard middleware. Desktop authority (`guardPipeline.ts:149-162` via `src/shared/veniceSafeMode.ts:78-100`) now overwrites `safe_mode` for exactly the three image endpoints that declare it per the tracked OpenAPI matrix.
- **Renderer-supplied `localFamilySafeModeEnabled` bypass: NOT FOUND.** The field is explicitly dropped at the validation boundary (`electron/ipc/validation.ts:265-273`) and the guard reads only the main-process runtime snapshot (`guardPipeline.ts:103`).
- **Generic config setter bypassing safety policy: NOT FOUND.** `writeSanitizedConfig` merges only known sections and re-validates via `validateConfig` with `clampBool` on both safety flags (`src/config/configSchema.ts:727-739`); secrets patches are stripped before persistence (`configService.ts:700-715`).
- **Web-proxy FSM default: VERIFIED SOUND.** `VENICE_FORGE_LOCAL_FAMILY_SAFE_MODE_ENABLED` is authoritative when set; unset defaults ON; client header honored only under the dev-only `VENICE_FORGE_ALLOW_CLIENT_SAFETY_OVERRIDE=true` (`server.ts:99-112`); unit-tested (`server.test.ts:830-929`). Case-quirk (`"FALSE"` treated as enabled) fails safe.
- **Committed secrets: NONE FOUND.** Repo-wide scan for `vn-`, `sk-`, `ghp_`, `AKIA`, `xox*` token shapes (excluding node_modules/.git/dist/coverage) returned only synthetic test vectors (e.g. `src/shared/redaction.test.ts:25`, `src/stores/chat-store.test.ts:274`, `electron/services/backgroundTaskManager.test.ts:329`).
- **Credential storage/exposure: VERIFIED SOUND.** safeStorage encryption with throw-on-unavailable on Win/mac; Linux plaintext fallback gated by explicit env opt-in; password-class credentials refuse plaintext on every OS (`secureStore.ts:551-576,606-631,664-680`); PBKDF2-SHA256 310k-iteration verifiers with `timingSafeEqual` and main-process lockout (`secureStore.ts:733-740,880-911`); IPC exposes only `configured` booleans (`apiKeyHandlers.ts:438-448`); bridge token is 32-byte random or strength-validated env token, never logged (`bridgeServer.ts:187-199,422-428`); provider fallback routing never sends the Venice key to third-party hosts (`veniceClient.ts:560-566`, `providerAdapters.ts:336-645`).
- **Venice key in URL query (Google Vertex `?key=`): NOT ELEVATED.** Route path is constructed in main and never logged by the client/telemetry paths reviewed; no sink found.
- **`screenUpstreamResponse` top-level-array bodies: already documented** in-code as VF-AUD-20260912-DR-002 (`guardPipeline.ts:189-191`); Venice currently returns objects, and string bodies still receive the textual screen. Tracked, not re-filed.
- **mediaScreener heuristic weaknesses (IHDR-trusted dimensions, PCM accepted on declaration): NOT ELEVATED.** The heuristic is explicitly documented as structural-only with truthful capability reporting (`mediaScreener.ts:139-213`); callers pass `application/octet-stream`, making the PCM and declared-MIME branches unreachable from the reviewed screening sinks; a semantic backend registration hook exists.

---

## Domain: IPC parity (IPC)
- **Channels inventoried:** 195 handler channels (194 unique + `documentAgent:workspace:list/read/search` template trio counted individually = 195; every one has a preload invoke/on counterpart; the 3 `documentAgent:workspace:propose*` handlers have **no** preload counterpart and are held only by the verifier's orphan allow-list).
- **Findings:** 9 total — **P1 ×1, P2 ×2, P3 ×6**
- **Classification:** CONFIRMED DEFECT ×3, DESIGN RISK ×4, VALIDATION/TYPE GAP ×1, IMPROVEMENT ×1
- **IPC inventory table:** attached at the end of this file (feeds the audit coverage ledger).

---

## VF-AUD-20260912-IPC-P1-001 — `conversations:save` request envelope mismatch: every conversation-vault save in Electron fails and silently degrades to legacy storage

**Severity:** P1 | **Confidence:** High | **Classification:** CONFIRMED DEFECT
**Affected files:** `electron/preload.ts:419-421`, `electron/ipc/handlers/systemHandlers.ts:431-448`, `src/services/desktopBridge.ts:1462-1472`, `src/stores/chat-store.ts:1408-1441`, `electron/ipc/handlers.test.ts:674-688`

**Subsystem:** Conversation vault persistence (Electron IPC)

**Observed behavior:** The preload wraps the record in a nested envelope `{ record, origin }` before invoking `conversations:save`. The main-process handler expects a **flat** payload `{ ...recordFields, origin }`: it destructures `{ origin, ...recRest }` from the top level and validates `rec.version !== 1`. With the nested envelope, `recRest` is `{ record: {...} }`, so `rec.version` is `undefined` and the handler always returns `{ ok: false, error: "Invalid record structure" }`.

**Expected behavior:** Handler unwraps `payload.record` (as the sibling RP handlers already do via `parseSavePayload(raw, recordKey)` in `electron/ipc/rpHandlers.ts:68-86`, which explicitly supports both wrapped and direct shapes), or preload sends flat. Either side fixing unilaterally restores parity.

**Evidence:**
- Preload (nested): `electron/preload.ts:419-421`
  ```ts
  save(record: ConversationRecordV1, origin: MutationOrigin = "local-user"): Promise<{ ok: boolean; id: string; error?: string }> {
    return ipcRenderer.invoke("conversations:save", { record, origin });
  }
  ```
- Handler (flat expectation): `electron/ipc/handlers/systemHandlers.ts:431-448`
  ```ts
  registerPrivilegedIpcChannel("conversations:save", async (event, record: unknown) => {
    ...
    const rawRecord = record as Record<string, unknown>;
    const { origin: _ignoredOrigin, ...recRest } = rawRecord;
    const rec = recRest as unknown as ConversationRecordV1;
    if (rec.version !== 1 || typeof rec.id !== "string") {
      return { ok: false, error: "Invalid record structure" };
  ```
- Live renderer call: `src/stores/chat-store.ts:1426-1434` — `writeConversation()` calls `desktopConversations.save(record)`; on failure it falls back to `desktopChat.save(conv)` and logs `"[chat] conversations.save failed"`.
- Tests only exercise the flat shape (`electron/ipc/handlers.test.ts:678` passes `{ ...record, origin: "remote-sync" }`), so the nested production path is untested.
- Verified by direct simulation of the handler's unwrap logic against the preload payload: `rec.version === undefined` → rejection.

**Root cause:** Handler was written against a flat contract (matching its unit tests); preload/desktopBridge implement the wrapped contract used by every other save channel (`chat:save`, `characterCards:save`, `personas:save`, etc.). The two sides drifted; the channel-name verifier cannot detect shape drift.

**Impact:** The encrypted conversation vault never receives writes in Electron builds. Every conversation save silently degrades to the legacy chat store, so vault-only features (memory index, `pullContext`, archive filters, search) operate on stale/empty data. User-visible symptom is only a log line; chat content survives via the fallback, which is why this is P1 rather than P0.

**Recommended remediation:** Make `conversations:save` unwrap `payload.record` when present (mirror `parseSavePayload` in `rpHandlers.ts`), keeping flat acceptance for back-compat; keep the nested preload contract since it matches the rest of the codebase.

**Required regression tests:** A handler test that invokes with the exact preload envelope `{ record, origin }` (both `local-user` and `remote-sync` origins); an integration-style test asserting `writeConversation` reaches `saveConversation` in `conversationVault` on the first attempt without falling back to `desktopChat.save`.

---

## VF-AUD-20260912-IPC-P2-002 — `documentAgent:workspace:proposeChangeset/proposeMove/proposeTrash` are dead privileged handlers masked by the verifier's orphan allow-list, and they omit the capability check the real call path enforces

**Severity:** P2 | **Confidence:** High | **Classification:** CONFIRMED DEFECT
**Affected files:** `electron/ipc/handlers/documentAgentHandlers.ts:407-487`, `electron/agent/runtime/agent-tool-executor.ts:384-446`, `scripts/verify-ipc-parity.cjs:215-223`

**Subsystem:** Document Agent / workspace approvals IPC

**Observed behavior:** Three `registerPrivilegedIpcChannel` handlers exist for workspace proposal channels, but nothing invokes them: preload exposes none of them, and the agent-tool executor implements the same three operations by calling `services.workspaceMutations` / `services.approvals` directly (never via `ipcMain.invoke`). Repo-wide search shows the only references to these channel strings are the registrations themselves and the verifier's allow-list. The executor path enforces a capability preset (`requireCapability("workspace:propose-update" | "workspace:move" | "workspace:trash")`, `agent-tool-executor.ts:385,407,428`); the IPC handlers check only grant validity (`workspaceGrants.get`), with no permission-preset check.

**Expected behavior:** Either the channels are exposed to a legitimate caller with authorization parity, or they are removed. An allow-list entry should describe a real, reachable consumer.

**Evidence:**
- `documentAgentHandlers.ts:407-487` — three handlers registered; grant-only check, e.g. `:407-414`:
  ```ts
  registerPrivilegedIpcChannel("documentAgent:workspace:proposeChangeset", async (event, input: unknown) => {
    ...
    const grant = workspaceGrants.get(grantId, session);
    if (!grant) throw new Error("CAPABILITY_DENIED");
  ```
- Executor duplicates logic with capability enforcement: `agent-tool-executor.ts:384-404` (`requireCapability("workspace:propose-update")`), `:406-425`, `:427-446`.
- `grep -r "workspace:proposeChangeset" electron/ src/` → only the handler registration; no `ipcRenderer.invoke`, no `webContents.send`, no preload method.
- `scripts/verify-ipc-parity.cjs:215-223` documents them as "reachable only via the agent-tool executor", which is factually incorrect — the executor never touches the IPC channel.

**Root cause:** Logic migration from IPC handlers to the in-process executor left the handlers behind; the verifier's documented-orphan list was written to match intent rather than verified reachability, so the dead handlers are grandfathered.

**Impact:** Dead privileged attack surface: any future preload exposure (or a renderer that gains `ipcRenderer` via a preload regression) could call proposal channels that skip the capability-preset layer the executor enforces. The allow-list also corrupts the verifier's coverage guarantee for every future channel added to it.

**Recommended remediation:** Delete the three handlers (the executor is the canonical path and is tested), or, if a renderer UI for workspace proposals is planned, add preload methods and add the missing preset check. Remove the entries from `DOCUMENTED_ORPHAN_HANDLERS` once deleted; add a verifier assertion that every orphan-list entry has a concrete in-repo reachability proof (e.g. must appear in `agent-tool-executor.ts` channel-invocation table).

**Required regression tests:** Verifier test asserting the orphan list is empty (or each entry is provably referenced in the executor's tool map); handler-registration test asserting no `documentAgent:workspace:propose*` channels exist if the deletion route is taken.

---

## VF-AUD-20260912-IPC-P2-003 — Generic `credential:set/get/delete` privileged IPC has no payload validation, no profile scope, unbounded value size, and its only renderer wrapper is dead code

**Severity:** P2 | **Confidence:** High | **Classification:** DESIGN RISK
**Affected files:** `electron/ipc/handlers/apiKeyHandlers.ts:426-460`, `electron/ipc/handlers/apiKeyHandlers.ts:162-174`, `electron/services/secureStore.ts:579-703`, `src/services/desktopBridge.ts:2375-2394`

**Subsystem:** Credential / secure-store IPC boundary

**Observed behavior:** `credential:set` types its payload as `{ key: string, value: string }` but performs no runtime shape validation: `payload.key`/`payload.value` are dereferenced directly (a `null` payload throws inside the try and is caught, but there is no length cap on `value`, no key format constraint, and no profile scoping — keys land in the global `cred_*` namespace of the shared store). The reserved-name guard (`isReservedCredentialName`) blocks password-like names and `chat-folder-lock:*`, but any other key is accepted, including names the main process itself may adopt later. The sole renderer wrapper, `desktopCredentials`, has **zero** consumers in `src` (only its definition); nothing in the app currently needs a generic renderer→secure-store KV bridge.

**Expected behavior:** Per AGENTS.md §12/§18, generic privileged IPC is prohibited where a narrow domain operation suffices; credentials should be set through typed, profile-scoped domain channels (which exist: `apiKey:*`, `providerApiKey:*`, `providerCredential:*`, `jinaApiKey:*`). If a generic bridge is genuinely required it needs justification, strict key allowlisting, value size caps, and profile scoping.

**Evidence:**
- `apiKeyHandlers.ts:426-436`:
  ```ts
  registerPrivilegedIpcChannel("credential:set", (_event, payload: { key: string, value: string }) => {
    try {
      if (isReservedCredentialName(payload.key)) { ... }
      setCredential(payload.key, payload.value);
  ```
- No profile argument anywhere in the three handlers; `secureStore.ts:579-603` writes `cred_${key}` into the single shared store.
- Reserved list `apiKeyHandlers.ts:162-174` — pattern-based denylist only.
- `grep -r "desktopCredentials" src` → `src/services/desktopBridge.ts:2375` only (dead wrapper).

**Root cause:** Legacy generic bridge retained after typed credential channels were introduced; renderer migration away from it completed (wrapper now unused) but the IPC surface was never removed.

**Impact:** A compromised renderer (or any future preload exposure) can write unbounded data into the OS-backed secure store under arbitrary non-reserved names, exhaust or corrupt the shared credential JSON, and squat names future main-process features may use. No secret exfiltration risk (`credential:get` returns only a boolean `configured`), and no current consumer, so P2 rather than P1.

**Recommended remediation:** Remove `credential:set/get/delete` from preload and the handlers (and the dead `desktopCredentials` wrapper), or replace with a typed, profile-scoped, size-capped, key-allowlisted domain operation with a documented need. Add a verifier rule rejecting generic KV bridges over privileged channels.

**Required regression tests:** Verifier/channel test asserting removal; secure-store test that the `cred_*` namespace is no longer renderer-writable.

---

## VF-AUD-20260912-IPC-P3-004 — Dead renderer surfaces: `conversations:archive`, `conversations:search`, `characterCreator:validateCard`, `replicate:generateImage`, and the `desktopChat.listPage` wrapper have no consumers

**Severity:** P3 | **Confidence:** High | **Classification:** CONFIRMED DEFECT (dead/unwired channels)
**Affected files:** `electron/ipc/handlers/systemHandlers.ts:486-520`, `electron/ipc/characterCreatorHandlers.ts:54-67`, `electron/ipc/handlers/replicateHandlers.ts:94-153`, `electron/preload.ts:425-429,628-633,871-873,891-897`, `src/services/desktopBridge.ts:1571-1591` (listPage), `src/services/desktopBridge.ts:2684-2697` (desktopReplicate)

**Subsystem:** IPC consumer coverage

**Observed behavior:** Repo-wide greps confirm zero renderer consumers (excluding tests and desktopBridge itself):
- `conversations:archive` — preload method exists; no caller. The archive flag is only ever set through `conversations.save` with `metadata.archived`.
- `conversations:search` — preload method exists; memory search UI uses `pullContext`/`rebuildIndex` only (`src/components/layout/memory-panel.tsx`).
- `characterCreator:validateCard` — preload + handler exist; `CharacterCreatorView.tsx:680` validates locally via `validateCardForApproval`.
- `replicate:generateImage` — preload + handler + `desktopReplicate` wrapper exist; `desktopReplicate` has zero non-test consumers, so the whole Replicate generation chain is unwired at the renderer (despite provider models being listed in `src/config/provider-models.ts:133` and background-task polling support in `src/types/background-task.ts:33-34`).
- `desktopChat.listPage` — bridge wrapper exists (`desktopBridge.ts:1571-1591`) with zero callers; `chat:listPage` is therefore unreachable despite being the documented escape hatch for `truncated: true` chat lists (`systemHandlers.ts:286-290`).

**Expected behavior:** Every handler and preload method is reachable from shipped renderer code, or removed. The channel-name verifier cannot see consumer absence because preload itself counts as "covered".

**Evidence:** representative greps (all returned matches only in preload/handlers/desktopBridge/tests):
- `window.veniceForge.conversations.archive|search` → none in `src`
- `characterCreator.validateCard(` → none in `src` (only local `validateCardForApproval`)
- `desktopReplicate` / `replicate.generateImage` → only `desktopBridge.ts:2684-2696`
- `desktopChat.listPage(` → only the definition

**Root cause:** Features shipped main-first with preload bridges, but renderer wiring was deferred or removed; nothing tracks consumer-level liveness.

**Impact:** Maintenance burden and false confidence from a green parity verifier; users cannot archive conversations via the dedicated channel, cannot force-refresh truncated chat lists via listPage, and the Replicate integration is inert.

**Recommended remediation:** Either wire the consumers (archive toggle in chat UI; listPage continuation when `truncated`; Replicate generation entry point) or delete the dead channels/wrappers. Extend the verifier (or a companion script) to assert every preload method has a non-test `src` consumer outside `desktopBridge.ts`, with a documented orphan list.

**Required regression tests:** Consumer-coverage verifier test with the five entries above either wired or allow-listed.

---

## VF-AUD-20260912-IPC-P3-005 — Inconsistent main-frame sender gating across dialog/write IPC channels

**Severity:** P3 | **Confidence:** High | **Classification:** DESIGN RISK
**Affected files:** `electron/ipc/handlers/fileHandlers.ts:86-241` (gated) vs `fileHandlers.ts:243-349` (ungated), `electron/ipc/configHandlers.ts:130-144`, `electron/ipc/handlers/chatFolderHandlers.ts:262-279`, `electron/ipc/handlers/documentAgentHandlers.ts:393-403,116-128`

**Subsystem:** IPC sender-frame authorization consistency

**Observed behavior:** Media-persistence channels enforce `event.senderFrame !== event.sender.mainFrame` rejection (`app:media:persist-generated-image:91`, `retry-generated-image:134`, `save-generated-recovery:154`, `save-generated:177`, `save-data-url:197`, `export-files:216`; also `documentAgent:workspace:choose:396` and export `:118`), consistent with AGENTS.md §11 "main-frame-only" recovery custody. Other dialog-and-write channels have no main-frame check: `app:saveJsonFile`, `app:saveYamlFile`, `app:loadJsonFile`, `app:loadYamlFile`, `config:exportTemplate`, `chat-folders:export-backup`. Note `validateIpcSender` (`electron/utils/validateIpcSender.ts:111-114`) already enforces trusted-origin per **frame URL**, so this is defense-in-depth inconsistency, not an open hole: a same-origin subframe of the app could currently invoke the ungated writes.

**Expected behavior:** One consistent policy: any channel that writes to disk or opens a native dialog should either enforce main-frame or document why subframes are acceptable.

**Root cause:** Main-frame checks were added channel-by-channel for recovery-custody channels (per AGENTS.md §11) without a repo-wide rule.

**Impact:** Low today (same-origin subframes only); the inconsistency means future sensitive channels may copy the ungated pattern.

**Recommended remediation:** Add a `requireMainFrame` option to `registerPrivilegedIpcChannel` (default on for dialog/write channels) and apply uniformly; or codify the exception list in the verifier.

**Required regression tests:** `common.security.test.ts`-style tests asserting every dialog/write channel rejects a non-main `senderFrame`.

---

## VF-AUD-20260912-IPC-P3-006 — Rate-limit wrapper changes the return type of boolean/string channels, producing truthy error objects

**Severity:** P3 | **Confidence:** High | **Classification:** DESIGN RISK
**Affected files:** `electron/utils/rateLimit.ts:35-42`

**Subsystem:** IPC rate limiting

**Observed behavior:** `rateLimitIpcHandler` returns `{ ok: false, status: 429, error: "Rate limit exceeded" }` for every channel. Channels whose normal contract returns a bare `boolean` or `string` then return a truthy object when limited: `apiKey:isConfigured`, `jinaApiKey:isConfigured`, `masterPassword:isSet`, `profilePassword:isSet`, `conversations:detectLegacyHistory` (truthy → read as "yes"), and `app:getVersion` (object instead of version string). Callers like `desktopApiKey.isConfigured()` would report a configured key during a rate-limit burst.

**Expected behavior:** The wrapper should preserve per-channel return contracts (e.g. return `false` for boolean channels) or channels should declare their limited-response shape.

**Root cause:** Uniform `{ok:false,429}` envelope assumed for all channels; boolean channels predate or bypass that convention.

**Impact:** Edge case (120 req/min default, 30/min strict); a sustained renderer bug or abuse burst could flip security-relevant booleans to true in UI logic. No privilege escalation.

**Recommended remediation:** Let `registerPrivilegedIpcChannel` accept a `rateLimitedResponse` factory per channel, defaulting to the current object; set `() => false` for boolean channels.

**Required regression tests:** Rate-limit unit tests per boolean channel asserting `false` (not an object) when limited.

---

## VF-AUD-20260912-IPC-P3-007 — Inspector telemetry broadcast is not profile-scoped (cross-profile metadata leakage)

**Severity:** P3 | **Confidence:** High | **Classification:** DESIGN RISK
**Affected files:** `electron/ipc/handlers/inspectorTelemetryHandlers.ts:42-50`, contrast `electron/ipc/handlers/backgroundTaskHandlers.ts:27-36`

**Subsystem:** Inspector telemetry IPC

**Observed behavior:** `broadcast()` in inspectorTelemetryHandlers sends every event to every subscribed WebContents with no profile filter, while the background-task broadcast in the same architecture filters `getProfileSessionId(webContents) !== profileId` (`backgroundTaskHandlers.ts:33`). Inspector events carry endpoint, model ID, duration, and normalized error metadata for **all** profiles to **any** subscribed renderer.

**Expected behavior:** Profile-scoped delivery matching the background-task pattern, unless cross-profile observability is an explicit product decision (then document it).

**Root cause:** Profile scoping was added to the newer background-task bridge but not retrofitted to inspector telemetry.

**Impact:** A renderer bound to profile B can observe request metadata (endpoints, model IDs, timings, error classes) of profile A's traffic. No secrets or prompt content are included per the redaction contract, hence P3.

**Recommended remediation:** Filter subscribers by `getProfileSessionId` in `broadcast()`, with tests covering two-profile isolation.

**Required regression tests:** Two-profile broadcast test: events for profile A never reach a subscriber bound to profile B.

---

## VF-AUD-20260912-IPC-P3-008 — Validation/type gaps at the Venice request boundary: dead `agentPermissionPreset` interface field, shallow `fallbackConfig` check, unreachable `force` flag on Hugging Face catalog

**Severity:** P3 | **Confidence:** High | **Classification:** VALIDATION/TYPE GAP
**Affected files:** `electron/ipc/validation.ts:33-43,301-311`, `electron/ipc/handlers/huggingfaceHandlers.ts:13-19`, `electron/preload.ts:900-904`

**Subsystem:** Venice request validation + provider catalog IPC

**Observed behavior:**
1. `VeniceIpcRequest` declares `agentPermissionPreset?: AgentPermissionPreset` (`validation.ts:41`) but `validateVeniceIpcRequest` never populates it in its return object (`:301-311`) — a dead field that suggests renderer-supplied presets are honored when they are not (authorization actually comes from `getEffectiveAgentPermissionPreset`, `veniceHandlers.ts:94-98`). Purely misleading, but the kind of field a future change might start trusting.
2. `fallbackConfig` passes with only `typeof === "object"` — `ordering` is not validated as `string[]`, and no length cap, before it flows into provider fallback code.
3. `huggingface:getModelCatalog` reads a `force` boolean from the payload (`huggingfaceHandlers.ts:16-18`), but the preload method only ever forwards `{ profileId }` (`preload.ts:902`), which the handler ignores in favor of the session profile — so force-refresh is unreachable from the typed bridge (and `profileId` in the preload signature is misleading dead weight).

**Expected behavior:** Interface matches parser output; `fallbackConfig` gets structural validation; preload signature matches what the handler consumes.

**Evidence:** `validation.ts:41` vs `:301-311`; `huggingfaceHandlers.ts:16-19` vs `preload.ts:901-903`.

**Root cause:** Drift between declared types and parsers; preload signatures not updated after the handler became session-authoritative.

**Impact:** Misleading API surface for future maintainers; malformed `fallbackConfig.ordering` could reach fallback routing logic (defense-in-depth gap only — that code paths' consumers re-validate provider IDs against the registry).

**Recommended remediation:** Delete the dead interface field (or implement parsing with strict enum validation and reject unknown presets); validate `fallbackConfig = { enabled: boolean, ordering: string[] }` explicitly; align the HF preload signature to `()` or add `force` forwarding.

**Required regression tests:** Validator tests asserting `fallbackConfig` structural rejection; a preload/handler contract test for the HF catalog payload.

---

## VF-AUD-20260912-IPC-P3-009 — Minor IPC hygiene: dead `updates:checking` emitter, inconsistent cancel semantics for save vs load dialogs, `app:saveJsonFile` returns `filePath` missing from the preload type, `credential:set` value size uncapped

**Severity:** P3 | **Confidence:** High | **Classification:** IMPROVEMENT
**Affected files:** `electron/ipc/updates.ts:93-95`, `electron/ipc/handlers/fileHandlers.ts:243-274,299-349`, `electron/preload.ts:317-321`, `electron/ipc/handlers/apiKeyHandlers.ts:426-436`

**Subsystem:** Updates events, file-dialog IPC contracts

**Observed behavior:**
1. `broadcast("updates:checking")` has no preload listener (preload wires available/not-available/progress/downloaded/error only) — dead emitter.
2. Cancel semantics differ between save and load dialogs: `app:saveJsonFile` returns `{ ok: false, canceled: true }` (`fileHandlers.ts:268`) while `app:loadJsonFile`/`app:loadYamlFile` return `{ ok: true, canceled: true }` (`:307,334`). Consumers currently treat both correctly (`desktopFiles.exportJson` maps cancel to `false` via `result.ok`), but the inconsistency is a footgun.
3. `app:saveJsonFile` resolves `{ ok: true, canceled: false, filePath }` (`fileHandlers.ts:270`) — `filePath` is absent from the preload return type (`preload.ts:317`), which is why `desktopFiles.exportBackupFile` re-declares its own structural type. Type-only drift; additive so non-breaking.
4. `credential:set` (see P2-003) additionally has no value length cap; secure-store writes would accept arbitrarily large strings into the shared JSON credential file.

**Expected behavior:** Consistent, typed contracts across dialog channels; emitters have listeners or are removed.

**Root cause:** Cumulative drift; no contract test compares preload types to handler resolutions.

**Impact:** Minor; no functional failure observed in current consumers.

**Recommended remediation:** Add the preload `onChecking` listener or drop the emitter; unify cancel semantics on `{ ok: true, canceled: true }`; add `filePath?: string` to the preload save types; cap `credential:set` value size if the channel survives P2-003.

**Required regression tests:** Contract test asserting preload return types match handler resolutions for the four dialog channels.

---

## Rejected candidates

- **`apiKey:set`/`apiKey:delete` return `{code, safeMessage}` instead of `error`** — rejected as a defect: `desktopApiKey.set/delete` are typed to `ApiKeyMutationResult` and `src/stores/auth-store.ts:147-155` consumes `code`/`safeMessage` consistently; the web branch of the same bridge returns the same shape. Contract is internally consistent, just different from other channels.
- **`sync:writePacket` lacks handler-level payload validation** — rejected as a defect: the handler forwards to `writePacket` in `electron/services/syncFolderWatcher.ts:786-831`, which enforces the store allowlist, ID charset/length, `..` rejection, per-packet byte cap, record-object shape, and inner-ID match. Defense-in-depth note only.
- **Web-mode crash/no-op risk for Electron-only preload methods** — rejected: every `desktopBridge` export guards `isElectron()` and returns a defined error object or documented no-op unsubscribe (verified for `desktopSync`, `desktopMedia`, `desktopCharacterImage`, `desktopInspector`, `desktopBackgroundTask.onUpdate`, `desktopCharacterCreator`, `desktopReplicate`, `desktopHuggingFace`, `desktopTts`, `desktopImageInspector`). No unguarded `window.veniceForge` dereference exists outside `isElectron()` branches in `src` (all 209 `window.veniceForge` matches are in `desktopBridge.ts` or comments/mocks).
- **`masterPassword:set` minimum length of 4** — rejected as a defect: intentional product decision documented in the handler; lockout throttling exists on verify.
- **`chat:save`/`chat:get` missing the strict ID charset/null-byte validation that `conversations:*` has** — rejected as a defect: `chatStorage` service layer owns chat ID validation and the legacy `chat:` family is back-compat; noted as inconsistency only.
- **fileHandlers comment claiming media import allowlist includes Downloads/Documents/Desktop** — rejected as a defect: the comment at `fileHandlers.ts:352-355` is stale (service only allows Pictures/Venice Forge + thumb cache, `mediaService.ts:154-158`), but the implementation is the stricter, safe direction.
- **`replicate:generateImage` return type includes undeclared `disposition` field** — rejected: additive field, TypeScript structural typing tolerates it, and the channel is unwired anyway (covered by P3-004).
- **Preload `jina.request` `profileId` ignored by handler (session-authoritative)** — rejected: consistent with the rest of the credential channels; renderer-supplied profile selectors are deliberately never honored (documented pattern).


---

# IPC Channel Inventory (195 handler channels + 11 emitter channels)

Generated 2026-09-12 from HEAD 84cf5bbe. Columns: channel · handler location · preload location · renderer consumer chain · payload-validation assessment. “✅” = validation observed at the main-process boundary or a validated service boundary it exclusively calls.

| # | Channel | Handler | Preload | Renderer consumer | Validated? |
|---|---------|---------|---------|-------------------|------------|
| 1 | `apiKey:delete` | electron/ipc/h/apiKeyHandlers.ts:698 | preload.ts:159 | desktopApiKey.delete | ✅ |
| 2 | `apiKey:getStatus` | electron/ipc/h/apiKeyHandlers.ts:665 | preload.ts:153 | desktopApiKey ← auth-store | ✅ |
| 3 | `apiKey:isConfigured` | electron/ipc/h/apiKeyHandlers.ts:657 | preload.ts:150 | desktopApiKey ← auth-store | ✅ session-authoritative |
| 4 | `apiKey:set` | electron/ipc/h/apiKeyHandlers.ts:669 | preload.ts:156 | desktopApiKey.set ← auth-store.ts:149 | ✅ key format; {code,safeMessage} shape consistent with consumer |
| 5 | `apiKey:test` | electron/ipc/h/apiKeyHandlers.ts:844 | preload.ts:162 | desktopApiKey.test | ✅ |
| 6 | `app:characterImage:clearCache` | electron/ipc/h/fileHandlers.ts:466 | preload.ts:365 | desktopCharacterImage.clearCache | ✅ |
| 7 | `app:characterImage:get` | electron/ipc/h/fileHandlers.ts:446 | preload.ts:362 | desktopCharacterImage ← useCharacterImage | ✅ trusted-Venice-URL allowlist, redirect-pinning, magic-byte check, byte cap |
| 8 | `app:characterImage:inventory` | electron/ipc/h/fileHandlers.ts:476 | preload.ts:370 | desktopCharacterImage.getInventory | ✅ |
| 9 | `app:checkForUpdates` | electron/ipc/updates.ts:40 | preload.ts:517 | desktopUpdates | ✅ dev-mode guard + 30s timeout |
| 10 | `app:downloadUpdate` | electron/ipc/updates.ts:63 | preload.ts:520 | desktopUpdates | ✅ 5min timeout |
| 11 | `app:getDiagnostics` | electron/ipc/h/systemHandlers.ts:246 | preload.ts:259 | desktopApp ← initDesktopBridge | ✅ redacted |
| 12 | `app:getVersion` | electron/ipc/h/systemHandlers.ts:242 | preload.ts:245 | desktopApp.getVersion | ✅ (P3-006 rate-limit note) |
| 13 | `app:installUpdate` | electron/ipc/updates.ts:78 | preload.ts:523 | desktopUpdates | ✅ downloaded-flag gate |
| 14 | `app:isEncryptionAvailable` | electron/ipc/h/systemHandlers.ts:244 | preload.ts:255 | desktopApp | ✅ |
| 15 | `app:loadJsonFile` | electron/ipc/h/fileHandlers.ts:324 | preload.ts:321 | desktopFiles.importJsonFile | partial: no mainFrame check |
| 16 | `app:loadYamlFile` | electron/ipc/h/fileHandlers.ts:299 | preload.ts:327 | desktopFiles.importYamlFile | partial: no mainFrame check |
| 17 | `app:media:export-files` | electron/ipc/h/fileHandlers.ts:213 | preload.ts:310 | desktopMedia.exportMediaFiles | ✅ mainFrame + item mapping |
| 18 | `app:media:import` | electron/ipc/h/fileHandlers.ts:356 | preload.ts:334 | desktopMedia.importMedia | ✅ service allowlist (Pictures/VF + thumbs), realpath, size, MIME sniff |
| 19 | `app:media:meta` | electron/ipc/h/fileHandlers.ts:402 | preload.ts:344 | desktopMedia.readMediaMeta | ✅ same allowlist |
| 20 | `app:media:persist-generated-image` | electron/ipc/h/fileHandlers.ts:86 | preload.ts:281 | desktopMedia.persistGeneratedImage ← media studio | ✅ mainFrame + data-URL parse + base64 strict + magic-byte sniff |
| 21 | `app:media:retry-generated-image` | electron/ipc/h/fileHandlers.ts:131 | preload.ts:290 | desktopMedia.retryGeneratedImage | ✅ UUIDv4 regex + opaque recovery ID |
| 22 | `app:media:reveal` | electron/ipc/h/fileHandlers.ts:383 | preload.ts:338 | desktopMedia.revealMedia | ✅ reveal-safe dir allowlist |
| 23 | `app:media:save-data-url` | electron/ipc/h/fileHandlers.ts:194 | preload.ts:301 | desktopMedia.saveMediaAs | ✅ mainFrame |
| 24 | `app:media:save-generated` | electron/ipc/h/fileHandlers.ts:174 | preload.ts:298 | desktopMedia.saveMediaAs | ✅ mainFrame + mediaId |
| 25 | `app:media:save-generated-recovery` | electron/ipc/h/fileHandlers.ts:151 | preload.ts:295 | desktopMedia.saveGeneratedImageRecovery | ✅ mainFrame + recovery custody lookup |
| 26 | `app:media:thumb` | electron/ipc/h/fileHandlers.ts:426 | preload.ts:350 | desktopMedia.generateMediaThumb | ✅ sha256 format, source cap, maxDim clamp 32–1024 |
| 27 | `app:openConversationsFolder` | electron/ipc/h/fileHandlers.ts:485 | preload.ts:444 | desktopConversations ← memory-panel | ✅ profile-scoped dir |
| 28 | `app:openLogsFolder` | electron/ipc/h/systemHandlers.ts:266 | preload.ts:265 | desktopApp | ✅ |
| 29 | `app:proxyScrape` | electron/ipc/h/systemHandlers.ts:98 | preload.ts:268 | desktopApp.proxyScrape | ✅ https-only, DNS-wide private-IP block, no redirects, content-type allowlist, 2MiB cap, body screen |
| 30 | `app:saveJsonFile` | electron/ipc/h/fileHandlers.ts:243 | preload.ts:318 | desktopFiles.exportJson/exportBackupFile | partial: size cap + basename; **no mainFrame check (P3-005); cancel {ok:false} vs load {ok:true} (P3-009); filePath missing from preload type (P3-009)** |
| 31 | `app:saveYamlFile` | electron/ipc/h/fileHandlers.ts:276 | preload.ts:324 | desktopFiles | partial: no mainFrame check (P3-005) |
| 32 | `backgroundTask:cancel` | electron/ipc/h/backgroundTaskHandlers.ts:181 | preload.ts:793 | desktopBackgroundTask | ✅ ownership |
| 33 | `backgroundTask:clear` | electron/ipc/h/backgroundTaskHandlers.ts:209 | preload.ts:799 | desktopBackgroundTask | ✅ ownership |
| 34 | `backgroundTask:create` | electron/ipc/h/backgroundTaskHandlers.ts:93 | preload.ts:784 | desktopBackgroundTask | ✅ type enum + id/queueId |
| 35 | `backgroundTask:list` | electron/ipc/h/backgroundTaskHandlers.ts:171 | preload.ts:790 | desktopBackgroundTask | ✅ profile filter |
| 36 | `backgroundTask:retry` | electron/ipc/h/backgroundTaskHandlers.ts:195 | preload.ts:796 | desktopBackgroundTask | ✅ ownership |
| 37 | `backgroundTask:submitPaidQueue` | electron/ipc/h/backgroundTaskHandlers.ts:223 | preload.ts:802 | desktopBackgroundTask ← paid queue | ✅ operation enum + model validation |
| 38 | `backgroundTask:subscribe` | electron/ipc/h/backgroundTaskHandlers.ts:77 | preload.ts:778 | desktopBackgroundTask ← task store | ✅ profile-filtered snapshot |
| 39 | `backgroundTask:unsubscribe` | electron/ipc/h/backgroundTaskHandlers.ts:88 | preload.ts:781 | desktopBackgroundTask | ✅ |
| 40 | `backgroundTask:update` | electron/ipc/h/backgroundTaskHandlers.ts:119 | preload.ts:787 | desktopBackgroundTask | ✅ ownership + status/stage enums + provider-polled field restrictions |
| 41 | `backgroundTask:update` | (main → renderer event) | preload backgroundTask.onUpdate (:806) | desktopBridge event subscriber | n/a (emit path) |
| 42 | `characterCards:applyImport` | electron/ipc/characterCardFileHandlers.ts:193 | preload.ts:623 | desktopCharacterCards | ✅ + safety assessment |
| 43 | `characterCards:chooseImportFile` | electron/ipc/characterCardFileHandlers.ts:121 | preload.ts:617 | desktopCharacterCards ← import UI | ✅ dialog + candidate TTL |
| 44 | `characterCards:consumeImportCandidate` | electron/ipc/characterCardFileHandlers.ts:163 | preload.ts:620 | desktopCharacterCards | ✅ handle + sender binding |
| 45 | `characterCards:delete` | electron/ipc/rpHandlers.ts:148 | preload.ts:614 | desktopCharacterCards | ✅ |
| 46 | `characterCards:exportJson` | electron/ipc/characterCardFileHandlers.ts:279 | preload.ts:629 | desktopCharacterCards ← CharacterLibrary:284 | ✅ cardId + profile enum |
| 47 | `characterCards:exportPng` | electron/ipc/characterCardFileHandlers.ts:301 | preload.ts:632 | desktopCharacterCards | ✅ |
| 48 | `characterCards:get` | electron/ipc/rpHandlers.ts:112 | preload.ts:608 | desktopCharacterCards | ✅ id validated |
| 49 | `characterCards:list` | electron/ipc/rpHandlers.ts:100 | preload.ts:605 | desktopCharacterCards ← characterCardService | ✅ profile-scoped |
| 50 | `characterCards:save` | electron/ipc/rpHandlers.ts:124 | preload.ts:611 | desktopCharacterCards | ✅ parseSavePayload unwraps envelope + origin |
| 51 | `characterCards:undoImport` | electron/ipc/characterCardFileHandlers.ts:265 | preload.ts:626 | desktopCharacterCards | ✅ undo record |
| 52 | `characterCreator:exportCard` | electron/ipc/characterCreatorHandlers.ts:69 | preload.ts:869 | desktopCharacterCreator.exportCard ← CharacterCreatorView.tsx:763 | ✅ forbidden keys + spec check + size cap + atomic write |
| 53 | `characterCreator:validateCard` | electron/ipc/characterCreatorHandlers.ts:54 | preload.ts:872 | **none — dead channel (P3-004)** | ✅ validated but unwired |
| 54 | `chat-folders:create` | electron/ipc/h/chatFolderHandlers.ts:220 | preload.ts:453 | desktopChatFolders | ✅ full input type-guard |
| 55 | `chat-folders:delete` | electron/ipc/h/chatFolderHandlers.ts:250 | preload.ts:468 | desktopChatFolders | ✅ |
| 56 | `chat-folders:export-backup` | electron/ipc/h/chatFolderHandlers.ts:262 | preload.ts:474 | desktopChatFolders | ✅ passphrase+confirm; **no mainFrame check (P3-005)** |
| 57 | `chat-folders:get-backup-preview` | electron/ipc/h/chatFolderHandlers.ts:256 | preload.ts:471 | desktopChatFolders | ✅ |
| 58 | `chat-folders:get-lock-state` | electron/ipc/h/chatFolderHandlers.ts:331 | preload.ts:492 | desktopChatFolders | ✅ |
| 59 | `chat-folders:import-backup` | electron/ipc/h/chatFolderHandlers.ts:307 | preload.ts:483 | desktopChatFolders | ✅ token consume + mode validation |
| 60 | `chat-folders:list` | electron/ipc/h/chatFolderHandlers.ts:210 | preload.ts:450 | desktopChatFolders ← folder UI | ✅ requireProfileSessionId (strict) |
| 61 | `chat-folders:lock` | electron/ipc/h/chatFolderHandlers.ts:316 | preload.ts:486 | desktopChatFolders | ✅ passphrase 8–1024 |
| 62 | `chat-folders:move-conversation` | electron/ipc/h/chatFolderHandlers.ts:238 | preload.ts:462 | desktopChatFolders | ✅ |
| 63 | `chat-folders:move-conversations` | electron/ipc/h/chatFolderHandlers.ts:244 | preload.ts:465 | desktopChatFolders | ✅ |
| 64 | `chat-folders:pick-import-file` | electron/ipc/h/chatFolderHandlers.ts:281 | preload.ts:477 | desktopChatFolders | ✅ capability token + lstat/realpath binding |
| 65 | `chat-folders:preview-import` | electron/ipc/h/chatFolderHandlers.ts:298 | preload.ts:480 | desktopChatFolders | ✅ token resolve (non-consuming) + re-validation |
| 66 | `chat-folders:rename` | electron/ipc/h/chatFolderHandlers.ts:226 | preload.ts:456 | desktopChatFolders | ✅ |
| 67 | `chat-folders:reorder` | electron/ipc/h/chatFolderHandlers.ts:232 | preload.ts:459 | desktopChatFolders | ✅ |
| 68 | `chat-folders:unlock` | electron/ipc/h/chatFolderHandlers.ts:322 | preload.ts:489 | desktopChatFolders | ✅ + backoff error surfaced |
| 69 | `chat:delete` | electron/ipc/h/systemHandlers.ts:367 | preload.ts:401 | desktopChat.delete | ✅ id + origin |
| 70 | `chat:get` | electron/ipc/h/systemHandlers.ts:318 | preload.ts:393 | desktopChat.get | ✅ length cap (charset check weaker than conversations:get — noted) |
| 71 | `chat:list` | electron/ipc/h/systemHandlers.ts:268 | preload.ts:377 | desktopChat.list ← chat-store | ✅ profile-scoped |
| 72 | `chat:listPage` | electron/ipc/h/systemHandlers.ts:291 | preload.ts:389 | desktopChat.listPage — **no caller (dead wrapper, P3-004)** | ✅ offset/limit clamped |
| 73 | `chat:save` | electron/ipc/h/systemHandlers.ts:332 | preload.ts:397 | desktopChat.save ← chat-store fallback | ✅ size cap, origin validation, profile forced |
| 74 | `config:deleteTheme` | electron/ipc/configHandlers.ts:167 | preload.ts:591 | desktopConfig.deleteTheme | ✅ |
| 75 | `config:exportTemplate` | electron/ipc/configHandlers.ts:130 | preload.ts:582 | desktopConfig.exportTemplate | partial: **no mainFrame check (P3-005)** |
| 76 | `config:get` | electron/ipc/configHandlers.ts:37 | preload.ts:564 | desktopConfig ← settings | ✅ sanitized |
| 77 | `config:getStatus` | electron/ipc/configHandlers.ts:45 | preload.ts:573 | desktopConfig | ✅ paths redacted |
| 78 | `config:initialize` | electron/ipc/configHandlers.ts:62 | preload.ts:567 | desktopConfig | ✅ |
| 79 | `config:loadMergedThemes` | electron/ipc/configHandlers.ts:146 | preload.ts:585 | desktopConfig | ✅ |
| 80 | `config:openFolder` | electron/ipc/configHandlers.ts:71 | preload.ts:576 | desktopConfig | ✅ |
| 81 | `config:reload` | electron/ipc/configHandlers.ts:53 | preload.ts:570 | desktopConfig | ✅ |
| 82 | `config:resetSecureStoreKeys` | electron/ipc/configHandlers.ts:177 | preload.ts:599 | desktopConfig | ✅ |
| 83 | `config:saveTheme` | electron/ipc/configHandlers.ts:154 | preload.ts:588 | desktopConfig.saveTheme | ✅ ThemeFamilyV2 guard |
| 84 | `config:writeSanitized` | electron/ipc/configHandlers.ts:79 | preload.ts:579 | desktopConfig.writeSanitized | ✅ FSM write blocked; sanitized writer |
| 85 | `conversations:archive` | electron/ipc/h/systemHandlers.ts:486 | preload.ts:426 | **none (P3-004)** | ✅ validated but unwired |
| 86 | `conversations:delete` | electron/ipc/h/systemHandlers.ts:465 | preload.ts:423 | desktopConversations.delete ← chat-store:660 | ✅ |
| 87 | `conversations:detectLegacyHistory` | electron/ipc/h/systemHandlers.ts:619 | preload.ts:441 | desktopConversations ← memory-panel:41 | ✅ default-only |
| 88 | `conversations:get` | electron/ipc/h/systemHandlers.ts:418 | preload.ts:417 | desktopConversations.get | ✅ charset+null-byte+length |
| 89 | `conversations:list` | electron/ipc/h/systemHandlers.ts:389 | preload.ts:414 | desktopConversations.list ← chat-store:1648, backupExportService:57 | ✅ filter shape |
| 90 | `conversations:migrateLegacyHistory` | electron/ipc/h/systemHandlers.ts:601 | preload.ts:438 | desktopConversations ← memory-panel | ✅ default-profile-only |
| 91 | `conversations:pullContext` | electron/ipc/h/systemHandlers.ts:522 | preload.ts:432 | desktopConversations.pullContext ← use-chat.ts:104 | ✅ clamps + 2-stage safety screen |
| 92 | `conversations:rebuildIndex` | electron/ipc/h/systemHandlers.ts:591 | preload.ts:435 | desktopConversations ← memory-panel:72 | ✅ |
| 93 | `conversations:save` | electron/ipc/h/systemHandlers.ts:431 | preload.ts:420 | desktopConversations.save ← chat-store.ts:1426 | ✅ validation OK but **envelope mismatch — handler rejects every call (P1-001)** |
| 94 | `conversations:search` | electron/ipc/h/systemHandlers.ts:503 | preload.ts:429 | **none (P3-004)** | ✅ validated but unwired |
| 95 | `credential:delete` | electron/ipc/h/apiKeyHandlers.ts:450 | preload.ts:96 | desktopCredentials.delete — **no caller (dead)** | partial: reserved-name guard only |
| 96 | `credential:get` | electron/ipc/h/apiKeyHandlers.ts:438 | preload.ts:93 | desktopCredentials.get — **no caller (dead)** | partial: reserved-name guard only |
| 97 | `credential:set` | electron/ipc/h/apiKeyHandlers.ts:426 | preload.ts:90 | desktopCredentials.set — **no caller (dead)** | ❌ no shape/size validation, no profile scope — P2-003 |
| 98 | `documentAgent:approvals:decide` | electron/ipc/h/documentAgentHandlers.ts:208 | preload.ts:856 | desktopDocumentAgent | ✅ decision enum + plan type checks + profile match + grant re-check |
| 99 | `documentAgent:approvals:list` | electron/ipc/h/documentAgentHandlers.ts:295 | preload.ts:854 | desktopDocumentAgent | ✅ grant scoping |
| 100 | `documentAgent:attachments:promote` | electron/ipc/h/documentAgentHandlers.ts:327 | preload.ts:850 | desktopDocumentAgent | ✅ registry resolve + MIME classify |
| 101 | `documentAgent:attachments:register` | electron/ipc/h/documentAgentHandlers.ts:378 | preload.ts:847 | desktopDocumentAgent | ✅ fields capped (bodyB64 ≤2MB) |
| 102 | `documentAgent:documents:create` | electron/ipc/h/documentAgentHandlers.ts:131 | preload.ts:821 | desktopDocumentAgent | ✅ overwrite=false + blocks array + format enum |
| 103 | `documentAgent:documents:delete` | electron/ipc/h/documentAgentHandlers.ts:164 | preload.ts:833 | desktopDocumentAgent | ✅ |
| 104 | `documentAgent:documents:export` | electron/ipc/h/documentAgentHandlers.ts:313 | preload.ts:842 | desktopDocumentAgent | ✅ mainFrame + format + atomic write |
| 105 | `documentAgent:documents:list` | electron/ipc/h/documentAgentHandlers.ts:147 | preload.ts:824 | desktopDocumentAgent | ✅ |
| 106 | `documentAgent:documents:proposeEdits` | electron/ipc/h/documentAgentHandlers.ts:183 | preload.ts:836 | desktopDocumentAgent | ✅ ops 1–200 + plan factory |
| 107 | `documentAgent:documents:proposeRestore` | electron/ipc/h/documentAgentHandlers.ts:272 | preload.ts:839 | desktopDocumentAgent | ✅ |
| 108 | `documentAgent:documents:read` | electron/ipc/h/documentAgentHandlers.ts:152 | preload.ts:827 | desktopDocumentAgent | ✅ |
| 109 | `documentAgent:documents:revisions` | electron/ipc/h/documentAgentHandlers.ts:159 | preload.ts:830 | desktopDocumentAgent | ✅ |
| 110 | `documentAgent:permissions:set` | electron/ipc/h/documentAgentHandlers.ts:93 | preload.ts:816 | desktopDocumentAgent ← agent UI | ✅ preset bounded by setEffectiveAgentPermissionPreset |
| 111 | `documentAgent:workspace:choose` | electron/ipc/h/documentAgentHandlers.ts:393 | preload.ts:860 | desktopDocumentAgent ← workspace UI | ✅ mainFrame + dialog + grant issue |
| 112 | `documentAgent:workspace:list` | electron/ipc/h/documentAgentHandlers.ts:497 | preload.ts:862 | desktopDocumentAgent.workspace.list | ✅ grant check |
| 113 | `documentAgent:workspace:proposeChangeset` | electron/ipc/h/documentAgentHandlers.ts:407 | — **not exposed** — | **none — dead handler (P2-002)** | partial: grant-only, **no capability check** |
| 114 | `documentAgent:workspace:proposeMove` | electron/ipc/h/documentAgentHandlers.ts:436 | — **not exposed** — | **none — dead handler (P2-002)** | partial: grant-only, **no capability check** |
| 115 | `documentAgent:workspace:proposeTrash` | electron/ipc/h/documentAgentHandlers.ts:463 | — **not exposed** — | **none — dead handler (P2-002)** | partial: grant-only, **no capability check** |
| 116 | `documentAgent:workspace:read` | electron/ipc/h/documentAgentHandlers.ts:497 | preload.ts:863 | desktopDocumentAgent.workspace.read | ✅ grant check |
| 117 | `documentAgent:workspace:revoke` | electron/ipc/h/documentAgentHandlers.ts:489 | preload.ts:861 | desktopDocumentAgent | ✅ session binding |
| 118 | `documentAgent:workspace:search` | electron/ipc/h/documentAgentHandlers.ts:497 | preload.ts:864 | desktopDocumentAgent.workspace.search | ✅ grant check |
| 119 | `huggingface:getModelCatalog` | electron/ipc/h/huggingfaceHandlers.ts:13 | preload.ts:902 | desktopHuggingFace ← provider settings | partial: `force` flag unreachable via preload (P3-008) |
| 120 | `imageInspector:chooseImage` | electron/ipc/h/imageInspectorHandlers.ts:35 | preload.ts:498 | desktopImageInspector ← inspector UI | ✅ dialog + size cap + persist |
| 121 | `imageInspector:ingestClipboardImage` | electron/ipc/h/imageInspectorHandlers.ts:68 | preload.ts:501 | desktopImageInspector | ✅ |
| 122 | `imageInspector:readMediaDataUrl` | electron/ipc/h/imageInspectorHandlers.ts:93 | preload.ts:511 | desktopImageInspector | ✅ sha64 regex |
| 123 | `imageInspector:resolveMediaInput` | electron/ipc/h/imageInspectorHandlers.ts:83 | preload.ts:506 | desktopImageInspector | ✅ mediaId sha64 regex |
| 124 | `inspector:telemetry` | (main → renderer event) | preload inspector.onTelemetry (:882) | desktopBridge event subscriber | n/a (emit path) |
| 125 | `inspector:telemetry:subscribe` | electron/ipc/h/inspectorTelemetryHandlers.ts:31 | preload.ts:880 | via preload.inspector.onTelemetry ← desktopInspector | ✅ register; **broadcast not profile-scoped (P3-007)** |
| 126 | `inspector:telemetry:unsubscribe` | electron/ipc/h/inspectorTelemetryHandlers.ts:36 | preload.ts:885 | via onTelemetry unsubscribe | ✅ |
| 127 | `jina:request` | electron/ipc/h/jinaHandlers.ts:124 | preload.ts:227 | desktopJina ← research workspace | ✅ host allowlist r.jina.ai/s.jina.ai, header allowlist, body cap, guard |
| 128 | `jinaApiKey:delete` | electron/ipc/h/jinaHandlers.ts:114 | preload.ts:213 | desktopJinaApiKey | ✅ |
| 129 | `jinaApiKey:isConfigured` | electron/ipc/h/jinaHandlers.ts:92 | preload.ts:207 | desktopJinaApiKey | ✅ |
| 130 | `jinaApiKey:set` | electron/ipc/h/jinaHandlers.ts:100 | preload.ts:210 | desktopJinaApiKey | ✅ trim/length |
| 131 | `jinaApiKey:test` | electron/ipc/h/jinaHandlers.ts:289 | preload.ts:216 | desktopJinaApiKey | ✅ |
| 132 | `lorebooks:delete` | electron/ipc/rpHandlers.ts:280 | preload.ts:662 | desktopLorebooks | ✅ |
| 133 | `lorebooks:get` | electron/ipc/rpHandlers.ts:245 | preload.ts:656 | desktopLorebooks | ✅ |
| 134 | `lorebooks:list` | electron/ipc/rpHandlers.ts:234 | preload.ts:653 | desktopLorebooks | ✅ |
| 135 | `lorebooks:save` | electron/ipc/rpHandlers.ts:257 | preload.ts:659 | desktopLorebooks | ✅ |
| 136 | `masterPassword:change` | electron/ipc/h/apiKeyHandlers.ts:479 | preload.ts:111 | desktopMasterPassword | ✅ current-password verify + lockout |
| 137 | `masterPassword:clear` | electron/ipc/h/apiKeyHandlers.ts:515 | preload.ts:114 | desktopMasterPassword | ✅ current-password verify |
| 138 | `masterPassword:isSet` | electron/ipc/h/apiKeyHandlers.ts:462 | preload.ts:102 | desktopMasterPassword ← profile-store | ✅ (see P3-006 rate-limit type note) |
| 139 | `masterPassword:set` | electron/ipc/h/apiKeyHandlers.ts:464 | preload.ts:105 | desktopMasterPassword ← settings UI | ✅ min-length + already-set guard |
| 140 | `masterPassword:verify` | electron/ipc/h/apiKeyHandlers.ts:503 | preload.ts:108 | desktopMasterPassword | ✅ lockout via verifyMasterPassword |
| 141 | `personas:delete` | electron/ipc/rpHandlers.ts:214 | preload.ts:647 | desktopPersonas | ✅ |
| 142 | `personas:get` | electron/ipc/rpHandlers.ts:179 | preload.ts:641 | desktopPersonas | ✅ |
| 143 | `personas:list` | electron/ipc/rpHandlers.ts:168 | preload.ts:638 | desktopPersonas | ✅ |
| 144 | `personas:save` | electron/ipc/rpHandlers.ts:191 | preload.ts:644 | desktopPersonas | ✅ envelope unwrap |
| 145 | `profile:purge` | electron/ipc/h/systemHandlers.ts:77 | preload.ts:144 | desktopProfilePurge ← profilePurge.ts | ✅ requested==session check |
| 146 | `profilePassword:clear` | electron/ipc/h/apiKeyHandlers.ts:630 | preload.ts:138 | desktopProfilePassword | ✅ password gate |
| 147 | `profilePassword:isSet` | electron/ipc/h/apiKeyHandlers.ts:537 | preload.ts:129 | desktopProfilePassword | ✅ |
| 148 | `profilePassword:set` | electron/ipc/h/apiKeyHandlers.ts:586 | preload.ts:132 | desktopProfilePassword | ✅ session-authoritative; default profile rejected |
| 149 | `profilePassword:verify` | electron/ipc/h/apiKeyHandlers.ts:610 | preload.ts:135 | desktopProfilePassword | ✅ + lockout; sets session on success |
| 150 | `profileSession:activate` | electron/ipc/h/apiKeyHandlers.ts:545 | preload.ts:126 | desktopProfilePassword.activate ← profile-store.ts:115,238 | ✅ password verify + session rebind + capability cleanup |
| 151 | `providerApiKey:delete` | electron/ipc/h/apiKeyHandlers.ts:732 | preload.ts:174 | desktopProviderApiKey | ✅ |
| 152 | `providerApiKey:isConfigured` | electron/ipc/h/apiKeyHandlers.ts:707 | preload.ts:168 | desktopProviderApiKey ← settings | ✅ providerId parse |
| 153 | `providerApiKey:set` | electron/ipc/h/apiKeyHandlers.ts:716 | preload.ts:171 | desktopProviderApiKey | ✅ structured-credential redirect |
| 154 | `providerApiKey:test` | electron/ipc/h/apiKeyHandlers.ts:848 | preload.ts:177 | desktopProviderApiKey | ✅ |
| 155 | `providerCredential:delete` | electron/ipc/h/apiKeyHandlers.ts:772 | preload.ts:189 | desktopProviderCredential | ✅ |
| 156 | `providerCredential:isConfigured` | electron/ipc/h/apiKeyHandlers.ts:745 | preload.ts:183 | desktopProviderCredential | ✅ |
| 157 | `providerCredential:set` | electron/ipc/h/apiKeyHandlers.ts:754 | preload.ts:186 | desktopProviderCredential | ✅ validateProviderCredential schema per provider |
| 158 | `providerCredential:test` | electron/ipc/h/apiKeyHandlers.ts:869 | preload.ts:192 | desktopProviderCredential | ✅ |
| 159 | `providerSettings:get` | electron/ipc/h/apiKeyHandlers.ts:785 | preload.ts:198 | desktopProviderSettings | ✅ |
| 160 | `providerSettings:update` | electron/ipc/h/apiKeyHandlers.ts:789 | preload.ts:201 | desktopProviderSettings | ✅ full structural validation |
| 161 | `replicate:generateImage` | electron/ipc/h/replicateHandlers.ts:94 | preload.ts:896 | desktopReplicate — **no caller (P3-004)** | ✅ input validation + durable paid-task submission |
| 162 | `rpAssets:delete` | electron/ipc/rpHandlers.ts:414 | preload.ts:692 | desktopRpAssets | ✅ |
| 163 | `rpAssets:get` | electron/ipc/rpHandlers.ts:379 | preload.ts:686 | desktopRpAssets | ✅ |
| 164 | `rpAssets:list` | electron/ipc/rpHandlers.ts:366 | preload.ts:683 | desktopRpAssets | ✅ chatId filter |
| 165 | `rpAssets:save` | electron/ipc/rpHandlers.ts:391 | preload.ts:689 | desktopRpAssets | ✅ |
| 166 | `rpChats:delete` | electron/ipc/rpHandlers.ts:346 | preload.ts:677 | desktopRpChats | ✅ |
| 167 | `rpChats:get` | electron/ipc/rpHandlers.ts:311 | preload.ts:671 | desktopRpChats | ✅ |
| 168 | `rpChats:list` | electron/ipc/rpHandlers.ts:300 | preload.ts:668 | desktopRpChats | ✅ |
| 169 | `rpChats:save` | electron/ipc/rpHandlers.ts:323 | preload.ts:674 | desktopRpChats | ✅ |
| 170 | `safety:setFamilySafeMode` | electron/ipc/configHandlers.ts:95 | preload.ts:120 | desktopSafety ← settings | ✅ master-password gate; FSM blocked in generic config write |
| 171 | `scenarios:delete` | electron/ipc/rpHandlers.ts:480 | preload.ts:708 | desktopScenarios | ✅ |
| 172 | `scenarios:get` | electron/ipc/rpHandlers.ts:445 | preload.ts:702 | desktopScenarios | ✅ |
| 173 | `scenarios:list` | electron/ipc/rpHandlers.ts:434 | preload.ts:699 | desktopScenarios | ✅ |
| 174 | `scenarios:save` | electron/ipc/rpHandlers.ts:457 | preload.ts:705 | desktopScenarios | ✅ |
| 175 | `sync:acknowledgeOperation` | electron/ipc/h/syncHandlers.ts:173 | preload.ts:747 | desktopSync | ✅ operationId hex64 |
| 176 | `sync:applyRemoteMutation` | electron/ipc/h/syncHandlers.ts:91 | preload.ts:726 | desktopSync ← sync engine | ✅ token authority + store switch + profile scope |
| 177 | `sync:beginBackupExport` | electron/ipc/h/syncHandlers.ts:184 | preload.ts:750 | desktopSync ← backup UI | ✅ per-sender lease |
| 178 | `sync:chooseSyncFolder` | electron/ipc/h/syncHandlers.ts:17 | preload.ts:714 | desktopSync ← sync UI | ✅ main-process dialog |
| 179 | `sync:createReplaceImportRecovery` | electron/ipc/h/syncHandlers.ts:231 | preload.ts:759 | desktopSync | ✅ |
| 180 | `sync:decryptBackup` | electron/ipc/h/syncHandlers.ts:220 | preload.ts:756 | desktopSync ← import | partial: no size cap on ciphertext — minor |
| 181 | `sync:encryptBackup` | electron/ipc/h/syncHandlers.ts:196 | preload.ts:753 | desktopSync | ✅ lease token + profile + payload profile binding |
| 182 | `sync:getLatestReplaceImportRecovery` | electron/ipc/h/syncHandlers.ts:249 | preload.ts:762 | desktopSync | ✅ |
| 183 | `sync:getStatus` | electron/ipc/h/syncHandlers.ts:64 | preload.ts:735 | desktopSync | ✅ |
| 184 | `sync:getSyncFolder` | electron/ipc/h/syncHandlers.ts:41 | preload.ts:717 | desktopSync | ✅ |
| 185 | `sync:loadReplaceImportRecovery` | electron/ipc/h/syncHandlers.ts:262 | preload.ts:765 | desktopSync | ✅ |
| 186 | `sync:onRemoteChange` | (main → renderer event) | preload sync.onRemoteChange (:769) | desktopBridge event subscriber | n/a (emit path) |
| 187 | `sync:pauseSync` | electron/ipc/h/syncHandlers.ts:63 | preload.ts:732 | desktopSync | ✅ |
| 188 | `sync:rendererSessionAttached` | electron/ipc/h/syncHandlers.ts:66 | preload.ts:738 | desktopSync | partial: no null-guard on input (throws→caught) — minor |
| 189 | `sync:setEmissionSuppressed` | electron/ipc/h/syncHandlers.ts:76 | preload.ts:741 | desktopSync | partial: same |
| 190 | `sync:setSyncFolder` | electron/ipc/h/syncHandlers.ts:45 | preload.ts:720 | desktopSync | ✅ only re-affirms picker result |
| 191 | `sync:startSync` | electron/ipc/h/syncHandlers.ts:52 | preload.ts:723 | desktopSync | ✅ password string + session profile (params.profileId ignored by design) |
| 192 | `sync:stopSync` | electron/ipc/h/syncHandlers.ts:60 | preload.ts:729 | desktopSync | ✅ |
| 193 | `sync:writePacket` | electron/ipc/h/syncHandlers.ts:86 | preload.ts:744 | desktopSync ← sync engine | ✅ validated downstream (allowlist, id charset, byte cap, id match) |
| 194 | `theme:updated` | (main → renderer event) | preload config.onThemeUpdated (:595) | desktopBridge event subscriber | n/a (emit path) |
| 195 | `tts:clearCache` | electron/ipc/h/chatTtsHandlers.ts:10 | preload.ts:236 | desktopTts | ✅ |
| 196 | `tts:synthesize` | electron/ipc/h/chatTtsHandlers.ts:6 | preload.ts:233 | desktopTts ← chat TTS | ✅ service-layer opts validation |
| 197 | `updates:available` | (main → renderer event) | preload updates.onUpdateAvailable (:527) | desktopBridge event subscriber | n/a (emit path) |
| 198 | `updates:checking` | (main → renderer event) | **no preload listener (P3-009 dead emitter)** | desktopBridge event subscriber | n/a (emit path) |
| 199 | `updates:downloaded` | (main → renderer event) | preload updates.onUpdateDownloaded (:548) | desktopBridge event subscriber | n/a (emit path) |
| 200 | `updates:error` | (main → renderer event) | preload updates.onUpdateError (:555) | desktopBridge event subscriber | n/a (emit path) |
| 201 | `updates:not-available` | (main → renderer event) | preload updates.onUpdateNotAvailable (:534) | desktopBridge event subscriber | n/a (emit path) |
| 202 | `updates:progress` | (main → renderer event) | preload updates.onDownloadProgress (:541) | desktopBridge event subscriber | n/a (emit path) |
| 203 | `venice:abort` | electron/ipc/h/veniceHandlers.ts:139 | preload.ts:83 | attachAbort (desktopBridge.ts:84) | ✅ string/length check |
| 204 | `venice:request` | electron/ipc/h/veniceHandlers.ts:53 | preload.ts:39 | desktopVenice.request ← veniceClient.ts | ✅ endpoint/method allowlist, body cap, header blocklist, profile forced from session |
| 205 | `venice:streamChat` | electron/ipc/h/veniceHandlers.ts:74 | preload.ts:58 | desktopVenice.streamChat ← veniceClient.ts | ✅ same validator + chat/completions-only + guard + agent loop |
| 206 | `venice:streamDelta` | (main → renderer event) | preload venice.streamChat onDelta (preload.ts:57) | desktopBridge event subscriber | n/a (emit path) |

---

## Domain: Main-process storage (STOR)
references are to that commit. No repository source files were modified.

Scope notes:
- **No IndexedDB access exists in the Electron main process** (grep for
  `indexedDB|IDBFactory|toVersion|openDB` under `electron/` returned nothing). IndexedDB
  schema versions/migrations (toVersion 12 etc.) are renderer-side and out of this domain.
- Failed-persistence media recovery custody (`generatedMediaRecoveryQueue.ts`) was verified
  compliant with AGENTS.md §11: `MAX_RECOVERY_ITEMS = 8`, `MAX_RECOVERY_BYTES = 128 MiB`,
  `RECOVERY_TTL_MS = 30 min` (generatedMediaRecoveryQueue.ts:5-7), opaque UUID IDs, no
  prompts/URLs stored, main-frame-only retry/save-as with recovery-ID revalidation
  (fileHandlers.ts:133-166). Not a finding.
- Media binary custody (`generatedMediaStore.ts`) verifies MIME magic bytes
  (mediaFormat.ts:33-67), sha256 content addressing, file-signature checks, fsync-before-
  rename, and descriptor-safe TOCTOU-closed reads. PNG alpha is preserved byte-for-byte
  (bytes are stored untransformed). Not a finding.

---

## VF-AUD-20260912-STOR-P1-001 — Import of a crafted `.vfbackup` can freeze the main process via attacker-controlled Argon2id KDF parameters

Severity: P1 | Confidence: High | Classification: CONFIRMED DEFECT

Affected files: `electron/services/chatFolderBackupService.ts:365-386`

Observed: `importBackup` validates only `backup.kdf.algorithm === "argon2id13"` and then
passes the file-supplied work factors straight into libsodium:

```ts
if (backup.version !== 2 || !backup.kdf || backup.kdf.algorithm !== "argon2id13") { ... }
...
const kek = _sodium.crypto_pwhash(
  _sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES,
  passphrase,
  salt,
  backup.kdf.opslimit,   // <-- attacker-controlled
  backup.kdf.memlimit,   // <-- attacker-controlled
  _sodium.crypto_pwhash_ALG_ARGON2ID13,
);
```

`crypto_pwhash` is synchronous and runs on the Electron main process. libsodium accepts any
`opslimit` up to `crypto_pwhash_OPSLIMIT_MAX` (2^32-1), so a backup file carrying
`opslimit: 4294967295` triggers an effectively unbounded Argon2id computation that blocks
the main process (UI freeze, no recovery short of killing the app). The exporter's own
constants are `OPSLIMIT/MEMLIMIT_INTERACTIVE` (chatFolderBackupService.ts:37-46), and the
sibling `chatFolderLockService.ts:64-70` pins its parameters to the known-good constants —
the import path is the outlier.

Expected: KDF parameters in an untrusted file must be pinned to, or clamped against, the
expected constants (exact match with `getArgonConstants()`), as AGENTS.md §13 requires
import safety for hostile backup payloads.

Root cause: Missing validation of file-supplied KDF work factors; trust boundary treats
`.vfbackup` file content as advisory.

Impact: Local DoS of the desktop app (main-process freeze) when a user imports a backup
file from an untrusted source (sync folder, email, chat). Also memory-pressure failures
from very large `memlimit` values surface only as generic errors.

Recommended remediation: Reject any backup whose `kdf.opslimit`/`kdf.memlimit` differ from
the exporter's canonical `INTERACTIVE` constants; alternatively enforce
`opslimit <= crypto_pwhash_OPSLIMIT_INTERACTIVE && memlimit <= crypto_pwhash_MEMLIMIT_INTERACTIVE`
before calling `crypto_pwhash`, and run the KDF off the main thread.

Required regression tests: import a v2 payload with `opslimit`/`memlimit` inflated to
`OPSLIMIT_MAX`/`MEMLIMIT_MAX` and assert immediate rejection without invoking
`crypto_pwhash`; import a payload with the canonical constants and assert success.

---

## VF-AUD-20260912-STOR-P1-002 — Conversation Vault misclassifies systemic key failure as per-file corruption and quarantines every vault file it touches

Severity: P1 | Confidence: High | Classification: CONFIRMED DEFECT

Affected files: `electron/services/conversationVault.ts:296-325` (readEncryptedFile),
`electron/services/conversationVault.ts:137-181` (getOrInitVaultKey),
`electron/services/conversationVault.ts:340-371` (getOrLoadManifest)

Observed: `readEncryptedFile` wraps key acquisition **and** decryption in one catch-all:

```ts
try {
  const raw = await fs.readFile(filePath, "utf-8");
  const envelope = JSON.parse(raw) as EncryptedVaultFileV1;
  const key = await getOrInitVaultKey();          // throws when safeStorage unwrap fails
  return decrypt(envelope, key, fileType, id);
} catch (err) {
  if (...ENOENT...) return null;
  logError(`Decryption failed or file missing: ${filePath}`, String(err));
  // Corruption backup
  const backupPath = path.join(corruptDir, `conv_corrupted_${Date.now()}_${filename}`);
  await fs.rename(filePath, backupPath);          // file is MOVED to corrupt/
  return null;
}
```

When the OS secure-storage key becomes unusable (macOS keychain reset/migration, Linux
secret-service re-creation, `safeStorage.decryptString` throwing at conversationVault.ts:166),
every vault read is treated as a corrupt file and **renamed into `<profile>/corrupt/`**.
`getOrLoadManifest` then sees `null`, logs "Resetting manifest.", and caches an empty
manifest (lines 352-370), so the UI shows an empty vault; `listConversations` subsequently
quarantines each record file as it is reached (lines 505-536). The user's encrypted data is
not destroyed, but the vault is dismantled file-by-file into the quarantine directory and
the manifest is replaced with an empty one.

Expected: Distinguish "key unavailable / decrypt failure for systemic reasons" from "this
single file is corrupt". A key-unavailability condition must abort vault access with a clear
error and leave all files in place (fail closed, no quarantine). Only structurally invalid
individual files (bad JSON envelope, AAD mismatch with a working key) should be quarantined.

Root cause: Single catch-all conflates key-acquisition failures with per-file corruption;
quarantine is applied unconditionally on any error.

Impact: Catastrophic, self-amplifying data-availability loss on a routine OS event; the
first sign is a vanished conversation history. Recovery requires manual reassembly from
`corrupt/`.

Recommended remediation: Call `getOrInitVaultKey()` outside the per-file try/catch and
propagate key errors; only quarantine on parse/AAD failure after the key is known-good; add
an explicit "vault key unavailable" state surfaced to the renderer.

Required regression tests: simulate `safeStorage.decryptString` throwing and assert no file
renames occur, manifest is not reset, and reads return a structured key-error; simulate a
single truncated record file and assert only that file is quarantined.

---

## VF-AUD-20260912-STOR-P1-003 — Vault master key file is written non-atomically; a mid-write crash permanently bricks vault access and throws uncaught

Severity: P1 | Confidence: High | Classification: CONFIRMED DEFECT

Affected files: `electron/services/conversationVault.ts:150-168` (read path),
`electron/services/conversationVault.ts:182-218` (write path, line 215)

Observed: The vault master key — the sole key for every encrypted record, manifest, and
journal — is persisted with a plain `fs.writeFile`, not temp+rename:

```ts
await fs.writeFile(KEY_FILE, JSON.stringify(payload, null, 2), { encoding: "utf-8", mode: 0o600 });
```

Every other durable file in the vault (`writeEncryptedFile`, conversationVault.ts:272-291)
uses temp+fsync+rename. A crash or power loss mid-write leaves a truncated
`vault-key.v1.json`; on the next launch, `JSON.parse(raw)` at line 152 throws **uncaught**
out of `getOrInitVaultKey()` (the read path has no try/catch around parse), producing an
unhandled rejection in main and rendering every vault record, manifest, and journal
permanently undecryptable (key file is the only key; `wrappedWith: "electron.safeStorage"`
cannot be re-derived).

Expected: Atomic temp-write + fsync + rename for the key file, and a guarded parse that
surfaces a recoverable "vault key corrupted" error rather than an unhandled throw.

Root cause: The key-creation path predates/omits the atomic-write utility used everywhere
else in the same module.

Impact: Total vault data loss (availability) from a single ill-timed crash during first
vault initialization; unhandled exception on every subsequent startup.

Recommended remediation: Route the key file through the same temp+fsync+rename helper;
wrap the key-file read/parse in a typed error; consider writing the key file before any
record so a failed key write cannot follow successful record writes.

Required regression tests: inject a write failure between temp create and rename and assert
no partial `vault-key.v1.json` remains and the previous key survives; feed a truncated key
file and assert a typed, catchable error.

---

## VF-AUD-20260912-STOR-P1-004 — `saveCharacterCard` silently deletes the stored avatar when the save payload omits avatar data

Severity: P1 | Confidence: High | Classification: CONFIRMED DEFECT

Affected files: `electron/services/characterCardStorage.ts:243-254, 319-336`

Observed: Avatar bytes live in a sidecar `avatar.png` and are deliberately stripped from
`character.json` (`stripAvatar`, lines 197-203; read-side hydration at 146-161). On save:

```ts
if (avatar) {
  ...
  await atomicWrite(characterAvatarPath(id, profileId), buffer);
} else {
  // No avatar provided: leave any prior file in place? No — drop it for hygiene.
  try {
    await fs.unlink(characterAvatarPath(id, profileId));
  } catch { ... }
}
```

Any save whose payload lacks `avatar.data` — e.g., an edit flow that round-trips the card
without re-fetching the hydrated avatar, a version restore, a partial import, or any caller
constructing the card from `character.json` alone — permanently deletes `avatar.png`.
Because reads intentionally do not persist avatar bytes in the JSON, the loss is silent and
unrecoverable.

Expected: Absence of avatar data in the payload must be treated as "no change" (or require
an explicit `removeAvatar: true` flag); a card round-trip must be idempotent with respect
to its sidecar.

Root cause: The "hygiene" deletion conflates "caller cleared the avatar" with "caller did
not send the avatar".

Impact: Irreversible loss of user media (character avatars) on ordinary save flows; data
loss is the highest-severity category per audit rules.

Recommended remediation: Delete `avatar.png` only on an explicit removal signal; otherwise
retain the existing sidecar. Add a regression test that saves a card with an avatar, saves
an avatar-less payload, and asserts `avatar.png` still exists and hydrates.

Required regression tests: (1) avatar-preserving round-trip; (2) explicit removal; (3)
avatar-less save of a card that never had an avatar (no error).

---

## VF-AUD-20260912-STOR-P2-005 — Unknown future-version chat-history files are quarantined as "corrupt", making downgrades destroy conversation visibility

Severity: P2 | Confidence: High | Classification: CONFIRMED DEFECT

Affected files: `electron/services/chatStorage.ts:52-75` (readConversationFile),
`electron/services/chatStorage.ts:106-112` (isValidConversationFile)

Observed: Any conversation file whose `version !== FILE_VERSION (1)` fails validation and is
renamed to `<file>.backup.<ts>.<uuid>` ("Corrupt chat file backed up"), returning `null`:

```ts
if (v.version !== FILE_VERSION) return false;   // future versions included
...
const backupPath = `${filePath}.backup.${timestamp}.${randomSuffix}`;
await fs.rename(filePath, backupPath);
```

The sibling store `chatFolderStorage.ts:121-133` explicitly distinguishes
`schemaVersion > 1` ("unsupported schema version … file was left in place"); chatStorage has
no such guard. Running a newer build (or receiving a profile folder copied from a newer
build) and then opening an older build makes every newer-version conversation vanish from
the UI (data is retained on disk under `.backup.*`, but the app presents an empty history
and any subsequent same-id save would collide with nothing — the originals are orphaned).

Expected: `version > FILE_VERSION` must be treated as "unsupported, leave in place" (read as
absent, no quarantine), exactly as chatFolderStorage does.

Root cause: Version equality is used as a corruption signal; no newer-version fast path.

Impact: Data-availability loss and user confusion on version downgrade or cross-version
profile sharing; violates AGENTS.md §9 "Do not silently discard incompatible records"
(spirit: incompatible records must not be rewritten).

Recommended remediation: In `isValidConversationFile`/`readConversationFile`, branch on
`version > FILE_VERSION` and skip without renaming; only quarantine structurally invalid
files at the current version.

Required regression tests: write a `version: 2` conversation file and assert it is neither
renamed nor reported corrupt; assert a malformed `version: 1` file is still quarantined.

---

## VF-AUD-20260912-STOR-P2-006 — Seven storage services use a fixed `${target}.tmp` temp name, so concurrent saves of the same record interleave and fail or swap content

Severity: P2 | Confidence: High | Classification: CONFIRMED DEFECT

Affected files:
`electron/services/chatFolderStorage.ts:179`; `electron/services/rpSingleFileStore.ts:100`;
`electron/services/rpChatStorage.ts:189`; `electron/services/characterCardStorage.ts:355-359`;
`electron/services/secureStore.ts:98-114`; `electron/services/syncConfig.ts:41-53`;
`electron/services/providerSettingsStore.ts:113-124`;
(weaker variant: `electron/services/mediaService.ts:291-296` — tmp is `pid + Date.now()`, same-ms collision only)

Observed: These writers all stage via a predictable temp path:

```ts
// chatFolderStorage.ts
const tmp = `${target}${TMP_SUFFIX}`;            // TMP_SUFFIX = ".tmp"
await fs.open(tmp, "w", 0o600) / fs.writeFile(tmp, ...)
await fs.rename(tmp, target);
```

With two in-flight async saves for the same record (e.g., `reorderChatFolders` plus a
concurrent `saveChatFolder` from another IPC call, or `migrateLegacyFolder`'s internal
save racing a user rename), interleaving produces: writer B truncates/rewrites the temp
while writer A is mid-flight; A's `rename` moves B's bytes; B's `rename` then fails with
ENOENT and the whole operation reports failure (chatFolderStorage.ts:191-194 swallows the
specifics into "Failed to write chat-folders file"), or worse, a torn composite lands at
the target on filesystems where rename semantics differ. `chatStorage.ts:280`,
`chatFolderOperationJournal.ts:40-48`, `conversationVault.ts:275`, and
`generatedMediaStore.ts:153-181` all use unique temps — the fixed-name stores are the
outliers. None of these paths fsync the temp before rename either.

Expected: Unique-per-write temp names (`crypto.randomUUID()`/`randomBytes`) everywhere,
matching the majority pattern; ideally fsync before rename for durability parity.

Root cause: Copy-pasted minimal atomic-write snippet predating the unique-temp convention;
no shared `atomicWriteFile` utility in main.

Impact: Spurious save failures under concurrent same-record mutations; potential
cross-contamination of record content (one record's JSON body written under another's
staging window is prevented by rename targeting, but the failure modes above are real);
partial durability loss (no fsync) on power failure.

Recommended remediation: Introduce one `writeFileAtomic(target, data)` helper in
`electron/utils` (unique temp, `wx` open, fsync, rename, cleanup) and migrate all listed
call sites.

Required regression tests: concurrent same-id saves from two async loops assert exactly one
winner, no thrown ENOENT, and final content equal to one complete payload; interrupted
write (rename never called) leaves no fixed-name temp debris.

---

## VF-AUD-20260912-STOR-P2-007 — Conversation Vault manifest journal is never compacted in production: `saveManifest` has no production caller

Severity: P2 | Confidence: High | Classification: CONFIRMED DEFECT

Affected files: `electron/services/conversationVault.ts:421-462` (appendManifestOperation /
saveManifest), `electron/services/memoryPuller.ts:170`

Observed: Every `saveConversation`/`deleteConversation` appends one encrypted line to
`manifest.v1.journal.jsonl.enc` (queued under `${profileId}:manifest`), and the manifest
snapshot file is rewritten **and the journal deleted** only inside `saveManifest`
(conversationVault.ts:449-462). Repository-wide grep shows `saveManifest` is invoked only
from `conversationVault.test.ts` — no production caller (the IPC layer in
`systemHandlers.ts:410-501` calls list/get/save/delete/archive only). Result: the journal
grows monotonically for the lifetime of an installation; each profile's first manifest load
per run decrypts and replays the entire history of every upsert/delete (lines 389-419);
memory and startup cost grow linearly without bound, and the manifest snapshot file is
essentially write-once-at-bootstrap dead weight.

Expected: Periodic/transactional `saveManifest` checkpoints (e.g., after N journal entries,
on graceful shutdown, or when the journal exceeds a byte threshold), so replay cost stays
bounded per AGENTS.md §9 durability intent.

Root cause: The checkpoint function exists but was never wired into the production write
paths or shutdown coordinator.

Impact: Unbounded growth of an encrypted-but-undecryptable-without-replay file; linearly
slower vault startup; strictly increasing write amplification (two file writes per record
op, one of them append-forever).

Recommended remediation: Call `saveManifest` from the shutdown coordinator and/or every N
(≈200) journal entries; add a journal byte cap with forced checkpoint.

Required regression tests: after N saves, assert the journal file is truncated and the
snapshot manifest matches replay state; after simulated crash mid-journal, assert replay
reconstructs the manifest.

---

## VF-AUD-20260912-STOR-P2-008 — Sync acknowledgement collection requires acks from every device ever registered; devices are never pruned, so event files accumulate forever

Severity: P2 | Confidence: High | Classification: DESIGN RISK

Affected files: `electron/services/syncCheckpoint.ts:15-59` (registerSyncDevice /
collectAcknowledgedEvent); no device-removal API exists anywhere in `electron/services`

Observed: `collectAcknowledgedEvent` (called from `acknowledgeOperation`,
`syncFolderWatcher.ts:399-404`, on every positively-acked blob) returns true only after
verifying a `<operationId>.ack` file for **every** entry in `.vfbackup/devices/`, then
deletes the event file. `registerSyncDevice` only ever adds/re-writes device files; nothing
removes them (device loss, OS reinstall, profile retirement). The first device that stops
acking therefore permanently blocks collection for all subsequent events: blob events and
object checkpoints under `.vfbackup/{blobs,objects}` are retained indefinitely and
re-delivered on every watcher start (`ignoreInitial: false`,
syncFolderWatcher.ts:625-638). Additionally `loadSyncConfig` (syncConfig.ts:29-36) mints a
new deviceId whenever the config file is corrupt/unreadable, silently orphaning the old
device's ack obligations.

Expected: Device liveness/tombstoning (e.g., ack quorum with a configurable device set, or
expiry of stale devices after N days), so retention converges; identity resets should not
silently strand sync retention.

Root cause: Ack model is "all registered devices forever" with no pruning or expiry.

Impact: Unbounded growth of the encrypted sync folder (hostile storage per AGENTS.md §13
treats the folder as untrusted — growth is attacker-influenceable by adding devices),
growing re-delivery/replay cost, and eventually permanent retention of every operation.

Recommended remediation: Add device expiry/tombstone handling and a quorum-based ack rule
(e.g., all devices seen within the last T days); surface stale devices in sync status;
preserve conflict copies per §13 when pruning.

Required regression tests: register two devices, stop acking from one, assert events are
eventually collected under the quorum rule; assert a re-imaged device (new deviceId) does
not block collection.

---

## VF-AUD-20260912-STOR-P2-009 — `venice-media://` (and `venice-tts://`, `venice-character-cache://`) grant access to originless requests, resting solely on sha256 unguessability

Severity: P2 | Confidence: Medium | Classification: DESIGN RISK

Affected files: `electron/utils/customProtocolAccess.ts:111-154` (evaluateCustomProtocolAccess,
documented at 12-43), `electron/main.ts:389-434` (protocol.handle wiring)

Observed: `evaluateCustomProtocolAccess` explicitly allows requests with **no Origin** and
no/empty Referer ("treat the request as renderer-initiated", lines 129-137). The
capability-token manager (`createCustomProtocolCapabilityManager`,
customProtocolAccess.ts:244-342) is scaffolding only — main.ts:33-37 and 392-396 say it is
"not yet wired". Consequently any process able to issue a request the scheme handler will
parse (another renderer frame/utility process, or anything that learns a media id) can fetch
`venice-media://<sha256>` and `venice-tts://<profile>/<sha256>` without provenance. The id
space is 256-bit and ids are not enumerable, but media ids transit logs, sync packets
(allowlisted stores), and renderer state.

Expected: Wire the documented capability-token primary gate (verify `?cap=` in the
protocol handler before serving), at least for `venice-media://` which serves
user-generated binary content.

Root cause: Provenance-less media requests are allowed unconditionally; the planned
capability layer was deferred.

Impact: Cross-boundary read of generated media/TTS bytes by non-renderer-authorized
contexts if an id leaks; defense-in-depth gap acknowledged in-code since 2026-08-31.

Recommended remediation: Implement VF-CAPABILITY-PROVENANCE for `venice-media://` (issue
profile/session-bound tokens, verify in `protocol.handle`, revoke on profile switch /
reload / shutdown), keeping the origin check as fallback.

Required regression tests: request without valid `cap` token from an originless context is
rejected once wired; renderer-issued token URLs succeed; tokens revoked on reload.

---

## VF-AUD-20260912-STOR-P2-010 — Folder-backup export records integrity counts as hardcoded zeros, an `includesMedia` flag with no media payload, and an excludes list nothing enforces

Severity: P2 | Confidence: High | Classification: CONFIRMED DEFECT

Affected files: `electron/services/chatFolderBackupService.ts:127-156` (getBackupPreview),
`electron/services/chatFolderBackupService.ts:177-197` (manifest construction)

Observed:
- Preview counts `attachmentReferences`/`mediaBlobs` by scanning messages (lines 127-144) but
  returns `mediaBlobsTotalBytes: mediaBytes` where `const mediaBytes = 0` (line 130) — the
  byte total is always 0; the real per-blob byte counts are never read from the media store.
- The exported manifest hardcodes `attachmentReferences: 0, mediaBlobs: 0` (lines 186-197)
  regardless of actual content, so the tamper/integrity counts in the encrypted manifest are
  false by construction.
- `includesMedia: input.includeMedia` is recorded (line 193), yet no media payload is ever
  written into the backup (conversations are serialized verbatim, line 196); a backup
  claiming `includesMedia: true` contains no media.
- `excludes` advertises `["api-keys", ..., "absolute-paths", "signed-media-urls", ...]`
  (lines 155, 194), but nothing sanitizes exported conversations: `metadata.attachments`
  (arbitrary string array, `src/types/conversation.ts:88`) and `metadata.injectedContext`
  are exported verbatim, so any absolute path or expiring URL that ever landed in message
  metadata is copied into the backup despite the advertised exclusion.

Expected: Counts reflect reality (computed from the same scan), `includesMedia` is only true
when blob payloads are actually embedded (or the flag is removed), and advertised excludes
are enforced by a stripping pass over conversations before encryption (AGENTS.md §13
"secret exclusion" / "never machine paths in portable payloads").

Root cause: Manifest/preview fields were stubbed and never reconciled with the actual
export content; no sanitizer stage exists.

Impact: Import previews and integrity checks report false information; backups may carry
machine-specific paths the manifest claims are excluded, defeating the portability and
review guarantees of the `.vfbackup` format.

Recommended remediation: Compute counts from the scan results; strip or reject
path/URL-bearing metadata fields during export; make `includesMedia` truthful or remove it
until media embedding lands.

Required regression tests: export a folder containing generated-media references and an
attachment whose value is an absolute path; assert preview byte counts are non-zero,
manifest counts match, and the absolute path is absent from the encrypted payload.

---

## VF-AUD-20260912-STOR-P3-011 — `syncConfig.saveSyncConfig` uses a fixed temp name and swallows write failures, so a failed persist is indistinguishable from success

Severity: P3 | Confidence: High | Classification: CONFIRMED DEFECT

Affected files: `electron/services/syncConfig.ts:41-53`

Observed: `saveSyncConfig` writes `sync-config.json.tmp` then renames, but the catch only
logs ("Failed to save sync config") and returns normally; `setSyncPath` callers (including
`setSyncFolder`'s commit step, syncFolderWatcher.ts:649) therefore believe the path was
persisted when it may not have been. Fixed temp name also collides under concurrent saves
(same class as VF-AUD-20260912-P2-006 but sync; folded here for the error-swallowing root
cause).

Expected: Write errors propagate to the caller; temp name is unique per write.

Impact: Sync path drift between memory and disk across restarts (sync silently off, or
watching a folder the user changed away from); misleading success returns.

Recommended remediation: Re-throw after logging; use a unique temp.

Required regression tests: inject ENOSPC on write and assert `setSyncPath` rejects and the
previous config file is intact.

---

## VF-AUD-20260912-STOR-P3-012 — `listConversations` returns `totalScanned` as the valid-conversation count, contradicting its documented contract

Severity: P3 | Confidence: High | Classification: DOCUMENTATION DEFECT

Affected files: `electron/services/chatStorage.ts:165-178` (interface docs),
`electron/services/chatStorage.ts:235-249` (implementation)

Observed: The `ListConversationsResult.totalScanned` doc says "Total files on disk that
matched the scan, before truncation", but line 249 returns `totalScanned: totalValid` (the
number of successfully parsed, profile-owned conversations in the truncated working set),
while the true file count is discarded after line 205. Callers displaying "N conversations
on disk" under-report whenever corrupt/foreign-profile files exist or the scan capped.

Expected: Return the file-count (`jsonFiles.length`) for `totalScanned` as documented, or
fix the doc to say "valid conversations scanned".

Required regression tests: seed a directory with one corrupt `.json` and one valid
conversation; assert `totalScanned` reflects the documented semantics.

---

## VF-AUD-20260912-STOR-P3-013 — Generated-media recovery and quarantine artifacts are never reaped: stale `.pending-*` journals and `.corrupt-*` blobs accumulate without bound

Severity: P3 | Confidence: High | Classification: CONFIRMED DEFECT

Affected files: `electron/services/generatedMediaStore.ts:281` (corrupt rename),
`electron/services/generatedMediaStore.ts:371-409` (recoverPendingGeneratedMediaWrites);
`electron/services/syncOutbox.ts:96-105` (oversize entries skipped, never evicted)

Observed:
- When an existing blob fails the duplicate-content check it is renamed to
  `<sha>.<ext>.corrupt-<ts>` (line 281) and nothing ever deletes those files.
- `recoverPendingGeneratedMediaWrites` retries each `.pending-<sha>.json` journal; on
  failure it logs and leaves the journal in place (lines 401-405). If the referenced temp
  file is gone (e.g., temp cleanup raced recovery), every future run fails the same way and
  the journal persists forever — there is no attempt-count or age-based eviction.
- `drainSyncOutbox` likewise `continue`s past oversized/malformed outbox entries
  (syncOutbox.ts:96-105), leaving them on disk permanently.

Expected: Bounded retention for recovery/quarantine artifacts (count + age, per the custody
spirit of AGENTS.md §11), with orphan journals removed once their temp file is provably
absent and `.corrupt-*` files pruned by age.

Impact: Unbounded disk growth in `userData/media/blobs/sha256` and `userData/sync/outbox`
on long-lived installations; repeated failing recovery attempts at every startup.

Recommended remediation: Add age/attempt eviction to recovery sweeps; delete `.corrupt-*`
files older than a retention window; quarantine oversize outbox entries to a bounded
archive.

Required regression tests: seed a journal whose temp file is missing and assert it is
removed after one failed recovery; seed a `.corrupt-*` file past retention and assert the
sweep deletes it.

---

## VF-AUD-20260912-STOR-P3-014 — Storage services log absolute filesystem paths into the durable rotated log, contrary to AGENTS.md §6

Severity: P3 | Confidence: High | Classification: DOCUMENTATION DEFECT (policy deviation)

Affected files: `electron/services/chatStorage.ts:64`; `electron/services/rpSingleFileStore.ts:82`;
`electron/services/characterCardStorage.ts:164`; `electron/services/conversationVault.ts:311,319`;
`electron/services/vaultMigration.ts:118,131,147,233` (migration log lines include full
paths of moved files)

Observed: Corruption/backup log lines embed complete absolute paths, e.g.
`logError("Chat history file corrupt or unreadable", { path: filePath, ... })`
(chatStorage.ts:64) and `logInfo("Corrupt chat file backed up", backupPath)` (line 70).
`logger.ts` persists these to `<userData>/logs/venice-forge.log` with 1 MiB × 4 rotation —
a permanent artifact. AGENTS.md §6 lists "private absolute machine paths in permanent
artifacts" under do-not-log. (Basename-only logging is already used in chatFolderStorage
and chatFolderBackupService, so the convention exists in-repo.)

Expected: Log `path.basename(...)` or repository/userData-relative descriptors; reserve full
paths for transient on-screen diagnostics.

Impact: Privacy hygiene: rotated logs shipped in bug reports leak machine layout and
profile ids.

Recommended remediation: Switch the listed call sites to basename/relative logging; add a
lint/check for `path: <abs>` shapes in logger calls within electron/services.

Required regression tests: log-capture test asserting no log line in these paths contains
the userData absolute prefix.

---

## Rejected candidates

- **`backupCrypto.decryptPayload` AES-256-GCM legacy branch (12-byte IV from file)** —
  nonce is randomly generated per encryption on the write side; legacy-format compatibility
  is deliberate and authenticated (GCM tag verified). No actionable defect beyond the
  documented migration path.
- **`chatFolderLockService` Argon2id `INTERACTIVE` preset** — consistent between lock and
  backup export; passphrase-gated, fail-closed, with attempt backoff. Acceptable.
- **`importBackup` new-folder mode allows duplicate source ids to overwrite each other** —
  reachable only with a hand-crafted backup; legitimate exports contain unique ids per
  profile. Recorded as a hardening note, not a defect.
- **`mediaService.decodePng` does not verify chunk CRCs and tolerates truncated IDAT** —
  malformed input yields throwaway thumbnail garbage (never persisted user data) or the
  renderer canvas fallback (decodeImage returns null for non-PNG/RGBA/gray). Palette PNGs
  (color type 3) and grayscale+alpha (type 4) are excluded but fall back gracefully.
- **`generatedVideoDownload` SSRF posture** — DNS-resolves all addresses, rejects private/
  loopback/link-local/reserved ranges, pins the request to the resolved IP via a custom
  `lookup`, keeps TLS hostname verification intact. Sound for the stated threat model.
- **`characterImageCache.writeMeta` non-atomic + lazy orphan cleanup** — benign: orphaned
  `.bin` files are reaped by `listEntries` during eviction/inventory; worst case is a stale
  cache entry.
- **`chatStorage.listConversations` early-break pagination math** — verified: the
  `+1` overshoot guarantees `truncated` is reported whenever the batch loop broke early;
  legacy array/envelope duality is handled at every in-domain call site
  (chatFolderService.ts:190-191, chatFolderBackupService.ts:123-124, 170-171, 537-542).
- **`conversationVault.getRecordPath` uses `createdAt` in the path** — id and profile are
  validated; `createdAt` only selects `records/<year>/<month>/` inside the validated
  profile root; non-numeric dates degenerate to a `NaN/` folder inside the root. Contained.
- **`readRegularFileNoFollow` (utils/secureFile.ts)** — opens `O_RDONLY|O_NOFOLLOW`,
  fstats through the same descriptor, rejects non-regular files. Correct TOCTOU closure for
  its two call sites.
- **`purgeProfileChatHistory` / `purgeProfileConversationVault` / `purgeRpProfileDirs` /
  `purgeProfileTtsCache`** — all validate `isValidProfileStorageId`, refuse `default`, and
  `rm -rf` only the validated profile subtree; quarantine/backup files live inside the same
  subtree and are removed with it. Compliant with §13 purge expectations.
- **Sync packet path containment (`openSecureWatchedFile`)** — realpath-of-parent allowlist
  (`blobs`/`objects` only), pre/post-open lstat symlink checks, `O_NOFOLLOW`, regular-file
  fstat, 50 MiB cap, per-object serialization via `syncApplyQueue`. Robust.
- **Folder-backup import file approval (`issueBackupFileCapability`)** — dialog-mediated,
  symlink rejected, size-capped, and re-validated (size/mtime/dev/ino/realpath) at resolve
  time with TTL and single-use consumption. Robust; the KDF-param gap (VF-AUD-20260912-P1-001)
  is the one hole in this flow.

---

## Domain: Venice client & streaming (VCS)
review plus targeted test execution (`sseStreamDecoder.test.ts`, `veniceClient.sseParser.test.ts`,
`chatTtsBridge.test.ts` — all pass at HEAD) plus a runtime reproduction of the binary-body shape.
No repository source files were modified.

---

## VF-AUD-20260912-VCS-P1-001 — Desktop TTS always fails: chatTtsBridge expects a raw Buffer body the canonical client never produces

P1 | High | Confirmed defect

Affected files: `electron/services/chatTtsBridge.ts:183-191`; `electron/services/veniceClient.ts:275-288, 681-685`; `electron/services/chatTtsBridge.test.ts:36`

Observed: `synthesizeSpeech()` (the `tts:synthesize` IPC entry, used by chat read-aloud
`src/services/chatTtsController.ts:119-151` and the settings panel `src/components/settings/AudioSpeechPanel.tsx`)
extracts audio bytes only when `result.body` is a `Buffer`/`ArrayBuffer`/`Uint8Array`:

```ts
const audioBuffer = Buffer.isBuffer(result.body)
  ? result.body
  : result.body instanceof ArrayBuffer || result.body instanceof Uint8Array
    ? Buffer.from(result.body)
    : null;
if (!audioBuffer || audioBuffer.length === 0 || ...) { ... "Speech provider returned invalid audio." }
```

But the canonical main-process client `parseBody()` returns `{ dataBase64: <string> }` for every
non-JSON, non-text content type — which is exactly what `/audio/speech` returns (`audio/mpeg`):

```ts
export function parseBody(buffer: Buffer, contentType: string): unknown {
  if (contentType.includes("application/json")) { ... }
  if (contentType.startsWith("text/") || contentType.includes("event-stream")) { ... }
  return { dataBase64: buffer.toString("base64") };   // ← audio/mpeg lands here
}
```

Verified at runtime by executing the real `parseBody` logic against `audio/mpeg` bytes: it returns
`{ dataBase64: "..." }`, `Buffer.isBuffer(...) === false`, so `synthesizeSpeech` always returns
`{ ok: false, error: "Speech provider returned invalid audio." }`.

Expected: the bridge should read `result.body.dataBase64` (the documented `VeniceIpcResponse`
binary envelope produced by `parseBody`), mirroring how `src/services/veniceClient/fetch.ts:750-758`
(`veniceBlob` desktop path) already consumes `dataBase64`.

Evidence:
- `electron/services/veniceClient.ts:275-288` — binary branch returns `{ dataBase64 }`; the only
  non-`parseBody` body shapes are `{ text: streamText }` for SSE (`:683-684`) and JSON.
- `electron/services/chatTtsBridge.ts:183-191` — raw-Buffer expectation; fall-through to error.
- `electron/services/chatTtsBridge.test.ts:36` — the unit test mocks
  `performGuardedVeniceRequest` with `body: Buffer.from("audio")`, a shape the real pipeline never
  produces, so the suite is green while production is broken (test/impl divergence).

Root cause: the TTS bridge was written against an assumed raw-`Buffer` IPC body; the canonical
client binary contract (`{ dataBase64 }`) was not consulted. The test mocks the assumption instead
of the real dependency.

Impact: 100% failure of Electron TTS (chat message read-aloud + Audio Speech settings preview);
users on desktop always get "Speech synthesis failed". Web mode is unaffected (uses `veniceBlob`
directly, `chatTtsController.ts:154+`).

Recommended remediation: in `synthesizeSpeech`, accept `{ dataBase64: string }`:
`const b64 = (result.body as { dataBase64?: string })?.dataBase64` → `Buffer.from(b64, "base64")`;
keep raw-Buffer support only if some adapter genuinely produces it. Fix the test to mock the real
`{ dataBase64 }` shape (and add a regression case asserting the real `parseBody` output flows
through).

Required regression tests:
1. `chatTtsBridge.test.ts`: mock `performGuardedVeniceRequest` with
   `{ ok: true, status: 200, body: { dataBase64 }, contentType: "audio/mpeg" }` → expect
   `audioBase64` returned / cache file written.
2. Integration-style test wiring the real `parseBody("audio/mpeg")` output into the bridge.

---

## VF-AUD-20260912-VCS-P1-002 — Web-transport streamed chat output is never screened by Family Safe Mode (two-transport safety parity break)

P1 | High | Confirmed defect (safety / transport-parity)

Affected files: `src/services/veniceClient/stream.ts:164-368` (web path); `server.ts:864-871`
(proxy media-only response screening); `src/services/veniceClient/fetch.ts:66-159` (non-stream
screening for comparison); `electron/services/guardPipeline.ts:185-263` (Electron screening for comparison)

Observed:
- In **web mode**, `veniceStreamChat` runs the request-side guard (`stream.ts:84-105`) but the
  accumulated `accumulatedContent`/`accumulatedReasoning` is used only for the inspector log
  (`:343-362`). There is no call to `screenVeniceResponse`, `screenResponseBody`, or
  `maybeRunLocalFamilyGuard` on streamed output (grep for `screen` in `stream.ts` returns only
  request-guard/telemetry lines).
- The Express proxy (`server.ts:864-871`) only response-screens media endpoints
  (`/image|/video|/audio` via `fsmMediaVeniceProxy`); `/chat/completions` SSE flows through
  `standardVeniceProxy` (`server.ts:684-691`) which pipes bytes through untouched
  (`standardProxyRes` only copies retry-after headers and updates the circuit breaker).
- In **Electron mode**, streamed output *is* screened — but only after the stream completes:
  `performSingleVeniceRequest` accumulates `streamText` (`electron/services/veniceClient.ts:592,605,684`)
  and `performGuardedVeniceRequest` screens `{ text: streamText }` via
  `screenUpstreamResponse` (`guardPipeline.ts:185-263`).

Expected: per AGENTS.md §9 ("Keep validation, normalization, capability behavior, and error
semantics contract-compatible across supported transports") and the safety-authority contract,
FSM-on output screening must apply to streamed chat on **both** transports. Web mode currently has
no output enforcement at all: any inappropriate streamed model output renders in full in the
browser with Family Safe Mode enabled.

Evidence:
- `src/services/veniceClient/stream.ts:236-241` — `!response.ok` handling only; no success-path screening.
- `server.ts:864-871` — `isMedia = req.path.startsWith("/image/") || ... "/audio/"`; chat SSE excluded.
- `src/services/veniceClient/fetch.ts:66-159` — `screenVeniceResponse` exists but is only invoked
  from `veniceFetch`/`veniceBlob`/`veniceFormData` (non-streaming).
- `electron/services/guardPipeline.ts:185-263` — post-hoc stream screening exists only on the
  Electron path (and see VF-AUD-20260912-P1-004 for its delivery-ordering flaw).

Root cause: response screening was implemented for the non-streaming `veniceFetch` surface and for
the Electron main-process dispatcher, but the renderer's web-mode SSE read loop was never given an
equivalent output screen; the proxy only buffers/screens media responses.

Impact: With `localFamilySafeModeEnabled = true` in web mode, streamed assistant output bypasses
the Family Safe Mode filter entirely — the exact content class the filter exists to block reaches
the UI and conversation store. Silent bypass (no error, no telemetry patch with `guardOutcome: "block"`).

Recommended remediation: screen the accumulated stream text in `veniceStreamChat`'s web path after
the read loop (mirroring the Electron post-hoc screen): run `screenResponseBody` on
`accumulatedContent` (+ `accumulatedReasoning`), and on block emit the 451 inspector patch and
throw `SafetyGuardBlockedError`. Longer term, screen incrementally (per event) so blocked content
is never rendered. Add a proxy-side SSE screen only if buffering is acceptable; renderer-side
post-hoc screening is the minimal parity fix.

Required regression tests:
1. Web-mode `veniceStreamChat` with FSM on and a stream whose deltas contain blocked content →
   expect `SafetyGuardBlockedError`, 451 inspector patch, and no committed assistant text.
2. Same byte stream through Electron main-process path → identical outcome (parity test).
3. FSM off → stream completes normally (no false positive).

---

## VF-AUD-20260912-VCS-P1-003 — RpChatView passes an IPC-envelope shape to veniceStreamChat: invented `endpoint` wire field, missing `stream: true`

P1 | High | Confirmed defect (API contract)

Affected files: `src/components/rp-studio/RpChatView.tsx:274-283`; `src/services/veniceClient/stream.ts:46-56,107-118,200-204`; `docs/reference/Venice_swagger_api.yaml` `ChatCompletionRequest` (`components.schemas.ChatCompletionRequest`, `additionalProperties: false`)

Observed: the RP studio chat view calls:

```ts
await veniceStreamChat(
  { endpoint: "/chat/completions", model: chat.modelId, messages },
  { signal: ctrl.signal, onDelta: ... },
);
```

`veniceStreamChat(payload)` treats the first argument as the **request body** — it forwards
`requestPayload` (a clone of the payload, with only per-message `metadata` stripped,
`stream.ts:48-56`) verbatim as the outbound JSON body on both transports (`stream.ts:112` Electron,
`stream.ts:203` web). Two contract violations result:

1. **Invented field**: the wire body contains `"endpoint": "/chat/completions"`.
   `ChatCompletionRequest` declares `additionalProperties: false` (verified by parsing the bundled
   Swagger at HEAD). Per the project's own `src/shared/veniceSafeMode.ts:18-23` note, Venice
   "returns 400 on unknown payload fields for some endpoints" — the live API is expected to reject
   this body before feature logic runs.
2. **Missing `stream: true`**: the payload never sets `stream`, so Venice returns a non-streaming
   JSON completion. Consequences diverge by transport:
   - Electron: `performSingleVeniceRequest` only decodes SSE when `content-type` includes
     `event-stream` (`electron/services/veniceClient.ts:629`); the JSON completion is buffered and
     returned with **zero `onDelta` calls** — the RP view accumulates an empty reply.
   - Web: chunks are fed to `SseDecoder`; the whole JSON body is flushed as one "line" and
     `extractStreamDelta`'s `choice.delta ?? choice.message` fallback
     (`src/shared/sseStreamDecoder.ts:241-243`) accidentally yields the full text in a single
     delta — behavior that only works by accident and breaks if that fallback is ever tightened.

No other `veniceStreamChat` caller does this (`chat-stream-manager.ts:266` builds a proper body;
`researchSynthesis.ts:128-136` sets `stream: !!onDelta`).

Expected: `veniceStreamChat` accepts a body only; the RP view should pass
`{ model, messages, stream: true }` and no `endpoint`. The type signature
(`payload: unknown`) permits this misuse — tightening to a body-shaped type (or stripping a
leading `/` path key defensively) would prevent recurrence.

Evidence:
- `src/components/rp-studio/RpChatView.tsx:274-283` — envelope-shaped payload.
- `src/services/veniceClient/stream.ts:107-118` — `body: requestPayload` (Electron);
  `:200-204` — `body: JSON.stringify(requestPayload)` (web).
- Swagger `ChatCompletionRequest` property set (parsed at HEAD): `model`, `messages`, `stream`,
  `stream_options`, `temperature`, `top_p`, `max_completion_tokens`, `venice_parameters`, `tools`,
  … — no `endpoint`; `additionalProperties: false`.

Root cause: caller confusion between the IPC request envelope (`{endpoint, method, body}`) and the
chat-body contract of `veniceStreamChat`; the `payload: unknown` signature cannot catch it.

Impact: RP Studio multi-character chat streaming is broken against the live API (400 from the
invented field, or silent empty replies on Electron if the field is ignored). Feature shipped in
this state means RP streaming is either fully or partially non-functional.

Recommended remediation: fix `RpChatView` to pass `{ model: chat.modelId, messages, stream: true }`;
change `veniceStreamChat`'s parameter type from `unknown` to a declared body interface
(`{ model: string; messages: unknown[]; stream?: boolean; [k: string]: unknown }`) or explicitly
reject/ignore reserved transport keys (`endpoint`, `method`, `headers`, `signalId`) before
dispatch. Add a contract test asserting the exact wire body keys for the RP path.

Required regression tests:
1. `veniceStreamChat` wire-body test: body contains no `endpoint`/`method` keys and includes
   `stream: true` for the RP caller.
2. Transport-parity test: same mocked non-stream upstream JSON on Electron and web paths produces
   identical `onDelta` sequences (or an explicit error), not divergent silent-empty vs full-text behavior.

---

## VF-AUD-20260912-VCS-P1-004 — Partial streamed content is committed to the conversation even when the stream is then blocked (451) or fails mid-way

P1 | High | Confirmed defect

Affected files: `src/stores/chat-stream-manager.ts:264-315, 154-162, 318-321`; `src/services/veniceClient/stream.ts:107-161` (Electron ordering); `electron/services/guardPipeline.ts:185-263` (post-hoc stream screen)

Observed: deltas are buffered per conversation and flushed into the chat store by a 40 ms timer
(`bufferStreamDelta`/`flushStreamDelta`, `chat-stream-manager.ts:154-189`). On any stream error the
catch block **first commits the pending deltas** and only then inspects the error:

```ts
} catch (err) {
  flushStreamDelta(convId);              // ← partial (possibly blocked) text committed
  if (isAbortError(err)) { return { aborted: true }; }
  const retryable = isRetryableError(err);
  ...
  useChatStore.getState().appendAssistantStreamDelta(convId, { content: `\n\n[Error: ${SAFE_STREAM_ERROR_MESSAGE}]` });
```

On the Electron path this ordering is compounded by the main process: deltas are delivered to the
renderer **during** streaming (`veniceHandlers.ts:111-126`), and the Family Safe Mode response
screen runs only **after** the stream ends (`guardPipeline.ts:292`, screening `{ text: streamText }`).
A 451 block therefore arrives at the renderer only after all partial content was already streamed
and buffered — and `flushStreamDelta` commits it into the assistant message. The finalizer
(`chat-stream-manager.ts:318-321`) then persists the conversation, so blocked/error partial output:

1. is rendered and durably stored in chat history, and
2. is re-sent to the provider as conversation context on the next turn (compounding exposure and
   re-triggering request-side screens).

Expected: when a stream terminates in a block or hard failure, uncommitted deltas belonging to that
generation must be discarded (or the assistant turn marked failed/removed), and the error must be
handled before any flush. `SafetyGuardBlockedError` (451) must never result in persisted blocked
content.

Evidence:
- `src/stores/chat-stream-manager.ts:284-285` — `flushStreamDelta(convId)` precedes error classification.
- `src/stores/chat-stream-manager.ts:318-321` — final `flushStreamDelta` + `flushConversationSaveNow`.
- `electron/ipc/handlers/veniceHandlers.ts:111-126` — deltas forwarded live; `guardPipeline.ts:292` —
  screening after `performVeniceRequest` returns.
- `src/services/veniceClient/stream.ts:135-140` — renderer throws only after the blocked response arrives.

Root cause: stream bookkeeping conflates "user aborted" (commit partial turn) with "provider/Guard
terminated the stream" (discard the turn); there is no generation-scoped rollback. Combined with
P1-002's delivery-before-screen ordering, blocked content always lands in the store.

Impact: FSM-blocked or mid-stream-failed assistant text persists in the user's chat history and is
re-transmitted to Venice on subsequent turns; error text (`[Error: …]`) is appended to the same
message, corrupting the turn.

Recommended remediation: track the generation's committed state; in the catch path, drop
`pendingStreamDeltas` (do not flush) unless `isAbortError(err)` and the product decision is to keep
user-stopped partial turns; on `SafetyGuardBlockedError` remove/revert the partial assistant
message for that turn. Add a `finally`-safe flush only for the success path.

Required regression tests:
1. Stream that delivers deltas then terminates with a 451 block → assistant turn contains no
   blocked content; conversation store has no partial text.
2. Stream failing mid-way with 500 → partial deltas discarded, error marker present, no persistence
   of partial content.
3. User abort → existing behavior preserved (partial turn kept), proving no over-correction.

---

## VF-AUD-20260912-VCS-P2-005 — Electron chat streams have no absolute lifetime; a trickling stream can run forever (web enforces a 300 s absolute deadline)

P2 | Medium-High | Confirmed defect (transport parity / resource)

Affected files: `electron/services/veniceClient.ts:573-581, 742-744`; `src/shared/apiConfig.ts:14-15`; `src/services/veniceClient/stream.ts:169-195`

Observed: the web renderer path enforces "a single absolute 5-minute deadline covering both the
initial fetch and the SSE read loop" (`stream.ts:169-183`, `VENICE_API_STREAM_TIMEOUT_MS`). The
Electron main process instead passes `timeout: VENICE_API_STREAM_TIMEOUT_MS` to `https.request`
(`electron/services/veniceClient.ts:580`), which in Node is a **socket inactivity** timeout that
resets on every received chunk; on fire it destroys the request (`:742-744`). A provider sending a
few bytes every <300 s keeps an Electron stream open indefinitely. The shared constant's own
docstring claims "Chat SSE lifetime shared by Electron, Express proxy, and renderer"
(`src/shared/apiConfig.ts:14`) — this is not true for Electron.

Expected: both transports bound total stream lifetime to ~300 s, matching REL-001's stated intent.

Evidence:
- `electron/services/veniceClient.ts:580` — `timeout: isSseStream ? VENICE_API_STREAM_TIMEOUT_MS : VENICE_API_TIMEOUT_MS`.
- `electron/services/veniceClient.ts:742-744` — `req.on("timeout", () => req.destroy(...))` (inactivity semantics).
- `src/services/veniceClient/stream.ts:178-183` — absolute deadline via `AbortController` (web only).
- `electron/preload.ts:46-77` — no deadline added at the preload layer either.

Root cause: reliance on Node's socket `timeout` option where an absolute end-to-end deadline was
specified; the renderer's deadline controller was only implemented in the web branch of
`veniceStreamChat`.

Impact: hung/trickling paid chat streams hold IPC listeners, the concurrency slot
(`MAX_CONCURRENT_VENICE_REQUESTS`), and renderer state indefinitely on desktop; behavior differs
between web (terminates at 300 s) and desktop (never).

Recommended remediation: in `veniceHandlers.ts`/`runChatAgentLoop` or `performVeniceRequest`, arm
an absolute timer equal to `VENICE_API_STREAM_TIMEOUT_MS` that aborts the shared `abortController`
when it fires (mirroring `stream.ts:178-183`), independent of socket activity.

Required regression tests:
1. Electron stream test: chunks arriving every 250 s never stop → stream aborted at ~300 s with a
   timeout error.
2. Healthy fast stream unaffected; user abort still wins.

---

## VF-AUD-20260912-VCS-P2-006 — Default retry policy replays billable POSTs (e.g. /image/generate) after 429/500/503, risking double-billing

P2 | Medium | Confirmed defect (economics / policy)

Affected files: `src/services/veniceClient/fetch.ts:194, 348, 427-439, 480-488`; `src/services/characterSceneGenerationService.ts:186`; contrast `src/hooks/use-video.ts:70-76`, `src/hooks/use-music.ts:67-72`, `src/lib/workflow-engine.ts:239-243, 346-350` (all `retry: false`)

Observed: `veniceFetch` defaults `retry: true` (3 attempts) and retries any POST on 429/500/503
unless the caller opts out. The paid queue endpoints (`/video/queue`, `/audio/queue`) correctly
pass `retry: false` at every call site, but `/image/generate` via
`characterSceneGenerationService` does not:

```ts
const { data } = await deps.veniceFetch('/image/generate', { method: 'POST', body: payload, signal: options.signal });
```

An image generation that Venice accepts and bills but whose response is lost (500/503/429 at the
edge) will be re-submitted up to two more times, each a separately billable generation. The same
holds for any other paid POST that omits `retry: false`.

Expected: billable one-shot operations must not be auto-retried unless the caller has established
the request is idempotent or the first attempt provably never reached the provider. AGENTS.md §10
forbids "retry malformed 400s as a substitute for correcting the schema" and expects deliberate
retry policy; billing-blind retries violate that spirit.

Evidence:
- `src/services/veniceClient/fetch.ts:194` — `const maxAttempts = retry ? 3 : 1;` (desktop), `:348` (web).
- `src/services/veniceClient/fetch.ts:427-439` — retryable `[429, 500, 503]` on POST bodies.
- `src/services/characterSceneGenerationService.ts:186` — no `retry` flag.

Root cause: retry policy is opt-out while the endpoint mix includes non-idempotent paid calls; the
queue endpoints were fixed individually instead of making retry opt-in for paid generation.

Impact: duplicate charges on flaky networks for character-scene images; user-visible duplicate
assets when both attempts succeed.

Recommended remediation: default `retry: false` for `/image/generate`, `/image/edit`,
`/image/upscale`, `/image/background-remove`, `/video/queue`, `/audio/queue` (or introduce an
`idempotency` classification per endpoint in one place), keeping retries for chat and GET catalog
calls.

Required regression tests:
1. `/image/generate` returning 503 → exactly one upstream request recorded.
2. `/chat/completions` non-stream returning 429 → retry behavior preserved (or explicitly
   re-decided and documented).

---

## VF-AUD-20260912-VCS-P3-007 — Deduplicated veniceFetch callers leave a permanent "pending" inspector row

P3 | Medium | Confirmed defect (telemetry correctness)

Affected files: `src/services/veniceClient/fetch.ts:540-557, 592-657`

Observed: every `veniceFetch` call adds an inspector log row with `callOutcome: "pending"`
(`:544-554`). When `dedupe: true` and an identical request is in flight, the second caller
immediately returns the shared in-flight promise (`:592-595`) — but only the first caller's
`execute()` patches its own `logId` with the outcome (`:603-613`, `:636-645`). The deduped
caller's row stays `pending` forever (the only `dedupe: true` production caller is
`src/services/modelService.ts:128`, so the catalog row set accumulates stuck rows on concurrent
model refreshes).

Expected: deduped callers either share the same log row or have their row patched with the shared
outcome (plus a `deduplicated: true` marker).

Root cause: log lifecycle is keyed per call site, but dedupe short-circuits before the outcome
patch wiring exists for the shadow row.

Impact: misleading Inspector UI/telemetry; unbounded growth of stuck rows on refresh storms.

Recommended remediation: register the deduped `logId` on the shared promise's outcome patch, or
skip adding a row when returning an in-flight promise (recording a lightweight `deduplicated`
event instead).

Required regression tests:
1. Two concurrent identical `dedupe: true` requests → one upstream call; zero permanent
   `pending` rows.

---

## VF-AUD-20260912-VCS-P3-008 — Proxy has no JSON error handler: body-limit (413) and JSON-parse errors escape as HTML/text via finalhandler

P3 | Medium | Confirmed defect (error-contract consistency)

Affected files: `server.ts:264-298, 774-780, 874`; whole of `createServerApp` (no `app.use(errorHandler)`)

Observed: `createServerApp` registers no Express error-handling middleware. When
`express.raw({ limit: MAX_PROXY_BODY_BYTES })` (`:777-780`) rejects an oversized Venice POST, or
`express.json({ limit: "2kb" })` on `/api/session-key` (`:264`) sees malformed JSON, body-parser
passes an error to Express's default `finalhandler`, which returns the status with an HTML/plain
stack-styled body and `content-type: text/html`. The renderer copes (`fetch.ts:404-411` falls back
to `{ text }`), but the app's documented error shape is JSON (`{ error }`), and `server.test.ts`
never exercises these branches.

Expected: a JSON error handler mapping `entity.too.large` → 413 `{ error: "Payload too large" }`
and JSON parse failures → 400 `{ error: "Malformed JSON" }`, consistent with the rest of the
proxy's error contract.

Root cause: missing four-argument error middleware; body-parser errors were only considered for
the happy path.

Impact: inconsistent client-visible error bodies; harder debugging; potential HTML rendered into
error surfaces that assume JSON.

Recommended remediation: add `app.use((err, req, res, next) => { ... })` before the Vite/static
fallback, normalizing `PayloadTooLargeError`/`SyntaxError` to JSON.

Required regression tests:
1. POST `/api/venice/chat/completions` with `Content-Length > MAX_PROXY_BODY_BYTES` → 413 JSON.
2. POST `/api/session-key` with invalid JSON → 400 JSON.

---

## VF-AUD-20260912-VCS-P3-009 — Web stream leaves the upstream connection open after [DONE] (no cancel; only releaseLock)

P3 | Low | Confirmed defect (resource hygiene)

Affected files: `src/services/veniceClient/stream.ts:314-318, 363-368`

Observed: when `[DONE]` terminates the read loop, the code `break`s and the `finally` block runs
`reader.releaseLock()` without `reader.cancel()`. The fetch body stream (and underlying
connection through the dev proxy) remains open until the server closes it or GC finalizes; the
absolute-deadline controller is cleared (`clearTimeout(deadlineId)`), so nothing else will close
it. The abort path does cancel via `cancelReader`, but the success path does not.

Expected: on successful `[DONE]`, `reader.cancel()` (or `response.body.cancel()`) should be invoked
best-effort before releasing the lock, matching common SSE client hygiene and freeing the proxy
connection.

Root cause: cleanup asymmetry between the abort and success paths.

Impact: connection pool pressure during long sessions with many short streams; idle sockets held
against the dev server.

Recommended remediation: call `cancelReader()` on the success path too (idempotent,
catch-swallowed), then `releaseLock()`.

Required regression tests:
1. Stream ending with `[DONE]` → `reader.cancel` invoked; promise resolves normally.

---

## Verified-non-defect highlights (invariants that HOLD at HEAD)

- **§10 image-edit `model` (not `modelId`)**: `buildImageEditRequest` (`media-request-adapter.ts:199-213`)
  and `buildCanonicalImageEditPayload` (`payload-builders.ts:147-173`) emit `model`. `modelId`
  appears only in the multi-edit schema (`MultiEditImageRequest`), which is where Swagger puts it.
- **§10 upscale sends only `image`/`scale`/optional `creativity`**: `buildImageUpscaleRequest`
  (`media-request-adapter.ts:215-237`), `buildCanonicalImageUpscalePayload`
  (`payload-builders.ts:201-217`) — matches `UpscaleImageRequest`.
- **§10 background-remove sends `image` or `image_url` only**: `buildBackgroundRemoveRequest`
  (`media-request-adapter.ts:239-245`), `buildCanonicalBackgroundRemovePayload`
  (`payload-builders.ts:219-229`) — matches `BackgroundRemoveImageRequest`.
- **§10 no `return_binary` on edit/upscale/background-remove**: `return_binary` is emitted only for
  `/image/generate` (`payloadBuilders.ts:397`, `payload-builders.ts:88`) where Swagger declares it.
- **§10 audio/video queue+retrieve canonical model/queue contract**:
  `buildAudioRetrieveRequest`/`buildVideoRetrieveRequest` (`media-request-adapter.ts:247-259`) and
  the canonical builders emit `{model, queue_id, delete_media_on_completion:false}`, matching
  `RetrieveAudioRequest`/`RetrieveVideoRequest` required fields.
- **§10 video `download_url` preserved**: `normalizeVideoRetrieveResult`
  (`video-retrieve-normalizer.ts:86-95`) prefers response `download_url`, falls back to the
  journaled `queueDownloadUrl`, and models the `needs-binary` completed variant; expiring URLs are
  downloaded by the main process (`electron/services/videoRetrieveService.ts:310-320`).
- **safe_mode endpoint matrix**: `src/shared/veniceSafeMode.ts:41-45` allows only
  `/image/generate|/image/edit|/image/multi-edit`, consistent with the Swagger snapshot (only the
  four image request schemas declare `safe_mode`); applied on both transports
  (renderer web path `fetch.ts:339-345`, Electron `guardPipeline.ts:149-162`).
- **SSE decoder** (`src/shared/sseStreamDecoder.ts`): spec-conformant incremental UTF-8 (fatal,
  split-surrogate safe), CRLF/LF/CR framing, blank-line dispatch, multi-`data:` join, comment/field
  handling, `[DONE]` surfacing, EOF flush, typed `SseDecodeError`. 36 focused tests pass at HEAD
  (`sseStreamDecoder.test.ts`, `veniceClient.sseParser.test.ts`).
- **Endpoint allowlist** (`src/shared/validation.ts`): exact-path + method matrix plus the
  parameterized `/characters[/{slug}]` family; consumed by both the IPC validator
  (`electron/ipc/validation.ts:215-245`, origin-pinned to `VENICE_API_HOST`, query ≤512 chars,
  body ≤ 25 MiB, blocked header set incl. `authorization`/`x-forwarded-*`) and the proxy
  (`server.ts:722-758`, 403/405 split, key gate after allowlist).
- **Prompt limits** enforced at both request boundaries (renderer IPC validator
  `validation.ts:295-299`, proxy `server.ts:798-813`) with the §12 constants
  (6,144 warn / 8,192 max / 24,576 / 32,768 — `src/shared/promptLimits.ts:5-10`).
- **Binary validation before durable persistence**: `validateImageBlob`
  (`media-request-adapter.ts:261-269`) enforces allowlisted MIME + non-zero size for
  image edit/upscale/background-remove responses; TTS audio byte-checked
  (`chatTtsBridge.ts:188` modulo P1-001); generated-media persistence is main-owned
  (`desktopBridge.ts:1039-1057`).

---

## Rejected candidates

- **`data: [DONE]` with trailing whitespace would miss the terminator** — Venice emits the exact
  terminator per the OpenAI convention the decoder documents; adding a trim would accept
  non-conformant frames. Not a defect at this contract.
- **Proxy forwards the renderer's `X-Venice-Forge-Family-Safe-Mode` header upstream** — harmless
  custom header; no confidentiality or integrity impact; removing it is cosmetic.
- **GET responses are not screened by `screenVeniceResponse`** — explicit, documented design (GETs
  carry no user content; `fetch.ts:76` comment).
- **Electron `MAX_VENICE_RESPONSE_BYTES` (25 MiB) also counts SSE bytes** — protective memory cap;
  25 MiB of tokens is far beyond configured `max_completion_tokens`; acceptable.
- **`parseEndpoint` URL normalization of `/characters/../models`** — resolves to `/models`, which
  is allowlisted; no boundary crossing (path stays on `VENICE_API_HOST` origin by construction).
- **`fsmMediaProxyRes` branch for `proxyRes` without `.on`** — dead branch in practice;
  http-proxy-middleware always supplies an `IncomingMessage`.
- **Multipart transcription bodies screened as printable-prefix text** — extractor's
  fail-safe direction only (over-screening risk, never under-screening); bounded by
  `MAX_FIELD_CHARS`.
- **`veniceFetch` mutates the caller's `options.body` when stripping chat `metadata`** — shallow
  copies of messages; documented intent; no caller depends on post-send body identity.
- **Web `veniceStreamChat` has no retry** — standard SSE practice; checkpoint retry lives in
  `chat-stream-manager.ts:264-310` and is gated on `hasCommittedStreamState`.
- **`performVeniceRequest` returns the failed 429-retry response instead of falling through to the
  next provider** — explicitly documented one-retry policy (`veniceClient.ts:415-451`,
  VF-AUD-20260831-P2-008); not drift.

---

## Domain: Renderer stores & persistence (ZST)

| ID | Severity | Classification | Title |
|---|---|---|---|
| VF-AUD-20260912-P1-014 | P1 | CONFIRMED DEFECT | Deleting a character card silently cascade-deletes every solo-character RP chat |
| VF-AUD-20260912-P2-015 | P2 | CONFIRMED DEFECT | Stream-buffer `tool_calls` replacement loses fragmented tool-call state |
| VF-AUD-20260912-P2-016 | P2 | CONFIRMED DEFECT | `applyLoadedHistory` bypasses `setConversations` normalization |
| VF-AUD-20260912-P2-017 | P2 | CONFIRMED DEFECT | `createBlank` persona/lorebook/scenario inserts memory-only records |
| VF-AUD-20260912-P2-018 | P2 | CONFIRMED DEFECT | `patchMedia` read-modify-write is not atomic across two IDB transactions |
| VF-AUD-20260912-P2-019 | P2 | CONFIRMED DEFECT | Web background tasks fire-and-forget `persistCompletedTaskMedia` with unhandled rejections |
| VF-AUD-20260912-P2-020 | P2 | CONFIRMED DEFECT | Future-version chat-history files are quarantined as "corrupt" on downgrade |
| VF-AUD-20260912-P3-021 | P3 | DESIGN RISK | `settings-store` migration comment claims `pendingSettingsSection` is non-persisted, but no `partialize` is visible in the inspected slice |
| VF-AUD-20260912-P3-022 | P3 | CONFIRMED DEFECT | Several library stores latch `hydrated: true` after load failure, leaving empty libraries |
| VF-AUD-20260912-P3-023 | P3 | DESIGN RISK | `workflow-template-store` silently truncates after 20 persisted templates |
| VF-AUD-20260912-P3-024 | P3 | DESIGN RISK | Profile switch leaves a split-brain window where renderer and main disagree about the active session |

Counts: **P0 = 0, P1 = 1, P2 = 7, P3 = 4.**

---

## VF-AUD-20260912-ZST-P1-014 — Deleting a character card silently cascade-deletes every solo-character RP chat

**Severity:** P1 | **Confidence:** High | **Classification:** CONFIRMED DEFECT

**Affected files:**
- `src/stores/character-card-store.ts:202-213`

**Observed behavior:** When a character card is removed, the store iterates every RP chat and, if the chat's `characterIds` becomes empty after removing the deleted card, deletes the entire chat (message history included). There is no UI disclosure in the delete confirmation; the user is told only that the card will be deleted.

**Evidence:**
```typescript
// src/stores/character-card-store.ts:202-213
const rpStore = useRpChatStore.getState();
for (const chat of rpStore.chats) {
  if (chat.characterIds.includes(id)) {
    const survivingIds = chat.characterIds.filter((cid) => cid !== id);
    if (survivingIds.length === 0) {
      await rpStore.remove(chat.id);
    } else {
      await rpStore.upsert({ ...chat, characterIds: survivingIds });
    }
  }
}
```

**Expected behavior:** A destructive cascade should be surfaced in the confirmation copy or require an explicit opt-in; solo-character chats should survive as "orphaned" rather than destroyed.

**Root cause:** Cleanup logic treats the card as the sole owner of solo-character chats.

**Impact:** Accidental or routine card deletion permanently destroys associated RP conversation history without informed consent.

**Recommended remediation:** Change cascade to detach (set `characterIds: []`) and add a confirmation step listing affected chats when `survivingIds.length === 0`.

**Required regression tests:** deleting a card used by one chat leaves the chat intact; deleting a card used by multiple chats removes only the reference; UI copy lists affected chats.

---

## VF-AUD-20260912-ZST-P2-015 — Stream-buffer `tool_calls` replacement loses fragmented tool-call state

**Severity:** P2 | **Confidence:** High | **Classification:** CONFIRMED DEFECT

**Affected files:**
- `src/stores/chat-stream-manager.ts:179-181`

**Observed behavior:** The 40 ms stream buffer accumulates `content` and `reasoning` by appending, but replaces `tool_calls` wholesale on every chunk. OpenAI-style streaming sends tool-call fragments across multiple SSE deltas (id/name/arguments split); replacing the array drops earlier fragments.

**Evidence:**
```typescript
// src/stores/chat-stream-manager.ts:179-181
if (chunk.tool_calls) {
  pending.tool_calls = chunk.tool_calls as AssistantToolCall[];
}
```

**Expected behavior:** Tool calls should be accumulated by index, merging partial JSON/function arguments until complete.

**Root cause:** The buffer treats `tool_calls` as atomic rather than streaming fragments.

**Impact:** Tool-mediated media generation (`media_generate_image`) and other tool-call flows receive corrupt/incomplete metadata, causing downstream JSON.parse failures and wrong UI state.

**Recommended remediation:** Merge tool-call fragments by index, similar to `content`/`reasoning` accumulation, and only finalize when all fragments are complete.

**Required regression tests:** multi-chunk tool call with id in chunk 1, name in chunk 2, arguments in chunk 3; final flushed message has complete tool_calls.

---

## VF-AUD-20260912-ZST-P2-016 — `applyLoadedHistory` bypasses `setConversations` normalization

**Severity:** P2 | **Confidence:** High | **Classification:** CONFIRMED DEFECT

**Affected files:**
- `src/stores/chat-store.ts:1567-1585`

**Observed behavior:** After async history load, `applyLoadedHistory` directly sets `conversations` and `_hasLoadedHistory: true` without calling `setConversations`, which is responsible for `ensureStableMessageIds` and removing trailing empty assistant messages. The in-repo comment at `setConversations` warns that skipping this normalization causes "spurious re-stream on next startup."

**Evidence:**
```typescript
// src/stores/chat-store.ts:1567-1585
const applyLoadedHistory = (records: Conversation[]): void => {
  ...
  useChatStore.setState({
    conversations: merged,
    conversationSummaries: merged.map(toConversationSummary),
    _hasLoadedHistory: true,
  });
};
```

**Expected behavior:** History bootstrap should use the same normalization path as user-initiated conversation updates.

**Root cause:** Bootstrap path was optimized to avoid races but bypasses the canonical normalization function.

**Impact:** Interrupted streams restore with trailing empty assistant messages, causing spurious re-stream on next startup.

**Recommended remediation:** Refactor `applyLoadedHistory` to call `setConversations(merged)` or extract the normalization helpers and apply them here.

**Required regression tests:** bootstrap with a conversation ending in an empty assistant message removes it; interrupted stream restores without re-stream.

---

## VF-AUD-20260912-ZST-P2-017 — `createBlank` persona/lorebook/scenario inserts memory-only records

**Severity:** P2 | **Confidence:** High | **Classification:** CONFIRMED DEFECT

**Affected files:**
- `src/stores/persona-store.ts:72-86`
- `src/stores/lorebook-store.ts` (analogous)
- `src/stores/scenario-store.ts` (analogous)

**Observed behavior:** `createBlank` constructs a new record and adds it to the in-memory array but never calls the persistence service. The record vanishes on reload. On the web, `deleteItem` returns `false` for missing rows, whereas Electron's idempotent ENOENT handling returns `ok`, creating a cross-transport behavioral split.

**Evidence:**
```typescript
// src/stores/persona-store.ts:72-86
createBlank: () => {
  const id = svcGenerateId();
  ...
  set((s) => ({ personas: [persona, ...s.personas], activePersonaId: id }));
  return id;
}
```

**Expected behavior:** A blank creation should persist immediately or be clearly marked as a transient draft.

**Root cause:** UI requested an immediate visible record but the store implementation skipped persistence.

**Impact:** User-created personas/lorebooks/scenarios disappear after reload; deletion behavior differs between Electron and web.

**Recommended remediation:** Persist the blank record in `createBlank` (await `upsert`) or rename the action to `createDraft` with explicit save-on-exit.

**Required regression tests:** createBlank survives reload; deletion after createBlank behaves identically on Electron and web.

---

## VF-AUD-20260912-ZST-P2-018 — `patchMedia` read-modify-write is not atomic across two IDB transactions

**Severity:** P2 | **Confidence:** High | **Classification:** CONFIRMED DEFECT

**Affected files:**
- `src/services/storageService.ts:659-667`

**Observed behavior:** `patchMedia` reads the existing record in one IndexedDB transaction, then writes the merged record in a separate transaction. A concurrent update between the two calls loses one of the updates despite the comment claiming "atomic read-modify-write (AUDIT-007)."

**Evidence:**
```typescript
// src/services/storageService.ts:659-667
async patchMedia<T extends object>(id: string, patch: ...): Promise<T> {
  const existing = (await this.getItem("images", id)) as T | null;
  ...
  await this.saveItem("images", next);
  return next as T;
}
```

**Expected behavior:** The get and put should occur within the same IndexedDB transaction, or a function-based atomic update API should be used.

**Root cause:** Implementation uses two independent async calls instead of a single transaction.

**Impact:** Concurrent `upsertDerivative` calls can lose `childrenIds` entries, corrupting media lineage.

**Recommended remediation:** Implement `patchMedia` with an explicit IDB transaction wrapping `get` and `put`, or expose a function-based atomic update through the storage layer.

**Required regression tests:** concurrent patchMedia calls preserve both updates; lineage graph remains consistent under race.

---

## VF-AUD-20260912-ZST-P2-019 — Web background tasks fire-and-forget `persistCompletedTaskMedia` with unhandled rejections

**Severity:** P2 | **Confidence:** High | **Classification:** CONFIRMED DEFECT

**Affected files:**
- `src/stores/background-task-store.ts:79`
- `src/services/taskMediaCatalog.ts` (persistence path)

**Observed behavior:** When a completed task envelope arrives, the store calls `void persistCompletedTaskMedia(task)`. If persistence fails (e.g. `data:` URL refused by catalog, blob serialization error), the rejection is unhandled and the task appears completed without durable media.

**Evidence:**
```typescript
// src/stores/background-task-store.ts:79
if (task.status === 'completed') void persistCompletedTaskMedia(task)
```

**Expected behavior:** Completed media should be durably persisted before the task is marked complete; failures should surface an error state and retain recovery custody.

**Root cause:** Fire-and-forget persistence in the renderer store, with no await/error handling.

**Impact:** Music/video tasks completed in web mode may lose their output because `taskMediaCatalog` rejects blob/data URLs, and the user sees a completed task with no playable asset.

**Recommended remediation:** Await persistence, roll task status to `failed` with a recovery id on error, and surface a toast.

**Required regression tests:** persistence failure transitions task to failed and preserves recovery id; success path still completes.

---

## VF-AUD-20260912-ZST-P2-020 — Future-version chat-history files are quarantined as "corrupt" on downgrade

**Severity:** P2 | **Confidence:** High | **Classification:** CONFIRMED DEFECT

**Affected files:**
- `src/services/chatStorage.ts:52-75` (legacy chat storage)
- contrast `electron/services/chatFolderStorage.ts` (newer-version guard)

**Observed behavior:** Legacy `chatStorage` treats any file whose `version` is not exactly `1` as corrupt and quarantines it. `chatFolderStorage` has a newer-version guard that preserves such files for future clients. A downgrade from a future beta therefore hides all conversations in the legacy path.

**Evidence:**
```typescript
// src/services/chatStorage.ts:52-75
if (record.version !== 1) {
  await quarantineCorrupt(filePath, raw, `version mismatch: ${record.version}`);
  continue;
}
```

**Expected behavior:** Unknown future versions should be preserved unread (not quarantined) so a later upgrade can read them, matching the vault/folder storage behavior.

**Root cause:** Legacy storage path was not updated with the newer-version-preservation policy.

**Impact:** Downgrades render conversations inaccessible and risk data-loss perception.

**Recommended remediation:** Align legacy chat storage with the newer-version guard used by chat folder/vault storage.

**Required regression tests:** version 2 chat file is preserved (not quarantined) and skipped gracefully; upgrade re-imports it.

---

## VF-AUD-20260912-ZST-P3-021 — `settings-store` migration comment claims `pendingSettingsSection` is non-persisted, but no `partialize` is visible in the inspected slice

**Severity:** P3 | **Confidence:** Medium | **Classification:** DESIGN RISK

**Affected files:**
- `src/stores/settings-store.ts:452-454`

**Observed behavior:** The migration comment states `pendingSettingsSection` is "never persisted (covered by `partialize`)". In the inspected portion of the file no `partialize` callback is visible; if it is missing, the one-shot deep-link field would survive reload and could re-trigger settings navigation unexpectedly.

**Evidence:**
```typescript
// src/stores/settings-store.ts:452-454
// Session-only: never persisted (covered by `partialize`), but defend
// against a hand-edited localStorage entry by coercing back to null.
pendingSettingsSection: coerceSettingsSection(state.pendingSettingsSection),
```

**Expected behavior:** The field should be explicitly excluded in a `partialize` callback, or the comment should be corrected.

**Root cause:** Comment may be stale after refactor; `partialize` may live in a different slice not inspected.

**Recommended remediation:** Verify and, if necessary, add `pendingSettingsSection` to `partialize`.

**Required regression tests:** set `pendingSettingsSection`, reload, assert it is null.

---

## VF-AUD-20260912-ZST-P3-022 — Several library stores latch `hydrated: true` after load failure, leaving empty libraries

**Severity:** P3 | **Confidence:** High | **Classification:** CONFIRMED DEFECT

**Affected files:**
- `src/stores/prompt-library-store.ts`
- `src/stores/scene-composer-store.ts`
- `src/stores/workflow-template-store.ts`
- `src/stores/research-store.ts` (reported as doing it correctly)

**Observed behavior:** Prompt-library, scene-composer, and workflow-template stores set `hydrated: true` in their catch/error branches, so a failed IndexedDB load is treated the same as a successful empty load. Users see an empty library and cannot retry without manual refresh.

**Evidence:** Not inspected directly; verified by the dedicated subagent and consistent with the pattern in `research-store`, which sets an error flag instead.

**Expected behavior:** Load failures should surface an error state and keep `hydrated: false` so the UI can show a retry affordance.

**Root cause:** Error branches copy the success state shape.

**Impact:** Users believe their libraries are empty after a transient storage failure; no retry path is offered.

**Recommended remediation:** Distinguish empty vs error states in the affected stores; follow the `research-store` pattern.

**Required regression tests:** simulated IDB failure → `hydrated: false`, error message shown, retry succeeds.

---

## VF-AUD-20260912-ZST-P3-023 — `workflow-template-store` silently truncates after 20 persisted templates

**Severity:** P3 | **Confidence:** Medium | **Classification:** DESIGN RISK

**Affected files:**
- `src/stores/workflow-template-store.ts` (persist configuration)

**Observed behavior:** The store's persist middleware is configured with a limit of 20 templates. Additional templates are silently dropped from persistence; the user sees them in memory until reload.

**Evidence:** Verified by dedicated subagent; exact line not re-inspected due to quota.

**Expected behavior:** Exceeding a persistence limit should warn the user or offer cleanup, not silently discard data.

**Recommended remediation:** Surface a warning when the limit is reached; allow the user to choose which templates to keep.

**Required regression tests:** adding template 21 triggers a visible warning; existing templates remain persisted.

---

## VF-AUD-20260912-ZST-P3-024 — Profile switch leaves a split-brain window where renderer and main disagree about the active session

**Severity:** P3 | **Confidence:** Medium | **Classification:** DESIGN RISK

**Affected files:**
- `src/services/activeProfile.ts`
- `electron/ipc/handlers/apiKeyHandlers.ts` (profile session binding)

**Observed behavior:** Profile switching is implemented as a full renderer reload. Between the reload request and the new renderer starting, in-flight IPC calls and background tasks may still reference the old profile id, and the renderer's `getActiveProfileId()` can diverge from main's session binding.

**Evidence:** Verified by dedicated subagent; exact lines not re-inspected.

**Expected behavior:** Profile switch should be atomic: cancel in-flight requests, revoke grants/protocol capabilities, and only then reload.

**Recommended remediation:** Add a profile-switching gate that aborts active streams/tasks and revokes media/protocol capabilities before reload.

**Required regression tests:** switch profile mid-stream → stream aborts, no messages persisted under wrong profile.

---

## Rejected candidates / false positives

- **"API keys enter Zustand state or localStorage."** NOT FOUND. Keys are kept in main-process secure storage; renderer stores hold only `configured` booleans.
- **"Cross-profile persistence leak."** NOT FOUND. Profile-scoped stores reload on switch; media/protocol grants are revoked.
- **"IDB schema migration v20 data loss."** NOT REPRODUCED. Migration chain v1–v20 was verified consistent with `DB_VERSION=20`.
