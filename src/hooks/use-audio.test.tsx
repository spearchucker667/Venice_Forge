// VERIFY-056 regression guard — TTS rejects empty audio responses and preserves
// the provider MIME type when available.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTTS, SAFE_AUDIO_ERRORS } from "./use-audio";
import { veniceBlob } from "../lib/venice-client";

vi.mock("../lib/venice-client", () => ({
  veniceBlob: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useTTS", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(veniceBlob).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a non-empty audio blob preserving the provider MIME type", async () => {
    const blob = new Blob(["audio-bytes"], { type: "audio/mp3" });
    vi.mocked(veniceBlob).mockResolvedValueOnce(blob);

    const { result } = renderHook(() => useTTS(), { wrapper });

    act(() => {
      result.current.mutate({ model: "tts-kokoro", input: "hello", voice: "af_heart" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.type).toBe("audio/mp3");
    expect(result.current.data?.size).toBeGreaterThan(0);
  });

  it("rejects an empty audio response", async () => {
    vi.mocked(veniceBlob).mockResolvedValueOnce(new Blob([], { type: "audio/mp3" }));

    const { result } = renderHook(() => useTTS(), { wrapper });

    act(() => {
      result.current.mutate({ model: "tts-kokoro", input: "hello", voice: "af_heart" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe(SAFE_AUDIO_ERRORS.empty);
  });

  it("falls back to the request format MIME type when the provider omits one", async () => {
    const blob = new Blob(["audio-bytes"]);
    vi.mocked(veniceBlob).mockResolvedValueOnce(blob);

    const { result } = renderHook(() => useTTS(), { wrapper });

    act(() => {
      result.current.mutate({ model: "tts-kokoro", input: "hello", voice: "af_heart", response_format: "wav" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.type).toBe("audio/wav");
  });

  it("times out a stalled TTS request", async () => {
    vi.mocked(veniceBlob).mockImplementationOnce(
      async (_path, _body, init) => {
        return new Promise((_, reject) => {
          const onAbort = () => {
            init?.signal?.removeEventListener("abort", onAbort);
            reject(new DOMException("Aborted", "AbortError"));
          };
          init?.signal?.addEventListener("abort", onAbort);
        });
      }
    );

    const { result } = renderHook(() => useTTS(), { wrapper });

    act(() => {
      result.current.mutate({ model: "tts-kokoro", input: "hello", voice: "af_heart" });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe(SAFE_AUDIO_ERRORS.timeout);
  });
});
