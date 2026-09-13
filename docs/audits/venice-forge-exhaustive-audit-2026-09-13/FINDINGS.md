# Findings — Venice Forge Exhaustive Audit (2026-09-13)

IDs follow the canonical pattern `VF-AUD-20260913-<Severity>-<Number>`.  
Classification uses `CONFIRMED DEFECT`, `DESIGN RISK`, `TEST GAP`, `IMPROVEMENT`, or `FALSE POSITIVE`.

---

## VF-AUD-20260913-P1-001 — Release workflow gate fails on strict i18n placeholders across 11 non-English catalogs

Severity: P1  
Confidence: High  
Classification: CONFIRMED DEFECT (Release-Blocking Pipeline Defect)

Affected files:
- `.github/workflows/release.yml:44`
- `scripts/verify-i18n.cjs:105-115`
- `docs/i18n/translation-status.json`
- `src/i18n/resources/{es,fr,de,pt-BR,ru,zh-CN,ja,hi,ar,ko,sv-SE}/common.json`
- `src/i18n/resources/{es,fr,de,pt-BR,ru,zh-CN,ja,hi,ar,ko,sv-SE}/media.json`

Affected subsystem:
Release Pipeline / Internationalization Enforcement

Observed behavior:
Executing `npm run verify:release-readiness` terminates with exit code 1.
`verify:release-readiness` invokes `npm run verify:i18n:release`, which runs `node scripts/verify-i18n.cjs --strict`.
Strict mode aborts because 5 newly introduced translation keys carry `__MISSING__:` sentinel prefixes across all 11 non-English catalogs (55 total missing leaves).
Any tag-triggered release workflow (`v*`) in `.github/workflows/release.yml` will fail immediately at step `Verify release readiness (VERIFY-052 + i18n)`.

Expected behavior:
All production locales must provide valid translated strings (without `__MISSING__:` markers) for all catalog keys, allowing `npm run verify:release-readiness` to exit with code 0.

Evidence:
Execution output from `npm run verify:release-readiness`:
```text
 - Locale 'de' key 'common:surface.componentsLayoutMemoryPanel.heading.searchVault' still carries __MISSING__ placeholder: "__MISSING__:Search vault"
 - Locale 'de' key 'common:runtimeGenerated.stores.profileStore.notification.profileNameCannotBeEmpty' still carries __MISSING__ placeholder: "__MISSING__:runtimeGenerated.stores.profileStore.notification.pr"
 - Locale 'de' key 'common:runtimeGenerated.stores.profileStore.notification.maximumProfileLimitReached' still carries __MISSING__ placeholder: "__MISSING__:runtimeGenerated.stores.profileStore.notification.ma"
 - Locale 'de' key 'media:imageStudioRuntime.replicateQueued' still carries __MISSING__ placeholder: "__MISSING__:Replicate generation queued"
 - Locale 'de' key 'media:imageStudioRuntime.replicateQueuedDetail' still carries __MISSING__ placeholder: "__MISSING__:The image will appear in Task Center and Media Studi"
... (repeated across pt-BR, ru, zh-CN, ja, hi, ar, ko, sv-SE, es, fr)
Command failed with exit code 1.
```

Reproduction:
1. Run `npm run verify:release-readiness` on the checked-out tree.
2. Observe fatal exit code 1.

Root cause:
Remediation tranches `bb29350e` and `cd27ebc2` added 5 new UI/store strings. While `npm run verify:contracts:static` runs `verify-i18n.cjs --allow-missing-markers --allow-key-name-fallbacks` (which permits markers during development), the release pipeline invokes `--strict`, which rejects any `__MISSING__` markers.

Impact:
Official releases cannot be cut or packaged via `.github/workflows/release.yml`. Tagged builds are blocked.

Recommended remediation:
1. Translate the 5 strings for the 11 non-English locales:
   - `common:surface.componentsLayoutMemoryPanel.heading.searchVault`
   - `common:runtimeGenerated.stores.profileStore.notification.profileNameCannotBeEmpty`
   - `common:runtimeGenerated.stores.profileStore.notification.maximumProfileLimitReached`
   - `media:imageStudioRuntime.replicateQueued`
   - `media:imageStudioRuntime.replicateQueuedDetail`
