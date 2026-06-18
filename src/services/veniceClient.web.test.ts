import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDispatch } from "../types/app";
import { veniceFetch, veniceStreamChat } from "./veniceClient";
import { useInspectorStore } from "../stores/inspector-store";

const originalFetch = globalThis.fetch;

function getLatestInspectorError(): string | undefined {
  const logs = useInspectorStore.getState().logs;
  return logs[0]?.error;
}

describe("veniceClient web regressions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it("retries fetch failures that do not have an HTTP status", async () => {
    vi.useFakeTimers();
    const dispatch = vi.fn() as unknown as AppDispatch;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    globalThis.fetch = fetchMock;

    const request = veniceFetch("/models", { method: "GET", dispatch });
    await vi.advanceTimersByTimeAsync(2400);

    await expect(request).resolves.toMatchObject({ data: { data: [] } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_DIAGNOSTICS",
        diagnostics: expect.objectContaining({
          ok: false,
          status: 0,
          error: expect.stringContaining("Fetch failure"),
        }),
      })
    );
  });

  it("dispatches parsed error diagnostics for failed web streaming responses", async () => {
    const dispatch = vi.fn() as unknown as AppDispatch;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid stream payload" }), {
        status: 400,
        statusText: "Bad Request",
        headers: { "content-type": "application/json" },
      })
    );
    globalThis.fetch = fetchMock;

    await expect(
      veniceStreamChat(
        { model: "venice-uncensored", messages: [] },
        { dispatch, onDelta: vi.fn() }
      )
    ).rejects.toThrow("400 request/schema/model error: invalid stream payload");

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_DIAGNOSTICS",
        diagnostics: expect.objectContaining({
          ok: false,
          status: 400,
          error: "400 request/schema/model error: invalid stream payload",
        }),
      })
    );
  });

  it("blocks CSAM payloads from being sent via veniceFetch", async () => {
    const dispatch = vi.fn() as unknown as AppDispatch;
    globalThis.fetch = vi.fn(); // Should not be called

    await expect(
      veniceFetch("/chat/completions", {
        method: "POST",
        body: { messages: [{ role: "user", content: "draw me a loli character" }] },
        dispatch
      })
    ).rejects.toThrow("Blocked by Family Safe Mode");

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("blocks CSAM payloads from being sent via veniceStreamChat", async () => {
    const dispatch = vi.fn() as unknown as AppDispatch;
    globalThis.fetch = vi.fn(); // Should not be called

    await expect(
      veniceStreamChat(
        { model: "venice-uncensored", messages: [{ role: "user", content: "draw me a loli character" }] },
        { dispatch, onDelta: vi.fn() }
      )
    ).rejects.toThrow("Blocked by Family Safe Mode");

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("enforces a single absolute 5-minute deadline across fetch and read (P1-004)", async () => {
    vi.useFakeTimers();
    let readResolve: (value: { done: true; value?: Uint8Array }) => void = () => {};
    let cancelCalled = false;
    const mockReader = {
      read: () =>
        new Promise<{ done: true; value?: Uint8Array }>((resolve) => {
          readResolve = resolve;
        }),
      cancel: () => {
        cancelCalled = true;
        readResolve({ done: true, value: undefined });
        return Promise.resolve();
      },
      releaseLock: () => {},
    };
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers(),
      body: { getReader: () => mockReader },
    };
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(mockResponse as unknown as Response);

    const promise = veniceStreamChat(
      { model: "venice-uncensored", messages: [] },
      { onDelta: vi.fn() }
    ).catch((err) => err);

    await vi.advanceTimersByTimeAsync(300_001);

    await expect(promise).resolves.toBeInstanceOf(Error);
    await expect(promise).resolves.toHaveProperty(
      "message",
      "Stream timed out after 5 minutes. The server may be overloaded — please try again."
    );
    expect(cancelCalled).toBe(true);
    vi.useRealTimers();
  });

  it("computes Retry-After delay from HTTP-date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("Wed, 21 Oct 2026 07:28:00 GMT"));
    const dispatch = vi.fn() as unknown as AppDispatch;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "rate limit" }), {
          status: 429,
          headers: { 
            "content-type": "application/json",
            "retry-after": "Wed, 21 Oct 2026 07:28:10 GMT" 
          },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    globalThis.fetch = fetchMock;

    const request = veniceFetch("/models", { method: "GET", dispatch, retry: true });
    
    // Fast-forward exactly 10s
    await vi.advanceTimersByTimeAsync(10000);
    
    const result = await request;
    expect(result.data).toEqual({ data: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  // T-170 regression guard: veniceFetch must redact secret-like tokens from
  // inspector log errors instead of storing the raw exception text.
  it("redacts secret-like tokens in inspector log errors for veniceFetch", async () => {
    const dispatch = vi.fn() as unknown as AppDispatch;
    globalThis.fetch = vi.fn<typeof fetch>().mockRejectedValue(
      new TypeError("Failed to fetch for " + "sk-1234567890abcdef" + "")
    );

    await expect(
      veniceFetch("/models", { method: "GET", dispatch, retry: false })
    ).rejects.toThrow();

    const loggedError = getLatestInspectorError();
    expect(loggedError).toBeDefined();
    expect(loggedError).not.toContain("" + "sk-1234567890abcdef" + "");
    expect(loggedError).toContain("[REDACTED]");
  });

  // T-171 regression guard: veniceStreamChat must redact secret-like tokens from
  // inspector log errors instead of storing the raw exception text.
  it("redacts secret-like tokens in inspector log errors for veniceStreamChat", async () => {
    const dispatch = vi.fn() as unknown as AppDispatch;
    globalThis.fetch = vi.fn<typeof fetch>().mockRejectedValue(
      new TypeError("Stream connect failed with vn-leaked-key-12345678")
    );

    await expect(
      veniceStreamChat(
        { model: "venice-uncensored", messages: [] },
        { dispatch, onDelta: vi.fn() }
      )
    ).rejects.toThrow();

    const loggedError = getLatestInspectorError();
    expect(loggedError).toBeDefined();
    expect(loggedError).not.toContain("vn-leaked-key-12345678");
    expect(loggedError).toContain("[REDACTED]");
  });

  // T-170 regression guard: arbitrary thrown objects must not be stringified
  // verbatim into inspector log errors, where custom toString() could leak paths.
  it("does not stringify arbitrary thrown objects into inspector log errors for veniceFetch", async () => {
    const dispatch = vi.fn() as unknown as AppDispatch;
    const thrown = { toString: () => "secret path /Users/admin/.venice/config" };
    globalThis.fetch = vi.fn<typeof fetch>().mockRejectedValue(thrown);

    await expect(
      veniceFetch("/models", { method: "GET", dispatch, retry: false })
    ).rejects.toBeDefined();

    const loggedError = getLatestInspectorError();
    expect(loggedError).toBeDefined();
    expect(loggedError).not.toContain("secret path");
    expect(loggedError).not.toContain("/Users/admin/.venice/config");
  });
});
