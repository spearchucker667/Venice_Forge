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
 * with a parent signal. Falls back to manual timeout for runtimes that
 * lack AbortSignal.timeout / AbortSignal.any.
 *
 * **Important:** The caller must call `clear()` on the returned object
 * when the operation completes (success or failure) to avoid leaking
 * timers and event listeners.
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

  if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
    const timeoutSignal = AbortSignal.timeout(ms);
    if (parentSignal && typeof AbortSignal !== "undefined" && AbortSignal.any) {
      const composed = AbortSignal.any([parentSignal, timeoutSignal]);
      return {
        signal: composed,
        clear: () => {
          // AbortSignal.any does not expose a dispose API, but we can
          // abort the composed signal to detach internal listeners.
          if (!composed.aborted) {
            // Calling abort() on the composed signal is a no-op for
            // downstream consumers that already finished, but it
            // signals the internal composition machinery to clean up.
            try {
              (composed as AbortSignal & { abort?: () => void }).abort?.();
            } catch {
              // ignore — some implementations may not expose abort()
            }
          }
        },
      };
    }
    return {
      signal: timeoutSignal,
      clear: () => {
        // AbortSignal.timeout cannot be cancelled, but we can abort the
        // signal itself so any downstream listeners stop waiting.
        if (!timeoutSignal.aborted) {
          try {
            (timeoutSignal as AbortSignal & { abort?: () => void }).abort?.();
          } catch {
            // ignore
          }
        }
      },
    };
  }

  // Fallback for older runtimes
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
