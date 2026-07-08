// VERIFY-056 regression guard — video hook passes plain objects to veniceFetch
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useVideo } from "./use-video";
import { useInspectorStore } from "../stores/inspector-store";

const mockVeniceFetch = vi.fn();

vi.mock("../services/veniceClient/fetch", () => ({
  veniceFetch: (...args: unknown[]) => mockVeniceFetch(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useVideo", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(0));
    mockVeniceFetch.mockReset();
    useInspectorStore.getState().clearLogs();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes queue and retrieve bodies as plain objects, not pre-stringified JSON", async () => {
    const queueId = "queue-123";
    const req = { prompt: "a cat", model: "vcfg" };

    mockVeniceFetch
      .mockResolvedValueOnce({ data: { queue_id: queueId, id: queueId } })
      .mockResolvedValueOnce({ data: { status: "completed", video_url: "https://example.com/video.mp4" } });

    const { result } = renderHook(() => useVideo(), { wrapper });

    act(() => {
      result.current.queue(req);
    });

    await waitFor(() => expect(result.current.queueId).toBe(queueId));

    expect(mockVeniceFetch).toHaveBeenNthCalledWith(1, "/video/queue", expect.objectContaining({
      method: "POST",
      body: req,
    }));

    // Advance the polling interval so the retrieve call fires.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    expect(mockVeniceFetch).toHaveBeenNthCalledWith(2, "/video/retrieve", expect.objectContaining({
      method: "POST",
      body: { id: queueId },
    }));

    // Ensure no JSON.stringify bodies were passed.
    const calls = mockVeniceFetch.mock.calls;
    for (const [, options] of calls) {
      if (options && typeof options === "object" && "body" in options) {
        expect(typeof options.body).not.toBe("string");
      }
    }
  });

  // VERIFY-056 cancel-vs-timeout regression guard — user cancellation and a
  // MAX_GENERATION_MS / MAX_ATTEMPTS timeout must land on the inspector log
  // with distinct callOutcome / errorClass pairs so the timeout chip is
  // populated and the audit counters separate user-driven aborts from
  // provider/operation deadlines.
  function fakeInspectorLogId(endpoint: string, method: string) {
    return useInspectorStore.getState().addLog({
      endpoint,
      method,
      transport: "venice",
      requestHeaders: {},
      requestBody: {},
    });
  }

  it("marks the in-flight log as 'aborted' when the user cancels", async () => {
    const queueId = "queue-cancel";
    const req = { prompt: "a cat", model: "vcfg" };

    mockVeniceFetch.mockImplementationOnce(async (_endpoint, options) => {
      const logId = fakeInspectorLogId("/video/queue", "POST");
      options?.registerLogId?.(logId);
      return { data: { queue_id: queueId, id: queueId } };
    });

    const { result } = renderHook(() => useVideo(), { wrapper });

    act(() => {
      result.current.queue(req);
    });

    await waitFor(() => expect(result.current.queueId).toBe(queueId));

    act(() => {
      result.current.cancel();
    });

    const [log] = useInspectorStore.getState().logs;
    expect(log.callOutcome).toBe("aborted");
    expect(log.errorClass).toBe("aborted");
    expect(log.callOutcome).not.toBe("timeout");
  });

  it("marks the in-flight log as 'timeout' when poll attempts exceed MAX_ATTEMPTS", async () => {
    const queueId = "queue-timeout";
    const req = { prompt: "a dog", model: "vcfg" };

    mockVeniceFetch
      .mockImplementationOnce(async (_endpoint, options) => {
        const logId = fakeInspectorLogId("/video/queue", "POST");
        options?.registerLogId?.(logId);
        return { data: { queue_id: queueId, id: queueId } };
      })
      // Every poll tick resolves with `processing` so the loop never trips
      // the catch arm and the MAX_ATTEMPTS guard at the top of the tick
      // fires `capTimeout` directly without depending on wall-clock math
      // (which is fragile under vi.useFakeTimers + setSystemTime).
      .mockImplementation(async (_endpoint) => ({ data: { status: "processing" } }));

    const { result } = renderHook(() => useVideo(), { wrapper });

    act(() => {
      result.current.queue(req);
    });

    await waitFor(() => expect(result.current.queueId).toBe(queueId));

    // Drive 205 polling ticks (MAX_ATTEMPTS=200 + safety margin). Each tick
    // is 3s apart, so we advance ~620s. After attemptsRef.current crosses
    // MAX_ATTEMPTS the next tick fires `capTimeout` which writes the
    // inspector log with `callOutcome: 'timeout'`.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(620_000);
    });

    const [log] = useInspectorStore.getState().logs;
    expect(log.callOutcome).toBe("timeout");
    expect(log.errorClass).toBe("timeout");
    expect(log.error).toMatch(/too long/i);
  });
});
