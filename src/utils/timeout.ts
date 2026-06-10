/** @fileoverview Shared utilities for handling timeouts and abort signals. */

/**
 * Disposable timeout signal. The `clear` function must be called when the
 * signal is no longer needed so that the internal timer and any parent
 * listeners are eagerly released.
 */
export interface TimeoutSignal {
  signal: AbortSignal;
  clear: () => void;
}

/**
 * Creates an abort signal that fires after `ms`, optionally composing
 * with a parent signal.
 *
 * **Important:** The caller must call `clear()` on the returned object
 * when the operation completes (success or failure) to avoid leaking
 * timers and event listeners.
 *
 * Implementation note: We deliberately do NOT use `AbortSignal.timeout` /
 * `AbortSignal.any` even on runtimes that support them. The native signals
 * do not expose a cancellation API, so we cannot release the internal
 * timer once the caller calls `clear()`. The timer would still fire
 * `ms` milliseconds later, calling `abort()` on a signal that has already
 * been consumed, which is a no-op for the caller but a real leak in the
 * runtime's signal graph. By always owning the `AbortController` and
 * `setTimeout` we can deterministically clear both.
 *
 * @param ms The timeout duration in milliseconds.
 * @param parentSignal An optional parent AbortSignal to compose with.
 * @returns A {@link TimeoutSignal} with the abort signal and a cleanup function.
 */
export function createTimeoutSignal(ms: number, parentSignal?: AbortSignal | null): TimeoutSignal {
  if (ms <= 0) {
    return {
      signal: parentSignal || new AbortController().signal,
      clear: () => {},
    };
  }

  const controller = new AbortController();
  let onAbort: (() => void) | undefined;

  const id = setTimeout(() => {
    if (onAbort && parentSignal) {
      parentSignal.removeEventListener("abort", onAbort);
    }
    controller.abort();
  }, ms);

  if (parentSignal) {
    onAbort = () => {
      clearTimeout(id);
      controller.abort();
    };
    parentSignal.addEventListener("abort", onAbort, { once: true });
    if (parentSignal.aborted) {
      onAbort();
    }
  }

  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(id);
      if (onAbort && parentSignal) {
        parentSignal.removeEventListener("abort", onAbort);
      }
      if (!controller.signal.aborted) {
        controller.abort();
      }
    },
  };
}

/**
 * Pauses execution for a given duration, optionally respecting an abort signal.
 * @param ms The number of milliseconds to sleep.
 * @param signal An optional abort signal to cancel the sleep early.
 * @returns A promise that resolves after the delay or rejects if aborted.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Request aborted", "AbortError"));
      return;
    }
    let onAbort: (() => void) | undefined;
    const id = setTimeout(() => {
      if (onAbort && signal) {
        signal.removeEventListener("abort", onAbort);
      }
      resolve();
    }, ms);
    if (signal) {
      onAbort = () => {
        clearTimeout(id);
        reject(new DOMException("Request aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}