2. Run `npm run i18n:locale-status` and update `docs/i18n/translation-status.json`.
3. Verify that `npm run verify:release-readiness` exits with code 0.

Required regression tests:
- `npm run verify:release-readiness` must pass with exit code 0 before tagging.

Dependencies / related findings:
None.

---

## VF-AUD-20260913-P1-002 — Profile switch race flushes old profile data to new profile partition

Severity: P1  
Confidence: High  
Classification: CONFIRMED DEFECT (Data Integrity & Privacy Boundary Violation)

Affected files:
- `src/stores/profile-store.ts:52-60`
- `src/stores/chat-store.ts:1401-1448, 1502-1562, 1727-1742`
- `src/services/activeProfile.ts:64-76`
- `src/services/storageService.ts:139-188`

Affected subsystem:
Profile Switching / Zustand Persistence / Storage Partitioning

Observed behavior:
When switching profiles via `performRawProfileSwitch(id)`:
1. `setActiveProfileId(id)` immediately writes `id` (the NEW profile) to `localStorage['venice-active-profile']`.
2. `window.location.reload()` is invoked.
3. The page reload fires the browser's `"beforeunload"` event.
4. `chat-store.ts` handles `"beforeunload"` by invoking `void flushAllPendingSaves()`.
5. `flushAllPendingSaves()` saves all conversations in `dirtyConversations` (which belong to the OLD profile).
6. In web mode, `writeConversation(conv)` calls `StorageService.saveItem("conversations", ...)`.
7. `StorageService.saveItem()` resolves the active profile via `getActiveProfileId()`, which NOW returns the NEW profile!
8. The dirty conversations from the old profile are saved under the new profile's ID (`${newProfileId}:${conv.id}`).
9. In Electron mode, `desktopProfilePassword.activate` also switches the main-process session prior to `performRawProfileSwitch`, allowing in-flight IPC calls to target the new session directory.

Expected behavior:
All pending writes and dirty states belonging to the active profile must be completely flushed and committed to storage *before* the active profile ID or session changes. Dirty sets must be cleared so that unload listeners cannot cross-contaminate partitions.

Evidence:
In `src/stores/profile-store.ts:52-60`:
```typescript
function performRawProfileSwitch(id: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event("venice-forge:abort-in-flight"));
    try { chatTtsController.stop(); } catch { /* ignore */ }
    setActiveProfileId(id); // <--- Sets NEW profile in localStorage immediately!
    window.location.reload(); // <--- Triggers beforeunload
  }
}
```
In `src/stores/chat-store.ts:1727-1742`:
```typescript
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    void flushAllPendingSaves(); // <--- Flushes dirty conversations from old profile
  });
}
```
And in `src/services/storageService.ts:144`:
```typescript
const profileId = options?.profileId ?? getActiveProfileId(); // <--- Resolves to NEW profile!
```

Reproduction:
1. Open Profile A. Type a message in a conversation so it is marked dirty in `dirtyConversations`.
2. Quickly trigger a profile switch to Profile B.
3. Observe that Profile A's conversation is saved under Profile B's partition key in IndexedDB.

Root cause:
`performRawProfileSwitch` is synchronous and alters the active profile identity before pending persistence is awaited and drained.

Impact:
Severe privacy leak and data corruption: private conversations from one profile leak into another profile's history and are encrypted under the wrong credentials.

Recommended remediation:
1. Make `performRawProfileSwitch(id)` async.
2. Await `useChatStore.getState().flushAllPendingSaves()` before altering `activeProfileId`.
3. Clear `dirtyConversations` before updating `setActiveProfileId(id)`.
4. In `useChatStore`, ensure that `beforeunload` checks whether a profile switch is already in flight.

Required regression tests:
- Add a unit test verifying that dirty conversations in Profile A are saved under Profile A's key and never under Profile B during profile transition.

Dependencies / related findings:
Related to `VF-AUD-20260913-P2-006` (Missing volatile store resets on profile switch).

---

## VF-AUD-20260913-P1-003 — Remote tombstone sync deletions rejected by security mutation authority

