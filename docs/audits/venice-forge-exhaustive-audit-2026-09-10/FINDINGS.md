# Findings

All findings were verified against SHA `c3ae21af2f723111d92b43c7888a60930226d213`. Historical IDs are cited only after independent revalidation.

---

## VF-AUD-20260910-P1-001 — Production js-yaml override still in the GHSA-2883-xcg3-v3hh range

Severity: P1
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `package.json:21-29` (`overrides.js-yaml`: `^4.3.1`)
- `package-lock.json` (`node_modules/js-yaml` resolved `4.3.1`)
- production tree: `electron-updater@6.8.9` → `js-yaml@4.3.1`

Affected subsystem: Dependencies / CI contracts / auto-update YAML parsing

Observed behavior:
`npm audit --omit=dev --audit-level=moderate` exits 1 and reports:

```text
js-yaml  4.0.0 - 4.3.1
Severity: high
GHSA-2883-xcg3-v3hh — maxTotalMergeKeys does not limit CPU use for empty merge sources
Patched versions: 4.3.2
```

The first-party override pins `^4.3.1`, which still resolves to the last vulnerable 4.x line.

Expected behavior:
Production audit gate used by `.github/workflows/ci.yml` (`npm audit --omit=dev --audit-level=moderate`) is green. Overrides must resolve to a patched version (`>= 4.3.2`).

Evidence:
- Local execution 2026-09-10, Node 22.15.0: `PROD_AUDIT_EXIT:1`.
- `npm ls js-yaml --omit=dev` shows `electron-updater@6.8.9` → `js-yaml@4.3.1 overridden`.
- Theme YAML uses the `yaml` package (`src/theme/yaml/parse.ts`), not `js-yaml`. The production consumer is `electron-updater` (GitHub `latest.yml` / update metadata).
- Hosted CI run `34044151608` on this SHA (2026-09-06) reported contracts success; the advisory is visible to npm audit today, so the same job would now fail.

Reproduction:
1. `nvm use 22.15.0`
2. `npm audit --omit=dev --audit-level=moderate`
3. Observe exit 1 and js-yaml 4.3.1.

Root cause:
The Dependabot remediation override was set to `^4.3.1` and never advanced to `4.3.2` after GHSA-2883-xcg3-v3hh.

Impact:
- Release/CI contracts job is currently fail-closed locally.
- A hostile or oversized merge-key YAML document parsed by `electron-updater` can consume CPU (DoS of the updater path). It is not a confirmed RCE. Feeding that YAML requires control of the update feed (GitHub Releases for this repo).

Recommended remediation:
Set `"js-yaml": "^4.3.2"` (or exact `4.3.2`) in `overrides`, refresh `package-lock.json` via `npm install`, re-run both audit commands, and confirm `npm ls js-yaml --omit=dev` shows `>= 4.3.2`.

Required regression tests:
- Script or CI assertion that production `js-yaml` is `>= 4.3.2`.
- `npm audit --omit=dev --audit-level=moderate` in contracts.

Dependencies / related findings: VF-AUD-20260910-P2-003, VF-AUD-20260910-P3-005

---

## VF-AUD-20260910-P1-002 — Desktop backup/sync exports legacy chat-history, not the encrypted vault the UI writes

Severity: P1
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `src/stores/chat-store.ts:1412-1433`
- `src/services/backupExportService.ts:52-58`

Affected subsystem: Persistence / backup / sync

Observed behavior:
Electron `writeConversation` persists to `desktopConversations.save` (Conversation Vault) and returns on success without writing `chat-history`. Backup export for store `"conversations"` calls `desktopChat.list()` (legacy files).

Expected behavior:
Backup and sync read the same store the live UI writes.

Evidence:

```1429:1433:src/stores/chat-store.ts
    const convRes = await desktopConversations.save(record);
    if (convRes.ok) return;
    const chatRes = await desktopChat.save(conv);
```

```54:58:src/services/backupExportService.ts
      case "conversations": {
        const chatsResult = await desktopChat.list();
        return chatsResult.ok ? chatsResult.conversations : [];
```

Reproduction:
1. Desktop: create/send a chat so vault save succeeds.
2. Export encrypted backup.
3. Inspect conversation record count — live vault chats that never fell back to `chat-history` are omitted.

Root cause:
Dual conversation backends after vault introduction; backup/sync were not migrated.

Impact:
Encrypted `.vfbackup` / sync packets can omit the user's live chats. Restore can look successful while conversations are empty.

Recommended remediation:
Export/list/delete conversations through `desktopConversations` (vault). Remove or strictly migrate `desktopChat` fallback. Add a fixture: save via vault, assert export contains the id.

Required regression tests:
Backup export after vault-only save includes the conversation; vault-miss fallback is explicit and logged.

Dependencies / related findings: VF-AUD-20260910-P2-006

---

## VF-AUD-20260910-P1-003 — Document Agent approval list/UI drops workspace and media proposals

Severity: P1
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `electron/ipc/handlers/documentAgentHandlers.ts:282-286`
- `electron/agent/runtime/agent-tool-executor.ts:102-113`
- `src/components/documents/DocumentAgentView.tsx:50-69`

Affected subsystem: Document Agent / media approval

Observed behavior:
`documentAgent:approvals:list` returns only `grantId === "limited:<profileId>"`. `media.generateImage` prepares approvals under `grantId: "media:<profileId>"`. Workspace mutations use the real workspace grant id. `restoredProposal` accepts only `document_edit` and `document_restore`.

Expected behavior:
Every advertised approval-gated tool produces a pending row the user can inspect and decide.

Evidence:

```282:286:electron/ipc/handlers/documentAgentHandlers.ts
  registerPrivilegedIpcChannel("documentAgent:approvals:list", async (event) => {
    try {
      const grantId = `limited:${getProfileSessionId(event.sender)}`;
      return { ok: true, pending: (await approvals.listPendingWithViews()).filter((entry) => entry.approval.grantId === grantId) };
```

```102:104:electron/agent/runtime/agent-tool-executor.ts
        const pending = await services.approvals.prepare({
          grantId: `media:${ctx.profileId}`,
          proposalType: "media_generate_image",
```

Impact:
Agent image generation and workspace writes create pending IDs the UI cannot list or approve. Principal advertised tools appear to no-op after the model "succeeds" at proposing.

Recommended remediation:
List pending approvals by profile/session, not a single grant-id prefix. Render media and workspace proposal types. Return `proposalHash` to the UI.

Required regression tests:
Prepare media and workspace plans → list includes them → decide executes the stored plan. Negative: `limited:` filter must not hide `media:` or `grant_` ids.

Dependencies / related findings: None

---

## VF-AUD-20260910-P1-004 — Video/music poll wall-clock timeout is 120s; Swagger P80 example is 145s

Severity: P1
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `electron/services/backgroundTaskManager.ts:53-54,600-611`
- `src/stores/background-task-store.ts:20,294-299`
- `docs/reference/Venice_swagger_api.yaml:11990-11994`

Observed:
Electron `MAX_VIDEO_GENERATION_MS` / `MAX_NON_VIDEO_GENERATION_MS` and the web poller `MAX_GENERATION_MS` are all `120000`. When `Date.now() - startedAt` exceeds that, status becomes terminal `timeout`. `MAX_ATTEMPTS = 200` (~10 min at 3s) is unreachable. Tracked `/video/retrieve` documents `average_execution_time` P80 example `145000` ms.

Expected:
Polling must outlive documented provider queue time; a still-`PROCESSING` paid job must not be locally failed at 120s.

Evidence:
`145000 > 120000`. Timeout is applied to video and music equally. `timeout` is a terminal status (`isTerminalStatus`).

Impact:
Paid jobs still running at two minutes are marked failed locally even if the provider later completes.

Remediation:
Raise the wall-clock cap from live model/queue metadata (or at least above the documented P80 plus margin). Keep attempt cap as a backstop. Do not treat timeout as terminal until retrieve reports a terminal provider status, or persist a resumable `processing` state.

