# Venice Forge Release Readiness Work Order

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the remaining P0 sync correctness blockers, CI determinism failures, chat/memory/RP Studio gaps, and repository-path hygiene issues so the app can be treated as release-ready for encrypted multi-machine sync.

**Architecture:** Fix one authoritative delete path for syncable records; add mutation-origin tracking so remote imports never echo; serialize remote apply with a per-object queue; harden the applied-operation journal; split CI into fresh-process domains; patch chat/memory/RP UX regressions; clean up agent-facing path documentation.

**Tech Stack:** React 19 + TypeScript strict, Electron 42, Express 4, Vitest 4, Zustand 5, Tailwind v4, Node 22.13+.

## Global Constraints

- Canonical local path: `/Users/super_user/Projects/Venice_Forge`.
- Repository: `spearchucker667/Venice_Forge`.
- Do NOT use historical paths such as `/Users/super_user/Projects/Venice_Forge/`.
- Run the local-only root bootstrap check from `AGENTS.md` before editing.
- Update `docs/summary_of_work.md` at the end of every substantive session.
- All new code must be TypeScript strict, lint-clean, and covered by focused tests.
- Sync transport must have one owner; remove duplicate/obsolete emitters.
- API keys, bearer tokens, and Venice keys must never appear in renderer memory, logs, or sync packets.

---

## Phase 0 — Repository Path Hygiene and Agent Handoff

**Objective:** Ensure every agent-facing file and the canonical session ledger unambiguously identify `/Users/super_user/Projects/Venice_Forge` as the project root, and archive historical references that carry the old repository name.

### Task 1: Add canonical-path banner to active agent instruction files

**Files:**
- Modify: `/Users/super_user/Projects/Venice_Forge/AGENTS.md:1-30`
- Modify: `/Users/super_user/Projects/Venice_Forge/CLAUDE.md:1-20`
- Modify: `/Users/super_user/Projects/Venice_Forge/GEMINI.md:1-20`
- Modify: `/Users/super_user/Projects/Venice_Forge/.cursorrules:1-15`
- Modify: `/Users/super_user/Projects/Venice_Forge/.windsurfrules:1-15`
- Modify: `/Users/super_user/Projects/Venice_Forge/.github/copilot-instructions.md:1-20`

**Interfaces:**
- Consumes: existing repository-root bootstrap check in `AGENTS.md`.
- Produces: a concise top banner in each file stating the canonical path and warning against the stale path.

- [ ] **Step 1: Update `AGENTS.md`**

Insert or update the top-of-file block (keep the existing bootstrap check):

```markdown
# Venice Forge — Agent Guide

> **Canonical repository root:** `/Users/super_user/Projects/Venice_Forge`
> **GitHub:** `spearchucker667/Venice_Forge`
> **Version:** 2.1.2
>
> Do not use historical paths such as
> `/Users/super_user/Projects/Venice_Forge/`. Always run the
> local-only root bootstrap check below before editing.
```

- [ ] **Step 2: Mirror banner to sibling instruction files**

Apply an equivalent one-line banner at the top of `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.windsurfrules`, and `.github/copilot-instructions.md`:

```markdown
# Canonical path: /Users/super_user/Projects/Venice_Forge
# Historical path `Windows-Venice-API-connector` must not be used.
```

- [ ] **Step 3: Run repository-identity verifier**

Run:

```bash
npm run verify:repository-identity
```

Expected: PASS in archive or git mode.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md CLAUDE.md GEMINI.md .cursorrules .windsurfrules .github/copilot-instructions.md
git commit -m "docs(agents): canonical path banner and stale-path warning"
```

### Task 2: Split oversized `docs/summary_of_work.md` into active ledger + archive

**Files:**
- Modify: `/Users/super_user/Projects/Venice_Forge/docs/summary_of_work.md`
- Create: `/Users/super_user/Projects/Venice_Forge/docs/archives/session-history-pre-2026-07-11.md`
- Modify: `/Users/super_user/Projects/Venice_Forge/docs/DOCS_INDEX.md`

**Interfaces:**
- Consumes: existing `docs/summary_of_work.md` (~1.3 MiB).
- Produces: a <100 KiB active ledger plus an archive file for dated records before 2026-07-11.

- [ ] **Step 1: Back up the original file**

```bash
cp docs/summary_of_work.md docs/summary_of_work.md.bak
```

- [ ] **Step 2: Create archive file with banner**

Create `/Users/super_user/Projects/Venice_Forge/docs/archives/session-history-pre-2026-07-11.md` containing all dated `Session History` entries dated before 2026-07-11. Prefix the file with:

```markdown
# Session History Archive (pre-2026-07-11)

> **Historical repository name notice:** older entries may reference deliverable
> ZIPs or snapshots named `Windows-Venice-API-connector-…`. The canonical
> repository is now `/Users/super_user/Projects/Venice_Forge`.
```

- [ ] **Step 3: Trim active ledger**

Rewrite `/Users/super_user/Projects/Venice_Forge/docs/summary_of_work.md` to keep only:

1. Latest Session Summary.
2. The most recent 5–7 dated session entries (or everything from 2026-07-11 onward).
3. Open TODO Ledger.
4. Validation Matrix.
5. A link to the archive file above.

- [ ] **Step 4: Update `docs/DOCS_INDEX.md`**

Add entries:

```markdown
- `docs/summary_of_work.md` — active session ledger (recent sessions only)
- `docs/archives/session-history-pre-2026-07-11.md` — archived dated session records
```

- [ ] **Step 5: Run markdown-link verifier**

Run:

```bash
npm run verify:markdown-links
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add docs/summary_of_work.md docs/archives/session-history-pre-2026-07-11.md docs/DOCS_INDEX.md
rm docs/summary_of_work.md.bak
git commit -m "docs(handoff): split session ledger and archive historical path references"
```

---

## Phase 1 — Sync Correctness: Tombstone Durability

**Objective:** One local delete must persist one exact local tombstone, delete the target, and emit one exact encrypted tombstone. Stale object packets must not resurrect deleted records.

### Task 3: Add exact tombstone persistence API

**Files:**
- Modify: `/Users/super_user/Projects/Venice_Forge/src/services/tombstoneService.ts`
- Modify: `/Users/super_user/Projects/Venice_Forge/src/types/sync.ts` (if `Tombstone` type lives there)

**Interfaces:**
- Consumes: `Tombstone` type from `src/shared/syncProtocol.ts` or `src/types/sync.ts`.
- Produces: `TombstoneService.saveTombstone(tombstone: Tombstone): Promise<void>`.

- [ ] **Step 1: Write failing test**

Create or extend `/Users/super_user/Projects/Venice_Forge/src/services/tombstoneService.test.ts`:

```ts
it("saves an exact tombstone including original deletedAt", async () => {
  const tombstone: Tombstone = {
    id: "conversations:conv-1",
    storeName: "conversations",
    recordId: "conv-1",
    deletedAt: 1_000_000,
    deviceId: "device-a",
  };
  await TombstoneService.saveTombstone(tombstone);
  const stored = await StorageService.getItem("tombstones", tombstone.id);
  expect(stored).toEqual(tombstone);
});
```

Run:

```bash
npx vitest run src/services/tombstoneService.test.ts
```

Expected: FAIL — `saveTombstone` not defined.

- [ ] **Step 2: Implement `saveTombstone`**

In `/Users/super_user/Projects/Venice_Forge/src/services/tombstoneService.ts`:

```ts
export class TombstoneService {
  static async saveTombstone(tombstone: Tombstone): Promise<void> {
    await StorageService.saveItem("tombstones", tombstone.id, tombstone, {
      bypassSyncEcho: true,
    });
  }