Severity: P1  
Confidence: High  
Classification: CONFIRMED DEFECT (Distributed Sync / Remote Deletion Failure)

Affected files:
- `electron/services/syncFolderWatcher.ts:750`
- `src/services/syncPacketImporter.ts:307-312`
- `electron/services/remoteApplyAuthority.ts:28-34`
- `electron/ipc/handlers/syncHandlers.ts:95`

Affected subsystem:
Sync Engine / Main Process Remote Apply Authority

Observed behavior:
When a tombstone sync packet is received by `syncFolderWatcher.ts`:
1. `syncFolderWatcher.ts:750` issues a grant:  
   `issueRemoteApplyGrant(parsed._operationId, parsed._storeName, parsed._id)` where `parsed._storeName = "tombstones"`.
2. The renderer imports the packet in `syncPacketImporter.ts:307` and calls:  
   `deleteStoreRecord(validation.tombstone.storeName, validation.tombstone.recordId, "remote-sync", remoteApplyToken)`
3. This dispatches an IPC call to `desktopSync.applyRemoteMutation({ storeName: validation.tombstone.storeName, id: recordId, delete: true, remoteApplyToken })`.
4. In `syncHandlers.ts:95`, `validateMutationAuthority(origin, remoteApplyToken, storeName, id)` is called with `storeName = "conversations"` (or `"character_cards"`, etc.).
5. `validateMutationAuthority()` verifies:  
   `grant?.storeName === storeName`.
6. Because `grant.storeName` is `"tombstones"` while `storeName` is `"conversations"`, the check evaluates to `false`.
7. The deletion is rejected with `"Remote mutation authority rejected."`.

Expected behavior:
A remote apply grant issued for a tombstone packet must be permitted to authorize the deletion of the corresponding record in its target domain store.

Evidence:
`electron/services/remoteApplyAuthority.ts:28-34`:
```typescript
export function validateMutationAuthority(
  origin: MutationOrigin,
  token: unknown,
  storeName: string,
  recordId: string,
): boolean {
  if (origin !== "remote-sync") return true;
  if (typeof token !== "string") return false;
  const grant = grants.get(token);
  return grant?.storeName === storeName && (
    grant.recordId === recordId || recordId.startsWith(`${grant.recordId}_conflict_`)
  );
}
```
When `grant.storeName` is `"tombstones"` and `storeName` is `"conversations"`, `grant?.storeName === storeName` is always false.

Reproduction:
1. Delete a conversation on Device A in a shared sync folder.
2. Device A exports a tombstone packet for `conversations` record `c1`.
3. Device B's `syncFolderWatcher` receives the tombstone packet and notifies the renderer.
4. Device B's renderer calls `applyRemoteMutation`.
5. Observe error log: `"Remote mutation authority rejected."` and record `c1` remains undeleted on Device B.

Root cause:
`validateMutationAuthority` strictly requires exact match between `grant.storeName` and the mutation `storeName`, not accounting for the fact that tombstones carry `storeName = "tombstones"` while operating on domain stores.

Impact:
Deletions performed on one device are never replicated to other desktop clients, causing phantom deleted records to resurface or sync divergence.

Recommended remediation:
Update `validateMutationAuthority` in `remoteApplyAuthority.ts`:
```typescript
export function validateMutationAuthority(
  origin: MutationOrigin,
  token: unknown,
  storeName: string,
  recordId: string,
): boolean {
  if (origin !== "remote-sync") return true;
  if (typeof token !== "string") return false;
  const grant = grants.get(token);
  if (!grant) return false;
  if (grant.storeName === "tombstones") {
    return grant.recordId === recordId;
  }
  return grant.storeName === storeName && (
    grant.recordId === recordId || recordId.startsWith(`${grant.recordId}_conflict_`)
  );
}
```

Required regression tests:
- Add a test in `electron/services/remoteApplyAuthority.test.ts` asserting that a grant issued with `storeName = "tombstones"` authorizes a deletion for any domain store with the matching `recordId`.

Dependencies / related findings:
None.

---

## VF-AUD-20260913-P1-004 — SSE chunk boundary CRLF split triggers premature event dispatch