Required regression tests:
Fake clock: at 121s with retrieve still PROCESSING, task remains polling; at provider COMPLETED after 150s, task completes.

Dependencies / related findings: VF-AUD-20260910-P1-005

---

## VF-AUD-20260910-P1-005 — VPS `download_url` is process-memory only; restart cannot finish the download

Severity: P1
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `electron/services/backgroundTaskManager.ts:57-62,992-1018`
- `electron/services/videoRetrieveService.ts:278-288`
- Queue schema `docs/reference/Venice_swagger_api.yaml:11743-11749`
- Retrieve JSON `docs/reference/Venice_swagger_api.yaml:11979-12003` (COMPLETED JSON has `status` / timing only — no `download_url`)

Observed:
Signed queue `download_url` is stored in `ephemeralSecrets` (30 min, in-memory) and persisted only as `queueDownloadUrlPresent` plus host. After restart the map is empty. Resume polling calls `/video/retrieve`. For VPS-backed models the tracked contract says retrieve returns JSON status only; COMPLETED JSON without a retained URL becomes a local failure.

Expected (AGENTS.md media contract):
Background generation survives recoverable restarts. Expiring provider URLs are downloaded by the trusted main process, not treated as durable renderer state. Restart must still be able to obtain the bytes (re-retrieve binary, or a durable opaque handle).

Impact:
A paid VPS video that completes after an app restart can be locally failed while the provider still holds the file (~24h).

Remediation:
On COMPLETED JSON, if no ephemeral URL, attempt retrieve as `video/mp4` or re-queue a main-process download using a server-side retrieve that returns bytes. Do not persist the signed URL. Optionally keep a bounded recovery-custody blob after first successful download.

Required regression tests:
Submit video with `download_url` → drop `ephemeralSecrets` → resume poll on COMPLETED JSON → assert download still succeeds or a typed recoverable error, not silent local fail.

Dependencies / related findings: VF-AUD-20260910-P1-004, VF-AUD-20260910-P1-006

---

## VF-AUD-20260910-P1-006 — Web video completion persists expiring HTTPS URLs and/or data URLs in Media Studio

Severity: P1
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `src/stores/background-task-store.ts:314-334,350-360`
- `src/services/taskMediaCatalog.ts:38-72`
- `src/services/veniceClient/fetch.ts:390-403` (binary → FileReader data URL)

Observed:
Web poller `kind === 'download'` stores the provider signed URL as `resultUrl` and stops. `kind === 'completed'` can be a full `data:video/mp4;base64,...`. `persistCompletedTaskMedia` writes `task.resultUrl` into IndexedDB as both `image` and `downloadUrl`. There is no main-process download on web.

Expected:
Do not persist large media as task/store data URLs; do not treat expiring provider URLs as durable gallery state.

Impact:
Web Media Studio records expire after ~24h or bloat IndexedDB with full video/audio bytes. Related Electron Image Studio generate path already uses `venice-media://`; image-tools save, character-scene, and workflow nodes still store data URLs (same root cause, narrower surfaces).

Remediation:
On web, download through the Express proxy into the canonical blob store (or refuse durable gallery save with an explicit “open/download now” action). On Electron, route remaining save paths through `persistGeneratedImage` / generated-media store.

Required regression tests:
Web video `kind: download` does not upsert a `https://` signed URL into `images`; completed binary is stored as a stable media id or not persisted.

Dependencies / related findings: VF-AUD-20260910-P1-005, VF-AUD-20260910-P2-001

---

## VF-AUD-20260910-P1-007 — FSM media Layer 2 never registers; interceptor buffers the whole body first

Severity: P1
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `server.ts:636-868` (FSM media branch `732-865`)
- `src/shared/limits.ts` (`VENICE_PROXY_MAX_FSM_RESPONSE_BYTES` = 256 MiB)
- `node_modules/http-proxy-middleware/dist/plugins/default/proxy-events.js:32-40`
- `node_modules/http-proxy-middleware/dist/handlers/response-interceptor.js:41-70`

Affected subsystem: Express web proxy / Family Safe Mode media screening

Observed behavior:
Comments at `server.ts:671-748` describe a two-layer FSM media guard: Content-Length pre-check on headers, then a streaming byte counter that destroys the upstream socket *before* `responseInterceptor` concatenates the body.

On the live FSM media path the code:

1. Sets `selfHandleResponse: true` and replaces `on.proxyRes` with `responseInterceptor(...)`.
2. Calls `createProxyMiddleware(proxyConfig)` (`server.ts:830`).
3. *Then* assigns `proxyConfig.on.proxyRes = byteLimitedProxyRes`.

`http-proxy-middleware` 4.2 binds `options.on.proxyRes` in the constructor via `proxyEventsPlugin` (`proxyServer.on(eventName, handler)`). Mutating `options.on` afterwards does not replace the already-registered listener. `byteLimitedProxyRes` is dead.

`responseInterceptor` concatenates every `data` chunk with no cap (`response-interceptor.js:41-47`) and only then invokes the Forge callback. The interceptor callback is also the *only* caller of `originalProxyRes` (`server.ts:750-751`), so the Content-Length “Layer 1” check does not run on headers either — it runs after the full body is already in memory.

The post-concat check at `server.ts:755-758` can still return 413, but only after Express has buffered the entire upstream body.

Expected behavior:
A streaming cap must be attached to the raw `proxyRes` (or a Transform in front of the interceptor) *before* buffering. Declared `Content-Length` above 256 MiB must destroy the upstream socket on headers, without concatenating the body.

Evidence:
- `createProxyMiddleware(proxyConfig)` at `server.ts:830` (FSM) and `server.ts:867` (non-FSM).
- Post-create mutation at `server.ts:839-862`.
- Constructor bind in `proxy-events.js:32-40`.
- Unbounded `chunks.push` in `response-interceptor.js:41-47`.

Reproduction (static): read the three sites above. Dynamic: POST an FSM media route whose upstream is chunked and larger than 256 MiB; observe RSS growth through the full body, then a late 413 (or process OOM). `server.test.ts` mocks `createProxyMiddleware`, so this path is invisible to tests.

Root cause:
Layer 2 was added after VF-WEB-001 without accounting for http-proxy-middleware binding listeners at construction time, and Layer 1 was nested inside the interceptor callback.

Impact:
Web Family Safe Mode is default-on. `/image/*`, `/video/*`, and `/audio/*` take this branch. A chunked video/audio response (or a lying/missing Content-Length) can OOM the Express process. The documented 256 MiB streaming guard does not exist at runtime.

Recommended remediation:
Create one (or two) long-lived middleware instance(s) at `createServerApp()` time. Install the byte counter as the actual `on.proxyRes` *before* `createProxyMiddleware`, wrapping `responseInterceptor`. Destroy + 413 without `res.json()` from inside the interceptor (see P2-014). Add an integration test that uses a real `IncomingMessage` emitting more than 256 MiB without Content-Length.

Required regression tests:
- Chunked body > 256 MiB never fully lands in `Buffer.concat`; client sees 413; process stays up.
- Declared Content-Length > 256 MiB destroys upstream before `data` handlers buffer.
- Mock-free coverage of `http-proxy-middleware` event binding (constructor vs later mutation).

Dependencies / related findings: VF-AUD-20260910-P2-013, VF-AUD-20260910-P2-014

---

## VF-AUD-20260910-P1-008 — `document.promoteAttachment` cannot resolve chat-registered attachments

Severity: P1
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `electron/ipc/handlers/documentAgentHandlers.ts:36-38,355-365`
- `electron/agent/runtime/tool-execution-context.ts:42`
- `electron/agent/runtime/agent-tool-executor.ts:256-262`
- `electron/agent/attachments/attachment-registry.ts:222-226`
- `src/stores/document-agent-store.ts:15,27`
- `src/stores/chat-stream-manager.ts:255-258`

Affected subsystem: Document Agent / attachment promotion

Observed behavior:
Chat registration (`documentAgent:attachments:register`) stores `sessionId = rendererSession(sender.id)` with **no** agent suffix: `` `${RUNTIME_SESSION_ID}:renderer_${id}` ``.