  // Keep recordTombstone as a convenience for tests/legacy callers, but make it delegate:
  static async recordTombstone(
    storeName: SyncStoreName,
    recordId: string,
    options?: { deletedAt?: number; deviceId?: string },
  ): Promise<void> {
    const tombstone = createTombstone(
      storeName,
      recordId,
      options?.deviceId,
      options?.deletedAt ?? Date.now(),
    );
    await this.saveTombstone(tombstone);
  }
}
```

- [ ] **Step 3: Add `bypassSyncEcho` option to `StorageService.saveItem`**

In `/Users/super_user/Projects/Venice_Forge/src/services/storageService.ts`, add an optional `options` bag to `saveItem` and `deleteItem` so that sync-originating writes can suppress re-emission. If the option does not exist, add it as a no-op for now; it will be wired in Task 1.4.

```ts
interface StorageMutationOptions {
  bypassSyncEcho?: boolean;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/services/tombstoneService.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/tombstoneService.ts src/services/tombstoneService.test.ts src/services/storageService.ts
git commit -m "feat(sync): exact tombstone persistence API"
```

### Task 4: Create authoritative `deleteSyncableRecord` coordinator

**Files:**
- Create: `/Users/super_user/Projects/Venice_Forge/src/services/syncDeleteCoordinator.ts`
- Create: `/Users/super_user/Projects/Venice_Forge/src/services/syncDeleteCoordinator.test.ts`
- Modify: `/Users/super_user/Projects/Venice_Forge/src/services/syncEngine.ts`
- Modify: `/Users/super_user/Projects/Venice_Forge/src/services/storageService.ts`

**Interfaces:**
- Consumes: `createTombstone` from `src/shared/syncProtocol.ts`, `TombstoneService.saveTombstone`, `StorageService.deleteItem`.
- Produces: `deleteSyncableRecord(storeName, recordId): Promise<{ ok: boolean; tombstone: Tombstone }>`.

- [ ] **Step 1: Write failing test**

```ts
// src/services/syncDeleteCoordinator.test.ts
it("persists local tombstone before deleting target and emits once", async () => {
  const spyDelete = vi.spyOn(StorageService, "deleteItem").mockResolvedValue(undefined);
  const spySave = vi.spyOn(TombstoneService, "saveTombstone").mockResolvedValue(undefined);
  const result = await deleteSyncableRecord("conversations", "conv-1");
  expect(result.ok).toBe(true);
  expect(spySave).toHaveBeenCalledBefore(spyDelete);
  expect(spySave.mock.calls[0][0].recordId).toBe("conv-1");
  spyDelete.mockRestore();
  spySave.mockRestore();
});
```

Run:

```bash
npx vitest run src/services/syncDeleteCoordinator.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Implement coordinator**

```ts
// src/services/syncDeleteCoordinator.ts
export interface DeleteSyncableRecordResult {
  ok: boolean;
  tombstone: Tombstone;
}

export async function deleteSyncableRecord(
  storeName: SyncStoreName,
  recordId: string,
  deviceId?: string,
): Promise<DeleteSyncableRecordResult> {
  const tombstone = createTombstone(storeName, recordId, deviceId);
  await TombstoneService.saveTombstone(tombstone);
  await StorageService.deleteItem(storeName, recordId, { bypassSyncEcho: true });
  return { ok: true, tombstone };
}
```

- [ ] **Step 3: Wire renderer delete path**

In `/Users/super_user/Projects/Venice_Forge/src/services/syncEngine.ts`, replace the existing `handleStorageDeleted` / `emitLocalTombstone` flow so that any renderer-side delete routes through `deleteSyncableRecord`. Keep the event listener for non-syncable stores.

- [ ] **Step 4: Remove obsolete direct write from `StorageService.deleteItem`**

In `/Users/super_user/Projects/Venice_Forge/src/services/storageService.ts:464-483`, delete the block that calls `desktopSync.writePacket` for tombstones. `StorageService` must only dispatch `venice:storage-deleted`.

- [ ] **Step 5: Add resurrection regression test**

```ts
it("a stale object packet cannot resurrect a locally deleted record", async () => {
  await StorageService.saveItem("conversations", "conv-1", { id: "conv-1", title: "x" });
  await deleteSyncableRecord("conversations", "conv-1");
  const stalePacket = createObjectPacket("conversations", "conv-1", { id: "conv-1", title: "x" });
  const result = await importDecryptedPacket(stalePacket);
  expect(result.ok).toBe(false);
  expect(await StorageService.getItem("conversations", "conv-1")).toBeNull();
});
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run src/services/syncDeleteCoordinator.test.ts src/services/syncEngine.test.ts src/services/storageService.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/syncDeleteCoordinator.ts src/services/syncDeleteCoordinator.test.ts src/services/syncEngine.ts src/services/storageService.ts
git commit -m "feat(sync): authoritative delete coordinator and remove obsolete StorageService emitter"
```

### Task 5: Preserve remote tombstone `deletedAt` and `deviceId`

**Files:**
- Modify: `/Users/super_user/Projects/Venice_Forge/src/services/backupImportService.ts:180-201`
- Modify: `/Users/super_user/Projects/Venice_Forge/src/services/backupImportService.test.ts`

**Interfaces:**
- Consumes: `validateTombstone`, `TombstoneService.saveTombstone`.
- Produces: imported tombstone with original metadata intact.

- [ ] **Step 1: Write failing test**

```ts
it("preserves remote tombstone deletedAt and deviceId", async () => {
  const remote: Tombstone = {
    id: "conversations:conv-1",
    storeName: "conversations",
    recordId: "conv-1",
    deletedAt: 1_000_000,
    deviceId: "device-a",
  };
  const result = await importRemoteTombstone(remote);
  expect(result.ok).toBe(true);
  const stored = await StorageService.getItem("tombstones", remote.id);
  expect(stored?.deletedAt).toBe(1_000_000);
  expect(stored?.deviceId).toBe("device-a");
});
```

- [ ] **Step 2: Update import path**

Replace:

```ts
await TombstoneService.recordTombstone(validation.tombstone.storeName, validation.tombstone.recordId);
```

with:

```ts
await TombstoneService.saveTombstone(validation.tombstone);
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/services/backupImportService.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/backupImportService.ts src/services/backupImportService.test.ts
git commit -m "fix(sync): preserve remote tombstone metadata on import"
```

---

## Phase 2 — Sync Correctness: Mutation Origin and Echo Suppression

**Objective:** Remote imports must not re-emit sync packets. Only `local-user` mutations generate new sync operations.

### Task 6: Add `MutationOrigin` and propagate it through persistence APIs

**Files:**
- Modify: `/Users/super_user/Projects/Venice_Forge/src/types/sync.ts`
- Modify: `/Users/super_user/Projects/Venice_Forge/src/services/storageService.ts`
- Modify: `/Users/super_user/Projects/Venice_Forge/src/services/desktopBridge.ts` (renderer types)
- Modify: `/Users/super_user/Projects/Venice_Forge/electron/preload.ts`
- Modify: `/Users/super_user/Projects/Venice_Forge/electron/ipc/validation.ts`

**Interfaces:**
- Consumes: existing IPC save/delete payloads.
- Produces: `MutationOrigin` union carried on every save/delete request.

- [ ] **Step 1: Define `MutationOrigin`**

```ts
// src/types/sync.ts
export type MutationOrigin =
  | "local-user"
  | "remote-sync"
  | "manual-import"
  | "migration";
```

- [ ] **Step 2: Add origin to storage mutation options**

Extend `StorageMutationOptions` from Task 1.1:

```ts
interface StorageMutationOptions {
  bypassSyncEcho?: boolean;
  origin?: MutationOrigin;
}
```

- [ ] **Step 3: Add origin to desktop bridge save/delete methods**

Update renderer-facing types in `src/services/desktopBridge.ts` and preload APIs in `electron/preload.ts` so every save/delete call can carry an `origin` field. Default to `"local-user"` when omitted for back-compat.

- [ ] **Step 4: Validate origin in IPC layer**

In `electron/ipc/validation.ts`, ensure `MutationOrigin` is one of the four allowed values; reject otherwise.

- [ ] **Step 5: Commit**

```bash
git add src/types/sync.ts src/services/storageService.ts src/services/desktopBridge.ts electron/preload.ts electron/ipc/validation.ts
git commit -m "feat(sync): MutationOrigin type and propagation"
```

### Task 7: Make main-process save/delete handlers origin-aware

**Files:**
- Modify: `/Users/super_user/Projects/Venice_Forge/electron/ipc/handlers/systemHandlers.ts:273-315` and `:359-401`
- Modify: `/Users/super_user/Projects/Venice_Forge/electron/ipc/rpHandlers.ts:87-384`
- Modify: `/Users/super_user/Projects/Venice_Forge/electron/services/syncBridge.ts:31-46` and `:52-66`

**Interfaces:**
- Consumes: `MutationOrigin` from IPC payloads.
- Produces: sync packet/tombstone emitted only when `origin === "local-user"` (or origin undefined for back-compat).

- [ ] **Step 1: Update system handlers**

In `systemHandlers.ts`, accept `origin` in chat/conversation save/delete payloads and pass it to `emitSyncPacket` / `emitSyncTombstone`. Modify `syncBridge.ts` to skip emission when `origin !== "local-user"`.

- [ ] **Step 2: Update RP handlers**

Apply the same origin guard to all RP store save/delete handlers in `rpHandlers.ts`.

- [ ] **Step 3: Add echo regression test**

```ts
it("remote-sync origin does not emit a sync packet", async () => {
  const spy = vi.spyOn(syncBridge, "emitSyncPacket").mockResolvedValue(undefined);
  await saveConversation(record, { origin: "remote-sync" });
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});

it("local-user origin still emits a sync packet", async () => {
  const spy = vi.spyOn(syncBridge, "emitSyncPacket").mockResolvedValue(undefined);
  await saveConversation(record, { origin: "local-user" });
  expect(spy).toHaveBeenCalledTimes(1);
  spy.mockRestore();
});
```

- [ ] **Step 4: Run tests**

```bash
npm run test:electron
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/handlers/systemHandlers.ts electron/ipc/rpHandlers.ts electron/services/syncBridge.ts
git commit -m "fix(sync): only local-user origin emits sync packets"
```

### Task 8: Remove renderer-global `__VENICE_IS_SYNCING` as the suppression mechanism

**Files:**
- Modify: `/Users/super_user/Projects/Venice_Forge/src/services/backupImportService.ts:188-189`
- Modify: `/Users/super_user/Projects/Venice_Forge/src/services/syncEngine.ts:146-149`
- Modify: `/Users/super_user/Projects/Venice_Forge/src/services/storageService.ts` (delete path)

**Interfaces:**
- Consumes: `MutationOrigin` / `bypassSyncEcho` options.
- Produces: no reliance on `window.__VENICE_IS_SYNCING`.

- [ ] **Step 1: Replace global boolean with origin option**

In `backupImportService.ts`, remove the `__VENICE_IS_SYNCING = true` wrapper and instead call storage methods with `{ origin: "remote-sync" }`.

- [ ] **Step 2: Remove the guard in `syncEngine.ts`**

The `handleStorageSaved` listener should no longer check `__VENICE_IS_SYNCING`; instead, remote-sync writes should carry `origin: "remote-sync"` and the coordinator should skip emission.

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/services/backupImportService.test.ts src/services/syncEngine.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/backupImportService.ts src/services/syncEngine.ts
git commit -m "refactor(sync): replace global sync flag with MutationOrigin"
```

---

## Phase 3 — Sync Correctness: Deterministic Remote Apply

**Objective:** Operations targeting the same logical record must serialize. Record and tombstone for the same ID must apply deterministically.

### Task 9: Add per-object remote apply queue

**Files:**
- Create: `/Users/super_user/Projects/Venice_Forge/electron/services/syncApplyQueue.ts`
- Create: `/Users/super_user/Projects/Venice_Forge/electron/services/syncApplyQueue.test.ts`
- Modify: `/Users/super_user/Projects/Venice_Forge/electron/services/syncFolderWatcher.ts:269-320`

**Interfaces:**
- Consumes: `handleRemoteChange` callback.
- Produces: `enqueueRemoteApply(queueKey, operation): Promise<void>` ensuring FIFO per logical object.

- [ ] **Step 1: Write failing test**

```ts
it("serializes two operations for the same record", async () => {
  const order: string[] = [];
  const op1 = async () => { order.push("a"); await delay(10); order.push("b"); };
  const op2 = async () => { order.push("c"); };
  await Promise.all([
    enqueueRemoteApply("conversations:conv-1", op1),
    enqueueRemoteApply("conversations:conv-1", op2),
  ]);
  expect(order).toEqual(["a", "b", "c"]);
});
```

- [ ] **Step 2: Implement queue**

Use a `Map<string, Promise<void>>` to chain per-key operations:

```ts
export function enqueueRemoteApply(
  queueKey: string,
  operation: () => Promise<void>,
): Promise<void> {
  const previous = pending.get(queueKey) ?? Promise.resolve();
  const next = previous.then(operation, operation).finally(() => {
    if (pending.get(queueKey) === next) pending.delete(queueKey);
  });
  pending.set(queueKey, next);
  return next;
}
```

- [ ] **Step 3: Wire into `syncFolderWatcher.ts`**

In `handleRemoteChange`, compute `queueKey` from the packet metadata and wrap the apply logic in `enqueueRemoteApply`.

- [ ] **Step 4: Add object/tombstone ordering test**

```ts
it("applies tombstone after record for same id deterministically", async () => {
  // seed record packet then tombstone packet, verify final deleted state
});
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run electron/services/syncApplyQueue.test.ts electron/services/syncFolderWatcher.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/services/syncApplyQueue.ts electron/services/syncApplyQueue.test.ts electron/services/syncFolderWatcher.ts
git commit -m "feat(sync): per-object remote apply queue"
```

---

## Phase 4 — Applied-Operation Journal Hardening

**Objective:** Journal writes serialize; acknowledgments are validated; failed imports retry; in-flight operations do not get stuck.

### Task 10: Serialize journal writes with a mutex

**Files:**
- Modify: `/Users/super_user/Projects/Venice_Forge/electron/services/syncFolderWatcher.ts:20-140`
- Modify: `/Users/super_user/Projects/Venice_Forge/electron/services/syncFolderWatcher.test.ts`

**Interfaces:**
- Consumes: existing `recordAppliedOperation` / `saveAppliedOperationsJournal`.
- Produces: serial journal mutation via `AsyncSerialQueue`.

- [ ] **Step 1: Add serial queue**

```ts
class AsyncSerialQueue {
  private tail = Promise.resolve();
  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task, task);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

const journalQueue = new AsyncSerialQueue();
```

- [ ] **Step 2: Wrap `recordAppliedOperation`**

```ts
export async function recordAppliedOperation(...): Promise<void> {
  return journalQueue.enqueue(async () => {
    // existing logic
    await saveAppliedOperationsJournal();
  });
}
```

- [ ] **Step 3: Add concurrent-ack persistence test**

```ts
it("preserves every acknowledgment under concurrent writes", async () => {
  const ids = Array.from({ length: 50 }, (_, i) => `op-${i}`);
  await Promise.all(ids.map((id) => recordAppliedOperation(id, "conversations", "applied")));
  const journal = await loadAppliedOperationsJournal();
  for (const id of ids) {
    expect(journal.operations.some((op) => op.operationId === id)).toBe(true);
  }
});
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/services/syncFolderWatcher.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/services/syncFolderWatcher.ts electron/services/syncFolderWatcher.test.ts
git commit -m "fix(sync): serialize applied-operation journal writes"
```

### Task 11: Validate acknowledgments and require live in-flight operations

**Files:**
- Modify: `/Users/super_user/Projects/Venice_Forge/electron/services/syncFolderWatcher.ts:150-164`
- Modify: `/Users/super_user/Projects/Venice_Forge/electron/ipc/handlers/syncHandlers.ts:66-70`
- Modify: `/Users/super_user/Projects/Venice_Forge/electron/services/syncFolderWatcher.test.ts`

**Interfaces:**
- Consumes: `inFlightOperations` map.
- Produces: strict acknowledgment validation.

- [ ] **Step 1: Add operation ID validation**

```ts
const OPERATION_ID_RE = /^[a-f0-9]{64}$/;

export async function acknowledgeOperation(
  operationId: string,
  ok: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!OPERATION_ID_RE.test(operationId)) {
    return { ok: false, error: "operationId must be 64 lowercase hex characters." };
  }
  const inFlight = inFlightOperations.get(operationId);
  if (!inFlight) {
    return { ok: false, error: "No such in-flight operation." };
  }
  inFlightOperations.delete(operationId);
  if (!ok) {
    scheduleRetry(inFlight);
    return { ok: true };
  }
  try {
    await recordAppliedOperation(operationId, inFlight.storeName, "applied", inFlight.sourceDeviceId);
    return { ok: true };
  } catch (err) {
    scheduleRetry(inFlight);
    return { ok: false, error: String(err) };
  }
}
```

- [ ] **Step 2: Update tests**

Change the existing test that acknowledges `"op-abc"` to first register a real 64-hex operation and then ack it.

- [ ] **Step 3: Run tests**

```bash
npx vitest run electron/services/syncFolderWatcher.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add electron/services/syncFolderWatcher.ts electron/ipc/handlers/syncHandlers.ts electron/services/syncFolderWatcher.test.ts
git commit -m "fix(sync): validate operation IDs and require live in-flight ops"
```

### Task 12: Add bounded retry queue and acknowledgment timeout

**Files:**
- Modify: `/Users/super_user/Projects/Venice_Forge/electron/services/syncFolderWatcher.ts`
- Create: `/Users/super_user/Projects/Venice_Forge/electron/services/syncRetryQueue.ts`
- Modify: `/Users/super_user/Projects/Venice_Forge/electron/services/syncFolderWatcher.test.ts`

**Interfaces:**
- Consumes: `inFlightOperations`, `handleRemoteChange`.
- Produces: `scheduleRetry(inFlight)`, acknowledgment timeout, and requeue on pause/stop.

- [ ] **Step 1: Define retry state**

```ts
interface PendingRemoteOperation {
  operationId: string;
  filePath: string;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
}
```

- [ ] **Step 2: Implement retry scheduler**

Use a simple setInterval (e.g., every 5 s) to scan pending retries and re-enqueue any whose `nextAttemptAt` has passed, with exponential backoff capped at 5 minutes and max 10 attempts.

- [ ] **Step 3: Add acknowledgment timeout**

When an operation is delivered to the renderer, start a `setTimeout` (e.g., 30 s). If not acknowledged, requeue it and remove from `inFlightOperations`.

- [ ] **Step 4: Requeue on stop/pause**

In `stopSyncWatcher` / `pauseSyncWatcher`, iterate `inFlightOperations.values()` and call `scheduleRetry` for each before clearing the map.

- [ ] **Step 5: Add tests**

```ts
it("requeues an unacknowledged operation after timeout", async () => {
  // register op, do not ack, advance timers, verify retry queue entry
});
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run electron/services/syncFolderWatcher.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add electron/services/syncFolderWatcher.ts electron/services/syncRetryQueue.ts electron/services/syncFolderWatcher.test.ts
git commit -m "feat(sync): retry queue, ack timeout, and stop requeue"
```

### Task 13: Enforce real journal bounds

**Files:**
- Modify: `/Users/super_user/Projects/Venice_Forge/electron/services/syncFolderWatcher.ts:20-140`
- Modify: `/Users/super_user/Projects/Venice_Forge/electron/services/syncFolderWatcher.test.ts`

**Interfaces:**
- Consumes: `appliedOperationsJournal.operations`.
- Produces: bounded journal with tombstone compaction.

- [ ] **Step 1: Implement bounded compaction**

Compaction rules:

1. Always keep tombstone entries younger than `JOURNAL_COMPACTION_DAYS` (used for conflict resolution).
2. For non-tombstone applied operations, keep the most recent `MAX_JOURNAL_ENTRIES - tombstoneCount` entries.
3. If the total still exceeds `MAX_JOURNAL_ENTRIES`, remove oldest non-tombstone entries first.
4. Persist a compacted snapshot with `lastCompactedAt`.

- [ ] **Step 2: Add bound test**

```ts
it("does not exceed MAX_JOURNAL_ENTRIES after many operations", async () => {
  for (let i = 0; i < MAX_JOURNAL_ENTRIES + 100; i++) {
    await recordAppliedOperation(`op-${i}`, "conversations", "applied");
  }
  const journal = await loadAppliedOperationsJournal();
  expect(journal.operations.length).toBeLessThanOrEqual(MAX_JOURNAL_ENTRIES);
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run electron/services/syncFolderWatcher.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add electron/services/syncFolderWatcher.ts electron/services/syncFolderWatcher.test.ts
git commit -m "fix(sync): enforce real applied-operation journal bounds"
```

---

## Phase 5 — Sync Status and Lifecycle

**Objective:** Sync status reflects actual main-process and renderer state; renderer reload cannot falsely show Active.

### Task 14: Improve `startSyncWatcher` state transitions

**Files:**
- Modify: `/Users/super_user/Projects/Venice_Forge/electron/services/syncFolderWatcher.ts`
- Modify: `/Users/super_user/Projects/Venice_Forge/src/components/settings/BackupSyncPanel.tsx`
- Modify: `/Users/super_user/Projects/Venice_Forge/src/types/desktop.ts`

**Interfaces:**
- Consumes: existing `syncStatus`.
- Produces: richer `SyncRuntimeStatus` with `configured`, `mainWatcher`, `rendererSessionAttached`, `authenticated`, `degradedReason`.

- [ ] **Step 1: Define richer status type**

```ts
// src/types/desktop.ts
export interface SyncRuntimeStatus {
  configured: boolean;
  mainWatcher: "stopped" | "paused" | "running" | "error";
  rendererSessionAttached: boolean;
  authenticated: boolean;
  degradedReason?: string;
}
```

- [ ] **Step 2: Update `startSyncWatcher`**

Set `mainWatcher: "running"` only after `setSyncFolder` succeeds. On failure, set `mainWatcher: "error"`, clear `currentPassword`, and return `{ ok: false, error }`.

- [ ] **Step 3: Update `BackupSyncPanel`**

Replace the coarse `isSyncing ? "Active" : syncFolder ? "Paused" : "Off"` pill with the new fields. Show "Active” only when `mainWatcher === "running" && rendererSessionAttached`. Show a warning when the renderer session is detached.

- [ ] **Step 4: Fix lower status text**

Change the lower card text from `syncFolder ? "Sync is active..."` to a message derived from actual runtime status, e.g.:

```tsx
{runtimeStatus.mainWatcher === "running" && runtimeStatus.rendererSessionAttached
  ? "Sync is active. New changes will be automatically merged."
  : runtimeStatus.mainWatcher === "error"
    ? `Sync error: ${runtimeStatus.degradedReason}`
    : "Sync is not fully active."}
```

- [ ] **Step 5: Run tests**

```bash
npm run test:electron
npx vitest run src/components/settings/BackupSyncPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/services/syncFolderWatcher.ts src/types/desktop.ts src/components/settings/BackupSyncPanel.tsx
git commit -m "feat(sync): richer runtime status and correct failure state"
```

### Task 15: Rebuild renderer sync session on reload

**Files:**
- Modify: `/Users/super_user/Projects/Venice_Forge/src/services/syncEngine.ts:35-98`
- Modify: `/Users/super_user/Projects/Venice_Forge/src/components/settings/BackupSyncPanel.tsx`

**Interfaces:**
- Consumes: `desktopSync.getRuntimeStatus()`.
- Produces: automatic re-init or UI prompt when renderer session is detached.

- [ ] **Step 1: Detect detached session on panel mount**

In `BackupSyncPanel`, after fetching runtime status, if `mainWatcher === "running" && !rendererSessionAttached`, call `initSyncEngine()` automatically **or** show a "Reattach sync session" button. For MVP, show the button to avoid silent re-auth issues.

- [ ] **Step 2: Add test**

```tsx
it("offers reattach when main watcher is running but renderer session is detached", async () => {
  // render panel with mocked detached status
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/components/settings/BackupSyncPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/syncEngine.ts src/components/settings/BackupSyncPanel.tsx
git commit -m "fix(sync): allow reattaching renderer session after reload"
```

---

## Phase 6 — Memory Index Migration

**Objective:** Historical `MemoryIndexV1` entries gain explicit `characterId` (or `null`) so character-scoped retrieval works immediately after upgrade.

### Task 16: Bump memory index schema and auto-migrate

**Files:**
- Modify: `/Users/super_user/Projects/Venice_Forge/src/services/memoryPuller.ts`
- Modify: `/Users/super_user/Projects/Venice_Forge/src/constants/venice.ts`
- Modify: `/Users/super_user/Projects/Venice_Forge/src/services/memoryPuller.test.ts`

**Interfaces:**
- Consumes: existing `MemoryIndexEntryV1`, conversation records.
- Produces: `MemoryIndexV2` with `characterId: string | null` and migration at load time.

- [ ] **Step 1: Define V2 types**

```ts
// src/services/memoryPuller.ts or a new src/types/memory.ts
export const MEMORY_INDEX_VERSION = 2;

export interface MemoryIndexEntryV2 {
  conversationId: string;
  characterId: string | null;
  summary: string;
  updatedAt: number;
}

export interface MemoryIndexV2 {
  version: 2;
  entries: MemoryIndexEntryV2[];
}
```

- [ ] **Step 2: Add migration function**

```ts
function migrateMemoryIndexV1ToV2(
  v1: MemoryIndexV1,
  conversations: ConversationRecordV1[],
): MemoryIndexV2 {
  const entryMap = new Map<string, MemoryIndexEntryV2>();
  for (const entry of v1.entries) {
    const conversation = conversations.find((c) => c.id === entry.conversationId);
    const characterId = conversation?.metadata?.character?.id ?? null;
    entryMap.set(entry.conversationId, {
      ...entry,
      characterId,
    });
  }
  return { version: 2, entries: Array.from(entryMap.values()) };
}
```

- [ ] **Step 3: Wire migration on load**

When loading the memory index, detect `version === 1`, load conversations, migrate, and save back as V2 before querying.

- [ ] **Step 4: Add regression test**

```ts
it("migrates V1 entries with characterId from conversation metadata", async () => {
  // seed V1 index, seed character conversation, load, verify character-scoped query returns it
});
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/services/memoryPuller.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/memoryPuller.ts src/constants/venice.ts src/services/memoryPuller.test.ts
git commit -m "feat(memory): auto-migrate V1 memory index to V2 with characterId"
```

---

## Phase 7 — CI Determinism

**Objective:** Every test command terminates reliably without relying on external timeouts.

### Task 17: Add explicit serial flags to ingestion and workflow scripts

**Files:**
- Modify: `/Users/super_user/Projects/Venice_Forge/package.json:107-119`

**Interfaces:**
- Consumes: existing Vitest scripts.
- Produces: deterministic `--no-file-parallelism` flags.

- [ ] **Step 1: Update scripts**

```json
"test:ingestion": "vitest run src/services/ingestion --no-file-parallelism",
"test:workflow:core": "vitest run src/types/workflow.test.ts src/services/workflowCompiler.test.ts src/services/workflowRunner.test.ts src/lib/workflow-engine.test.ts src/lib/workflow-validator.test.ts src/lib/workflow-schema.test.ts src/lib/workflow-mutations.test.ts src/stores/workflow-template-store.test.ts --no-file-parallelism",
"test:workflow:ui": "vitest run src/components/workflows/workflow-node.test.tsx src/components/workflows/WorkflowTemplatesView.test.tsx --no-file-parallelism",
```

- [ ] **Step 2: Normalize flag form**

Decide on one form (`--no-file-parallelism` is already used in `test:unit`). Update audit scripts (`verify-document-ingestion.cjs`, `verify-rp-studio-polish.cjs`, `verify-research-workspace.cjs`) to match if they use `--fileParallelism=false`.

- [ ] **Step 3: Run affected scripts**

```bash
npm run test:ingestion
npm run test:workflow:core
npm run test:workflow:ui
npm run verify:workflow-templates
```

Expected: each exits zero.

- [ ] **Step 4: Commit**

```bash
git add package.json scripts/verify-document-ingestion.cjs scripts/verify-rp-studio-polish.cjs scripts/verify-research-workspace.cjs
git commit -m "ci: deterministic serial execution for ingestion and workflow tests"
```

### Task 18: Split aggregate unit suite into fresh-process domains

**Files:**
- Modify: `/Users/super_user/Projects/Venice_Forge/package.json`
- Create: `/Users/super_user/Projects/Venice_Forge/scripts/run-unit-domains.cjs` (optional helper)

**Interfaces:**
- Consumes: existing `test:unit` excludes.
- Produces: `test:unit:*` sub-scripts composed into `test:unit`.

- [ ] **Step 1: Define domain scripts**

```json
"test:unit:stores": "vitest run src/stores --no-file-parallelism",
"test:unit:services": "vitest run src/services --exclude 'src/services/ingestion/**/*' --no-file-parallelism",
"test:unit:hooks": "vitest run src/hooks --no-file-parallelism",
"test:unit:lib": "vitest run src/lib --no-file-parallelism",
"test:unit:shared": "vitest run src/shared --no-file-parallelism",
"test:unit:utils": "vitest run src/utils --no-file-parallelism",
"test:unit:theme": "vitest run src/theme --no-file-parallelism",
"test:unit:scripts": "vitest run scripts --exclude 'scripts/verify-document-ingestion.test.ts' --no-file-parallelism",
"test:unit:types": "vitest run src/types --no-file-parallelism",
"test:unit": "npm run test:unit:stores && npm run test:unit:services && npm run test:unit:hooks && npm run test:unit:lib && npm run test:unit:shared && npm run test:unit:utils && npm run test:unit:theme && npm run test:unit:scripts && npm run test:unit:types"
```

- [ ] **Step 2: Verify each domain**

Run each `test:unit:*` script individually and fix any domain-specific leaks.

- [ ] **Step 3: Run full `test:unit`**

```bash
npm run test:unit
```

Expected: exits zero.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "ci: split unit tests into fresh-process domains"
```

### Task 19: Split coverage into domains and merge

**Files:**
- Modify: `/Users/super_user/Projects/Venice_Forge/package.json`
- Modify: `/Users/super_user/Projects/Venice_Forge/vitest.config.ts`

**Interfaces:**
- Consumes: v8 coverage config.
- Produces: merged coverage report from domain runs.

- [ ] **Step 1: Add per-domain coverage scripts**

```json
"test:coverage:stores": "vitest run src/stores --coverage --no-file-parallelism",
"test:coverage:services": "vitest run src/services --exclude 'src/services/ingestion/**/*' --coverage --no-file-parallelism",
"test:coverage:ingestion": "vitest run src/services/ingestion --coverage --no-file-parallelism",
"test:coverage:components": "vitest run src/components --coverage --no-file-parallelism",
"test:coverage:unit": "npm run test:coverage:stores && npm run test:coverage:services && npm run test:coverage:ingestion && npm run test:coverage:components"
```

- [ ] **Step 2: Configure coverage reporter to allow merging**

Ensure `vitest.config.ts` coverage uses `coverage.reporter: ['json', 'text', 'html']` and unique `coverage.reportsDirectory` per domain if needed. Merge with `nyc merge` or a custom script.

- [ ] **Step 3: Run and verify thresholds**

```bash
npm run test:coverage:unit
```

Expected: exits zero and meets thresholds.

- [ ] **Step 4: Commit**

```bash
git add package.json vitest.config.ts
git commit -m "ci: domain-split coverage execution"
```

---

## Phase 8 — RP Token Counting

**Objective:** Replace fixed `length/4` estimate with model-aware counting where possible, and keep the fallback explicitly labeled.

### Task 20: Resolve per-model context limits

**Files:**
- Modify: `/Users/super_user/Projects/Venice_Forge/src/services/rpTokenCounter.ts`
- Modify: `/Users/super_user/Projects/Venice_Forge/src/services/rpTokenCounter.test.ts`
- Modify: `/Users/super_user/Projects/Venice_Forge/src/constants/venice.ts`

**Interfaces:**
- Consumes: `VeniceModel` list from settings/auth store.
- Produces: `resolveModelContextLimit(modelId, models)` and `resolveReservedOutputTokens(modelId)`.

- [ ] **Step 1: Add model-aware lookup**

```ts
export function resolveModelContextLimit(
  modelId: string | undefined,
  models: readonly VeniceModel[],
): number {
  const model = models.find((m) => m.id === modelId);
  const ctx = model?.model_spec?.contextTokens;
  if (typeof ctx === "number" && ctx > 0) return ctx;
  return RP_MODEL_CONTEXT_LIMIT_FALLBACK;
}
```

- [ ] **Step 2: Add tokenizer preference**

```ts
export function estimateTokenCount(text: string, modelId?: string, models?: readonly VeniceModel[]): TokenCountResult {
  // priority 1: if a future Venice token-count endpoint exists, call it.
  // priority 2: model-specific tokenizer if bundled.
  // priority 3: length/4 approximation.
  return {
    count: text.length === 0 ? 0 : Math.max(1, Math.ceil(text.length / 4)),
    method: "approximation",
    modelId,
    isEstimate: true,
  };
}
```

- [ ] **Step 3: Update `getCharacterTokenBudget`**

Accept `models` and use `resolveModelContextLimit(card.modelId, models)`. Update `CharacterEditor.tsx` to pass `models`.

- [ ] **Step 4: Add tests**

```ts
it("uses model context limit when available", () => {
  const models = [{ id: "custom", model_spec: { contextTokens: 16_384 } }];
  const budget = getCharacterTokenBudget(card, models);
  expect(budget.contextLimit).toBe(16_384);
});
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/services/rpTokenCounter.test.ts src/components/rp-studio/CharacterEditor.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/rpTokenCounter.ts src/services/rpTokenCounter.test.ts src/constants/venice.ts src/components/rp-studio/CharacterEditor.tsx
git commit -m "feat(rp): model-aware context limit for token budget"
```

---

## Phase 9 — Chat and Memory UX

**Objective:** Fix remaining chat/memory regressions from the user's notes and audits.

### Task 21: Reset memory preview state per conversation

**Files:**
- Modify: `/Users/super_user/Projects/Venice_Forge/src/hooks/use-chat.ts`
- Modify: `/Users/super_user/Projects/Venice_Forge/src/stores/chat-store.ts`
- Modify: `/Users/super_user/Projects/Venice_Forge/src/hooks/use-chat.test.ts`

**Interfaces:**
- Consumes: active conversation ID.
- Produces: `previewShown` / `previewAttempted` keyed by conversation.

- [ ] **Step 1: Move preview state into conversation-scoped map**

Replace module-level flags with a `Map<conversationId, { previewShown: boolean; previewAttempted: boolean }>` or store them in conversation metadata.

- [ ] **Step 2: Reset on conversation switch**

When `setActiveConversation` is called, reset `pendingContext` and use the map entry for the new conversation.

- [ ] **Step 3: Add regression test**

```ts
it("shows preview again when returning to a different conversation", async () => {
  // switch conversations, verify preview state is per-conversation
});
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-chat.ts src/stores/chat-store.ts src/hooks/use-chat.test.ts
git commit -m "fix(chat): per-conversation memory preview state"
```

### Task 22: Honor character memory toggle truthfully

**Files:**
- Modify: `/Users/super_user/Projects/Venice_Forge/src/hooks/use-chat.ts`
- Modify: `/Users/super_user/Projects/Venice_Forge/src/components/chat/chat-view.tsx`

**Interfaces:**
- Consumes: `conversation.metadata.memoryRetrievalEnabled`.
- Produces: no unconditional disabling for character chats.

- [ ] **Step 1: Remove unconditional character disable**

In `use-chat.ts`, remove the branch that forces `enableMemoryRetrieval = false` when `isCharacterConversation` is true. Instead, rely on `conversation.metadata.memoryRetrievalEnabled`.

- [ ] **Step 2: Default character chats to false but allow toggle**

`createCharacterConversation` already defaults to `memoryRetrievalEnabled: false`. The UI toggle must now actually enable it.

- [ ] **Step 3: Add test**

```ts
it("allows memory retrieval for character chats when enabled", async () => {
  // create character chat, enable memory, send, verify pullContext is called
});
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-chat.ts src/components/chat/chat-view.tsx
git commit -m "fix(chat): honor per-chat memory toggle for character conversations"
```

### Task 23: Exclude current conversation from prior-context list

**Files:**
- Modify: `/Users/super_user/Projects/Venice_Forge/src/components/chat/chat-view.tsx`

**Interfaces:**
- Consumes: `conversation.id`, `availablePriorConversations`.
- Produces: filtered list excluding the active conversation.

- [ ] **Step 1: Filter list**

```ts
const availablePriorConversations = useMemo(
  () => conversations.filter((c) => c.id !== conversation?.id && !c.metadata?.archivedAt),
  [conversations, conversation?.id],
);
```

- [ ] **Step 2: Add test**

```tsx
it("does not list the active conversation as a prior context source", () => {
  render(<ChatView ... />);
  // open context selector, assert active id absent
});
```

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/chat-view.tsx src/components/chat/chat-view.test.tsx
git commit -m "fix(chat): exclude active conversation from prior context list"
```

### Task 24: Input-area settings horizontal layout

**Files:**
- Modify: `/Users/super_user/Projects/Venice_Forge/src/components/chat/chat-view.tsx:630-648`
- Modify: `/Users/super_user/Projects/Venice_Forge/src/components/chat/chat-input.tsx:249-265`

**Interfaces:**
- Consumes: `settingsControl`.
- Produces: settings rendered beside input instead of above.

- [ ] **Step 1: Move settings control into input toolbar**

Change `chat-input.tsx` so `settingsControl` is rendered inside the horizontal toolbar row (left side, before attach/send buttons), not in a separate `div` above the textarea.

- [ ] **Step 2: Update ChatView if needed**

Ensure the popover trigger fits the toolbar height and remains keyboard accessible.

- [ ] **Step 3: Run visual/UI tests**

```bash
npx vitest run src/components/chat/chat-input.test.tsx src/components/chat/chat-view.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/chat-input.tsx src/components/chat/chat-view.tsx
git commit -m "ui(chat): move context settings into input toolbar"
```

---

## Phase 10 — RP Studio and Scenes

**Objective:** Persona images survive safely; scene references use persona/character visuals when available.

### Task 25: Ensure persona image byte length matches stored payload

**Files:**
- Modify: `/Users/super_user/Projects/Venice_Forge/src/components/rp-studio/PersonaManager.tsx:210-223`
- Modify: `/Users/super_user/Projects/Venice_Forge/src/services/rp/personaService.ts:27-39`

**Interfaces:**
- Consumes: `readImageAttachment` result.
- Produces: `byteLength` equal to decoded base64 size.

- [ ] **Step 1: Compute actual payload size**

```ts
const data = match[2];
const byteLength = Math.floor(data.length * 0.75) - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
update("image", { mimeType: match[1], data, byteLength });
```

- [ ] **Step 2: Update validation**

In `personaService.ts`, ensure `normalizePersonaImage` accepts the computed byte length and still enforces the 5 MiB cap.

- [ ] **Step 3: Add test**

```ts
it("stores byte length matching decoded base64 payload", async () => {
  // upload image, verify persona.image.byteLength equals decoded length
});
```

- [ ] **Step 4: Commit**

```bash
git add src/components/rp-studio/PersonaManager.tsx src/services/rp/personaService.ts src/components/rp-studio/PersonaManager.test.tsx
git commit -m "fix(rp): persona image byte length matches stored payload"
```

### Task 26: Optional — use persona/character avatar as scene reference image

**Files:**
- Modify: `/Users/super_user/Projects/Venice_Forge/src/services/sceneReferenceResolver.ts`
- Modify: `/Users/super_user/Projects/Venice_Forge/src/services/sceneReferencePlanner.ts`
- Modify: `/Users/super_user/Projects/Venice_Forge/src/services/characterSceneGenerationService.ts`

**Interfaces:**
- Consumes: `PersonaV1.image`, `CharacterCardV1.avatar`.
- Produces: `SceneReferenceEntity` optionally carrying a `visualDataUrl`.

- [ ] **Step 1: Add visual reference to entities**

```ts
export interface SceneReferenceEntity {
  id: string;
  name: string;
  type: "character" | "persona";
  visualDataUrl?: string;
}
```

- [ ] **Step 2: Map avatars in resolver**

```ts
if (persona.image?.data) {
  entity.visualDataUrl = `data:${persona.image.mimeType};base64,${persona.image.data}`;
}
```

- [ ] **Step 3: Include visual references in plan**

If the selected image model supports reference images, include the entity's `visualDataUrl` in `references` when the entity is mentioned in the scene description.

- [ ] **Step 4: Add test**

```ts
it("includes persona image as reference when model supports references", () => {
  // build plan with persona image, assert reference list contains image
});
```

- [ ] **Step 5: Commit**

```bash
git add src/services/sceneReferenceResolver.ts src/services/sceneReferencePlanner.ts src/services/characterSceneGenerationService.ts
git commit -m "feat(scenes): persona/character avatars as scene references"
```

---

### Task 27: Final Validation Matrix

Run the full validation matrix and record results honestly in `docs/summary_of_work.md`.

- [ ] `npm ci --no-audit --no-fund`
- [ ] `npm run lint:eslint`
- [ ] `npm run typecheck`
- [ ] `npm run test:server`
- [ ] `npm run test:electron`
- [ ] `npm run test:ingestion`
- [ ] `npm run test:unit`
- [ ] `npm run test:ui`
- [ ] `npm run test:coverage`
- [ ] `npm run verify:repository-identity`
- [ ] `npm run verify:lockfile`
- [ ] `npm run verify:backup-sync`
- [ ] `npm run verify:workflow-templates`
- [ ] `npm run verify:contracts`
- [ ] `npm run build`
- [ ] `npm run verify:dist`
- [ ] `npm audit --audit-level=moderate`

Record any failures, skipped items, and blockers in `docs/summary_of_work.md` under the latest session entry.
