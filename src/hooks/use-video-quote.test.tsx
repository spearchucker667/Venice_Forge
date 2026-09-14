import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const veniceFetchMock = vi.hoisted(() => vi.fn());
vi.mock("../services/veniceClient/fetch", () => ({
  veniceFetch: veniceFetchMock,
}));

import { useVideoQuote } from "./use-video-quote";
import { useAuthStore } from "../stores/auth-store";

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useVideoQuote hook", () => {
  beforeEach(() => {
    veniceFetchMock.mockReset();
    useAuthStore.setState({ apiKey: "test-key" });
  });

  it("does not fetch when apiKey is absent", () => {
    useAuthStore.setState({ apiKey: "" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () =>
        useVideoQuote({
          model: "kling-2-1",
          duration: "5s",
        }),
      { wrapper: createWrapper(client) },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(veniceFetchMock).not.toHaveBeenCalled();
  });

  it("does not fetch when model or duration is missing", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () =>
        useVideoQuote({
          model: "",
          duration: "5s",
        }),
      { wrapper: createWrapper(client) },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(veniceFetchMock).not.toHaveBeenCalled();
  });

  it("fetches and normalizes quote successfully", async () => {
    veniceFetchMock.mockResolvedValueOnce({
      data: {
        cost: 0.15,
      },
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () =>
        useVideoQuote({
          model: "kling-2-1",
          duration: "5s",
          resolution: "720p",
          aspectRatio: "16:9",
        }),
      { wrapper: createWrapper(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ costUsd: 0.15 });
    expect(veniceFetchMock).toHaveBeenCalledWith(
      "/video/quote",
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({
          model: "kling-2-1",
          duration: "5s",
          resolution: "720p",
          aspect_ratio: "16:9",
        }),
      }),
    );
  });

  it("returns null gracefully when API fails", async () => {
    veniceFetchMock.mockRejectedValueOnce(new Error("Network Error"));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () =>
        useVideoQuote({
          model: "kling-2-1",
          duration: "5s",
        }),
      { wrapper: createWrapper(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