The production chat loop always has an `agentSessionId` (`useDocumentAgentStore` initializes `crypto.randomUUID()`). Tool execution builds `ctx.rendererSessionId` **with** the suffix: `` `${runtime}:renderer_${id}:agent_${uuid}` ``.

`AttachmentRegistry.resolveWithBody` requires exact `profileId` **and** `sessionId`. The advertised `document.promoteAttachment` tool therefore returns “Attachment not found or access denied” for every chat-registered file. The composer IPC promote path uses the suffix-free session and still works.

Expected behavior:
Opaque `attachmentId` values issued for a renderer/profile must be resolvable by the Document Agent tool under the same conversation/session grant. The model must not need to guess a session string.

Evidence:

```36:38:electron/ipc/handlers/documentAgentHandlers.ts
function rendererSession(senderId: number, agentSessionId?: string): string {
  if (agentSessionId && !/^[a-zA-Z0-9_.-]{1,128}$/.test(agentSessionId)) throw new Error("Invalid agent session id.");
  return `${RUNTIME_SESSION_ID}:renderer_${senderId}${agentSessionId ? `:agent_${agentSessionId}` : ""}`;
```

Register at `documentAgentHandlers.ts:360` calls `rendererSession(event.sender.id)` with one argument. `createToolExecutionContext` always appends `:agent_` when `agentSessionId` is present (`tool-execution-context.ts:42`). Registry exact-match at `attachment-registry.ts:225`. Store always sets a UUID (`document-agent-store.ts:27`). Stream always forwards it (`chat-stream-manager.ts:258`).

Reproduction:
1. Desktop chat with Document Agent preset that includes `attachment:promote`.
2. Attach a file (composer register IPC).
3. Ask the agent to promote it.
4. Tool result is access denied. Composer “promote” button on the same file succeeds.

Root cause:
Two session-id constructions; register IPC has no `agentSessionId` argument, resolve requires equality.

Impact:
The only model-callable promotion tool is dead on the real chat path. Combined with P1-003, advertised Document Agent write/media/promote tools are not completable from the UI.

Recommended remediation:
Register and resolve with the same renderer-session tuple (include the agent suffix on register, or resolve by renderer prefix + profile, or key by attachmentId + profile). Do not let the model supply a session.

Required regression tests:
Register via IPC without agent suffix, execute `document.promoteAttachment` with a tool context that has `agentSessionId`, expect success. Cross-profile and cross-sender must still deny.

Dependencies / related findings: VF-AUD-20260910-P1-003, VF-AUD-20260910-P2-020

---

## VF-AUD-20260910-P2-001 — Workflow image generation ignores live model constraints

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `src/lib/workflow-engine.ts:115-127`

Affected subsystem: Workflows / Venice image contract

Observed behavior:
`imageGen` nodes call `buildCanonicalImageGeneratePayload` with `DEFAULT_IMAGE_MODEL`, `steps: data.steps ?? 20`, `width/height 1024` when no aspect ratio, and `hideWatermark: data.hideWatermark ?? true`. There is no call to the runtime `/models` capability or constraint resolver used by Image Studio.

Expected behavior:
Paid image dispatch uses the same live capability/constraint path as Image Studio (divisor, max steps, variants, CFG omission, watermark policy).

Evidence:

```115:127:src/lib/workflow-engine.ts
    case 'imageGen': {
      const prompt = resolvePrompt(data.prompt, input)
      const wirePayload = buildCanonicalImageGeneratePayload({
        model: data.model || DEFAULT_IMAGE_MODEL,
        prompt,
        negativePrompt: data.negativePrompt || undefined,
        steps: data.steps ?? 20,
        stylePreset: data.style || undefined,
        aspectRatio: data.aspectRatio || undefined,
        width: data.aspectRatio ? undefined : (data.width ?? 1024),
        height: data.aspectRatio ? undefined : (data.height ?? 1024),
        hideWatermark: data.hideWatermark ?? true,
      })
```

This is the remaining item (1) of `VF-GENERATION-CONTRACT-PARITY-2026-09-01` in `docs/ROADMAP.md`. Independently confirmed still present.

Impact:
Workflow runs can emit bodies that Image Studio would clamp or omit, causing 400s or unexpected defaults (including default watermark hiding).

Recommended remediation:
Resolve the selected model through the canonical runtime image-capability helper before `buildCanonicalImageGeneratePayload`. Fail closed when the model is offline or constraints cannot be loaded.

Required regression tests:
Workflow image node with a model whose live `steps.max < 20` or non-64 divisor; assert the wire body matches runtime constraints, not the static 20/1024 defaults.

Dependencies / related findings: VF-AUD-20260910-P2-004

---

## VF-AUD-20260910-P2-002 — Unused generic credential get/set still returns secret values to the renderer

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `electron/preload.ts:87-97`
- `electron/ipc/handlers/apiKeyHandlers.ts:426-448`
- `src/services/desktopBridge.ts:2376-2395`

Affected subsystem: Electron IPC / secret storage

Observed behavior:
Venice API keys use typed `apiKey:set` / `apiKey:getStatus` and never return the raw key. A parallel generic `credential:get` / `credential:set` / `credential:delete` surface still exists on `window.veniceForge.credentials`. The handler returns `{ ok: true, value: getCredential(key) }` for any name that is not reserved (passwords, unlock secrets, `chat-folder-lock:`).

`desktopCredentials` has no production importers. The preload method remains callable from any renderer script.

Expected behavior:
Renderer-visible credential APIs are typed, existence-only, or absent. Generic secret KV is main-process-only.

Evidence:

```438:444:electron/ipc/handlers/apiKeyHandlers.ts
  registerPrivilegedIpcChannel("credential:get", (_event, key: string) => {
    try {
      if (isReservedCredentialName(key)) {
        return { ok: true, value: null };
      }
      const val = getCredential(key);
      return { ok: true, value: val };
```

Impact:
Defense-in-depth gap. XSS or a compromised renderer can read/write non-reserved secure-store entries. API keys and master/profile passwords are reserved or on other channels, so this is not a confirmed Venice-key leak, but it is an unnecessary privileged primitive.

Recommended remediation:
Remove preload `credentials.*` and the generic IPC handlers if unused, or change `get` to `{ configured: boolean }` without `value`. Keep typed password APIs.

Required regression tests:
Handler test that `credential:get` is unregistered or never returns a secret string. Grep gate that `window.veniceForge.credentials` is absent.

Dependencies / related findings: VF-AUD-20260910-P3-002

---

## VF-AUD-20260910-P2-003 — vitest 4.1.10 is in the CVE-2026-84373 range

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `package.json` `vitest: ^4.1.6`
- `package-lock.json` resolved `vitest@4.1.10`
- Dependabot alert #33 (open)

Affected subsystem: Dev server / test tooling

Observed behavior:
`@vitest/mocker` 2.1.0–4.1.10 allows redirect mocks to read files outside the project when the Vite HMR websocket is reachable. Patched in 4.1.11.

Expected behavior:
Lockfile uses vitest `>= 4.1.11`.

Evidence:
- `npm ls` / lockfile `4.1.10`
- GitHub Dependabot alert 33, CVE-2026-84373, created 2026-09-10
- `npm audit --audit-level=critical` does not fail (moderate)

Impact:
Development-only. Default Vite bind is localhost. Production packaged app is unaffected. Still a confirmed lockfile vulnerability and an open Dependabot alert.

Recommended remediation:
Bump `vitest` to `^4.1.11` (or current patched 4.x) and refresh the lockfile.

Required regression tests: none beyond `npm audit` and existing vitest suite.

Dependencies / related findings: VF-AUD-20260910-P1-001

---

## VF-AUD-20260910-P2-004 — Tracked Swagger snapshot lags the ROADMAP-noted official revision

Severity: P2
Confidence: High
Classification: DOCUMENTATION DEFECT / contract lag

