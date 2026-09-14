# Venice Forge Electron / IPC Security Audit

- **Date:** 2026-09-10
- **Auditor:** principal Electron security review (read-only)
- **Repository:** `spearchucker667/Venice_Forge`
- **Branch:** `main` (`origin/main`)
- **Baseline SHA:** `c3ae21af2f723111d92b43c7888a60930226d213`
- **Package version:** `3.0.0-beta.3` (from `package.json`)
- **Scope:** `electron/main.ts`, `electron/preload.ts`, `electron/ipc/**`, sender/navigation/CSP/protocol helpers, `secureStore` / `providerSettingsStore` / `guardPipeline` / `logger` / `generatedMediaStore`, and `src/services/desktopBridge.ts`
- **Method:** independent source review of the checked-out tree. Historical files under `docs/audits/Records/` were **not** used as evidence.
- **Worktree note:** only unrelated uncommitted audit/docs files and `.gitignore`; Electron source matches the baseline SHA.

## Finding counts

| Classification | P0 | P1 | P2 | P3 | Total |
|---|---:|---:|---:|---:|---:|
| CONFIRMED DEFECT | 0 | 3 | 7 | 4 | 14 |
| LIKELY DEFECT | 0 | 0 | 1 | 1 | 2 |
| DESIGN RISK | 0 | 1 | 7 | 8 | 16 |
| TEST GAP | 0 | 0 | 0 | 2 | 2 |
| DOCUMENTATION DEFECT | 0 | 0 | 1 | 1 | 2 |
| IMPROVEMENT | 0 | 0 | 1 | 3 | 4 |
| FALSE POSITIVE | 0 | 0 | 0 | 0 | 0 |
| **Total findings** | **0** | **4** | **17** | **19** | **40** |

No P0 renderer-to-Node escape (`nodeIntegration`, disabled `contextIsolation`, unsandboxed preload, raw `ipcRenderer` leak, or typed `apiKey:get` of the Venice key) was found in current source.

---

## Controls that hold (current source)

These are **not** findings. They are verified against the checked-out tree.

- BrowserWindow `webPreferences`: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, `devTools` off in packaged builds unless `VENICE_FORGE_DEBUG_DEVTOOLS=true`.
- No `webviewTag`, `BrowserView`, `WebContentsView`, `allowRunningInsecureContent`, `disableWebSecurity`, `NODE_TLS_REJECT_UNAUTHORIZED`, or `certificate-error` bypass.
- Production CSP: `script-src 'self'`, `style-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`, `frame-ancestors 'none'`. `connect-src` does not include `https://api.venice.ai` (renderer is not supposed to talk to Venice directly).
- Navigation: `will-navigate` + `setWindowOpenHandler` deny; `shell.openExternal` only after `isTrustedExternalUrl` (`https:` and non-private hostname) **and** a native confirmation dialog.
- `session.defaultSession.setPermissionRequestHandler` denies all permission requests.
- Every registered `ipcMain.handle` channel goes through `registerPrivilegedIpcChannel` (sender validation **then** rate limit). `registerIpcChannel` (no sender check) is defined but unused.
- Preload exposes a cloned `window.veniceForge` object only. It does **not** expose `ipcRenderer`, `require`, or Node primitives.
- Typed Venice/Jina/provider key APIs return configuration booleans / sanitized status, not key material. `config:get` / `writeSanitized` strip plaintext keys. Renderer `localFamilySafeModeEnabled` is dropped in `validateVeniceIpcRequest`; `guardPipeline` reads the main-process snapshot.
- Credential selection for Venice/Jina/provider keys uses `getProfileSessionId(event.sender)`, not renderer-supplied `profileId`.
- `app:proxyScrape` pins DNS (`lookup` callback) after rejecting private A/AAAA records, blocks redirects, caps body size, and screens the body through Family Safe Mode.
- `jina:request` allowlists `r.jina.ai` / `s.jina.ai` over HTTPS and allowlists forwarded headers.
- Generated-media IDs are sha256; protocol handlers reject non-hex keys; `readRegularFileNoFollow` is used for character-cache and TTS reads.
- Backup file import uses opaque, sender+profile-bound capabilities (`chat-folders:pick-import-file`). Sync folder paths cannot be set to an arbitrary renderer path (`sync:setSyncFolder` only no-ops if it already matches the picker-chosen folder).
- Renderer `window.veniceForge.*` consumers in `src/` are confined to `src/services/desktopBridge.ts` (other hits are comments).

---

## Revalidated as repaired (current source, not copied from 2026-08-15 records)

These classes of issue are **not present** in the current tree. Listed so a prior 2026-08-15 finding of the same shape is not re-filed as open.

| Topic | Current evidence |
|---|---|
| `nodeIntegration` / missing `contextIsolation` / missing `sandbox` | `electron/main.ts` `webPreferences` sets isolation, no Node in renderer, sandbox on. |
| Privileged IPC without sender-frame checks | `registerPrivilegedIpcChannel` in `electron/ipc/handlers/common.ts`; registration tests in `common.security.test.ts` and `validateIpcSender.test.ts`. |
| Renderer-authoritative Family Safe Mode flag | `validateVeniceIpcRequest` drops `localFamilySafeModeEnabled`; `guardPipeline.ts` uses `getRuntimeLocalFamilySafeModeEnabled()`. |
| Generic `app:readLocalFile` **handler** that reads a renderer-supplied path | Handler is **absent**. Only a dead preload stub remains (see SEC-016). |
| `credential:get` of `master_password` / `profile_password` / chat-folder lock keys | `isReservedCredentialName` returns null / no-op for those names (`apiKeyHandlers.ts`, `apiKeyHandlers.reserved.test.ts`). |
| `config:writeSanitized` toggling Family Safe Mode | Explicitly rejected; dedicated `safety:setFamilySafeMode` requires master password. |
| Sync folder set from arbitrary renderer path | `sync:setSyncFolder` rejects unless path already equals the picker-configured folder. |
| Renderer-supplied fallback provider config honored | `performVeniceRequest` comment + `getProviderSettings(request.profileId)` — renderer `fallbackConfig` is wire-compat only (see SEC-030). |
| CSP `'unsafe-inline'` for production scripts | Production `script-src 'self'` in `rendererCsp.ts`. |
| Unrestricted `shell.openExternal` | HTTPS + non-private host + native prompt. |
| Headless bridge bound on `0.0.0.0` / missing token | Host allowlist `127.0.0.1`/`localhost`/`::1`; headless requires strong `VENICE_BRIDGE_TOKEN`. |
| Duplicate IPC channel registration | `registeredChannels` Set throws on duplicates; `registration.test.ts` asserts `registerIpcHandlers()` does not throw. |

---

## Findings

### VF-AUD-20260910-SEC-001

- **Severity:** P1
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Evidence:** `electron/preload.ts:88-97`, `electron/ipc/handlers/apiKeyHandlers.ts:426-447`

```88:97:electron/preload.ts
  credentials: {
    set(key: string, value: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("credential:set", { key, value });
    },
    get(key: string): Promise<{ ok: boolean; value: string | null; error?: string }> {
      return ipcRenderer.invoke("credential:get", key);
    },
```

```438:447:electron/ipc/handlers/apiKeyHandlers.ts
  registerPrivilegedIpcChannel("credential:get", (_event, key: string) => {
    try {
      if (isReservedCredentialName(key)) {
        return { ok: true, value: null };
      }
      const val = getCredential(key);
      return { ok: true, value: val };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
```

- **Observed:** Preload and `desktopCredentials` expose a generic secret KV. `credential:get` returns decrypted plaintext to the renderer for any name not matching the reservation policy. Reservation blocks passwords / unlock-secrets / `chat-folder-lock:*` but **explicitly allows** names such as `venice_api_key`, `openai_api_key`, `jina_api_key` (`apiKeyHandlers.reserved.test.ts`). There is no first-party `src/` caller besides the unused `desktopCredentials` wrapper; XSS or any renderer script can still invoke `window.veniceForge.credentials.get/set`.
- **Expected:** Renderer never receives raw credentials. Typed APIs (`apiKey:*`, `jinaApiKey:*`, `providerApiKey:*`) already follow that contract.
- **Root cause:** A generic secret bridge was left on the contextBridge after typed key APIs were introduced. Reservation is a denylist, not a removal of the get path.
- **Impact:** Compromised renderer can persist and exfiltrate any non-reserved secret stored in `secure-prefs` / Windows Credential Manager under `cred_*`. Future main-process secrets that do not contain `"password"` will leak. This does **not** currently dump the typed Venice `apiKey` slot (`apiKey` vs `cred_apiKey` namespaces are distinct) — that is why this is P1, not P0.
- **Remediation:** Remove `credentials.{get,set,delete}` from preload and `desktopCredentials`. Keep `getCredential` main-process-only. If a renderer-visible generic store is required, return presence booleans only.
- **Tests required:** Handler registration test that `credential:get/set/delete` are unregistered; preload surface test that `window.veniceForge.credentials` is absent; reserved-name tests remain as defense-in-depth until removal.

---

### VF-AUD-20260910-SEC-002

- **Severity:** P1
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Evidence:** `electron/ipc/handlers/apiKeyHandlers.ts:626-637`, `electron/preload.ts:137-139`

```626:637:electron/ipc/handlers/apiKeyHandlers.ts
  registerPrivilegedIpcChannel("profilePassword:clear", (event, profileId: unknown) => {
    try {
      // The default profile cannot acquire a verifier; allowing explicit
      // default cleanup preserves recovery from historical orphan rows.
      const requestedId = parseProfileId(profileId);
      const validId = requestedId === "default" ? "default" : getProfileSessionId(event.sender);
      clearProfilePassword(validId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });
```

