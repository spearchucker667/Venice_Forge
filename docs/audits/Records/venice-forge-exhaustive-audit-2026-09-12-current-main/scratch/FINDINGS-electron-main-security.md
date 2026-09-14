# FINDINGS — Electron Main-Process Security Audit (Domain: electron main / preload / utils / protocols / IPC boundary)

- **Audit date:** 2026-09-12
- **Audited commit:** `84cf5bbe` (main) — `git status` clean at audit time; no repository files were modified, created, or deleted during this audit. This report is the only file written.
- **Scope:** `electron/main.ts`, `electron/preload.ts`, `electron/utils/**`, `electron/ipc/**` (validation + all handlers), custom-protocol handlers and privileges, `webPreferences` anywhere in `electron/`, `shell.openExternal`/`shell.openPath`, navigation/window-open controls, `safeStorage` boundaries, headless bridge server, auto-update IPC.
- **Scope note:** There is **no `electron/security/` directory** at this commit. The security enforcement layer lives in `electron/utils/` (`validateIpcSender`, `customProtocolAccess`, `navigation`, `rendererCsp`, `secureFile`, `bridgeHost`, `rateLimit`), `electron/ipc/validation.ts`, `electron/ipc/handlers/common.ts`, and per-service guards. All of it was reviewed line-by-line. `git diff --stat c1aa891b 84cf5bbe -- electron/` is **empty** — no electron source changed between the prior 2026-09-12 audit commit and current HEAD, so prior remediation claims about electron code apply verbatim to this HEAD; every claim below was nevertheless re-verified directly against the checked-out files.
- **Method:** Independent line-by-line review of every file in scope, plus one out-of-tree empirical probe (a minimal Electron 43.2.0 app in `/tmp`, no repo files touched) to settle CSP-delivery behavior for `file://` documents and custom-scheme `<audio>` loads.

---

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

## VF-AUD-20260912-P1-001 — Renderer CSP `media-src` omits `venice-tts:`, blocking the default TTS playback path

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

## VF-AUD-20260912-P2-002 — Custom-protocol media authorization relies on originless-request allowance; capability tokens scaffolded but unwired

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

## VF-AUD-20260912-P3-003 — Unreachable privileged IPC channels `documentAgent:workspace:proposeChangeset|proposeMove|proposeTrash`

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

## VF-AUD-20260912-P3-004 — No automated assertion that the production CSP is delivered to the packaged `file://` renderer

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