Affected files:
- `docs/reference/Venice_swagger_api.yaml:1-13` (`content_version: "20260821.193530"`)
- `docs/ROADMAP.md` (`VF-GENERATION-CONTRACT-PARITY-2026-09-01` item 2)

Observed behavior:
The bundled OpenAPI snapshot is `20260821.193530` (retrieved 2026-08-23, upstream commit `601b7bb1…`). ROADMAP records official `veniceai/api-docs` main at Swagger `20260826.105305` with optional video enhancement/upscaling fields not exposed by Forge.

Expected behavior:
Tracked snapshot, `VENICE_API_SOURCE_MANIFEST`, and `verify:venice-contract-drift` run against a current official snapshot, or the lag is explicitly dated in the manifest as accepted.

Evidence:
File header of `docs/reference/Venice_swagger_api.yaml`. `docs/reference/VENICE_API_SOURCE_MANIFEST.md` header says `20260821.193530` while §1 still cites ignored upstream `swagger.yaml` version `20260814.194349`. Local `verify:venice-contract-drift` PASSES against the older snapshot (it cannot detect upstream drift it does not fetch).

Impact:
Contract tests can be green while official video request schemas have new optional fields. Not evidence that current Forge request bodies are invalid.

Recommended remediation:
Run `npm run docs:venice:sync` (or equivalent) against current official main, re-run drift verification, then decide whether to expose new video fields.

Required regression tests:
Verifier compares tracked `content_version` to a recorded expected version or fails on stale retrieval date policy.

Dependencies / related findings: VF-AUD-20260910-P2-001

---

## VF-AUD-20260910-P2-008 — Web proxy forces provider `safe_mode: true` whenever Family Safe Mode is on

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `server.ts:170-176,631-633`
- Contrast Electron `electron/services/guardPipeline.ts` using `getRuntimeVeniceApiSafeMode()`

Observed:
After the local Family Safe Mode guard allows a POST, the Express proxy rewrites JSON bodies with `applyVeniceApiSafeMode(endpoint, parsed, true)` when FSM is on. Web FSM defaults **on** if `VENICE_FORGE_LOCAL_FAMILY_SAFE_MODE_ENABLED` is unset. On `/image/generate`, `/image/edit`, and `/image/multi-edit` this overwrites a client `safe_mode: false`.

Expected:
Local Family Safe Mode and provider `safe_mode` stay independent on every transport.

Impact:
On the web/dev-proxy path, turning Venice API Safe Mode off does not produce `safe_mode: false` for image generate/edit while FSM is on (the default). Electron honors the independent toggle.

Remediation:
Apply `applyVeniceApiSafeMode(endpoint, body, veniceApiSafeModeFromConfig)`, not `true` because FSM is on.

Required regression tests:
FSM on + provider safe_mode false + POST `/image/generate` must leave `safe_mode: false`. Chat/audio/video bodies still omit the field.

Dependencies / related findings: None

---

## VF-AUD-20260910-P2-009 — Stop-stream abort is not an `AbortError`; chat UI treats cancel as failure

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `src/services/veniceClient/stream.ts:208,281-294`
- `electron/services/veniceClient.ts:630-649`
- `src/stores/chat-stream-manager.ts:40-41,272-288`

Observed:
Web throws `new Error("Aborted")`. Electron destroys with `new Error("Request aborted")`, IPC returns `status: 0`. `startStream` only treats `DOMException` named `AbortError` as a clean stop; otherwise it appends `[Error: Sorry, something went wrong. Please try again.]`. Manager tests mock `AbortError`, so they miss the real throw shapes.

Expected:
User stop is cancellation: `aborted: true`, no assistant error suffix, no retry.

Impact:
Stop Generation looks like a provider failure. Partial text remains, plus a fake error line.

Remediation:
Shared `isAbortError()` covering `AbortError`, message `Aborted` / `Request aborted`, and IPC status 0. Do not append `SAFE_STREAM_ERROR_MESSAGE` on cancel.

Required regression tests:
Real web/Electron abort shapes against `startStream`; no safe-error suffix.

Dependencies / related findings: None

---

## VF-AUD-20260910-P2-010 — Provider SSE error frames and Electron truncated-UTF-8 EOF still complete as success

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `src/shared/sseStreamDecoder.ts:229-258`
- `electron/services/veniceClient.ts:525-545,574-603`
- `src/services/veniceClient/stream.ts:257-276,315-326`

Observed:
`extractStreamDelta` marks JSON `error` frames `malformed: true`. Both transports log and continue. If `[DONE]` or EOF follows, the stream is HTTP 200 / IPC ok. Separately, Electron `flush()` `truncated_utf8` is logged then still `resolve({ ok: true })`; web throws.

Expected:
Provider error frames fail the stream. Truncated UTF-8 at EOF fails both transports the same way.

Impact:
Quota/moderation error frames can look like a successful empty chat. A cut-off last byte on Electron can persist a silently truncated assistant message.

Remediation:
Throw `VeniceApiError` on `outcome.malformed` with an error payload. On Electron `flush()` `SseDecodeError`, return `ok: false`.

Required regression tests:
`data: {"error":{"message":"quota"}}\n\n` then `[DONE]` rejects. Electron truncated UTF-8 tail is non-ok.

Dependencies / related findings: None

---

## VF-AUD-20260910-P2-011 — Stream idle timeout is 60s; renderer stream deadline is 300s

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `src/shared/configSchema.ts` (`VENICE_API_TIMEOUT_MS` default 60_000)
- `electron/services/veniceClient.ts:504-510,651-653`
- `server.ts` proxy `timeout` / `proxyTimeout`
- `src/services/veniceClient/stream.ts:169-183` (`STREAM_TIMEOUT_MS = 300_000`)

Observed:
Unary and streaming sockets share a 60s timeout. Web `veniceStreamChat` allows 5 minutes for fetch + SSE read. Reasoning models can emit no tokens for >60s.

Expected:
One documented stream lifetime on both transports.

Impact:
Long-thinking chat can die at ~60s on Electron and the Express proxy while the renderer is still waiting.

Remediation:
Separate stream vs unary timeouts; align proxy/Electron stream idle/overall with the 300s renderer contract (or lower the renderer).

Required regression tests:
Fake stream whose first byte arrives at 61s must not be destroyed if the product contract is 300s.

Dependencies / related findings: VF-AUD-20260910-P2-009

---

## VF-AUD-20260910-P2-005 — `profilePassword:clear` does not require the current password

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `electron/ipc/handlers/apiKeyHandlers.ts:626-633`
- Contrast `masterPassword:clear` at `515-531`

Observed:
Clearing a non-default profile password uses the active session id and calls `clearProfilePassword` with no verifier. Master-password clear requires `verifyMasterPassword`. Tests expect `{ ok: true }` without a password.

Expected:
Removing profile lock requires the current profile password (and lockout).

Impact:
A compromised renderer for an unlocked profile can silently drop password protection.

Remediation:
Require `currentPassword` + `verifyProfilePassword` before clear.

Required regression tests:
Clear without password fails; wrong password lockout; success only after verify.

Dependencies / related findings: VF-AUD-20260910-P2-002

---

## VF-AUD-20260910-P2-006 — RP/character file stores are not profile-scoped

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `electron/ipc/rpHandlers.ts:99-107`
- `electron/services/characterCardStorage.ts:45-47`
- `electron/services/profilePurge.ts:51-66`

Observed:
RP IPC never calls `getProfileSessionId`. Storage is global `userData/characters`. Profile purge deletes vault/chats/keys but not RP directories and never calls `deleteProviderCredential`.

Expected:
Profile session isolates RP libraries and all credentials.

Impact:
Desktop profiles share one character/RP library. Profile delete leaves cards, RP transcripts, and structured Azure/Bedrock/Vertex blobs.

Remediation:
Namespace RP dirs by profile; bind IPC to session id; migrate existing files into `default`; extend purge.

Required regression tests:
Two-profile isolation; purge removes structured credentials and RP files.

Dependencies / related findings: VF-AUD-20260910-P1-002

---