- **Observed:** Clearing a non-default profile password requires only that the profile is the active session. No current password, master password, or native confirmation is required. Contrast `masterPassword:clear`, which requires `verifyMasterPassword`.
- **Expected:** Removing profile password protection is a privileged identity operation and must require the current verifier (and lockout), same as master-password clear.
- **Root cause:** Session binding was added to stop cross-profile clears, but authentication of the clear itself was omitted.
- **Impact:** Any trusted renderer (XSS, malicious extension of renderer JS, compromised dependency in the renderer bundle) can silently drop password protection for the unlocked profile. Persistence of the profile lock is renderer-revocable.
- **Remediation:** Require `currentPassword` and `verifyProfilePassword` (honor lockout) before `clearProfilePassword`. Keep the default-profile orphan-row cleanup as a separate, non-secret no-op if needed.
- **Tests required:** Handler tests: clear without password fails; wrong password lockout; success only after verify; other-profile id is ignored in favor of session id.

Related lockout path (same handler family): `profilePassword:set` also does not require the existing password, so XSS can **replace** the verifier and lock the user out. See SEC-034.

---

### VF-AUD-20260910-SEC-003

- **Severity:** P1
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Evidence:** `electron/ipc/rpHandlers.ts:99-107`, `electron/services/characterCardStorage.ts:45-47`, `electron/services/rpSingleFileStore.ts:33-34`

```99:107:electron/ipc/rpHandlers.ts
  handleIpc("characterCards:list", async () => {
    try {
      const { cards, truncated, totalScanned } = await listCharacterCards();
      return { ok: true, cards, truncated, totalScanned };
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("characterCards:list failed", message);
      return { ok: false, error: message, cards: [], truncated: false, totalScanned: 0 };
    }
  });
```

```45:47:electron/services/characterCardStorage.ts
export function getCharactersDir(): string {
  return path.join(app.getPath("userData"), CHARACTERS_DIR);
}
```

- **Observed:** RP IPC (`characterCards:*`, `personas:*`, `lorebooks:*`, `rpChats:*`, `rpAssets:*`, `scenarios:*`) never calls `getProfileSessionId`. Storage roots are global under `userData` (`characters/`, plus single-file store directories). Chat, conversations, chat-folders, API keys, TTS cache, and background tasks **are** profile-scoped.
- **Expected:** Profile session is a privacy/security boundary. RP cards include system prompts, adult flags, and avatars; they must not be listable/writable from another profile.
- **Root cause:** RP studio storage was implemented as a single global library and never bound to the later profile-session model.
- **Impact:** Switching profiles does not isolate RP content. A “guest” or secondary profile can read/modify/delete another profile’s characters, personas, lorebooks, and RP chats. `sync:applyRemoteMutation` for `character_cards` / `personas` / `lorebooks` / `rp_chats` is likewise unscoped.
- **Remediation:** Namespace RP directories by `getProfileSessionId(event.sender)`; pass profile into `sync:applyRemoteMutation` RP branches; migrate existing global data into `default` with a documented one-time move.
- **Tests required:** Two-profile fixture: list/get/save/delete isolation; applyRemoteMutation cannot write another profile’s RP records.

---

### VF-AUD-20260910-SEC-004

- **Severity:** P1
- **Confidence:** High
- **Classification:** DESIGN RISK
- **Evidence:** `electron/ipc/handlers/documentAgentHandlers.ts:93-110`, `208-256`

```93:110:electron/ipc/handlers/documentAgentHandlers.ts
  registerPrivilegedIpcChannel("documentAgent:permissions:set", (event, input: unknown) => {
    try {
      const value = record(input);
      const agentSessionId = stringField(value, "agentSessionId", 128);
      const preset = stringField(value, "preset", 64) as AgentPermissionPreset;
      return {
        ok: true,
        preset: setEffectiveAgentPermissionPreset(
          event.sender,
          getProfileSessionId(event.sender),
          agentSessionId,
          preset,
        ),
      };
```

```209:213:electron/ipc/handlers/documentAgentHandlers.ts
  registerPrivilegedIpcChannel("documentAgent:approvals:decide", async (event, input: unknown) => {
    try {
      const value = record(input);
      const decision = stringField(value, "decision", 10);
      if (decision !== "approve" && decision !== "reject") throw new Error("Invalid approval decision.");
```

- **Observed:** The renderer may set any valid agent preset, including `workspace_with_approval` / `media_with_approval`. `approvals:decide` executes workspace changeset/move/trash **without a native confirmation dialog** once a grant exists. Export is the exception (save dialog + main-frame check). Workspace **choose** uses a native folder picker (good).
- **Expected:** AGENTS.md: renderer state is not authoritative for security-sensitive permission decisions; destructive workspace writes should be user-mediated in the main process, not only a renderer button that calls IPC.
- **Root cause:** Approval UX lives in the renderer. Main process treats a privileged IPC “approve” as the user.
- **Impact:** XSS in a session that already has a workspace grant can self-propose and self-approve writes/moves/trashes inside that grant. This is not a grant forgery (grant is session-bound) and not a path-escape (path-policy is strict). It **is** bypass of the human approval step.
- **Remediation:** For workspace apply/move/trash, require a main-process dialog (or OS prompt) on approve, or bind approve to a one-time capability minted only after a native confirmation. Do not let `permissions:set` raise presets without a matching user gesture.
- **Tests required:** Adversarial test: proposeChangeset + decide(approve) without a dialog hook fails; native-confirm path succeeds; grant from another session is CAPABILITY_DENIED.

---

### VF-AUD-20260910-SEC-005

- **Severity:** P2
- **Confidence:** High
- **Classification:** DESIGN RISK
- **Evidence:** `electron/utils/customProtocolAccess.ts:123-136`, `electron/main.ts:389-402`

```123:136:electron/utils/customProtocolAccess.ts
export function evaluateCustomProtocolAccess(
  input: CustomProtocolAccessInput,
): CustomProtocolAccessDecision {
  const origin = input.origin?.trim() ?? "";
  const referrer = input.referrer?.trim() ?? "";

  // Image / media loads may omit both. Without an explicit foreign origin, treat
  // the request as renderer-initiated so we still serve the cached resource.
  if (!origin) {
    if (referrer.length === 0 || isAllowedRendererReferrer(referrer, input.isDev, input.rendererRoot)) {
      const allowOrigin = input.isDev ? DEV_RENDERER_ORIGIN : "null";
      return { allowed: true, allowOrigin, vary: "Origin" };
    }
```

```389:402:electron/main.ts
    protocol.handle(GENERATED_MEDIA_SCHEME, async (request) => {
      const parsedUrl = new URL(request.url);
      const id = parsedUrl.hostname || parsedUrl.pathname.replace(/^\/+/, '');
      // Future VF-CAPABILITY-PROVENANCE: extract `?cap=<token>` via
      // `parseCustomProtocolCapabilityUrl(request.url)` and verify it through the
      // app-scoped capability manager ...
      return createGeneratedMediaResponse(id, request, {
        isDev,
        origin: request.headers.get("origin"),
        referrer: request.referrer,
        rendererRoot: packagedRendererRoot,
      });
```

- **Observed:** Capability-token manager exists but is **not wired**. Origin-less `venice-media://`, `venice-tts://`, and `venice-character-cache://` requests are allowed. Access control is unguessable sha256 object ids + CORS never `*`. Generated media is **not** profile-scoped (content-addressed global blob store).
- **Expected:** Provenance-less media loads should present a short-lived, session/profile-bound capability (the module’s own documented future model).
- **Root cause:** Playback compatibility for Chromium media elements that omit Origin/Referer.
- **Impact:** Any code that can request a custom-scheme URL in this session and that knows (or is told) a 64-hex id can read that blob, including across profiles. Ids are not guessable; leakage is via renderer HTML, logs, or sync metadata.
- **Remediation:** Wire `createCustomProtocolCapabilityManager` into URL minting (`persistGeneratedMedia` / TTS / character cache) and `protocol.handle` verify; revoke on profile switch / reload / shutdown as the comments already specify.
- **Tests required:** Origin-less request without `cap` denied (or allowed only with valid token); expired/wrong-profile token 403; media element still plays with minted URL.

---

### VF-AUD-20260910-SEC-006

- **Severity:** P2
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Evidence:** `electron/services/mediaService.ts:90-103`, used by `app:media:reveal` and `app:media:meta`

```90:103:electron/services/mediaService.ts
/** Returns the explicit list of "reveal-safe" base directories. Anything
 *  the renderer asks to reveal in the file manager must be inside one of
 *  these roots. The list intentionally excludes Documents and Downloads
 *  (where the user may have unrelated sensitive files). */
function revealSafeBaseDirs(): string[] {
  return [
    picturesBaseDir(),
    path.resolve(app.getPath("desktop")),
    path.resolve(app.getPath("downloads")),
    path.resolve(app.getPath("documents")),
    thumbsDir(),
    exportsBaseDir(),
  ];
}
```

- **Observed:** Comment claims Documents and Downloads are excluded. Implementation includes both, plus Desktop. `readMediaMeta` returns size/mtime/isFile for any realpath inside those trees. `revealMediaInFolder` opens Finder/Explorer on that path. Import of bytes was correctly tightened to Pictures/Venice Forge + thumbs (`importMediaFromPath` lines 154-158).
- **Expected:** Reveal/stat allowlist matches the documented “no unrelated user documents” policy. Renderer-supplied paths must not be an existence oracle for `~/Documents`.
- **Root cause:** Comment and allowlist drifted; import was hardened, reveal/meta were not.
- **Impact:** Trusted renderer that knows or guesses a path (e.g. `.../Documents/taxes.pdf`) can confirm existence and size, and pop the file in the OS file manager. It cannot read file bytes through this channel (import sniffs images only under Pictures/Venice Forge).
- **Remediation:** Remove Documents/Downloads (and likely Desktop) from `revealSafeBaseDirs`, or require those reveals to go through a fresh main-process dialog. Align the comment.
- **Tests required:** Meta/reveal of a Documents path denied; Pictures/Venice Forge still allowed; import still rejects Documents.

---

### VF-AUD-20260910-SEC-007

- **Severity:** P2
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Evidence:** `electron/services/mediaService.ts:303-355`, `electron/ipc/handlers/fileHandlers.ts:426-438`

```303:307:electron/services/mediaService.ts
/** Generates a thumbnail and stores it on disk. The sha256 is used as the
 *  cache key; the file is keyed `<sha>.png` and is content-addressable.
 *  Returns the on-disk path and a file:// URL the renderer can drop into
 *  an <img src>.
```