Severity: P1  
Confidence: High  
Classification: CONFIRMED DEFECT (Streaming Chat Parsing Defect)

Affected files:
- `src/shared/sseStreamDecoder.ts:117-127`

Affected subsystem:
SSE Stream Decoder / Streaming Chat

Observed behavior:
In `SseStreamDecoder.findLineEnd()`, when a chunk boundary splits a CRLF pair (`\r\n`) such that `\r` is the final byte of chunk $N$ and `\n` is the first byte of chunk $N+1$:
1. `this.lineBuffer[i]` is `\r`.
2. `this.lineBuffer[i + 1]` is `undefined` (chunk $N+1$ has not yet been appended to `this.lineBuffer`).
3. `findLineEnd()` treats the `\r` as a single-character line ending and returns `{ index: i, length: 1 }`.
4. `consumeLine()` consumes the text before `\r`.
5. When chunk $N+1$ is pushed with `\n` at index 0, `findLineEnd()` returns `{ index: 0, length: 1 }`, producing an empty line (`""`).
6. In SSE protocol, an empty line (`line === ""`) signals event completion and triggers `this.dispatchEvent()`.
7. This causes an incomplete SSE event to be dispatched prematurely, leading to corrupted chat deltas or truncated JSON parsing errors.

Expected behavior:
If `\r` is the last byte of `this.lineBuffer`, `findLineEnd()` must return `null` and defer processing until the next chunk arrives to verify whether `\n` follows.

Evidence:
In `src/shared/sseStreamDecoder.ts:117-127`:
```typescript
private findLineEnd(startIndex: number): { index: number; length: number } | null {
  for (let i = startIndex; i < this.lineBuffer.length; i++) {
    const char = this.lineBuffer[i];
    if (char === '\n') {
      return { index: i, length: 1 };
    }
    if (char === '\r') {
      if (this.lineBuffer[i + 1] === '\n') {
        return { index: i, length: 2 };
      }
      return { index: i, length: 1 }; // <--- Defects here when i === this.lineBuffer.length - 1
    }
  }
  return null;
}
```

Reproduction:
1. Instantiate `SseStreamDecoder`.
2. Push chunk 1: `"data: {\"token\":\"hello\"}\r"`
3. Push chunk 2: `"\ndata: {\"token\":\" world\"}\n\n"`
4. Observe that chunk 1 triggers an empty line and premature dispatch before `\n` arrives.

Root cause:
Lack of lookahead suspension when `\r` is the terminal byte of the internal buffer.

Impact:
Intermittent streaming corruption, dropped tokens, and JSON parse failures during fast or heavily fragmented network streams.

Recommended remediation:
Update `findLineEnd`:
```typescript
if (char === '\r') {
  if (i === this.lineBuffer.length - 1) {
    // Cannot know if next byte is \n until more data arrives.
    return null;
  }
  if (this.lineBuffer[i + 1] === '\n') {
    return { index: i, length: 2 };
  }
  return { index: i, length: 1 };
}
```

Required regression tests:
- Add a unit test in `src/shared/sseStreamDecoder.test.ts` verifying that splitting `\r\n` across two consecutive `push()` calls produces exactly one cleanly parsed event.

Dependencies / related findings:
None.

---

## VF-AUD-20260913-P2-001 — Uncaught SyntaxError in `syncOutbox.ts` halts all sync draining

Severity: P2  
Confidence: High  
Classification: CONFIRMED DEFECT (Sync Queue Resilience Defect)

Affected files:
- `electron/services/syncOutbox.ts:86`

Affected subsystem:
Sync Outbox / Durability

Observed behavior:
In `drainSyncOutbox()`, `const parsed = JSON.parse(raw) as Partial<SyncOutboxEntry>;` is executed without a `try/catch` block. If an outbox file is partially written (e.g. system crashed before atomic rename or zero-byte file created), `JSON.parse` throws an unhandled `SyntaxError`. The entire `drainSyncOutbox()` loop aborts. Because files are read in sorted alphabetical order, the corrupted file remains at the front of the list, permanently freezing all future outbox operations.