## VF-AUD-20260910-P2-012 — Creating a chat or switching profiles can suppress durable history load

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `src/stores/chat-store.ts:422-449,483-490,1576-1609`
- `src/hooks/useProfileVolatileReset.ts:49-76,89-99`
- `src/main.tsx:79-92`

Observed:
`setConversations` and `createConversation` set `_hasLoadedHistory: true`. Module-level vault/legacy `list` then no-ops if that flag is true. Profile switch calls `setConversations([])`, which sets the flag and never re-lists. `bootApp` races hydration against a 2.5s timeout.

Expected:
Durable history is authoritative. Profile activation reloads that profile’s vault. Creating a chat before list returns must merge, not replace-suppress.

Impact:
Fast “new chat” or a profile switch can show an empty or single-conversation sidebar while older chats remain on disk. A full reload recovers.

Remediation:
Split “user mutated” from “history loaded”. After profile activation, force vault list. Merge in-memory creates into the loaded list by id.

Required regression tests:
Create conversation before mocked list resolves → both new and listed chats remain. Profile switch → list is fetched for the new session id.

Dependencies / related findings: VF-AUD-20260910-P1-002, VF-AUD-20260910-P2-006

---

## VF-AUD-20260910-P2-013 — Per-request `createProxyMiddleware()` leaks HTTP `close` listeners

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `server.ts:636-868`
- `node_modules/http-proxy-middleware/dist/http-proxy-middleware.js:18-24,77-92`

Observed:
The `/api/venice` handler builds a fresh `proxyConfig` and calls `createProxyMiddleware(proxyConfig)` on every request (FSM `830`, non-FSM `867`). Each `HttpProxyMiddleware` instance has its own empty `activeServers` Set. The first `middleware()` invocation then does `server.on("close", …)` on `req.socket.server` because that instance has never seen the server.

Expected:
One (or a small fixed set of) long-lived middleware instance(s) registered at `createServerApp()` time.

Impact:
Unbounded listener and `httpxy` EventEmitter growth in web mode. Default `MaxListenersExceededWarning` after 10 Venice proxy requests. Localhost bind (`server.ts:1315-1321`) limits remote abuse; a normal UI session is enough to leak. Same construction site as P1-007.

Remediation:
Hoist middleware creation out of the request handler. Share instances keyed by `{ fsmMedia, timeout }` at most.

Required regression tests:
Two sequential proxied requests must not add a second `close` listener on the HTTP server.

Dependencies / related findings: VF-AUD-20260910-P1-007

---

## VF-AUD-20260910-P2-014 — FSM Layer 1 413 still calls `res.json()` inside `responseInterceptor`

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `server.ts:683-690,750-751,855-857`
- `node_modules/http-proxy-middleware/dist/handlers/response-interceptor.js:46-70`

Observed:
On the FSM media path, `originalProxyRes` (Layer 1 Content-Length check) runs from *inside* the interceptor callback, after `copyHeaders(proxyRes, res)`. `res.status(413).json(...)` sends and finishes the response. The interceptor then always `setHeader('content-length')`, `res.write()`, `res.end()` with the interceptor return value. That is `ERR_HTTP_HEADERS_SENT`. The interceptor `end` callback has no try/catch. The streaming 413 at `server.ts:855-857` has the same `res.json()` shape and is additionally dead (P1-007).

This is the same class as VF-PLAYTEST-002 (fixed on `proxyReq.removeHeader` after httpxy flush). The residual is on the inbound FSM 413 path.

Expected:
Mutate `res.statusCode` / headers and *return* the 413 JSON (as the post-buffer cap already does at `755-758`). Never `res.json()` from inside the interceptor.

Impact:
A declared Content-Length > 256 MiB on an FSM media response can throw after headers are copied. Combined with P1-007 the body may already be buffered.

Remediation:
Same server.ts pass as P1-007. Guard interceptor failures.

Required regression tests:
Content-Length > 256 MiB must yield a single 413 JSON body and leave `/health` 200. Stub `removeHeader`/`setHeader` after write must not crash.

Dependencies / related findings: VF-AUD-20260910-P1-007

---

## VF-AUD-20260910-P2-015 — Venice proxy 502 JSON echoes `err.message` to the client

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `server.ts:713-726`

Observed:
`on.error` logs through `error("Proxy error:", err.message)` (production logger is a no-op). The *response* is `JSON.stringify({ error: "Proxy error", details: err.message })` with no redaction. Jina (`server.ts:1010-1011`) and scrape (`server.ts:1186-1187`) return generic strings; tests lock that.

Expected:
Generic client body; redacted details only in logs.

Impact:
Upstream/socket errors can leak internal host, syscall, or path fragments to the web renderer. Localhost bind limits who can read them.

Remediation:
Match the Jina/scrape pattern. Keep `redactSecrets` on any logged message.

Required regression tests:
Force proxy `error` with a message containing a fake key/path; client JSON has no `details` substring of that message.

Dependencies / related findings: None

---

## VF-AUD-20260910-P2-016 — Jina `fetch()` follows redirects; host allowlist is first-hop only

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `server.ts:879-883,968-978`
- Contrast scrape `server.ts:1114-1117`

Observed:
Jina URLs are allowlisted `https:` + `r.jina.ai` | `s.jina.ai`. `fetch(parsed.toString(), { method: "GET", headers, signal })` does not set `redirect: "error"` / `"manual"`. Node fetch defaults to follow. Scrape explicitly rejects 3xx. The comment at `968-972` (“SSRF to internal services is impossible by construction”) is first-URL only.

Expected:
`redirect: "error"` or re-validate scheme/host on every hop.

Impact:
A 302 from an allowlisted Jina host to a link-local or loopback URL would be followed from the Forge host. Practical exploit requires Jina (or a MITM of Jina TLS) to emit that redirect. Defense-in-depth gap on a localhost-bound proxy.

Remediation:
`redirect: "error"` (simplest) or manual hop re-validation matching scrape.

Required regression tests:
Mock fetch 302 to `http://127.0.0.1/`; proxy must not follow; client 502/400.

Dependencies / related findings: None

---

## VF-AUD-20260910-P2-017 — System-prompt limit ignores non-string `messages[].content`

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `src/shared/promptLimits.ts:109-125`
- `server.ts:567-574`
- `electron/ipc/validation.ts` (same helper)

Observed:
`checkSystemPromptMessages` concatenates parts only where `role === "system"` **and** `typeof content === "string"`. Array/multimodal system content is skipped, so the 8,192-token / 32,768 code-point ceiling is not applied. FSM screening *does* walk array content (`promptPayloadExtractor.ts:127-138`). `server.test.ts` only covers a string of length 32,769.

Expected:
Split system messages cannot bypass policy, including array `content` parts.

Impact:
`{ role: "system", content: [{ type: "text", text: "a".repeat(40000) }] }` is forwarded subject only to `MAX_PROXY_BODY_BYTES`.

Remediation:
Extract text from string and array `content` the same way the FSM extractor does, then run `checkSystemPromptLimit`.

Required regression tests:
Array system content of 32,769 code points is 400 on Express and rejected on Electron IPC.

Dependencies / related findings: None

---

## VF-AUD-20260910-P2-018 — Command Palette stacks above the first-run age-gate

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `src/components/command-palette/CommandPalette.tsx:90-97,304-311` (`z-[200]`, always-on Cmd/Ctrl+K)
- `src/components/FirstRunModal.tsx:36-37` (`z-[80]`)
- `src/App.tsx:332-344`

Observed:
`CommandPalette` is always mounted. Its overlay is `z-[200]`. `FirstRunModal` is `z-[80]`. Cmd/Ctrl+K is not suppressed while the age-gate is open (and is not suppressed in editable fields). Palette commands call `setActiveTab` while `firstRunAcked` is still false. `ApiKeyDialog` is correctly gated on `firstRunAcked && globalOnboardingCompleted`; the palette is not.

Headed confirmation that a user can complete paid/provider work without acknowledging the gate was **not** run. The stacking and the always-on listener are static facts.

