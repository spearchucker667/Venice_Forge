# VF-AUD-20260912 — IPC Contract Parity Audit (Domain: electron/ipc ↔ preload ↔ renderer)

- **Repo:** Venice Forge, branch `main`, HEAD `84cf5bbe`, version `3.0.0-beta.3`
- **Date:** 2026-09-12
- **Auditor domain:** full IPC contract parity across `electron/ipc/**` (43 files), `electron/preload.ts`, renderer consumers (`window.veniceForge` usages in `src/`), `src/services/desktopBridge.ts`, and `scripts/verify-ipc-parity.cjs`
- **Method:** every claim below was verified by reading the current checked-out files. No claims were copied from docs or prior audits. Channel inventory was generated programmatically from source and cross-checked against `scripts/verify-ipc-parity.cjs` (live run: 195 handler channels / 192 preload.invoke / 10 preload.on — passes).
- **Verifier blind spots confirmed:** `verify-ipc-parity.cjs` checks only channel-name existence in both directions. It does **not** check request/response schema parity, payload validation depth, renderer-consumer existence, profile-scope consistency, main-frame gating, rate-limit return-type confusion, or the accuracy of its own `DOCUMENTED_ORPHAN_HANDLERS` allow-list. Findings 001–004 fall exactly in those gaps.

## Summary counts

- **Channels inventoried:** 195 handler channels (194 unique + `documentAgent:workspace:list/read/search` template trio counted individually = 195; every one has a preload invoke/on counterpart; the 3 `documentAgent:workspace:propose*` handlers have **no** preload counterpart and are held only by the verifier's orphan allow-list).
- **Findings:** 9 total — **P1 ×1, P2 ×2, P3 ×6**
- **Classification:** CONFIRMED DEFECT ×3, DESIGN RISK ×4, VALIDATION/TYPE GAP ×1, IMPROVEMENT ×1
- **IPC inventory table:** attached at the end of this file (feeds the audit coverage ledger).

---

## VF-AUD-20260912-P1-001 — `conversations:save` request envelope mismatch: every conversation-vault save in Electron fails and silently degrades to legacy storage

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

## VF-AUD-20260912-P2-002 — `documentAgent:workspace:proposeChangeset/proposeMove/proposeTrash` are dead privileged handlers masked by the verifier's orphan allow-list, and they omit the capability check the real call path enforces

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

## VF-AUD-20260912-P2-003 — Generic `credential:set/get/delete` privileged IPC has no payload validation, no profile scope, unbounded value size, and its only renderer wrapper is dead code

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

## VF-AUD-20260912-P3-004 — Dead renderer surfaces: `conversations:archive`, `conversations:search`, `characterCreator:validateCard`, `replicate:generateImage`, and the `desktopChat.listPage` wrapper have no consumers

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

## VF-AUD-20260912-P3-005 — Inconsistent main-frame sender gating across dialog/write IPC channels

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

## VF-AUD-20260912-P3-006 — Rate-limit wrapper changes the return type of boolean/string channels, producing truthy error objects

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

## VF-AUD-20260912-P3-007 — Inspector telemetry broadcast is not profile-scoped (cross-profile metadata leakage)

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

## VF-AUD-20260912-P3-008 — Validation/type gaps at the Venice request boundary: dead `agentPermissionPreset` interface field, shallow `fallbackConfig` check, unreachable `force` flag on Hugging Face catalog

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

## VF-AUD-20260912-P3-009 — Minor IPC hygiene: dead `updates:checking` emitter, inconsistent cancel semantics for save vs load dialogs, `app:saveJsonFile` returns `filePath` missing from the preload type, `credential:set` value size uncapped

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
