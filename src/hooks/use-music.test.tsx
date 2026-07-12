// VERIFY-056 regression guard — music hook passes plain objects to veniceFetch
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useMusic } from "./use-music";
import { veniceFetch } from "../services/veniceClient/fetch";
import { useInspectorStore } from "../stores/inspector-store";

vi.mock("../services/veniceClient/fetch", () => ({
  veniceFetch: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useMusic", () => {
  beforeEach(() => {
    vi.mocked(veniceFetch).mockReset();
    useInspectorStore.getState().clearLogs();
  });

  it("passes queue bodies as plain objects, not pre-stringified JSON", async () => {
    const queueId = "queue-456";
    const req = { prompt: "upbeat electronic", model: "harp" };

    vi.mocked(veniceFetch)
      .mockResolvedValueOnce({ data: { queue_id: queueId } } as never);

    const { result } = renderHook(() => useMusic(), { wrapper });

    act(() => {
      result.current.queue(req);
    });

    await waitFor(() => expect(result.current.status).toBe("queued"));

    expect(veniceFetch).toHaveBeenNthCalledWith(1, "/audio/queue", {
      method: "POST",
      body: req,
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