Expected:
Blocking first-run and onboarding dialogs remain the top-most modal until acknowledged. Global shortcuts that mutate app state are inert until ack.

Impact:
Keyboard users can paint a command UI over the legal age-gate and switch tabs. Complete legal-control bypass of the ack itself is **LIKELY** without headed QA (the gate remains mounted underneath).

Remediation:
Do not mount or toggle the palette until `firstRunAcked && globalOnboardingCompleted`. Raise the gate z-index above the palette, or suppress Cmd/Ctrl+K while any blocking modal is open.

Required regression tests:
With `firstRunAcked === false`, Cmd/Ctrl+K does not open the palette; `setActiveTab` is not reachable from palette commands.

Dependencies / related findings: None

---

## VF-AUD-20260910-P2-019 — Non-English catalogs ship `Tr:` scaffolding and key-name leftovers; i18n verifiers accept them

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT / verifier drift

Affected files:
- `src/i18n/resources/{es,fr,de,pt-BR,ru,zh-CN,ja,hi,ar,ko,sv-SE}/**/*.json` (66 `Tr:` keys × 11 locales)
- `scripts/verify-i18n.cjs` `SENTINEL_PATTERN` / `isKeyNameFallback()`
- `src/i18n/resourceNormalizer.ts` `isUntranslatedCatalogValue()`
- Callers: `src/components/image/image-view.tsx` (`actions.saveAs`), `src/shared/safety/formatSafetyDecision.ts`, `src/components/gallery/gallery-view.tsx` (`mediaSave.*`)

Observed:
Every non-English catalog stores 66 values prefixed `Tr: ` plus the English source (example `es` `common:actions.saveAs` = `"Tr: Save As…"`). Seven further keys are the dotted key plus interpolation tokens (`"mediaSave.exported {{count}}"` vs en-US `"Exported {{count}} media files."`). Runtime does not scrub `Tr:`. `verify:i18n` / `--strict` exit 0 because sentinels are only `[XX]` and `__MISSING__:`, and key-name fallback requires exact equality.

This does **not** make non-English locales production-complete; AGENTS.md already requires `isProductionComplete: false` until native review (`VF-I18N-NATIVE-REVIEW-001`). It *is* a confirmed visible-scaffolding defect if a user switches locale.

Expected:
Untranslated scaffolding fails `verify:i18n` and is scrubbed at runtime so i18next falls back to en-US. Safety and media strings must not show `Tr:` or raw key paths.

Impact:
Image Studio / Media Studio / Family Safe Mode block copy under `es` (and the other 10 locales) can render `Tr: Save As…` or `mediaSave.exported 3`. en-US is unaffected.

Remediation:
Treat `/^\s*Tr:\s/` and `value === keyPath + leftover interpolations` as untranslated. Scrub at normalize time. Replace the 726+77 leaves with real translations or omit them so fallback works. Do not mark locales `isProductionComplete: true`.

Required regression tests:
`verify:i18n --strict` fails on a `Tr:` fixture. Runtime `t("actions.saveAs")` in `es` does not contain `Tr:`.

Dependencies / related findings: `VF-I18N-NATIVE-REVIEW-001`

---

## VF-AUD-20260910-P2-020 — `executeAgentTool` never runs registry `argsValidator`

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `electron/agent/runtime/agent-tool-executor.ts:31-38`
- `src/agent/registry/tool-registry.ts` (`RegisteredTool.argsValidator`)

Observed:
Registry validators enforce `additionalProperties: false`, required fields, path bounds, and `overwrite: const false`. `executeAgentTool` `JSON.parse`s arguments and `as`-casts them. Production grep shows `argsValidator.parse` only in tests, never in the executor.

Expected:
The executor must run the same runtime validator the registry advertises to the model.

Impact:
Argument smuggling, weaker overwrite/path/format enforcement, and unbounded changeset/edit shapes until a later service throws. Combined with P1-008, a malformed promote call is still a parse-success path.

Remediation:
`argsValidator.parse` before the switch; map validator errors to `INVALID_ARGUMENTS`.

Required regression tests:
Extra keys, omitted required fields, `overwrite: true`, oversize paths — all must fail in `executeAgentTool`, not only in `argsValidator` unit tests.

Dependencies / related findings: VF-AUD-20260910-P1-008

---

## VF-AUD-20260910-P2-021 — Release signature evidence is derived from a boolean flag, and macOS verify fail-opens if `.app` is missing

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `scripts/write-signature-evidence.cjs` `buildEvidence()` (`28-55`)
- `.github/workflows/release.yml` “Verify macOS signature and notarization”
- `scripts/write-signature-evidence.test.ts` (asserts the boolean mapping)

Observed:
macOS evidence is `unsigned ? "unsigned-exception" : "signed-and-notarized"` with `signed: !unsigned`, `notarized: !unsigned`. Windows sets `signatureStatus: "Valid"` whenever `--unsigned` is absent. Tests assert this mapping and never run `codesign` or `Get-AuthenticodeSignature`.

The macOS verify step wraps each arch in `if [ -d "release/mac/Venice Forge.app" ]; then … fi`. If neither directory exists, the step exits 0.

Expected:
Evidence files record actual verifier output (or refuse to claim signed/notarized). Missing `.app` after a tag package must fail the job.

Impact:
A tag build can publish `signed-and-notarized: true` without `codesign`/`stapler` output in the JSON, and can skip verification entirely if electron-builder did not emit the expected directory. This is source-level false evidence, distinct from missing Apple/Windows certificates (`VF-EXTERNAL-RELEASE-ACCEPTANCE-2026-08-31`).

Remediation:
Write evidence from captured `codesign --verify` / `stapler validate` / Authenticode output. Fail the job when the `.app`/`.exe` is absent unless `--unsigned` is explicit.

Required regression tests:
`buildEvidence` without a verification payload must not emit `signed-and-notarized`. Workflow step fails when the `.app` directory is missing and `--unsigned` is not set.

Dependencies / related findings: `VF-EXTERNAL-RELEASE-ACCEPTANCE-2026-08-31`

---

## VF-AUD-20260910-P2-022 — Agent `promoteAttachment` trusts model-supplied MIME type and size

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `electron/agent/runtime/agent-tool-executor.ts:243-271`
- Contrast IPC `electron/ipc/handlers/documentAgentHandlers.ts:310-327`
- `electron/agent/documents/attachment-import-service.ts:63-71`

Observed:
The composer IPC promote path uses `resolved.mimeType` from the registry and rejects `classifyMime === "reject"` before import. The advertised tool path passes **model-supplied** `mimeType` and `sizeBytes` into `attachments.promote`, using the registry only for the body buffer. `classifyMime` then chooses text extraction vs metadata-only. `sizeBytes` is range-checked (1..1 MiB) and never compared to `attachment.body.length`.

Expected:
MIME class and size come from the trusted registry record. Tool arguments must not change extraction mode.

Impact:
A prompt-injected promotion can label a registered `application/pdf` / zip / executable as `text/plain` and force UTF-8 extraction into a managed document. Currently blocked in production by P1-008 (the tool cannot resolve the attachment at all). Fix P1-008 without this and the MIME confused-deputy becomes live.

Remediation:
Ignore model `mimeType`/`sizeBytes`; use registry fields; fail if they disagree.

Required regression tests:
Register as `application/pdf`, tool-call with `mimeType: "text/plain"` → metadata-only or deny, never text extract.

Dependencies / related findings: VF-AUD-20260910-P1-008

---

## VF-AUD-20260910-P2-023 — Chat default avatar is a root-absolute `/assets/…` URL; Electron production `base` is `./`

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `src/components/chat/message-bubble.tsx:37-40,766`
- `vite.config.ts:45-46`
- `electron/main.ts:244-246` (`loadFile` of `dist/index.html`)

Observed:
The comment claims Vite rewrites the URL for `file://`. The value is a **string literal** `"/assets/branding/venice-seal-red-fill.svg"`. Vite does not rewrite string literals. Packaged Electron sets `base: "./"` and loads `dist/index.html` via `loadFile`. In a `file://` document a leading `/` resolves to `file:///assets/…`, not `dist/assets/…`.

