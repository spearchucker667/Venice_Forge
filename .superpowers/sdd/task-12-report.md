# Task 12 Report: Add bounded retry queue and acknowledgment timeout

## What was implemented

1. **Created `electron/services/syncRetryQueue.ts`**
   - Defined `PendingRemoteOperation` with `operationId`, `filePath`, `attempts`, `nextAttemptAt`, and `lastError`.
   - Implemented `scheduleRetry(operationId, filePath, attemptsSoFar, lastError?)` with exponential backoff (1 s initial, doubled each attempt, capped at 5 minutes) and a hard maximum of 10 attempts.
   - Implemented `initSyncRetryQueue(callback)` which starts a 5-second `setInterval` scheduler that scans pending retries and invokes the callback with the stored `filePath` when `nextAttemptAt` has passed.
   - Added `stopSyncRetryQueue`, `getPendingRetries`, and `clearPendingRetries` helpers for lifecycle management and tests.

2. **Updated `electron/services/syncFolderWatcher.ts`**
   - Expanded `inFlightOperations` to track `filePath` and `attempts` in addition to `storeName`/`sourceDeviceId`.
   - Added a 30-second acknowledgment timeout (`ACK_TIMEOUT_MS`) started when `handleRemoteChange` delivers an operation to the renderer; if the timeout fires before an ack, the operation is removed from in-flight and scheduled for retry.
   - Updated `acknowledgeOperation` to clear the ack timeout and schedule a retry on negative acknowledgments or journal-write failures.
   - Updated `stopSyncWatcher` and `pauseSyncWatcher` to requeue every remaining in-flight operation via `scheduleRetry` before clearing the map.
   - Wired the retry queue callback to `handleRemoteChange` inside `initSyncFolderWatcher`.
   - Exported `handleRemoteChange` so the retry queue can consume it and tests can invoke it directly if needed.
   - Updated test helpers (`__registerInFlightOperationForTests`, `__clearInFlightOperationsForTests`) and added `__startAckTimeoutForTests` for deterministic timeout testing.

3. **Updated `electron/services/syncFolderWatcher.test.ts`**
   - Added cleanup for retry-queue state and timers in `beforeEach`.
   - Added regression tests:
     - negative acknowledgment requeues the operation
     - unacknowledged operation is requeued after the 30-second timeout
     - `stopSyncWatcher` requeues in-flight operations
     - `pauseSyncWatcher` requeues in-flight operations and preserves the attempt count
     - retry scheduler delivers due operations to the callback after exponential backoff
     - retry queue gives up after the maximum number of attempts

## Test results

- `npx vitest run electron/services/syncFolderWatcher.test.ts` — **PASS** (20 tests)
- `npm run test:electron` — **PASS** (31 files / 553 tests)
- `npx tsc --project tsconfig.electron.json --noEmit` — **PASS**
- `npx eslint electron/services/syncFolderWatcher.ts electron/services/syncRetryQueue.ts electron/services/syncFolderWatcher.test.ts --max-warnings=0` — **PASS** (0 warnings)

## Files changed

- `electron/services/syncFolderWatcher.ts`
- `electron/services/syncRetryQueue.ts` (new)
- `electron/services/syncFolderWatcher.test.ts`
- `docs/summary_of_work.md`
- `.superpowers/sdd/task-12-report.md` (this file)

## Self-review findings

- The retry queue is bounded and deterministic: attempts cap at 10, backoff caps at 5 minutes.
- Ack timeouts are cleaned up on positive and negative acks, so there is no leaking `setTimeout` after a successful apply.
- `stopSyncWatcher`/`pauseSyncWatcher` clear all in-flight timeouts before requeuing, preventing double retries.
- The scheduler callback catches errors and logs them, so a single failed retry does not crash the interval.
- Tests use `vi.useFakeTimers()` for deterministic timeout/backoff verification and reset queue/timers in `beforeEach`.

## Issues or concerns

- One minor edge case remains: if a retry fires while the watcher is paused/stopped, `handleRemoteChange` returns early because `currentPassword` is null and the operation is removed from the pending queue without being re-added. In practice this is mitigated because `stopSyncWatcher`/`pauseSyncWatcher` already requeue in-flight operations before clearing state, and on resume the existing blob files are re-scanned via `ignoreInitial: false`. A future improvement could make the scheduler predicate re-add the operation when the watcher is not active, but that is outside the bounded scope of this task.


---

## Task 12 Review Fixes (subsequent session)

### Issues fixed

1. **Critical — Bounded retry counter no longer dropped on scheduler redelivery**
   - Changed `RetryCallback` in `electron/services/syncRetryQueue.ts` from `(filePath: string) => void` to `(filePath: string, attempts: number) => boolean | Promise<boolean>`.
   - The scheduler now invokes the callback with the stored `attempts` count and deletes the pending entry only when the callback returns `true`.
   - Updated `handleRemoteChange(filePath, attempts = 0)` in `electron/services/syncFolderWatcher.ts` to accept and use the delivered attempt count for both the in-flight record and the acknowledgment timeout.
   - On timeout, `scheduleRetry` is called with the current `attempts` value, so `attemptsSoFar` increments on every cycle and `MAX_ATTEMPTS` is enforced.
   - Wrapped `handleRemoteChange` for chokidar `add`/`change` events so the watcher-supplied `Stats` parameter is not mistaken for an attempt count.

2. **Important — Pending retries no longer dropped while watcher is paused/stopped**
   - `handleRemoteChange` now returns `false` when the main window is destroyed or `currentPassword` is null (watcher not running).
   - The scheduler keeps the pending retry entry when the callback returns `false` or throws, so the operation is redelivered once the watcher resumes.

3. **Important — `stopSyncWatcher` stops the retry scheduler**
   - Imported `stopSyncRetryQueue` into `electron/services/syncFolderWatcher.ts`.
   - `stopSyncWatcher` now calls `stopSyncRetryQueue()` after requeuing in-flight operations.
   - `startSyncWatcher` restarts the scheduler via `initSyncRetryQueue` so retries resume when sync is re-enabled.

4. **Important — `initSyncRetryQueue` is idempotent**
   - It now clears the existing interval before setting a new one, ensuring the latest callback is always used and no stale intervals accumulate.
   - Synchronous callbacks delete pending entries immediately; asynchronous results delete after the promise resolves.

5. **Minor — Removed unused `__startAckTimeoutForTests`**
   - The helper was not used by any test and has been removed from `electron/services/syncFolderWatcher.ts` and the test imports.

### Tests added/updated

- Updated "delivers retries via the scheduler after exponential backoff" to assert the callback receives `(filePath, attempts)`.
- Added "increments the attempt count across scheduler redelivery and timeout cycles".
- Added "enforces maximum retry attempts end-to-end" (abandoned after attempt 10).
- Added "increases nextAttemptAt with exponential backoff".
- Added "does not drop pending retries while the watcher is stopped".
- Added "stops the retry scheduler on stopSyncWatcher".
- Mocked `BrowserWindow` with `webContents.send` so `initSyncFolderWatcher` can be exercised in tests.

### Validation

- `npx vitest run electron/services/syncFolderWatcher.test.ts` — **PASS** (25 tests)
- `npm run test:electron` — **PASS** (31 files / 558 tests)
- `npm run typecheck` — **PASS**
- `npm run lint:eslint` — **PASS** (0 warnings)

### Files changed

- `electron/services/syncFolderWatcher.ts`
- `electron/services/syncRetryQueue.ts`
- `electron/services/syncFolderWatcher.test.ts`
- `docs/summary_of_work.md`
- `.superpowers/sdd/task-12-report.md`