```354:355:electron/services/mediaService.ts
    await writeThumb(targetPath, webp);
    return { ok: true, filePath: targetPath, url: pathToFileURL(targetPath).href };
```

- **Observed:** IPC returns an absolute `userData/.../media-thumbs/...` path and a `file://` URL. Production CSP `img-src` is `'self' data: blob: venice-character-cache: venice-media:` — `file:` is not listed. `webSecurity: true` also blocks renderer `file://` loads of userData from a packaged `file://dist/index.html` origin.
- **Expected:** Renderer media URLs are `venice-media://` / `venice-character-cache://` opaque ids, not filesystem paths. AGENTS.md forbids private absolute machine paths in renderer-visible durable state.
- **Root cause:** Thumbnail helper predates the custom-protocol media store and still uses `pathToFileURL`.
- **Impact:** Path disclosure of `userData` to renderer/XSS. If CSP/`webSecurity` were ever relaxed, this would become arbitrary-thumb `file://` loads from userData. Functionally, thumbs may already fail in production CSP (separate product bug).
- **Remediation:** Serve thumbs via `venice-media://` or a dedicated custom scheme; return only the opaque id. Stop returning `filePath`.
- **Tests required:** Handler result has no `file:` URL and no absolute path; CSP fixture rejects `file:` img-src.

---

### VF-AUD-20260910-SEC-008

- **Severity:** P2
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Evidence:** `electron/ipc/handlers/inspectorTelemetryHandlers.ts:42-49` vs `electron/ipc/handlers/backgroundTaskHandlers.ts:27-35`

```42:49:electron/ipc/handlers/inspectorTelemetryHandlers.ts
function broadcast(event: InspectorTelemetryEvent): void {
  for (const webContents of Array.from(subscribers)) {
    if (webContents.isDestroyed()) {
      subscribers.delete(webContents);
      continue;
    }
    safeSendToRenderer(webContents, INSPECTOR_TELEMETRY_CHANNEL, event);
  }
}
```

- **Observed:** Inspector events (endpoint, method, status, error, model, taskId) are broadcast to **every** subscribed WebContents. Background-task broadcasts filter on `getProfileSessionId`. Events are designed not to include raw prompts (good).
- **Expected:** Profile-scoped diagnostics. Two windows / profile switch should not mix telemetry.
- **Root cause:** Subscriber set is process-global with no profile key.
- **Impact:** Cross-profile metadata leak (which endpoints ran, errors, task ids). Not a secret dump given current event shape.
- **Remediation:** Filter subscribers by `getProfileSessionId`, same as background tasks. Optionally bind subscribe to main frame.
- **Tests required:** Two WebContents with different profile sessions; events from A do not arrive at B.

---

### VF-AUD-20260910-SEC-009

- **Severity:** P2
- **Confidence:** Medium
- **Classification:** DESIGN RISK
- **Evidence:** `electron/services/generatedMediaRecoveryQueue.ts:40-82`, `electron/ipc/handlers/fileHandlers.ts:131-168`

```40:47:electron/services/generatedMediaRecoveryQueue.ts
export function retainGeneratedMediaForRecovery(bytes: Buffer, mimeType: string): {
  recoveryId: string
  byteCount: number
  sha256: string
} | null {
  prune()
  if (bytes.length === 0 || bytes.length > MAX_RECOVERY_BYTES) return null
  const recoveryId = crypto.randomUUID()
```

- **Observed:** Recovery custody is bounded (8 items, 128 MiB, 30 min, no prompt/URL/credentials) — that part matches AGENTS.md. Retry/Save-As require main-frame + BrowserWindow (good) but **do not bind `recoveryId` to sender id or profile**. Any trusted main frame that learns a UUID can retry or export another window’s bytes.
- **Expected:** Opaque recovery IDs are scoped to the issuing WebContents and profile.
- **Root cause:** Process-local Map keyed only by UUID.
- **Impact:** Cross-window/cross-profile export of failed-persist images if the UUID leaks into renderer state that is shared or logged. UUIDs are unguessable.
- **Remediation:** Store `{ senderId, profileId }` with each entry; reject mismatch.
- **Tests required:** Recovery from WebContents B with A’s id fails; same sender succeeds.

---

### VF-AUD-20260910-SEC-010

- **Severity:** P2
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Evidence:** `electron/services/characterImageCache.ts:219-224`, `electron/ipc/handlers/fileHandlers.ts:446-458`

```219:224:electron/services/characterImageCache.ts
  const attempt = async (requestUrl: string, withAuth: boolean): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (withAuth) {
      const key = getApiKey();
      if (key) headers["Authorization"] = `Bearer ${key}`;
    }
    return fetch(requestUrl, {
```

- **Observed:** Auth retry uses `getApiKey()` with the default profile, not `getProfileSessionId`. URL allowlist (`isTrustedVeniceImageUrl`) is otherwise strict (https + `outerface.venice.ai` / `venice.ai` / `api.venice.ai`, redirect checked). `redirect: "manual"` + one hop (good).
- **Expected:** Provider credentials are profile-scoped everywhere, including cache fetches.
- **Root cause:** Cache service predates profile session binding; IPC does not pass profile into `getCachedCharacterImage`.
- **Impact:** Character photo fetches on 401/403 authenticate with the default profile’s Venice key even when another profile is active. Wrong-account quota/auth; default key used outside its session.
- **Remediation:** Pass `getProfileSessionId(event.sender)` into `getCachedCharacterImage` → `getApiKey(profileId)`.
- **Tests required:** Non-default profile does not call `getApiKey()` without that id; 401 retry uses the session key.

---

### VF-AUD-20260910-SEC-011

- **Severity:** P2
- **Confidence:** High
- **Classification:** IMPROVEMENT
- **Evidence:** `electron/main.ts:506`, `536-557`

```506:506:electron/main.ts
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
```

- **Observed:** Permission **requests** are denied. There is no `setPermissionCheckHandler`, no `will-attach-webview` deny, and no `app.on('web-contents-created')` that applies `webPreferences` to unexpected contents. Window open is denied (good). No webview/BrowserView usage was found.
- **Expected:** Electron security checklist: deny webviews even if unused; use permission **check** handler (Electron 31+) so checks that never become requests still fail closed.
- **Root cause:** Hardening covers the request path and navigation, not the unused webview attach path.
- **Impact:** Defense-in-depth only today. A future webview/embed would inherit default attach behavior until someone remembers to add the listener.
- **Remediation:** `contents.on('will-attach-webview', (e) => e.preventDefault())` on `web-contents-created`; `setPermissionCheckHandler` return false.
- **Tests required:** `main.test.ts` asserts both handlers are registered.

---

### VF-AUD-20260910-SEC-012

- **Severity:** P2
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Evidence:** `electron/ipc/configHandlers.ts:177-184`, `electron/preload.ts:604-606`

```177:184:electron/ipc/configHandlers.ts
  handleIpc("config:resetSecureStoreKeys", () => {
    try {
      const removed = resetSecureStoreKeys();
      return { ok: true, removed };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });
```

- **Observed:** Wiping Venice and Jina keys requires only a trusted IPC invoke. No master password, no native confirm. Family Safe Mode changes **do** require the master password.
- **Expected:** Destructive credential deletion is gated like other identity operations (or at least a native dialog).
- **Root cause:** Settings “reset keys” was implemented as an unauthenticated privileged channel.
- **Impact:** XSS can delete stored API keys (availability/integrity of credentials, not confidentiality). User must re-enter keys.
- **Remediation:** Require master password when set; otherwise native confirmation. Bind to main frame.
- **Tests required:** Reset without password/dialog rejected when master password is set.

---

### VF-AUD-20260910-SEC-013

- **Severity:** P2
- **Confidence:** Medium
- **Classification:** LIKELY DEFECT
- **Evidence:** `electron/ipc/handlers/backgroundTaskHandlers.ts:141-165`

```141:165:electron/ipc/handlers/backgroundTaskHandlers.ts
      // P2-FIX: For provider-polled tasks (video, music), the renderer
      // must not authoritatively set status, queueId, stage, or resultUrl
      // — those are owned by the main-process poll loop. ...
      // Non-provider-polled tasks (image, research, document) can still
      // receive full updates from their rendering owner.
      const existingTask = getBackgroundTask(taskId);
      let safeUpdate = updatePayload;
      if (existingTask && (existingTask.type === 'video' || existingTask.type === 'music')) {
        safeUpdate = { metadata: {} };
        ...
      }

      const task = await updateBackgroundTaskInMain(taskId, safeUpdate);
```

- **Observed:** Video/music updates are stripped. Image/research/document tasks still accept renderer `status`, `resultUrl`, `queueId`, `stage`. Paid image generation now goes through `replicate:generateImage` / main `submitPaidQueue`, but `backgroundTask:update` remains a generic mutation API for other types.
- **Expected:** Completion and result URLs for any paid/provider task are main-process-only. Renderer may set UI notes only.
- **Root cause:** Partial fix applied only to video/music.
- **Impact:** Compromised renderer can mark an image/research task complete with an attacker-controlled `resultUrl` in persisted task metadata (completion notices / gallery association), even if bytes never hit `generatedMediaStore`.
- **Remediation:** Apply the same allowlist to all provider-backed types; persist results only after main-process download/validate.
- **Tests required:** Image task update with `status: completed` + `resultUrl` is ignored or rejected.

---

### VF-AUD-20260910-SEC-014

- **Severity:** P2
- **Confidence:** High
- **Classification:** DESIGN RISK
- **Evidence:** `electron/ipc/handlers/syncHandlers.ts:217-221`, `electron/preload.ts:761-763`

```217:221:electron/ipc/handlers/syncHandlers.ts
  registerPrivilegedIpcChannel("sync:decryptBackup", async (_event, params: { ciphertext: string, salt: string, iv: string, password: string }) => {
    try {
      const { decryptPayload } = await import("../../services/backupCrypto");
      const decrypted = await decryptPayload(params.ciphertext, params.salt, params.iv, params.password);
      return { ok: true, data: decrypted };
```

