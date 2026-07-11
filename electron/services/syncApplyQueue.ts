/**
 * Per-object remote apply queue for the sync folder watcher.
 *
 * The watcher can deliver record and tombstone packets for the same logical
 * object concurrently. Operations targeting the same record key are serialized
 * so that applies (and the resulting renderer notifications / journal writes)
 * execute in FIFO order per object. Operations for different keys proceed
 * concurrently.
 */

const pending = new Map<string, Promise<void>>();

/**
 * Enqueue an operation to be run serially for the given logical object key.
 *
 * @param queueKey - Logical object identifier, e.g. `${storeName}:${id}`.
 * @param operation - Async operation to run for this object.
 * @returns A promise that resolves or rejects with the operation result.
 */
export function enqueueRemoteApply(
  queueKey: string,
  operation: () => Promise<void>,
): Promise<void> {
  const previous = pending.get(queueKey) ?? Promise.resolve();
  const next = previous.then(operation, operation).finally(() => {
    if (pending.get(queueKey) === next) {
      pending.delete(queueKey);
    }
  });
  pending.set(queueKey, next);
  return next;
}

/** Exposed for tests and diagnostics. */
export function getPendingQueueSize(): number {
  return pending.size;
}
