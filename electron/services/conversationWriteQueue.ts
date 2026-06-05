/**
 * @fileoverview Queue to serialize concurrent write operations for individual conversation IDs.
 * Prevents race conditions and database/file corruption during rapid write operations.
 */

export class ConversationWriteQueue {
  private pending = new Map<string, Promise<unknown>>();

  /**
   * Enqueues a write task for a specific conversation ID.
   * If a previous task is running, this wait for it to complete.
   */
  enqueue<T>(id: string, write: () => Promise<T>): Promise<T> {
    const previous = this.pending.get(id) ?? Promise.resolve();

    const next = previous
      .catch(() => undefined)
      .then(write)
      .finally(() => {
        if (this.pending.get(id) === next) {
          this.pending.delete(id);
        }
      });

    this.pending.set(id, next);
    return next as Promise<T>;
  }
}