- **Observed:** Decrypt returns the full plaintext backup document to the renderer. Encrypt **is** lease-bound to sender/profile/token (good). Decrypt is not lease-bound and has no size/schema check at the IPC layer beyond what `decryptPayload` does.
- **Expected:** Import preview and apply stay in main process; renderer receives counts/conflicts, not the decrypted corpus.
- **Root cause:** Backup UX decrypts in main then hydrates renderer stores from the plaintext string.
- **Impact:** XSS that already has the user password (or that is invoked during a user-initiated import) receives the entire backup in renderer memory. Password still required (not a free decrypt). Violates “encrypt before leaving the local app-data trust boundary” in spirit: plaintext re-enters the renderer.
- **Remediation:** `decryptBackup` should parse/validate in main and return a preview DTO; apply should be a main-process import. At minimum bind decrypt to a begin-import lease like encrypt.
- **Tests required:** Decrypt result is not a raw JSON dump of conversations; wrong password fails closed; lease mismatch fails.

---

### VF-AUD-20260910-SEC-015

- **Severity:** P2
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Evidence:** `electron/services/logger.ts:205-211`, `electron/services/configService.ts:654-660`, `electron/ipc/handlers/syncHandlers.ts:41-43`, `electron/ipc/handlers/fileHandlers.ts:270`, `electron/ipc/handlers/systemHandlers.ts:254-255` (diagnostics **do** basename — contrast)

```205:211:electron/services/logger.ts
export async function openLogsFolder(): Promise<{ ok: boolean; path: string; error?: string }> {
  ensureLogFile();
  const result = await shell.openPath(getLogsDir());
  if (result) {
    return { ok: false, path: getLogsDir(), error: result };
  }
  return { ok: true, path: getLogsDir() };
}
```

```41:43:electron/ipc/handlers/syncHandlers.ts
  registerPrivilegedIpcChannel("sync:getSyncFolder", async () => {
    return { ok: true, path: getSyncFolder(), ...getSyncStatus() };
  });
```

- **Observed:** Several privileged channels return absolute machine paths: logs dir, config dir, sync folder, `app:saveJsonFile` `filePath`, media import `filePath`, media meta `filePath`. `app:getDiagnostics` correctly returns only `path.basename(userData)`.
- **Expected:** Renderer-visible paths are labels or opaque; diagnostics already follow that rule.
- **Root cause:** Dialog/reveal results were forwarded verbatim.
- **Impact:** XSS learns username, volume layout, and sync-folder location. Useful for SEC-006 path oracles and social engineering. Not a direct file read.
- **Remediation:** Return basenames / “user config directory” labels (as `redactConfigPaths` already does for `config:getStatus`). Keep absolute paths in main only.
- **Tests required:** `openLogsFolder` / `getSyncFolder` / `openFolder` payloads contain no `/Users/` or `C:\Users\` prefixes.

---

### VF-AUD-20260910-SEC-016

- **Severity:** P3
- **Confidence:** High
- **Classification:** TEST GAP
- **Evidence:** `electron/preload.ts:332-334` vs no `registerPrivilegedIpcChannel("app:readLocalFile")` anywhere under `electron/`

```332:334:electron/preload.ts
    readLocalFile(): Promise<{ ok: boolean; canceled?: boolean; content?: string; filename?: string; error?: string }> {
      return ipcRenderer.invoke("app:readLocalFile");
    },