`VeniceLogo` correctly uses a relative `assets/branding/…` path. The message-bubble test only asserts the filename substring, so the leading slash is uncaught.

Expected:
Default avatar URL is valid in Vite HTTP dev **and** packaged `file://` (relative path, `document.baseURI`, or a Vite `import`).

Impact:
Assistant messages without a character avatar show a broken image in packaged Electron. Dev (`base: "/"`) looks fine.

Remediation:
Match `VeniceLogo` (`assets/branding/venice-seal-red-fill.svg`) or `import` the SVG. Assert `src` does not start with `/`.

Required regression tests:
`DEFAULT_AI_AVATAR_SRC` is relative or a hashed module URL. Optionally a packaged-smoke check that the seal file is requested under the renderer root.

Dependencies / related findings: None

---

## VF-AUD-20260910-P2-024 — API key, character-picker, and import-plan overlays have no focus trap

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `src/components/layout/api-key-dialog.tsx` (`role="dialog"` `aria-modal="true"`, no `useFocusTrap`; first tab stop is a full-viewport close button)
- `src/components/character-creator/CharacterCreatorLocalPickerModal.tsx` (no dialog role, no trap, no Escape, unlabeled `X`)
- `src/components/settings/ImportPlanModal.tsx` (no dialog role, no trap, no Escape; also `bg-background` — P3-009)

Observed:
Canonical dialogs (`AccessibleDialog`, `ConfirmModal`, FirstRunModal, Command Palette) use `useFocusTrap`. These three overlays do not. Tab can leave the overlay into the app behind it. Import plan is a destructive-import confirmation.

Expected:
Modal overlays trap focus, restore it on close, have an accessible name, and close on Escape.

Impact:
Keyboard and screen-reader users can operate the page behind a supposed modal. Import confirmation can be skipped accidentally.

Remediation:
Reuse `AccessibleDialog` / `useFocusTrap`. Label the picker close button. Do not invent a third modal primitive.

Required regression tests:
Open each overlay; Tab cycles inside; Escape closes; close button has an accessible name.

Dependencies / related findings: VF-AUD-20260910-P2-018

---

## VF-AUD-20260910-P2-025 — Approvals are consumed before the approved plan executes

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `electron/agent/approvals/approval-coordinator.ts:113-128`
- `electron/ipc/handlers/documentAgentHandlers.ts:208-256`

Observed:
`ApprovalCoordinator.decide` writes `consumedAt` (or `rejectedAt`) and persists **before** returning `privateExecutionPlan`. The IPC handler then re-checks profile, workspace grant, and runs apply/export/media. If `workspaceGrants.get` fails, `applyEdits` throws, the export dialog is canceled, or `executeApprovedGenerateImagePlan` returns `ok: false`, the approval is already spent. There is no restore-to-pending path.

Expected:
Consume only after successful execution, or execute under a lock and revert `consumedAt` on failure. Canceled native dialogs must not consume.

Impact:
Lost document edits, lost workspace mutations, and a consumed media plan with no retry id after a post-consume failure. Combined with P1-003, workspace/media plans are both un-approvable in the UI and non-retryable if decide is ever reached.

Remediation:
Two-phase decide (validate → execute → consume) or compensate on failure. Do not consume on `canceled: true` export.

Required regression tests:
Approve + apply throw → pending still listable. Approve + revoked grant → not consumed. Approve + canceled save dialog → not consumed.

Dependencies / related findings: VF-AUD-20260910-P1-003

---

## VF-AUD-20260910-P2-026 — Unknown Document Agent sessions fail open to `limited_documents`

Severity: P2
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `electron/agent/runtime/agent-permission-state.ts:36-44`
- `electron/agent/runtime/agent-permission-state.test.ts:17-18` (locks the fail-open)
- `src/stores/document-agent-store.ts:26-28`
- `src/stores/chat-stream-manager.ts` tool injection

Observed:
`getEffectiveAgentPermissionPreset` returns `limited_documents` when `agentSessionId` is missing or the session/profile/sender record is unknown. Tests treat that as intended. `permissions.set` runs only when the Document Agent UI changes the dropdown — never on startup. `limited_documents` includes `document:create` and `attachment:promote` with `requiresApproval: "never"`. Chat stream injection uses the Zustand default preset.

Expected:
Missing session fails closed (`off`). Model document tools require an explicit main-recorded user grant.

Impact:
Prompt injection on ordinary chat can create managed documents and propose edits without the user opening Document Agent. A renderer that sends a fresh `agentSessionId` after the user selected `off` also gets `limited_documents`.

Remediation:
Default `off`; persist preset in main and require `permissions.set` before tools; do not inject tools until main acknowledges the preset.

Required regression tests:
No `permissions.set` → no document tools executed. After `off`, a different `agentSessionId` must not revive `limited_documents`.

Dependencies / related findings: VF-AUD-20260910-P1-003, VF-AUD-20260910-P3-004

---

## VF-AUD-20260910-P3-001 — AGENT_REINITIALIZATION.md version header is stale

Severity: P3
Confidence: High
Classification: DOCUMENTATION DEFECT

Affected files:
- `AGENT_REINITIALIZATION.md:5` (`3.0.0-beta.2`)
- `package.json:9` and `AGENTS.md:6-7` (`3.0.0-beta.3`)

Observed: reinitialization handoff still claims beta.2.
Expected: version header matches `package.json` or is clearly labeled historical.
Evidence: file headers quoted above.
Remediation: update the version/date/SHA header or mark the document historical.

Required regression tests: `verify:release-metadata` / `verify:agent-docs` should fail on this mismatch if they do not already.

Dependencies / related findings: None

---

## VF-AUD-20260910-P3-002 — Preload still exposes `app:readLocalFile` with no handler

Severity: P3
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `electron/preload.ts:329-334`

Observed:
`window.veniceForge` (via preload `readLocalFile`) invokes `app:readLocalFile`. No `registerPrivilegedIpcChannel("app:readLocalFile"` exists under `electron/`. Renderer `desktopBridge` no longer wraps it (`docs/summary_of_work.md` records removal of `desktopFileReader`).

Expected:
Preload methods and main handlers stay in parity. Removed features are removed from both sides.

Evidence:
Repository-wide grep: the only implementation is the preload invoke. Historical CHANGELOG claimed a handler in `electron/ipc/handlers.ts`.

Impact:
Any future caller gets Electron “no handler” rejection. Not a filesystem bypass (no handler). Dead privileged-looking API.

Remediation: delete the preload method (and any desktop type) or restore a dialog-only handler with tests.

Required regression tests: IPC parity test that every preload `invoke` channel is registered.

Dependencies / related findings: VF-AUD-20260910-P2-002

---

## VF-AUD-20260910-P3-003 — Tracked root scratch script `test-delete-session.js`

Severity: P3
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `test-delete-session.js` (tracked)

Observed: a two-line `assertValidId` smoke script at repository root.
Expected: scratch scripts live under `scratch/` (gitignored) or tests.
Remediation: delete the tracked file.
Required regression tests: `verify:repo-handoff-hygiene` if it does not already forbid root `test-*.js`.

Dependencies / related findings: None

---

## VF-AUD-20260910-P3-004 — `enable_document_tools` is forwarded in `venice_parameters`

Severity: P3
Confidence: Medium
Classification: LIKELY DEFECT

Affected files:
- `src/stores/chat-stream-manager.ts:122-125`
- `src/components/chat/venice-params.tsx:147-156`
- `docs/reference/Venice_swagger_api.yaml:1474-1551` (`venice_parameters` properties)

Observed:
Chat stream bodies set `venice_parameters.enable_document_tools` from the Document Agent preset. Swagger `venice_parameters` lists character_slug, thinking flags, web search, e2ee, x-search, etc., but not `enable_document_tools`. The object does not set `additionalProperties: false`, so the provider may ignore the field.

Expected:
Local Document Agent flags stay off the Venice wire.

Evidence: stream builder vs swagger property list.

