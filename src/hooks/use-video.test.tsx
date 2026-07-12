// VERIFY-056 regression guard — video hook passes plain objects to veniceFetch
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useVideo } from "./use-video";
import { veniceFetch } from "../services/veniceClient/fetch";
import { useInspectorStore } from "../stores/inspector-store";

vi.mock("../services/veniceClient/fetch", () => ({
  veniceFetch: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useVideo", () => {
  beforeEach(() => {
    vi.mocked(veniceFetch).mockReset();
    useInspectorStore.getState().clearLogs();
  });

  it("passes queue bodies as plain objects, not pre-stringified JSON", async () => {
    const queueId = "queue-123";
    const req = { prompt: "a cat", model: "vcfg" };

    vi.mocked(veniceFetch)
      .mockResolvedValueOnce({ data: { queue_id: queueId } } as never);

    const { result } = renderHook(() => useVideo(), { wrapper });

    act(() => {
      result.current.queue(req);
    });

    await waitFor(() => expect(result.current.status).toBe("queued"));

    expect(veniceFetch).toHaveBeenNthCalledWith(1, "/video/queue", {
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