Expected behavior:
Any corrupt or unparseable outbox file must be caught, quarantined (e.g. renamed to `.corrupt`), logged, and bypassed so the queue can continue processing valid entries.

Evidence:
In `electron/services/syncOutbox.ts:84-90`:
```typescript
for (const file of files) {
  const entryPath = path.join(outboxDir, file);
  const raw = await fs.readFile(entryPath, "utf-8");
  const parsed = JSON.parse(raw) as Partial<SyncOutboxEntry>; // <--- Uncaught exception
  ...
}
```

Root cause:
Missing try/catch and quarantine handling around individual outbox entry parsing.

Impact:
Sync replication is permanently halted for the client until the corrupt file is manually deleted from disk.

Recommended remediation:
Wrap `JSON.parse(raw)` in a try/catch. On failure, quarantine the file (`${entryPath}.corrupt-${Date.now()}`) and `continue`.

Required regression tests:
- Unit test in `syncOutbox.test.ts` verifying that a corrupt outbox file is quarantined and valid subsequent files are successfully processed.

---

## VF-AUD-20260913-P2-002 — Sync conflict ID generation exceeds 128-character validation limit on long IDs

Severity: P2  
Confidence: High  
Classification: CONFIRMED DEFECT (Conflict Resolution Validation Failure)

Affected files:
- `src/services/syncPacketImporter.ts:420, 542`
- `src/utils/idValidation.ts:6, 24`

Affected subsystem:
Sync Engine / Conflict Resolution

Observed behavior:
When two devices modify the same record and a non-mergeable conflict is resolved by preserving both copies, `syncPacketImporter.ts` generates:
`const newId = `${id}_conflict_${conflictIdentity.slice(0, 16)}`;`
The conflict suffix is 26 characters long (`_conflict_` [10 chars] + 16 chars).
`isValidId()` in `idValidation.ts` enforces `id.length <= 128`.
If the original record ID exceeds 102 characters, `newId` exceeds 128 characters. `isValidId(newId)` returns `false`, causing `applyRemoteMutation` to reject the save.

Expected behavior:
Conflict IDs must always satisfy `isValidId()`, guaranteeing `newId.length <= 128`.

Evidence:
In `src/utils/idValidation.ts:24`:
```typescript
if (id.length < 1 || id.length > 128) return false;
```
In `src/services/syncPacketImporter.ts:420`:
```typescript
const newId = `${id}_conflict_${conflictIdentity.slice(0, 16)}`;
```

Root cause:
Base ID is not clamped before appending the suffix.

Impact:
Conflict resolution fails with an error for any items whose identifiers are longer than 102 characters, causing sync to fail repeatedly.

Recommended remediation:
Truncate the base ID if necessary:
```typescript
const suffix = `_conflict_${conflictIdentity.slice(0, 16)}`;
const safeBase = id.slice(0, 128 - suffix.length);
const newId = `${safeBase}${suffix}`;
```

Required regression tests:
- Unit test in `syncPacketImporter.test.ts` with a 128-character input ID confirming that the resulting conflict ID is `<= 128` chars and passes `isValidId()`.

---

## VF-AUD-20260913-P2-003 — Missing `chat_folders` from Sync replication allowlists

Severity: P2  
Confidence: High  
Classification: CONFIRMED DEFECT (Incomplete Sync Coverage)

Affected files:
- `electron/services/syncFolderWatcher.ts:181`
- `electron/services/syncBridge.ts:16`
- `electron/ipc/handlers/syncHandlers.ts:104`

Affected subsystem:
Sync Engine / Chat Folders

Observed behavior:
`chat_folders` exists as a durable store in `src/constants/venice.ts` and `chatFolderStorage.ts`. However, it was omitted from `SYNC_STORE_ALLOWLIST` in `syncFolderWatcher.ts` and `SYNC_STORE_NAME_MAP` in `syncBridge.ts`. Sync packets generated for chat folders are rejected as unrecognized stores by the sync watcher.

Expected behavior:
Chat folder structures must replicate across synchronized devices.

Evidence:
`SYNC_STORE_ALLOWLIST` in `electron/services/syncFolderWatcher.ts:181-192` contains `conversations`, `cards`, `personas`, `lorebooks`, `chats`, `assets`, `scenarios`, `tombstones`, but lacks `chat_folders`.

