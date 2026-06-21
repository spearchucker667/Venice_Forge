// VERIFY-056 regression guard — music hook passes plain objects to venice
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useMusic } from "./use-music";
import { venice } from "../lib/venice-client";

vi.mock("../lib/venice-client", () => ({
  venice: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useMusic", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(venice).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes queue and retrieve bodies as plain objects, not pre-stringified JSON", async () => {
    const queueId = "queue-456";
    const req = { prompt: "upbeat electronic", model: "harp" };

    vi.mocked(venice)
      .mockResolvedValueOnce({ queue_id: queueId } as never)
      .mockResolvedValueOnce({ status: "COMPLETED", audio_url: "https://example.com/audio.mp3" } as never);

    const { result } = renderHook(() => useMusic(), { wrapper });

    act(() => {
      result.current.queue(req);
    });

    await waitFor(() => expect(result.current.status).toBe("queued"));

    expect(venice).toHaveBeenNthCalledWith(1, "/audio/queue", {
      method: "POST",
      body: req,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    expect(venice).toHaveBeenNthCalledWith(2, "/audio/retrieve", {
      method: "POST",
      body: { id: queueId },
    });

    const calls = vi.mocked(venice).mock.calls;
    for (const [, options] of calls) {
      if (options && typeof options === "object" && "body" in options) {
        expect(typeof options.body).not.toBe("string");
      }
    }
  });
});
