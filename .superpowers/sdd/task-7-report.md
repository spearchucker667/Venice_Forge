# Task 7 Report: Make main-process save/delete handlers origin-aware

## What was implemented

1. **`electron/services/syncBridge.ts`**
   - Added an optional `origin?: MutationOrigin` parameter to `emitSyncPacket` and `emitSyncTombstone`.
   - Both functions now return early when `origin` is defined and is not `"local-user"`, so remote-sync / manual-import / migration mutations do not re-emit sync packets or tombstones.
   - Omitted `origin` defaults to the existing back-compat behavior (emit).

2. **`electron/ipc/handlers/systemHandlers.ts`**
   - Added `parseSaveOrigin` helper to extract and validate an optional mutation origin from save payloads, defaulting to `"local-user"`.
   - `chat:save` now reads `origin` from the payload and passes it to `emitSyncPacket`.
   - `conversations:save` now reads `origin` from the record payload and passes it to `emitSyncPacket`.
   - `chat:delete` and `conversations:delete` now forward the parsed `origin` from `parseDeletePayload` to `emitSyncTombstone`.

3. **`electron/ipc/rpHandlers.ts`**
   - Added the same `parseSaveOrigin` helper.
   - All RP save handlers (`characterCards:save`, `personas:save`, `lorebooks:save`, `rpChats:save`, `rpAssets:save`, `scenarios:save`) parse and forward `origin` to `emitSyncPacket`.
   - All RP delete handlers (`characterCards:delete`, `personas:delete`, `lorebooks:delete`, `rpChats:delete`, `rpAssets:delete`, `scenarios:delete`) forward the parsed `origin` to `emitSyncTombstone`.

4. **Regression tests**
   - `electron/services/syncBridge.test.ts`: verifies suppression for `remote-sync`, `manual-import`, and `migration` origins; verifies emission for `local-user`; verifies back-compat when origin is omitted (for both packets and tombstones).
   - `electron/ipc/handlers.test.ts`: verifies origin forwarding for `chat:save`, `chat:delete`, `conversations:save`, and `conversations:delete`, including omitted-origin default.
   - `electron/ipc/rpHandlers.test.ts`: verifies origin forwarding for `personas:save` and `personas:delete`, including omitted-origin default.

## Test results

| Command | Result |
| :------ | :----: |
| `npx vitest run electron/services/syncBridge.test.ts electron/ipc/handlers.test.ts electron/ipc/rpHandlers.test.ts --fileParallelism=false` | PASS (3 files / 102 tests) |
| `npm run test:electron` | PASS (30 files / 527 tests) |
| `npm run lint:eslint` | PASS (0 warnings) |
| `npm run typecheck` | PASS (renderer + Electron main clean) |

## Files changed

- `electron/services/syncBridge.ts`
- `electron/services/syncBridge.test.ts`
- `electron/ipc/handlers/systemHandlers.ts`
- `electron/ipc/handlers.test.ts`
- `electron/ipc/rpHandlers.ts`
- `electron/ipc/rpHandlers.test.ts`
- `docs/summary_of_work.md`
- `.superpowers/sdd/task-7-report.md`

## Self-review findings

- The implementation is minimal and consistent with Task 6's `MutationOrigin` propagation.
- All save/delete handlers in both `systemHandlers.ts` and `rpHandlers.ts` now pass origin through to the sync bridge.
- The sync bridge is the single gate for emission suppression, which keeps the policy in one place.
- Backward compatibility is preserved: payloads without an `origin` field still emit sync packets/tombstones.
- Tests cover the main paths and the edge case of omitted origin.
- ESLint and TypeScript both pass.

## Issues or concerns

None. The task brief's example regression tests spy on `syncBridge.emitSyncPacket` and expect it not to be called for `remote-sync`; in this codebase the handlers call `emitSyncPacket` and the bridge itself suppresses emission. The implemented tests verify that suppression at the bridge layer and correct origin forwarding at the handler layer, which achieves the same functional outcome (only `local-user` mutations emit sync traffic).

---

## Task 7 Review Fixes

### Fixes applied

