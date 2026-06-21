// VERIFY-056 regression guard — video hook passes plain objects to venice
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useVideo } from "./use-video";
import { venice } from "../lib/venice-client";

vi.mock("../lib/venice-client", () => ({
  venice: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useVideo", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(venice).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes queue and retrieve bodies as plain objects, not pre-stringified JSON", async () => {
    const queueId = "queue-123";
    const req = { prompt: "a cat", model: "vcfg" };

    vi.mocked(venice)
      .mockResolvedValueOnce({ queue_id: queueId, id: queueId } as never)
      .mockResolvedValueOnce({ status: "completed", video_url: "https://example.com/video.mp4" } as never);

    const { result } = renderHook(() => useVideo(), { wrapper });

    act(() => {
      result.current.queue(req);
    });

    await waitFor(() => expect(result.current.queueId).toBe(queueId));

    expect(venice).toHaveBeenNthCalledWith(1, "/video/queue", {
      method: "POST",
      body: req,
    });

    // Advance the polling interval so the retrieve call fires.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    expect(venice).toHaveBeenNthCalledWith(2, "/video/retrieve", {
      method: "POST",
      body: { id: queueId },
    });

    // Ensure no JSON.stringify bodies were passed.
    const calls = vi.mocked(venice).mock.calls;
    for (const [, options] of calls) {
      if (options && typeof options === "object" && "body" in options) {
        expect(typeof options.body).not.toBe("string");
      }
    }
  });
});
