// VERIFY-056 regression guard — music hook passes plain objects to veniceFetch
// and logs queue/poll/success/timeout/abort lifecycle to the inspector.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

function fakeInspectorLogId(endpoint: string, method: string) {
  return useInspectorStore.getState().addLog({
    endpoint,
    method,
    transport: "venice",
    requestHeaders: {},
    requestBody: {},
  });
}

describe("useMusic", () => {
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(0));
    vi.mocked(veniceFetch).mockReset();
    useInspectorStore.getState().clearLogs();
    createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-audio");
    revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
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
      registerLogId: expect.any(Function),
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

  it("preserves data URL MIME types and creates blob URLs for raw base64", async () => {
    const queueId = "queue-mime";
    const req = { prompt: "upbeat electronic", model: "harp" };

    vi.mocked(veniceFetch)
      .mockResolvedValueOnce({ data: { queue_id: queueId } } as never)
      .mockResolvedValueOnce({ data: { status: "COMPLETED", audio_url: "data:audio/wav;base64,aGVsbG8=" } } as never);

    const { result } = renderHook(() => useMusic(), { wrapper });

    act(() => {
      result.current.queue(req);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    await waitFor(() => expect(result.current.status).toBe("completed"));

    expect(result.current.audioUrl).toBe("data:audio/wav;base64,aGVsbG8=");
    expect(createObjectURLSpy).not.toHaveBeenCalled();

    // Raw base64 should be converted to a blob URL with the default MIME type.
    vi.mocked(veniceFetch)
      .mockResolvedValueOnce({ data: { queue_id: "queue-base64" } } as never)
      .mockResolvedValueOnce({ data: { status: "COMPLETED", audio_url: "aGVsbG8=" } } as never);

    act(() => {
      result.current.queue({ ...req, prompt: "raw base64" });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    await waitFor(() => expect(result.current.status).toBe("completed"));

    expect(createObjectURLSpy).toHaveBeenCalledWith(expect.any(Blob));
    const blob = createObjectURLSpy.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("audio/mpeg");
  });

  it("rejects completed responses with an empty audio_url", async () => {
    const queueId = "queue-empty";
    const req = { prompt: "upbeat electronic", model: "harp" };

    vi.mocked(veniceFetch)
      .mockResolvedValueOnce({ data: { queue_id: queueId } } as never)
      .mockResolvedValueOnce({ data: { status: "COMPLETED", audio_url: "" } } as never);

    const { result } = renderHook(() => useMusic(), { wrapper });

    act(() => {
      result.current.queue(req);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    await waitFor(() => expect(result.current.status).toBe("failed"));

    expect(result.current.error).toMatch(/empty/i);
  });

  it("marks the in-flight log as 'success' when generation completes", async () => {
    const queueId = "queue-success";
    const req = { prompt: "upbeat electronic", model: "harp" };

    vi.mocked(veniceFetch)
      .mockImplementationOnce(async (_endpoint, options) => {
        const logId = fakeInspectorLogId("/audio/queue", "POST");
        options?.registerLogId?.(logId);
        return { data: { queue_id: queueId } } as never;
      })
      .mockResolvedValueOnce({ data: { status: "COMPLETED", audio_url: "https://example.com/audio.mp3" } } as never);

    const { result } = renderHook(() => useMusic(), { wrapper });

    act(() => {
      result.current.queue(req);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    await waitFor(() => expect(result.current.status).toBe("completed"));

    const [log] = useInspectorStore.getState().logs;
    expect(log.callOutcome).toBe("success");
    expect(log.status).toBe(200);
  });

  it("marks the in-flight log as 'aborted' when the user cancels", async () => {
    const queueId = "queue-cancel";
    const req = { prompt: "upbeat electronic", model: "harp" };

    vi.mocked(veniceFetch).mockImplementationOnce(async (_endpoint, options) => {
      const logId = fakeInspectorLogId("/audio/queue", "POST");
      options?.registerLogId?.(logId);
      return { data: { queue_id: queueId } } as never;
    });

    const { result } = renderHook(() => useMusic(), { wrapper });

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
    const req = { prompt: "upbeat electronic", model: "harp" };

    vi.mocked(veniceFetch)
      .mockImplementationOnce(async (_endpoint, options) => {
        const logId = fakeInspectorLogId("/audio/queue", "POST");
        options?.registerLogId?.(logId);
        return { data: { queue_id: queueId } } as never;
      })
      .mockImplementation(async (_endpoint) => ({ data: { status: "processing" } }) as never);

    const { result } = renderHook(() => useMusic(), { wrapper });

    act(() => {
      result.current.queue(req);
    });

    await waitFor(() => expect(result.current.queueId).toBe(queueId));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(380_000);
    });

    const [log] = useInspectorStore.getState().logs;
    expect(log.callOutcome).toBe("timeout");
    expect(log.errorClass).toBe("timeout");
    expect(log.error).toMatch(/too long/i);
  });

  it("revokes created object URLs on unmount", async () => {
    const queueId = "queue-cleanup";
    const req = { prompt: "upbeat electronic", model: "harp" };

    vi.mocked(veniceFetch)
      .mockResolvedValueOnce({ data: { queue_id: queueId } } as never)
      .mockResolvedValueOnce({ data: { status: "COMPLETED", audio_url: "aGVsbG8=" } } as never);

    const { result, unmount } = renderHook(() => useMusic(), { wrapper });

    act(() => {
      result.current.queue(req);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    await waitFor(() => expect(result.current.status).toBe("completed"));

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);

    unmount();

    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:mock-audio");
  });
});