Root cause:
Omission during the chat folder feature merge.

Impact:
Chat folder organizations and hierarchies do not synchronize across devices.

Recommended remediation:
Add `chat_folders` to `SYNC_STORE_ALLOWLIST`, `SYNC_STORE_NAME_MAP`, and add its handler mapping in `syncHandlers.ts`.

Required regression tests:
- Verify `chat_folders` sync packet round-trip in `syncFolderWatcher.test.ts`.

---

## VF-AUD-20260913-P2-004 — Quota error in `safe-storage.ts` wipes all user settings

Severity: P2  
Confidence: High  
Classification: CONFIRMED DEFECT (Storage Resilience Defect)

Affected files:
- `src/lib/safe-storage.ts:52-61, 73-91`
- `src/stores/settings-store.ts:420-430`

Affected subsystem:
Web Storage / Settings Persistence

Observed behavior:
When `window.localStorage.setItem()` throws a `QuotaExceededError`:
1. `safe-storage.ts:55` catches the error and calls `pruneOversized(value)`.
2. `pruneOversized` checks for keys `'conversations'`, `'workflows'`, and `'messages'`.
3. For `venice-settings`, none of those keys exist; `pruneOversized` returns `null`.
4. Line 58 executes: `window.localStorage.removeItem(getProfileKey(name));`
5. The entire `venice-settings` record is deleted from storage, resetting theme, safe mode, provider preferences, and model defaults to factory state.

Expected behavior:
Settings should never be deleted on quota errors; non-essential caches should be pruned or a storage warning surfaced.

Evidence:
`src/lib/safe-storage.ts:52-61`:
```typescript
const pruned = pruneOversized(value);
if (pruned) {
  try { window.localStorage.setItem(getProfileKey(name), pruned); return; } catch { /* fall through */ }
}
try { window.localStorage.removeItem(getProfileKey(name)); } catch { /* noop */ }
```

Root cause:
All-or-nothing quota fallback that treats small critical configuration identical to large cache arrays.

Impact:
Catastrophic settings loss on devices with restricted `localStorage` limits.

Recommended remediation:
Do not remove `venice-settings` on quota errors. Log a warning and retain the in-memory state.

Required regression tests:
- Unit test simulating `QuotaExceededError` on `venice-settings` asserting that `localStorage.removeItem` is not called.

---

## VF-AUD-20260913-P2-005 — Asynchronous `persist` rehydration race in `workflow-store.ts` and `playground-store.ts`

Severity: P2  
Confidence: High  
Classification: CONFIRMED DEFECT (State Hydration Race Condition)

Affected files:
- `src/stores/workflow-store.ts:14-50, 133-168`
- `src/stores/playground-store.ts:9-45, 86-132`

Affected subsystem:
Zustand State Stores / Async Hydration

Observed behavior:
Both stores use Zustand's `persist` middleware with `asyncStorageAdapter` backed by IndexedDB (`StorageService.getItem`).
Initial store state is synchronous (`workflows: []`, `messages: []`).
If an action (`createWorkflow`, `addMessage`) executes before the asynchronous read from IndexedDB finishes:
1. The new record is stored in memory and immediately triggers `setItem()` to IndexedDB.
2. When the initial `getItem()` completes with the 20 existing records, Zustand's default `{ ...current, ...persisted }` overwrites the new record, or the late `setItem()` overwrites the 20 existing records in storage with only the single new item.

Expected behavior:
Stores must track `isHydrated` and defer or properly merge initial mutations.

Evidence:
Neither `workflow-store.ts` nor `playground-store.ts` implements `onRehydrateStorage`, `merge()`, or hydration gating.

Root cause:
Using async storage backend with synchronous default Zustand store initialization without concurrency control.

Impact:
Silent workflow or message loss when interacting with the UI immediately upon app launch.

Recommended remediation:
Implement `onRehydrateStorage` and an `isHydrated` flag in both stores, merging in-flight additions into the rehydrated state.

Required regression tests:
- Test asserting that mutations triggered before `rehydrate()` completes are preserved alongside loaded records.

