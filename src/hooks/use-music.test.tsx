// VERIFY-056 regression guard — music hook passes plain objects to veniceFetch
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useMusic } from "./use-music";
import { veniceFetch } from "../services/veniceClient/fetch";

vi.mock("../services/veniceClient/fetch", () => ({
  veniceFetch: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useMusic", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(veniceFetch).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes queue and retrieve bodies as plain objects, not pre-stringified JSON", async () => {
    const queueId = "queue-456";
    const req = { prompt: "upbeat electronic", model: "harp" };

    vi.mocked(veniceFetch)
      .mockResolvedValueOnce({ data: { queue_id: queueId } } as never)
      .mockResolvedValueOnce({ data: { status: "COMPLETED", audio_url: "https://example.com/audio.mp3" } } as never);

    const { result } = renderHook(() => useMusic(), { wrapper });

    act(() => {
      result.current.queue(req);
    });

    await waitFor(() => expect(result.current.status).toBe("queued"));

    expect(veniceFetch).toHaveBeenNthCalledWith(1, "/audio/queue", {
      method: "POST",
      body: req,
      signal: expect.any(AbortSignal),
      timeoutMs: expect.any(Number),
      retry: false,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    expect(veniceFetch).toHaveBeenNthCalledWith(2, "/audio/retrieve", {
      method: "POST",
      body: { id: queueId },
      signal: expect.any(AbortSignal),
      timeoutMs: expect.any(Number),
      retry: false,
    });

    const calls = vi.mocked(veniceFetch).mock.calls;
    for (const [, options] of calls) {
      if (options && typeof options === "object" && "body" in options) {
        expect(typeof options.body).not.toBe("string");
      }
    }
  });
});