```

- **Observed:** Preload still invokes `app:readLocalFile`. No handler is registered. `desktopBridge.ts` does not wrap it (good). Historical comments in `configService.ts` still mention “matches app:readLocalFile policy”.
- **Expected:** Dead privileged surfaces are removed so they cannot be re-implemented loosely.
- **Root cause:** Handler removed; preload stub left.
- **Impact:** Invoke fails at runtime if anything calls it. The dangerous generic-read primitive is not live. Residual risk is a future incomplete re-add.
- **Remediation:** Delete preload `files.readLocalFile` and the `VeniceForge` type field. Add a contract test: channel not registered.
- **Tests required:** Preload surface snapshot; `ipcMain` listener list excludes `app:readLocalFile`.

---

### VF-AUD-20260910-SEC-017

- **Severity:** P3
- **Confidence:** High
- **Classification:** TEST GAP
- **Evidence:** handlers in `documentAgentHandlers.ts:384-464` vs preload `documentAgent.workspace` (`electron/preload.ts:865-871`)

- **Observed:** Main registers `documentAgent:workspace:proposeChangeset|proposeMove|proposeTrash`. Preload does **not** expose them. Renderer cannot call them without raw `ipcRenderer` (not exposed). Conversely, preload exposes `conversations:archive` with a handler, but `desktopBridge` has no `archive` wrapper — still callable as `window.veniceForge.conversations.archive`.
- **Expected:** Preload method set ≡ privileged handler set ≡ desktopBridge wrappers, except documented internals.
- **Root cause:** Workspace mutation UX goes through `approvals:decide` + agent tools; extra channels were added for agent-side propose and never bridged. Archive was left off the bridge.
- **Impact:** Dead privileged handlers increase attack surface if a future preload expose is careless. Unbridged `conversations.archive` is still a renderer-reachable privileged write.
- **Remediation:** Either expose propose* through desktopBridge with the same validation, or stop registering them if the agent executor is the only caller (agent is main-process and should not use IPC). Add `archive` to the bridge or remove the preload method.
- **Tests required:** Contract test enumerating preload invoke channels vs `ipcMain.handle` names.

---

### VF-AUD-20260910-SEC-018

- **Severity:** P3
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Evidence:** `electron/ipc/handlers/apiKeyHandlers.ts:464-471`

```464:471:electron/ipc/handlers/apiKeyHandlers.ts
  registerPrivilegedIpcChannel("masterPassword:set", (_event, password: unknown) => {
    try {
      if (isMasterPasswordSet()) {
        return { ok: false, error: "Master password is already set." };
      }
      if (typeof password !== "string" || password.length < 4) {
        return { ok: false, error: "Password too short (min 4 characters)" };
```

- **Observed:** Master password minimum is 4 characters. Profile password minimum is non-empty. Family Safe Mode and backup encryption depend on this secret.
- **Expected:** Application lock secrets meet a real policy (length + complexity floor), consistent with folder-lock (`MIN_PASSPHRASE_LENGTH = 8`).
- **Root cause:** Early lock implementation never raised the floor.
- **Impact:** Weak master password is brute-forceable against `verifyMasterPassword` (lockout exists — mitigates online guesses, not an offline verifier dump). Combined with SEC-001, not a current verifier leak.
- **Remediation:** Raise minimum (e.g. 8+) for set/change; keep verify compatible with existing verifiers.
- **Tests required:** `masterPassword:set` rejects length 4–7 after the change; existing 4-char verifier still verifies until changed.

---

### VF-AUD-20260910-SEC-019

- **Severity:** P3
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Evidence:** `electron/utils/rateLimit.ts:35-41`, boolean handlers e.g. `apiKey:isConfigured`

```35:41:electron/utils/rateLimit.ts
export function rateLimitIpcHandler<T extends (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>(channel: string, handler: T): T {
  return (async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!checkIpcRateLimit(channel, event?.sender?.id)) {
      return { ok: false, status: 429, error: "Rate limit exceeded" };
    }
    return handler(event, ...args);
  }) as T;
}
```

- **Observed:** Rate-limit denial is always `{ ok: false, status: 429 }`. Handlers such as `apiKey:isConfigured`, `masterPassword:isSet`, `jinaApiKey:isConfigured`, `conversations:detectLegacyHistory` return booleans. A 429 object is truthy in JavaScript.
- **Expected:** Rate-limit errors must not coerce to “configured / password set / legacy history present”.
- **Root cause:** Uniform 429 envelope applied in front of heterogeneous return types.
- **Impact:** After 120 calls/min, UI may treat keys as configured or master password as set. Availability/UX confusion, not a key leak. Strict channels (venice/jina) already return object envelopes (OK).
- **Remediation:** Throw on 429 (preload maps to `{ ok:false }`) **or** wrap boolean channels. Prefer throw so all callers fail closed.
- **Tests required:** After flooding `apiKey:isConfigured`, result is not a truthy object treated as `true`.

---

### VF-AUD-20260910-SEC-020

- **Severity:** P3
- **Confidence:** High
- **Classification:** DESIGN RISK
- **Evidence:** `electron/ipc/handlers/veniceHandlers.ts:139-142`, `electron/services/veniceClient.ts:267-271`

```139:142:electron/ipc/handlers/veniceHandlers.ts
  registerPrivilegedIpcChannel("venice:abort", (_event, signalId: unknown) => {
    if (typeof signalId !== "string" || signalId.length > 128) return { ok: false };
    return abortVeniceRequest(signalId);
  });
```

- **Observed:** Abort is global by `signalId`. Signal IDs are renderer-chosen UUIDs (or main-generated if missing). No sender ownership map. Headless bridge also aborts by UUID.
- **Expected:** Only the issuing WebContents (or the bridge client that created the request) can abort it.
- **Root cause:** `activeRequests` is a process-wide Map.
- **Impact:** A second trusted window or XSS that learns a UUID can cancel another profile’s in-flight paid/chat request. UUIDs are unguessable.
- **Remediation:** Store `{ webContentsId, signalId }`; abort rejects on mismatch.
- **Tests required:** Window B cannot abort window A’s signalId.

---

### VF-AUD-20260910-SEC-021

- **Severity:** P3
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Evidence:** `electron/ipc/handlers/apiKeyHandlers.ts:426-436`

```426:436:electron/ipc/handlers/apiKeyHandlers.ts
  registerPrivilegedIpcChannel("credential:set", (_event, payload: { key: string, value: string }) => {
    try {
      if (isReservedCredentialName(payload.key)) {
        return { ok: false, error: `Credential name "${payload.key}" is reserved. Use typed password/profile APIs.` };
      }
      setCredential(payload.key, payload.value);
      return { ok: true };
```

- **Observed:** No check that `payload` is an object, or that `key`/`value` are strings with length caps (`validateApiKeyInput` caps typed keys at 512). A huge `value` is encrypted into `secure-prefs.json`.
- **Expected:** Same validation as typed key APIs; fail closed on malformed payloads (avoid throwing on `payload.key` when payload is undefined).
- **Root cause:** Generic bridge was not run through `validation.ts`.
- **Impact:** Renderer can grow the secure-prefs file (disk DoS). Throws on bad payload become invoke rejections (not a main-process crash).
- **Remediation:** Prefer removing the API (SEC-001). Until then, validate types and max lengths.
- **Tests required:** Non-object payload returns `{ ok:false }`; oversized value rejected.

---

### VF-AUD-20260910-SEC-022

- **Severity:** P3
- **Confidence:** Medium
- **Classification:** DESIGN RISK
- **Evidence:** `electron/main.ts:237-249`

```237:249:electron/main.ts
  if (isDev) {
    win.loadURL("http://localhost:5173").catch((err) => {
      logError("Failed to load Vite dev server", err);
      win.loadURL(`data:text/html,<h1>Failed to load dev server</h1><p>${encodeURIComponent(err.message)}</p>`);
    });
    ...
  } else {
    const prodHtmlPath = path.join(__dirname, "../../dist/index.html");
    win.loadFile(prodHtmlPath).catch((err) => {
      logError("Failed to load production renderer", err);
      win.loadURL(`data:text/html,<h1>Failed to load application</h1><p>${encodeURIComponent(err.message)}</p><p>Please check the logs or reinstall the application.</p>`);
    });
  }
```

- **Observed:** Load failure navigates to a `data:` document. `webRequest` CSP often does not apply to `data:` URLs. Error text is `encodeURIComponent`’d (XSS of the message is unlikely). IPC sender validation rejects `data:` (good) so the error page cannot call privileged channels.
- **Expected:** Failure UI is a packaged `file:` page under `dist/` still covered by CSP and sender allowlist.
- **Root cause:** Last-resort `loadURL` fallback.
- **Impact:** Unprivileged HTML error page without CSP. Low, because IPC is rejected.
- **Remediation:** Ship `dist/load-error.html` and `loadFile` it.
- **Tests required:** Failed load stays on `file:` inside renderer root; `isTrustedIpcSender` still true or window is non-interactive.

---

### VF-AUD-20260910-SEC-023

- **Severity:** P3
- **Confidence:** High
- **Classification:** DESIGN RISK
- **Evidence:** `electron/main.ts:81-85`, `231-235`

```81:85:electron/main.ts
const allowProdDevTools = process.env.VENICE_FORGE_DEBUG_DEVTOOLS === "true";
if (allowProdDevTools) {
  logInfo("VENICE_FORGE_DEBUG_DEVTOOLS is enabled — DevTools will be available in production builds.");
}
```

- **Observed:** An environment variable re-enables DevTools in packaged builds and disables the `devtools-opened` closer.
- **Expected:** Production DevTools remain off unless a documented, operator-only debug build. Env toggles are acceptable if they cannot be set from the renderer (they cannot).
- **Root cause:** Support/debug escape hatch.
- **Impact:** Local attacker who can set the process environment (already code execution equivalent on the same account) gets DevTools. Not a remote issue.
- **Remediation:** Restrict to unpackaged or a compile-time flag; or require a native confirm on first open.
- **Tests required:** Packaged + env unset → DevTools closed; env set → log line only in tests.

---

### VF-AUD-20260910-SEC-024

- **Severity:** P3
- **Confidence:** Medium
- **Classification:** DESIGN RISK
- **Evidence:** `electron/ipc/validation.ts:48-58`, `electron/services/veniceClient.ts:491-497`

```48:58:electron/ipc/validation.ts
const BLOCKED_VENICE_HEADERS = new Set([
  "authorization",
  "host",
  "cookie",
  "content-length",
  "transfer-encoding",
  "origin",
  "referer",
  "proxy-authorization",
  "proxy-authenticate",
]);
```

```491:497:electron/services/veniceClient.ts
    const headers: Record<string, string | number> = {
      ...request.headers,
      ...(route ? route.headers : {
        Authorization: `Bearer ${apiKey}`
      }),
      "User-Agent": `VeniceForge/${app.getVersion()}`,
    };
```

- **Observed:** Venice forwarded headers are a denylist. Jina uses an allowlist (`JINA_ALLOWED_FORWARD_HEADERS`). Renderer can still send e.g. `x-api-key`, `x-venice-*`, `accept`, etc. `Authorization` is overwritten for the default Venice route (later object key wins). Case-normalized block of `authorization` is correct.
- **Expected:** Same allowlist discipline as Jina for any renderer-supplied header.
- **Root cause:** Early IPC validator blocked hop-by-hop/auth headers only.
- **Impact:** Low unless an upstream honors an unblocked injection header over Bearer. No current proof that Venice does.
- **Remediation:** Allowlist renderer headers (e.g. `content-type`, `accept`, `x-venice-include-venice-system-prompt` if required by contract).
- **Tests required:** Unknown header dropped; blocked names dropped in any case.

---

### VF-AUD-20260910-SEC-025

- **Severity:** P3
- **Confidence:** High
- **Classification:** DOCUMENTATION DEFECT
- **Evidence:** `electron/ipc/handlers/fileHandlers.ts:352-355` vs `importMediaFromPath` allowlist

```352:355:electron/ipc/handlers/fileHandlers.ts
  // Media Studio: read a file from an allowlisted directory (Downloads,
  // Documents, Desktop, or Pictures/Venice Forge) and return it as a
  // data URL plus metadata. The renderer uses this to import a previously
  // generated image that was not saved to IDB.
```

- **Observed:** Comment says import may read Downloads/Documents/Desktop. Implementation allowlists only `picturesBaseDir()` and `thumbsDir()` after `realpath` (correct, tighter).
- **Expected:** Comments match the allowlist so future edits do not “restore” Documents based on the comment.
- **Root cause:** Comment not updated when import was narrowed.
- **Impact:** Documentation-only today; regression magnet.
- **Remediation:** Fix the comment; keep the tight allowlist.
- **Tests required:** Existing import-path tests already cover rejection; add a comment/contract assertion in `mediaService.test.ts`.

---

### VF-AUD-20260910-SEC-026

- **Severity:** P3
- **Confidence:** Medium
- **Classification:** DESIGN RISK
- **Evidence:** `electron/utils/validateIpcSender.ts:50-72` vs `src/shared/urlSecurity.ts:7-82`

```50:72:electron/utils/validateIpcSender.ts
function isPrivateHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower === "127.0.0.1" || lower === "::1") {
    return true;
  }
  ...
```

- **Observed:** Sender validation uses a **weaker** private-host helper than `src/shared/urlSecurity.ts` (missing `.localhost`, `.local`, IPv4-mapped IPv6, `127.0.0.0/8` beyond `127.0.0.1`, CGNAT, etc.). In development, trust is exact origin `http://localhost:5173` (good). In production, only contained `file:` paths (good). The weak helper is used to **reject** `file://localhost` / private hostnames on file URLs.
- **Expected:** One shared `isPrivateHostname`.
- **Root cause:** Local copy in the sender module.
- **Impact:** Production file: URLs with exotic loopback hostnames might not be classified as private; containment check still required. Residual is narrow.
- **Remediation:** Import `src/shared/urlSecurity.ts` (already re-exported from `electron/utils/urlSecurity.ts`).
- **Tests required:** `file://127.1/index.html` and IPv4-mapped forms rejected.

---

### VF-AUD-20260910-SEC-027

- **Severity:** P2
- **Confidence:** Medium
- **Classification:** DESIGN RISK
- **Evidence:** `electron/main.ts:207-223`

```207:223:electron/main.ts
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (isDev) {
      process.stdout.write(`[renderer:${level}] ${message} (${sourceId}:${line})\n`);
    }
    ...
    const truncated = message && message.length > 10000 ? message.slice(0, 10000) + "…" : message;
    const safe = redactErrorMessage(truncated);
    if (level >= 2) {
      logError(`renderer-console-${levelStr}${src}`, safe);
    } else {
      logInfo(`renderer-console-${levelStr}${src}: ${safe}`);
```

- **Observed:** Every renderer console message is persisted (after `redactErrorMessage`, which strips key patterns and paths, **not** chat/prompt bodies). Dev also writes raw-then-redacted lines to stdout. 10k truncation.
- **Expected:** AGENTS.md: do not log prompts, chat bodies, or attachment contents. Console mirroring will persist whatever React/model code `console.log`s.
- **Root cause:** Diagnostics convenience.
- **Impact:** User content that hits `console.*` lands in `userData/logs/venice-forge.log`. Secrets matching `vn-`/`sk-`/Bearer are redacted; prompt text is not.
- **Remediation:** Log renderer console at error level only, or drop message bodies and keep level/source. Never stdout-echo user content in production.
- **Tests required:** Logger test: a console-message containing a prompt-like string is not written, or is hashed.

---

### VF-AUD-20260910-SEC-028

- **Severity:** P2
- **Confidence:** High
- **Classification:** DESIGN RISK
- **Evidence:** `electron/utils/rendererCsp.ts:24-36`, `electron/utils/validateIpcSender.ts:15-16,89-92`

```24:36:electron/utils/rendererCsp.ts
export function rendererCsp(isDev: boolean): string {
  const connectSrc = isDev
    ? "'self' http://localhost:5173 ws://localhost:5173 venice-media: venice-character-cache: venice-tts:"
    : "'self' venice-media: venice-character-cache: venice-tts:";
  ...
  const scriptSrc = isDev
    ? "'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173"
    : "'self'";
```

- **Observed:** Development trusts the entire Vite origin for **IPC and script-eval**. Anything served on `http://localhost:5173` (Vite, a hijacked port, a malicious dependency served by Vite) is a fully privileged renderer.
- **Expected:** Documented as a dev-only tradeoff. Production must not use this origin (it does not).
- **Root cause:** Vite HMR.
- **Impact:** Standard Electron-dev risk. A process binding 5173 before Vite can become the trusted UI. `http://127.0.0.1:5173` is **not** trusted for IPC (asymmetric with loadURL which uses localhost).
- **Remediation:** Keep as-is with a comment in `AGENTS.md`; optionally pin Vite to a random port and pass the origin into both `loadURL` and `DEV_TRUSTED_ORIGIN`.
- **Tests required:** Already present for origin mismatch. Add 127.0.0.1 rejection (exists).

---

### VF-AUD-20260910-SEC-029

- **Severity:** P3
- **Confidence:** High
- **Classification:** IMPROVEMENT
- **Evidence:** main-frame checks on generated-media save (`fileHandlers.ts:90-93`) vs missing on `app:saveJsonFile`, `characterCreator:exportCard`, `imageInspector:chooseImage`, most config/RP channels

```90:93:electron/ipc/handlers/fileHandlers.ts
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (!owner || event.senderFrame !== event.sender.mainFrame) {
        return { ok: false, error: "Generated image persistence sender was rejected." };
      }
```

- **Observed:** A subset of file/dialog channels require `senderFrame === mainFrame`. Most other dialog channels do not. CSP `default-src 'self'` still allows same-origin iframes.
- **Expected:** All dialog, credential, and destructive channels require main frame (AGENTS.md: recovery channels “must remain main-frame-only”).
- **Root cause:** Main-frame checks were added per-incident.
- **Impact:** If a same-origin iframe is ever injected, it is a trusted IPC sender today (same origin as Vite/file renderer). Combined with SEC-028 this is mostly XSS-complete anyway.
- **Remediation:** Put main-frame enforcement inside `registerPrivilegedIpcChannel` or a `registerMainFrameIpcChannel` helper for dialogs/secrets.
- **Tests required:** Subframe event rejected on saveJsonFile / apiKey:set.

---

### VF-AUD-20260910-SEC-030

- **Severity:** P3
- **Confidence:** High
- **Classification:** IMPROVEMENT
- **Evidence:** `electron/ipc/validation.ts:310`, `electron/services/veniceClient.ts:285-287`

```285:287:electron/services/veniceClient.ts
  // Renderer-provided fallbackConfig is retained only for wire compatibility.
  // Consent, ordering, and provider-native models are main-process authority.
  const fallbackConfig = getProviderSettings(request.profileId);
```

- **Observed:** Validator still accepts and returns renderer `fallbackConfig`. Dispatcher ignores it. Good functionally; leftover attack-looking field.
- **Expected:** Drop the field in the validator (as with Family Safe Mode) so reviews do not re-hook it.
- **Remediation:** `void request.fallbackConfig` and omit from the returned struct.
- **Tests required:** Request with fallbackConfig still uses `provider-settings.json` ordering.

---

### VF-AUD-20260910-SEC-031

- **Severity:** P3
- **Confidence:** High
- **Classification:** DESIGN RISK
- **Evidence:** `electron/ipc/handlers/syncHandlers.ts:76-84`

```76:84:electron/ipc/handlers/syncHandlers.ts
  registerPrivilegedIpcChannel("sync:setEmissionSuppressed", async (_event, input: { suppressed: boolean }) => {
    try {
      setSyncEmissionSuppressed(input.suppressed === true);
      return { ok: true };
```

- **Observed:** Renderer can globally suppress sync emission (and `sync:rendererSessionAttached`). Intended for import/apply windows.
- **Expected:** Suppression should be a main-process lease (like backup export tokens), not a sticky boolean any IPC can set.
- **Impact:** XSS can pause outbound sync indefinitely (availability), or attach/detach the renderer session flag to confuse apply.
- **Remediation:** Time-limited lease bound to sender; auto-clear on destroyed WebContents.
- **Tests required:** Destroyed sender clears suppression; second window cannot leave it stuck.

---

### VF-AUD-20260910-SEC-032

- **Severity:** P2
- **Confidence:** High
- **Classification:** DESIGN RISK
- **Evidence:** `electron/services/generatedMediaStore.ts:126-128,359-367` (global sha256 root); `electron/ipc/rpHandlers.ts` (no profile)

- **Observed:** Generated media blobs are content-addressed and globally readable via `venice-media://<sha256>` once the id is known. RP storage is also global (SEC-003). Chat/conversations **are** profile-scoped.
- **Expected:** Profile A cannot render Profile B’s media by id, even if the hash is learned from a leaked HTML attribute.
- **Impact:** Cross-profile media read given id leakage. Ids are 256-bit hashes of content (same bytes → same id by design).
- **Remediation:** Include profile in capability tokens (SEC-005) even if the blob store stays content-addressed.
- **Tests required:** Profile B protocol fetch of A’s id denied without B-scoped capability.

---

### VF-AUD-20260910-SEC-033

- **Severity:** P3
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Evidence:** `electron/ipc/handlers/apiKeyHandlers.ts:239-245` (`buildProviderTestRequest` google_vertex express)

```239:245:electron/ipc/handlers/apiKeyHandlers.ts
  if (providerId === "google_vertex") {
    if (!isGoogleVertexConfig(credential)) return null;
    if (credential.authMode === "express") {
      return {
        url: `https://aiplatform.googleapis.com/v1/publishers/google/models?key=${encodeURIComponent(credential.apiKey)}`,
        headers: {},
      };
```

- **Observed:** Connection test puts the API key in the URL query. `redactErrorMessage` / `redactUrl` may not catch Google `AIza…` keys if a fetch error stringifies the URL. Main-process `fetch` does not log the URL by default.
- **Expected:** Secrets in headers, never query strings, at a logging/diagnostics boundary.
- **Impact:** Low unless errors/proxies record full URLs. Not renderer-visible.
- **Remediation:** Use header auth if the API allows; if query is mandatory, wrap fetch so thrown errors never include the URL.
- **Tests required:** Simulated fetch throw does not contain the key.

---

### VF-AUD-20260910-SEC-034

- **Severity:** P2
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Evidence:** `electron/ipc/handlers/apiKeyHandlers.ts:582-600`

```582:600:electron/ipc/handlers/apiKeyHandlers.ts
  registerPrivilegedIpcChannel("profilePassword:set", (event, payload: unknown) => {
    try {
      ...
      const validId = getProfileSessionId(event.sender);
      if (validId === "default") {
        return { ok: false, error: "The default profile cannot be password-protected." };
      }
      if (typeof password !== "string" || password.length === 0) {
        throw new Error("Profile password must be a non-empty string.");
      }
      setProfilePassword(password, validId);
      return { ok: true };
```

- **Observed:** Setting/replacing a profile password does not require the existing password. Session must already be unlocked (good vs cross-profile), but XSS can rotate the verifier and lock the real user out. Default profile correctly cannot be locked.
- **Expected:** Change requires current password, like `masterPassword:change`.
- **Impact:** Account lockout for that profile; not a credential leak.
- **Remediation:** If a verifier exists, require `currentPassword` + verify + lockout.
- **Tests required:** Second `set` without current password fails; with current succeeds.

---

### VF-AUD-20260910-SEC-035

- **Severity:** P2
- **Confidence:** High
- **Classification:** DESIGN RISK
- **Evidence:** `electron/main.ts:119-155`, `electron/utils/urlSecurity.ts` / `src/shared/urlSecurity.ts:134-141`

```134:141:src/shared/urlSecurity.ts
export function isTrustedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return !isPrivateHostname(parsed.hostname);
  } catch {
    return false;
  }
}
```

- **Observed:** `promptExternalLink` already documents no DNS resolution (rebinding residual). User must confirm. `javascript:`, `file:`, `http:` are rejected. This is the correct Electron pattern; residual phishing is user-assisted.
- **Expected:** Accept residual; optionally show eTLD+1 more prominently and pin IP after resolve before `openExternal` (hard on macOS `open`).
- **Impact:** User can still confirm a look-alike https host. Private-IP literal hosts are blocked.
- **Remediation:** Keep confirm; consider showing registrable domain in the dialog title; do not auto-open.
- **Tests required:** Existing `isTrustedExternalUrl` tests; dialog is covered at unit level if extracted.

---

### VF-AUD-20260910-SEC-036

- **Severity:** P3
- **Confidence:** High
- **Classification:** IMPROVEMENT
- **Evidence:** `electron/ipc/handlers/common.ts:16-25` (unused non-privileged registrar)

```16:25:electron/ipc/handlers/common.ts
export function registerIpcChannel(
  channel: string,
  handler: Parameters<typeof ipcMain.handle>[1],
): void {
  if (registeredChannels.has(channel)) {
    throw new Error(`IPC channel "${channel}" is already registered. Duplicate registration is not allowed.`);
  }
  registeredChannels.add(channel);
  ipcMain.handle(channel, rateLimitIpcHandler(channel, handler));
}
```

- **Observed:** Helper registers IPC **without** `validateIpcSender`. No production caller. A future “non-privileged” channel would skip the control that every current channel uses.
- **Expected:** Delete the helper or make it also validate senders (rate-limit-only is not a security boundary).
- **Remediation:** Remove `registerIpcChannel` or alias it to privileged.
- **Tests required:** Grep/contract: no `ipcMain.handle` without `validateIpcSender`.

---

### VF-AUD-20260910-SEC-037

- **Severity:** P3
- **Confidence:** Medium
- **Classification:** LIKELY DEFECT
- **Evidence:** `electron/ipc/handlers/apiKeyHandlers.ts:246-263`, `electron/ipc/handlers/systemHandlers.ts:246-263`

```246:263:electron/ipc/handlers/systemHandlers.ts
  registerPrivilegedIpcChannel("app:getDiagnostics", () => {
    const secureStore = getSecureStoreStatus();
    return {
      ...
      apiKeyConfigured: isApiKeyConfigured(),
      transport: "direct-ipc",
      lastApiError: getLastApiError() ? redactErrorMessage(getLastApiError()) : "",
    };
  });
```

- **Observed:** Diagnostics call `isApiKeyConfigured()` / `getSecureStoreStatus()` → `getApiKey()` **without** the session profile (defaults to `default`). `userDataPath`/`logsPath` are basenames (good).
- **Expected:** Diagnostics reflect the active profile’s key state.
- **Impact:** Misleading “configured” bit while using a non-default profile; minor metadata leak of default-profile key presence.
- **Remediation:** `isApiKeyConfigured(getProfileSessionId(event.sender))`.
- **Tests required:** Non-default profile with no key of its own reports false even if default has a key.

---

### VF-AUD-20260910-SEC-038

- **Severity:** P3
- **Confidence:** Medium
- **Classification:** DESIGN RISK
- **Evidence:** `electron/utils/navigation.ts:46-70`

```46:70:electron/utils/navigation.ts
export function checkPathContained(targetPath: string, rootPath: string): boolean {
  if (!existsCaseInsensitive(targetPath) || !existsCaseInsensitive(rootPath)) {
    return false;
  }
  ...
  } catch {
    if (process.platform !== "win32") return false;
    resolvedTarget = path.resolve(path.normalize(targetPath));
  }
```

- **Observed:** Containment requires the path to exist (TOCTOU vs later open). On Windows, `realpath` failure falls back to `path.resolve` **without** symlink/junction resolution. Used for IPC sender `file:` checks and some protocol paths.
- **Expected:** Fail closed on realpath errors on all platforms; prefer handle-based checks (`O_NOFOLLOW`) at consume time (already done for character cache).
- **Impact:** Windows junction races against the packaged renderer root are a narrow local-attacker issue. Non-existent files cannot become trusted senders (existence required).
- **Remediation:** Remove the Windows resolve fallback or require `FILE_FLAG_OPEN_REPARSE_POINT` style checks.
- **Tests required:** Junction pointing outside renderer root is rejected on win32 (skip on macOS).

---

### VF-AUD-20260910-SEC-039

- **Severity:** P3
- **Confidence:** High
- **Classification:** DESIGN RISK
- **Evidence:** `electron/ipc/handlers/jinaHandlers.ts:190-198`

```190:198:electron/ipc/handlers/jinaHandlers.ts
      const parsed = new URL(request.url);
      const allowedHosts = ["r.jina.ai", "s.jina.ai"];
      if (parsed.protocol !== "https:" || !allowedHosts.includes(parsed.hostname)) {
        return {
          kind: "fail",
          status: 403,
          error: "Only Jina Reader/Search HTTPS endpoints are allowed.",
```

- **Observed:** Renderer may pass `https://r.jina.ai/<any url>`. That is Jina Reader’s product (remote fetch from Jina’s network, not local SSRF). Host check is exact (good). Family Safe Mode screens URL and body (good). Header allowlist (good).
- **Expected:** Treat as intentional open-proxy-to-Jina, not a local SSRF bug. Optional: restrict path to `https://r.jina.ai/https://...` and cap path length.
- **Impact:** Paid Jina quota abuse / fetch of arbitrary public URLs through the user’s Jina key. Not LAN SSRF.
- **Remediation:** Document; optionally enforce path prefix `https://` and max URL length at IPC.
- **Tests required:** `https://evil.com` rejected; `https://r.jina.ai.evil.com` rejected (already).

---

### VF-AUD-20260910-SEC-040

- **Severity:** P2
- **Confidence:** Medium
- **Classification:** DOCUMENTATION DEFECT
- **Evidence:** `electron/preload.ts:250` (commented-out `getUserData` remnant), `electron/preload.ts:358-362` (capability-token API described, not implemented), `AGENT_REINITIALIZATION.md` still says `3.0.0-beta.2`

```250:256:electron/preload.ts
    /** Returns the path to the application's user data directory.
     *  @returns A promise resolving with the absolute path.
     */

    /** Checks whether OS-level encryption is available for secure storage.
```

- **Observed:** Preload comment still describes a `getUserData` API that is not exposed (good that it is gone). Capability-token minting is documented in comments as future. Agent reinit header version lags `package.json` `3.0.0-beta.3`.
- **Expected:** Comments match exported surface; version headers are not treated as authority (AGENTS.md already says verify `package.json`).
- **Impact:** Reviewers may assume APIs exist. No runtime hole.
- **Remediation:** Delete the orphan JSDoc; keep capability comments next to the unimplemented manager only.
- **Tests required:** None beyond preload surface snapshot (SEC-016/017).

---

## Preload vs handler vs renderer mismatches

| Channel | Preload | Handler | desktopBridge |
|---|---|---|---|
| `app:readLocalFile` | yes (`files.readLocalFile`) | **none** | **none** |
| `documentAgent:workspace:proposeChangeset` | **none** | yes | **none** |
| `documentAgent:workspace:proposeMove` | **none** | yes | **none** |
| `documentAgent:workspace:proposeTrash` | **none** | yes | **none** |
| `conversations:archive` | yes | yes | **none** (still on `window.veniceForge`) |
| `credential:{get,set,delete}` | yes | yes | `desktopCredentials` **exported but unused** |
| `files.resolveMediaUrl` (capability mint) | comment only | **none** | **none** |

All other preload `ipcRenderer.invoke` names have a `registerPrivilegedIpcChannel` handler. No production `ipcMain.on` request channels were found (push-only events: stream deltas, updates, theme, sync, background tasks, inspector).

`registerIpcChannel` (unprivileged) has **zero** production registrations.

---

## IPC inventory

Legend: **Priv** = `registerPrivilegedIpcChannel` (sender validation + rate limit). **Validation** is a short note, not a claim of completeness.

Renderer consumers: `src/services/desktopBridge.ts` unless noted. XSS can call any preload method directly.

### Venice / safety / keys

| Channel | Preload method | Handler file | Validation | Priv | Renderer consumers |
|---|---|---|---|---|---|
| `venice:request` | `venice.request` | `ipc/handlers/veniceHandlers.ts` | `validateVeniceIpcRequest`; session profile overwrite; guard pipeline | Y | `desktopBridge` venice fetch |
| `venice:streamChat` | `venice.streamChat` | same | endpoint must be POST `/chat/completions`; guard; agent preset from main | Y | stream helper |
| `venice:abort` | `venice.abort` | same | string ≤128; **no owner bind** (SEC-020) | Y | abort on pagehide |
| `credential:set` | `credentials.set` | `ipc/handlers/apiKeyHandlers.ts` | reserved-name denylist only (SEC-001/021) | Y | unused `desktopCredentials` |
| `credential:get` | `credentials.get` | same | reserved names → null; else plaintext (SEC-001) | Y | unused wrapper |
| `credential:delete` | `credentials.delete` | same | reserved no-op | Y | unused wrapper |
| `masterPassword:isSet` | `masterPassword.isSet` | same | none (boolean; SEC-019) | Y | settings |
| `masterPassword:set` | `masterPassword.set` | same | min 4 chars; not already set (SEC-018) | Y | settings |
| `masterPassword:verify` | `masterPassword.verify` | same | string; lockout | Y | settings |
| `masterPassword:change` | `masterPassword.change` | same | current+new; verify | Y | settings |
| `masterPassword:clear` | `masterPassword.clear` | same | current password required | Y | settings |
| `safety:setFamilySafeMode` | `safety.setFamilySafeMode` | `ipc/configHandlers.ts` | master password required | Y | settings |
| `profileSession:activate` | `profilePassword.activate` | `apiKeyHandlers.ts` | profile id; password if set | Y | profile switch |
| `profilePassword:isSet` | `profilePassword.isSet` | same | profile id parse | Y | profile UI |
| `profilePassword:set` | `profilePassword.set` | same | session id; default forbidden (SEC-034) | Y | profile UI |
| `profilePassword:verify` | `profilePassword.verify` | same | lockout; sets session | Y | profile UI |
| `profilePassword:clear` | `profilePassword.clear` | same | **no password** (SEC-002) | Y | profile UI |
| `profile:purge` | `profilePurge.purge` | `systemHandlers.ts` | requested id must equal session | Y | privacy |
| `apiKey:isConfigured` | `apiKey.isConfigured` | `apiKeyHandlers.ts` | session profile | Y | auth/status |
| `apiKey:getStatus` | `apiKey.getStatus` | same | sanitized status, no key | Y | config |
| `apiKey:set` | `apiKey.set` | same | `validateApiKeyInput`; session profile | Y | config |
| `apiKey:delete` | `apiKey.delete` | same | session profile | Y | config |
| `apiKey:test` | `apiKey.test` | same | guarded `/models` | Y | config |
| `providerApiKey:*` | `providerApiKey.*` | same | registry id; no structured providers on key API | Y | providers |
| `providerCredential:*` | `providerCredential.*` | same | `validateProviderCredential` | Y | providers |
| `providerSettings:get/update` | `providerSettings.*` | same | booleans/ordering; credentials must exist to enable | Y | providers |
| `jinaApiKey:*` | `jinaApiKey.*` | `jinaHandlers.ts` | session profile; length 512 | Y | research settings |
| `jina:request` | `jina.request` | same | host allowlist; header allowlist; guard | Y | research |

### App / files / media / TTS / inspector

| Channel | Preload method | Handler file | Validation | Priv | Renderer consumers |
|---|---|---|---|---|---|
| `app:getVersion` | `app.getVersion` | `systemHandlers.ts` | none | Y | about |
| `app:isEncryptionAvailable` | `app.isEncryptionAvailable` | same | status flags only | Y | config |
| `app:getDiagnostics` | `app.getDiagnostics` | same | basenames; default-profile key bit (SEC-037) | Y | status |
| `app:openLogsFolder` | `app.openLogsFolder` | same | opens logs dir; returns abs path (SEC-015) | Y | status |
| `app:proxyScrape` | `app.proxyScrape` | same | https, DNS pin, no redirect, type/size cap, FSM | Y | research |
| `app:openConversationsFolder` | `conversations.openConversationsFolder` | `fileHandlers.ts` | session profile dir | Y | vault |
| `app:saveJsonFile` / `loadJsonFile` | `files.saveJsonFile` / `loadJsonFile` | `fileHandlers.ts` | size cap; **dialog**; basename defaultPath | Y | backup/export |
| `app:saveYamlFile` / `loadYamlFile` | `files.saveYamlFile` / `loadYamlFile` | same | size cap; dialog | Y | themes |
| `app:readLocalFile` | `files.readLocalFile` | **none** | n/a (SEC-016) | — | none |
| `app:media:persist-generated-image` | `files.persistGeneratedImage` | `fileHandlers.ts` | main-frame; MIME sniff; size | Y | media persist |
| `app:media:retry-generated-image` | `files.retryGeneratedImage` | same | main-frame; UUID; **no owner** (SEC-009) | Y | recovery |
| `app:media:save-generated-recovery` | `files.saveGeneratedImageRecovery` | same | main-frame; UUID | Y | recovery |
| `app:media:save-generated` | `files.saveGeneratedMedia` | same | main-frame; mediaId | Y | gallery save |
| `app:media:save-data-url` | `files.saveMediaDataUrl` | same | main-frame | Y | save as |
| `app:media:export-files` | `files.exportMediaFiles` | same | main-frame; batch | Y | bulk export |
| `app:media:import` | `files.importMedia` | same | realpath; Pictures/thumbs only | Y | media import |
| `app:media:reveal` | `files.revealMedia` | same | reveal-safe dirs (SEC-006) | Y | reveal |
| `app:media:meta` | `files.readMediaMeta` | same | same dirs | Y | media meta |
| `app:media:thumb` | `files.generateMediaThumb` | same | sha256; returns `file://` (SEC-007) | Y | thumbs |
| `app:characterImage:get` | `files.getCharacterImage` | same | Venice URL allowlist; default key (SEC-010) | Y | avatars |
| `app:characterImage:clearCache` | `files.clearCharacterImageCache` | same | cache dir only | Y | settings |
| `app:characterImage:inventory` | `files.getCharacterImageCacheInventory` | same | counts | Y | settings |
| `tts:synthesize` | `tts.synthesize` | `chatTtsHandlers.ts` | text/model/voice/speed; profile cache | Y | chat TTS |
| `tts:clearCache` | `tts.clearCache` | same | session profile | Y | settings |
| `imageInspector:chooseImage` | `imageInspector.chooseImage` | `imageInspectorHandlers.ts` | dialog; size; persist bytes | Y | inspector |
| `imageInspector:ingestClipboardImage` | `imageInspector.ingestClipboardImage` | same | clipboard PNG | Y | inspector |
| `imageInspector:resolveMediaInput` | `imageInspector.resolveMediaInput` | same | sha256 mediaId | Y | inspector |
| `imageInspector:readMediaDataUrl` | `imageInspector.readMediaDataUrl` | same | sha256 mediaId | Y | inspector |
| `inspector:telemetry:subscribe` | `inspector.onTelemetry` | `inspectorTelemetryHandlers.ts` | none; **no profile filter** (SEC-008) | Y | inspector store |
| `inspector:telemetry:unsubscribe` | (unsubscribe fn) | same | sender set delete | Y | inspector store |
| `huggingface:getModelCatalog` | `huggingFace.getModelCatalog` | `huggingfaceHandlers.ts` | session profile; no token to renderer | Y | providers |
| `replicate:generateImage` | `replicate.generateImage` | `replicateHandlers.ts` | model/input size; paid WAL | Y | image gen |

### Chat / conversations / folders

| Channel | Preload method | Handler file | Validation | Priv | Renderer consumers |
|---|---|---|---|---|---|
| `chat:list` / `listPage` / `get` / `save` / `delete` | `chat.*` | `systemHandlers.ts` | session profile; size cap on save; origin | Y | chat store |
| `conversations:list/get/save/delete/archive/search/pullContext/rebuildIndex/migrateLegacyHistory/detectLegacyHistory` | `conversations.*` (archive not in bridge) | `systemHandlers.ts` | id regex; FSM on pullContext; migrate default-only | Y | vault |
| `chat-folders:*` (list/create/rename/reorder/move/delete/backup/lock) | `chatFolders.*` | `chatFolderHandlers.ts` | id/name/passphrase schema; backup capability tokens | Y | chat folders |

### RP / character creator

| Channel | Preload method | Handler file | Validation | Priv | Renderer consumers |
|---|---|---|---|---|---|
| `characterCards:list/get/save/delete` | `characterCards.*` | `rpHandlers.ts` | schema/id; **no profile** (SEC-003) | Y | RP library |
| `characterCards:chooseImportFile/consumeImportCandidate/applyImport/undoImport/exportJson/exportPng` | `characterCards.*` | `characterCardFileHandlers.ts` | dialog; sender-scoped handles; size 20 MiB | Y | import/export |
| `personas:*` `lorebooks:*` `rpChats:*` `rpAssets:*` `scenarios:*` | matching | `rpHandlers.ts` | schema/id; **no profile** (SEC-003) | Y | RP studio |
| `characterCreator:exportCard` | `characterCreator.exportCard` | `characterCreatorHandlers.ts` | proto-key ban; dialog; 10 MiB avatar | Y | character creator |
| `characterCreator:validateCard` | `characterCreator.validateCard` | same | V2 name/spec | Y | character creator |

### Sync / backup / background / updates / config

| Channel | Preload method | Handler file | Validation | Priv | Renderer consumers |
|---|---|---|---|---|---|
| `sync:chooseSyncFolder` | `sync.chooseSyncFolder` | `syncHandlers.ts` | native dir dialog | Y | sync settings |
| `sync:getSyncFolder` | `sync.getSyncFolder` | same | returns abs path (SEC-015) | Y | sync settings |
| `sync:setSyncFolder` | `sync.setSyncFolder` | same | must equal already-chosen path | Y | sync settings |
| `sync:startSync/stopSync/pauseSync/getStatus` | `sync.*` | same | password string; session profile | Y | sync |
| `sync:rendererSessionAttached` | `sync.setRendererSessionAttached` | same | boolean (SEC-031) | Y | sync |
| `sync:setEmissionSuppressed` | `sync.setEmissionSuppressed` | same | boolean (SEC-031) | Y | sync |
| `sync:writePacket` | `sync.writePacket` | same | store allowlist; id regex; size 50 MiB; id match | Y | sync |
| `sync:applyRemoteMutation` | `sync.applyRemoteMutation` | same | `validateMutationAuthority` token; store switch | Y | sync apply |
| `sync:acknowledgeOperation` | `sync.acknowledgeOperation` | same | 64-hex operationId | Y | sync |
| `sync:beginBackupExport` | `sync.beginBackupExport` | same | sender lease token | Y | backup |
| `sync:encryptBackup` | `sync.encryptBackup` | same | lease + profile payload check | Y | backup |
| `sync:decryptBackup` | `sync.decryptBackup` | same | password; returns plaintext (SEC-014) | Y | backup import |
| `sync:createReplaceImportRecovery` / `getLatest` / `load` | `sync.*` | same | session profile; password | Y | replace import |
| `backgroundTask:*` | `backgroundTask.*` | `backgroundTaskHandlers.ts` | type/id; owner by profile; video/music update strip (SEC-013) | Y | task UI |
| `app:checkForUpdates/downloadUpdate/installUpdate` | `updates.*` | `ipc/updates.ts` | packaged-only check; install requires downloaded flag | Y | update UI |
| `config:get/initialize/reload/getStatus/openFolder/writeSanitized/exportTemplate/loadMergedThemes/saveTheme/deleteTheme/resetSecureStoreKeys` | `config.*` | `configHandlers.ts` | sanitized config; FSM blocked on writeSanitized; reset unauthenticated (SEC-012) | Y | config/themes |

### Document agent

| Channel | Preload method | Handler file | Validation | Priv | Renderer consumers |
|---|---|---|---|---|---|
| `documentAgent:permissions:set` | `documentAgent.permissions.set` | `documentAgentHandlers.ts` | preset enum; session (SEC-004) | Y | agent UI |
| `documentAgent:documents:*` | `documentAgent.documents.*` | same | profile; format enum; overwrite=false on create | Y | documents |
| `documentAgent:attachments:register/promote` | `documentAgent.attachments.*` | same | bodyB64 cap 2e6; mime classify | Y | attachments |
| `documentAgent:approvals:list/decide` | `documentAgent.approvals.*` | same | hash + id; execute plans (SEC-004) | Y | approval UI |
| `documentAgent:workspace:choose/revoke/list/read/search` | `documentAgent.workspace.*` | same | main-frame picker; grant+session | Y | workspace |
| `documentAgent:workspace:proposeChangeset/Move/Trash` | **not in preload** | same | grant+session (SEC-017) | Y | none (dead IPC) |

### Push events (main → renderer)

| Channel | Preload listener | Emitter | Notes |
|---|---|---|---|
| `venice:streamDelta` | `venice.streamChat` | `veniceHandlers` via `safeSendToRenderer` | envelope sanitized in preload |
| `updates:available/not-available/progress/downloaded/error` | `updates.on*` | `ipc/updates.ts` broadcast all windows | error string already generic |
| `theme:updated` | `config.onThemeUpdated` | theme service | no payload |
| `sync:onRemoteChange` | `sync.onRemoteChange` | sync watcher | includes `remoteApplyToken` (capability for apply) |
| `backgroundTask:update` | `backgroundTask.onUpdate` | `backgroundTaskHandlers` | **profile filtered** |
| `inspector:telemetry` | `inspector.onTelemetry` | `inspectorTelemetryHandlers` | **not profile filtered** (SEC-008) |

---

## Residual test gaps (not separate product defects)

- No single contract test that diffs preload invoke channel names against `ipcMain.handle` registrations (would have caught SEC-016/017).
- Boolean IPC return types vs rate-limit object (SEC-019) untested.
- Profile isolation tests exist for chat/folders/keys; missing for RP stores (SEC-003) and inspector (SEC-008).
- `will-attach-webview` / `setPermissionCheckHandler` untested because unimplemented (SEC-011).
- Recovery ID ownership (SEC-009) untested.

---

## Out of scope / not claimed

- Express `server.ts` web-proxy security (separate process).
- Renderer XSS inventory (this review assumes a compromised renderer as the primary Electron threat model).
- Hosted CI/CodeQL (not run; static review only).
- Manual QA of dialogs / Family Safe Mode / profile switch (not run).
)