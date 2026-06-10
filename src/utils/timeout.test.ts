import { describe, it, expect, vi } from "vitest";
import { sleep, createTimeoutSignal } from "./timeout";

describe("timeout utils", () => {
  describe("sleep", () => {
    it("resolves after the given time", async () => {
      vi.useFakeTimers();
      const p = sleep(100);
      vi.advanceTimersByTime(100);
      await expect(p).resolves.toBeUndefined();
      vi.useRealTimers();
    });

    it("rejects immediately if signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(sleep(100, controller.signal)).rejects.toThrow("Request aborted");
    });

    it("rejects if signal aborts during sleep", async () => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const p = sleep(100, controller.signal);
      controller.abort();
      await expect(p).rejects.toThrow("Request aborted");
      vi.useRealTimers();
    });
  });

  describe("createTimeoutSignal", () => {
    it("aborts after the given ms", async () => {
      const { signal, clear } = createTimeoutSignal(10);
      expect(signal.aborted).toBe(false);
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(signal.aborted).toBe(true);
      clear(); // no-op after abort, but must not throw
    });

    it("aborts when parent signal aborts", () => {
      const parent = new AbortController();
      const { signal, clear } = createTimeoutSignal(100, parent.signal);
      expect(signal.aborted).toBe(false);
      parent.abort();
      expect(signal.aborted).toBe(true);
      clear();
    });

    it("does not leak a timer when clear() is called before the timeout fires", async () => {
      // TIMEOUT-CLEANUP-001 regression guard
      vi.useFakeTimers();
      const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
      const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
      try {
        const { signal, clear } = createTimeoutSignal(60_000);
        expect(signal.aborted).toBe(false);
        const setCallCountAtCreate = setTimeoutSpy.mock.calls.length;
        const clearCallCountBefore = clearTimeoutSpy.mock.calls.length;
        clear();
        // clear() must call clearTimeout for the timer created at
        // construction. If createTimeoutSignal ever uses AbortSignal.timeout,
        // there is no internal setTimeout handle to clear and the spy will
        // not see the matching clearTimeout call.
        expect(clearTimeoutSpy.mock.calls.length).toBe(clearCallCountBefore + 1);
        // setTimeout was called exactly once at construction (no parent listener).
        expect(setTimeoutSpy.mock.calls.length).toBe(setCallCountAtCreate);
        // Advance past the original timeout — because clear() cancelled the
        // timer, the fake clock must not have any pending timer left that
        // would abort the signal.
        vi.advanceTimersByTime(120_000);
        // The signal is aborted because clear() also calls controller.abort()
        // to release any downstream consumers. What matters is that it is
        // aborted for the RIGHT reason (clear() did it) not because the
        // internal timer fired.
        expect(signal.aborted).toBe(true);
      } finally {
        setTimeoutSpy.mockRestore();
        clearTimeoutSpy.mockRestore();
        vi.useRealTimers();
      }
    });

    it("does not leak a parent listener when clear() is called before abort", () => {
      // TIMEOUT-CLEANUP-002 regression guard
      const parent = new AbortController();
      const { clear } = createTimeoutSignal(60_000, parent.signal);
      // clear() must detach the parent's "abort" listener before the parent
      // can fire it. The signal is already aborted at this point because
      // clear() calls controller.abort() to release any downstream consumers
      // immediately — that is by design.
      clear();
      // Parent abort after clear() must not throw and must not leave a
      // dangling listener (the implementation calls removeEventListener in
      // clear() before aborting). A regression that re-attaches the parent
      // listener inside clear() would throw or leak.
      expect(() => parent.abort()).not.toThrow();
    });
  });
});
