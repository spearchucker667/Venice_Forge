// VERIFY-056 regression guard — embeddings hook passes plain objects to venice
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEmbeddings } from "./use-embeddings";
import { venice } from "../lib/venice-client";

vi.mock("../lib/venice-client", () => ({
  venice: vi.fn().mockResolvedValue({ object: "list", data: [], model: "test" }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useEmbeddings", () => {
  beforeEach(() => {
    vi.mocked(venice).mockClear();
  });

  it("passes the request as a plain object, not a pre-stringified JSON string", async () => {
    const { result } = renderHook(() => useEmbeddings(), { wrapper });
    const req = { input: "hello", model: "text-embedding-3-small" };

    result.current.mutate(req);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(venice).toHaveBeenCalledWith("/embeddings", {
      method: "POST",
      body: req,
    });
    expect(venice).not.toHaveBeenCalledWith(
      "/embeddings",
      expect.objectContaining({ body: JSON.stringify(req) })
    );
  });
});