---

## VF-AUD-20260913-P3-001 — Audio provider error messages dropped in retrieval normalizer

Severity: P3  
Confidence: High  
Classification: CONFIRMED DEFECT (User Feedback / Diagnostics Gap)

Affected files:
- `src/services/audio-retrieve-normalizer.ts:31-41`

Observed behavior:
When audio queue retrieval fails, `normalizeAudioRetrieveResponse()` sets a static error: `"Audio generation returned no playable audio."`, completely discarding provider-returned error details (e.g. content policy rejections, credit exhaustion, or model failures). In contrast, `video-retrieve-normalizer.ts` extracts `data.error || data.message`.

Recommended remediation:
Extract `data.error || data.message || "Audio generation returned no playable audio."`.

---

## VF-AUD-20260913-P3-002 — Hardcoded Kokoro voice default in canonical media speech builder

Severity: P3  
Confidence: High  
Classification: CONFIRMED DEFECT (API Contract Fragility)

Affected files:
- `src/shared/venice-media-contract/payload-builders.ts:432`

Observed behavior:
`buildCanonicalAudioSpeechPayload()` defaults `voice: cleanString(req.voice) || 'af_sky'`.
`af_sky` is exclusive to Kokoro TTS models. If a user selects ElevenLabs, Qwen 3 TTS, or other non-Kokoro models without specifying a voice, Venice rejects the request with 400 Bad Request.

Recommended remediation:
Default to `'af_sky'` only if the model is Kokoro; otherwise omit `voice` or resolve the model's canonical default voice.

---

## VF-AUD-20260913-P3-003 — `media-store.ts:patchMany` updates in-memory cache on partial storage failures

Severity: P3  
Confidence: High  
Classification: CONFIRMED DEFECT (State Inconsistency)

Affected files:
- `src/stores/media-store.ts:317-330`

Observed behavior:
If `StorageService.bulkPatchMedia(ids, patch)` updates only a subset of IDs and returns `count < ids.length`, the store sets `updatedSet = new Set(ids)` and patches all IDs in Zustand memory. The UI displays updated properties for items that failed to persist in IndexedDB.

Recommended remediation:
Update `bulkPatchMedia` to return the array of successfully patched IDs, and update only those IDs in Zustand state.

---

## VF-AUD-20260913-P3-004 — Residual raw file writes in character image cache and theme service

Severity: P3  
Confidence: High  
Classification: CONFIRMED DEFECT / RESIDUAL DEBT

Affected files:
- `electron/services/characterImageCache.ts:143, 337-346`
- `electron/services/themeService.ts:212`

Observed behavior:
`characterImageCache.ts` was not migrated to `atomicReplaceFile()`, retaining raw `writeFile` for `.meta.json` and a custom PID/timestamp temp file with raw `fs.rename` (which lacks the Windows EEXIST fallback). `themeService.ts:212` writes custom theme YAML directly to the destination without temp-and-rename atomicity.

Recommended remediation:
Migrate both call sites to `atomicReplaceFile()`.

---

## Design Risks

### VF-AUD-20260913-DR-001 — Full SSE stream buffering in Web Proxy under Local Family Safe Mode
- **Affected file:** `server.ts:693-702, 746-831, 1010-1012`
- **Description:** In web mode, when Safe Mode is active (default), `fsmChatStreamProxy` intercepts the response (`selfHandleResponse: true`), buffers all SSE chunks into an array, and flushes the entire response only when the upstream stream ends. This defeats real-time token streaming in web mode, causing long perceived latency.
- **Remediation:** Implement a streaming chunk-by-chunk inspection transform instead of full body buffering.

### VF-AUD-20260913-DR-002 — Omission of 502 and 504 from transient retry status codes
- **Affected file:** `src/services/veniceClient/fetch.ts:235`
- **Description:** `RETRYABLE_STATUS_CODES = [429, 500, 503]`. Cloudflare/edge 502 Bad Gateway and 504 Gateway Timeout are treated as fatal non-retryable errors.
- **Remediation:** Add 502 and 504 to `RETRYABLE_STATUS_CODES`.
