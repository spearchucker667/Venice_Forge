// VERIFY-056 regression guard — video hook passes plain objects to veniceFetch
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useVideo } from "./use-video";

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
    mockVeniceFetch.mockReset();
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
});