1. **Inconsistent invalid-origin handling for saves vs. deletes (Important)**
   - Changed `parseSaveOrigin` in `electron/ipc/handlers/systemHandlers.ts` and `electron/ipc/rpHandlers.ts` to return a `[error, origin]` tuple and reject invalid origins, matching the behavior of `parseDeletePayload`.
   - All save handlers (`chat:save`, `conversations:save`, and every RP save handler) now parse the origin first and return an error before saving when the origin is invalid.

2. **`conversations:save` no longer leaks `origin` into the sync packet (Important)**
   - In `electron/ipc/handlers/systemHandlers.ts`, `conversations:save` now destructures the incoming payload to strip the `origin` field before validation, persistence, and sync emission.
   - The sync packet now contains only the cleaned record; `origin` is passed separately to `emitSyncPacket`.

3. **Handler-level sync emission gating**
   - Save and delete handlers in both `systemHandlers.ts` and `rpHandlers.ts` now call `emitSyncPacket` / `emitSyncTombstone` only when the parsed origin is `"local-user"` (or undefined for back-compat).
   - The existing bridge-level gating in `electron/services/syncBridge.ts` is retained as defense in depth.

4. **Regression test for remote-sync origin (Minor)**
   - Added an integration-style regression test in `electron/ipc/handlers.test.ts` that calls `chat:save` with `{ conversation, origin: "remote-sync" }` and verifies `syncBridge.emitSyncPacket` is not called, while the same call with `origin: "local-user"` calls it exactly once.

### Updated tests

- `electron/ipc/handlers.test.ts`: existing `remote-sync` origin tests now assert no sync-bridge call; added invalid-origin rejection tests for `chat:save` and `conversations:save`; added the requested integration regression test.
- `electron/ipc/rpHandlers.test.ts`: existing `remote-sync` origin tests now assert no sync-bridge call; added invalid-origin rejection test for `personas:save`.
- `electron/services/syncBridge.test.ts`: unchanged; still verifies suppression at the bridge layer.

### Validation

| Command | Result |
| :------ | :----: |
| `npx vitest run electron/ipc/handlers.test.ts electron/ipc/rpHandlers.test.ts electron/services/syncBridge.test.ts --fileParallelism=false` | PASS (3 files / 106 tests) |
| `npm run test:electron` | PASS (30 files / 531 tests) |
| `npm run typecheck` | PASS (renderer + Electron main clean) |
| `npm run lint:eslint` | PASS (0 warnings) |

### Files changed

- `electron/ipc/handlers/systemHandlers.ts`
- `electron/ipc/handlers.test.ts`
- `electron/ipc/rpHandlers.ts`
- `electron/ipc/rpHandlers.test.ts`
- `docs/summary_of_work.md`
- `.superpowers/sdd/task-7-report.md`

---

## Task 7 Remaining Review Fix

### Issue

The personas, lorebooks, rp_assets, and scenarios save handlers in `electron/ipc/rpHandlers.ts` were persisting the operation `origin` field into storage because the underlying single-file store validators accept extra properties. The leaked `origin` then re-emerged in sync packets.

### Fix

In `electron/ipc/rpHandlers.ts`, the four RP single-file save handlers now destructure `origin` out of the payload before calling `store.save`:

- `personas:save`
- `lorebooks:save`
- `rpAssets:save`
- `scenarios:save`

Each handler passes only the cleaned record (without `origin`) to the store and to the read-back/sync path.

### Regression test

Added a parameterized test in `electron/ipc/rpHandlers.test.ts` that calls each of the four handlers with `origin: "local-user"` and asserts that the object passed to `store.save` does not contain an `origin` property.

### Validation

| Command | Result |
| :------ | :----: |
| `npx vitest run electron/ipc/rpHandlers.test.ts --fileParallelism=false` | PASS (1 file / 19 tests) |
| `npx vitest run electron/services/syncBridge.test.ts --fileParallelism=false` | PASS (1 file / 12 tests) |
| `npm run test:electron` | PASS (30 files / 535 tests) |
| `npm run typecheck` | PASS (renderer + Electron main clean) |
| `npm run lint:eslint` | PASS (0 warnings) |

### Files changed

- `electron/ipc/rpHandlers.ts`
- `electron/ipc/rpHandlers.test.ts`
- `docs/summary_of_work.md`
- `.superpowers/sdd/task-7-report.md`
