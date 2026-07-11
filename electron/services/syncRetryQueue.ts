/**
 * Bounded retry queue for remote sync operations.
 *
 * Operations that are negatively acknowledged, time out, or are interrupted by
 * a pause/stop are re-enqueued here. A periodic scheduler re-delivers them by
 * invoking the supplied callback with the original file path.
 */

import { logError } from "./logger";
import { redactErrorMessage } from "../../src/shared/redaction";

export interface PendingRemoteOperation {
  operationId: string;
  filePath: string;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
}

type RetryCallback = (filePath: string, attempts: number) => boolean | Promise<boolean>;

const pendingRetries = new Map<string, PendingRemoteOperation>();
let retryInterval: ReturnType<typeof setInterval> | null = null;
let retryCallback: RetryCallback | null = null;

const MAX_ATTEMPTS = 10;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;
const SCAN_INTERVAL_MS = 5000;

function computeNextAttemptAt(attempts: number): number {
  // attempts is 1-based inside the retry queue.
  const backoff = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, attempts - 1), MAX_BACKOFF_MS);
  return Date.now() + backoff;
}

function deletePendingOperation(operationId: string): void {
  pendingRetries.delete(operationId);
}

function handleRetryResult(operationId: string, result: boolean | Promise<boolean>): void {
  if (result && typeof (result as Promise<boolean>).then === "function") {
    (result as Promise<boolean>)
      .then((accepted) => {
        if (accepted) deletePendingOperation(operationId);
      })
      .catch((err: unknown) => {
        logError("syncRetryQueue", `Retry callback failed for ${operationId}: ${redactErrorMessage(err)}`);
      });
  } else if (result) {
    deletePendingOperation(operationId);
  }
}

/** Start scanning for retries that are due. Idempotent. */
export function initSyncRetryQueue(callback: RetryCallback): void {
  retryCallback = callback;
  if (retryInterval) {
    clearInterval(retryInterval);
  }
  retryInterval = setInterval(() => {
    const now = Date.now();
    for (const [operationId, op] of pendingRetries) {
      if (op.nextAttemptAt <= now) {
        try {
          const result = retryCallback?.(op.filePath, op.attempts);
          handleRetryResult(operationId, result ?? false);
        } catch (err: unknown) {
          logError("syncRetryQueue", `Retry callback failed for ${operationId}: ${redactErrorMessage(err)}`);
        }
      }
    }
  }, SCAN_INTERVAL_MS);
}

/** Stop the retry scheduler. */
export function stopSyncRetryQueue(): void {
  if (retryInterval) {
    clearInterval(retryInterval);
    retryInterval = null;
  }
  retryCallback = null;
}

/** Exposed for runtime status tests and diagnostics. */
export function isSyncRetryQueueRunning(): boolean {
  return retryInterval !== null;
}

/**
 * Schedule a failed operation for retry.
 *
 * @param attemptsSoFar - Number of delivery attempts already made (0 for the first retry).
 */
export function scheduleRetry(
  operationId: string,
  filePath: string,
  attemptsSoFar: number,
  lastError?: string,
): void {
  if (attemptsSoFar >= MAX_ATTEMPTS) {
    logError(
      "syncRetryQueue",
      `Operation ${operationId} exceeded max retry attempts (${MAX_ATTEMPTS}); giving up.`,
    );
    return;
  }
  const attempts = attemptsSoFar + 1;
  const nextAttemptAt = computeNextAttemptAt(attempts);
  pendingRetries.set(operationId, {
    operationId,
    filePath,
    attempts,
    nextAttemptAt,
    lastError,
  });
}

/** Exposed for tests and diagnostics. */
export function getPendingRetries(): Map<string, PendingRemoteOperation> {
  return new Map(pendingRetries);
}

/** Exposed for tests. */
export function clearPendingRetries(): void {
  pendingRetries.clear();
}