Impact:
Unknown field is likely ignored. Worst case is a strict-schema 400 if Venice later forbids additional properties. UI suggests a provider feature that is actually local.

Remediation:
Keep the UI/store flag; strip it in `buildStreamBody` before `veniceStreamChat`. Drive tool injection only via `tools` + preset.

Required regression tests:
Chat stream body fixture asserting `enable_document_tools` is absent from the JSON sent to `veniceStreamChat`.

Dependencies / related findings: None

---

## VF-AUD-20260910-P3-005 — Transitive joi prototype-pollution advisories (dev)

Severity: P3
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `package-lock.json` (`joi` 18.0.0–18.2.4 via electron-builder)
- Dependabot alerts #31 and #32

Observed: two Low prototype-pollution issues in joi custom messages / regex rename.
Expected: patched joi `>= 18.2.5` (and `>= 18.2.4` for the rename issue).
Impact: development/packaging. Exploitation requires feeding untrusted objects into joi schema construction, which first-party code does not do.
Remediation: override when it does not break electron-builder, or wait for upstream.

Dependencies / related findings: VF-AUD-20260910-P1-001

---

## VF-AUD-20260910-P3-006 — Replicate User-Agent fallback still says 3.0.0-beta.2

Severity: P3
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `electron/services/replicateService.ts:69-78`

Observed:
`getReplicateUserAgent()` uses `app.getVersion()` when available, then falls back to the string `VeniceForge/3.0.0-beta.2`. Tests mock that version. Packaged app is `3.0.0-beta.3`.

Expected:
Fallback matches `package.json` version or a version-less product token (`VeniceForge`).

Impact:
Utility/test contexts (and any path where `app.getVersion()` throws) advertise a stale version to Replicate. Not a security issue.

Remediation:
Read version from `package.json` or drop the numeric fallback.

Required regression tests:
Assert fallback is not a hardcoded older package version.

Dependencies / related findings: VF-AUD-20260910-P3-001

---

## VF-AUD-20260910-P3-007 — ABOUT.md still describes a Windows/macOS-only desktop product

Severity: P3
Confidence: High
Classification: DOCUMENTATION DEFECT

Affected files:
- `docs/ABOUT.md:5,9,15,72-73,108` vs `:164`
- `package.json` `dist:linux`; `.github/workflows/ci.yml` `electron-smoke-linux`

Observed:
The opening and packaging tables say Venice Forge ships as Windows and macOS only. Later the same file documents Linux AppImage/deb/rpm from the release workflow. CI packaged-smoke includes Linux.

Expected:
Canonical ABOUT packaging claims match `electron-builder.config.cjs` and CI (Windows, macOS, experimental Linux).

Remediation:
State Linux as experimental/community in the lead paragraph and tables, consistent with line 164 and `electron-builder.config.cjs`.

Dependencies / related findings: None

---

## VF-AUD-20260910-P3-008 — App logo is a white-fill SVG on light themes

Severity: P3
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `src/components/ui/logo.tsx:13-16` (`assets/branding/venice-keys-white.svg`)
- Unused siblings: `public/assets/branding/venice-keys-black.svg`, `venice-keys-red.svg`
- Forge Daylight background `#f6f8fa` (`src/theme/builtins/light.ts`)

Observed:
`VeniceLogo` always loads the white-fill mark. White on `#f6f8fa` is ~1.05:1. Path is correctly relative (unlike P2-023). Headed pixel check was not run; the asset fill and token are static.

Expected:
Brand mark tracks appearance (black/red on light, white on dark) or uses `currentColor`.

Impact:
Sidebar, API-key dialog, empty chat, and onboarding marks are near-invisible on light themes.

Remediation:
Select asset from resolved appearance, or CSS-mask the SVG with `text-primary`.

Dependencies / related findings: VF-AUD-20260910-P2-023

---

## VF-AUD-20260910-P3-009 — Production UI uses Tailwind color classes that are not in the theme contract

Severity: P3
Confidence: High
Classification: CONFIRMED DEFECT

Affected files:
- `src/styles/theme.css` defines `--color-bg`, not `--color-background` / `--color-surface-base` / `--color-error`
- Widespread `bg-background`, `bg-surface-base`, `text-error` / `bg-error` (ImportPlanModal, CommandPalette, TaskCenterDrawer, DocumentAgentView, ImageInspectorView, ContextMenu, …)
- `scripts/verify-theme-tokens.cjs` does not flag these names

Observed:
Those utilities are not `@theme` colors, so they do not follow the active theme (and often generate no fill). `bg-bg` / `bg-surface` / `text-danger` are the contract.

Expected:
UI color classes resolve through theme tokens; the verifier fails unknown `bg-*`/`text-*` theme-ish names.

Impact:
Overlays and drawers can miss dimming/backgrounds; error text may not use danger color. Visual, not a trust-boundary bug.

Remediation:
Replace with `bg-bg`, `bg-surface`, `text-danger`. Extend the theme-token verifier.

Dependencies / related findings: VF-AUD-20260910-P2-024

---

# Historical 2026-08-15 P1 revalidation

Source hypotheses: `docs/audits/Records/venice-forge-exhaustive-audit-2026-08-15/07-P1-FINDINGS.md`.

| Historical ID | Current status | Evidence |
|---|---|---|
| P1-001 safe_mode on non-image endpoints | **Fully repaired** | `src/shared/veniceSafeMode.ts:41-45` only `/image/generate`, `/image/edit`, `/image/multi-edit` |
| P1-002 SSE framing / UTF-8 | **Fully repaired** (framing/UTF-8 decoder) | Shared `SseDecoder`. Residuals: abort typing and error-frame/EOF success — **P2-009**, **P2-010**, **P2-011** |
| P1-003 video duration omitted | **Fully repaired** | `src/lib/workflow-engine.ts:261-269` fail-closed |
| P1-004 `reference_image_urls` on image generate | **Fully repaired** | `src/utils/payloadBuilders.modelAware.test.ts` asserts `style_references` |
| P1-005 tools without function calling | **Fully repaired** | `src/agent/registry/tool-registry.ts:533-538` |
| P1-006 preload dropped `appendedMessages` | **Fully repaired** | `electron/preload.ts:49-54` + `sanitizeStreamDeltaEnvelope` |
| P1-007 retry after partial stream | **Fully repaired** | `src/stores/chat-stream-manager.ts:250-284` `hasCommittedStreamState` |
| P1-008 search `provider`/`maxResults` | **Fully repaired** | `src/shared/veniceSearchWire.ts` emits `search_provider`/`limit` |

2026-08-15 P2-001 (`prompt_cache_key` nesting) and P2-002 (audio `language` vs `language_code`) were independently classified **fully repaired** by the historical-revalidation pass (`scratch/historical-revalidation.md`).

# Historical 2026-08-31 P1 / P2 revalidation

Source hypotheses: `docs/audits/Records/VENICE_FORGE_AUDIT_TODO_2026-08-31.md`.

| Historical ID | Current status |
|---|---|
| P1-001 Linux arch names | **Fully repaired** |
| P1-002 Windows portable vs unpacked smoke | **Fully repaired** |
| P1-003 Packaged onboarding coverage | **Fully repaired** |
| P1-004 Rules01 live apply | **Partially repaired** — helper exists; admin must still apply (`VF-RULES01-SYNC-2026-08-31`) |
| P2-001–005, P2-008–011 | **Fully repaired** |
| P2-006 custom-protocol capability tokens | **Partially repaired** — design recorded, not wired (`VF-CAPABILITY-PROVENANCE`) |
| P2-007 Vertex `authMode: "full"` UI | **Partially repaired** — UI gone; `isGoogleVertexConfig` still accepts `"full"` and requires express `projectId`/`location` |
| P2-012 external signed/paid/two-device evidence | **Still present** (`VF-EXTERNAL-RELEASE-ACCEPTANCE`) |
| P2-013 native i18n review | **Still present** (`VF-I18N-NATIVE-REVIEW-001`) |

No historical P1/P2 from these two audits is classified **regressed**.
