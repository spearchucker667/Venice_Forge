import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDispatch } from "../types/app";
import { useInspectorStore } from "../stores/inspector-store";

vi.mock("./desktopBridge", () => ({
  isElectron: vi.fn(() => true),
  desktopVenice: {
    request: vi.fn(),
    streamChat: vi.fn(),
  },
}));

import { veniceFetch, veniceStreamChat } from "./veniceClient";
import { desktopVenice } from "./desktopBridge";

function getLatestInspectorError(): string | undefined {
  const logs = useInspectorStore.getState().logs;
  return logs[0]?.error;
}

describe("veniceClient desktop regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes desktop response headers in diagnostics", async () => {
    const dispatch = vi.fn() as unknown as AppDispatch;
    vi.mocked(desktopVenice.request).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { "retry-after": "3", "x-ratelimit-reset-requests": "2" },
      body: { data: [] },
      contentType: "application/json",
    });

    await veniceFetch("/models", { method: "GET", dispatch, retry: false });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_DIAGNOSTICS",
        diagnostics: expect.objectContaining({
          headers: expect.objectContaining({
            "retry-after": "3",
            "x-ratelimit-reset-requests": "2",
          }),
        }),
      })
    );
  });

  it("logs normalized error details for failed desktop streaming responses", async () => {
    const dispatch = vi.fn() as unknown as AppDispatch;
    vi.mocked(desktopVenice.streamChat).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      headers: {},
      body: { details: { _errors: ["invalid payload"] } },
      contentType: "application/json",
    });

    await expect(
      veniceStreamChat(
        { model: "venice-uncensored", messages: [] },
        { dispatch, onDelta: vi.fn() }
      )
    ).rejects.toThrow("400 request/schema/model error: invalid payload");

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_DIAGNOSTICS",
        diagnostics: expect.objectContaining({
          ok: false,
          status: 400,
          error: "400 request/schema/model error: invalid payload",
        }),
      })
    );
  });

  // T-170 regression guard: veniceFetch must redact secret-like tokens from
  // inspector log errors instead of storing the raw exception text.
  it("redacts secret-like tokens in inspector log errors for desktop veniceFetch", async () => {
    const dispatch = vi.fn() as unknown as AppDispatch;
    vi.mocked(desktopVenice.request).mockRejectedValue(
      new Error("Desktop transport failed with sk-1234567890abcdef")
    );

    await expect(veniceFetch("/models", { method: "GET", dispatch, retry: false })).rejects.toThrow();

    const loggedError = getLatestInspectorError();
    expect(loggedError).toBeDefined();
    expect(loggedError).not.toContain("sk-1234567890abcdef");
    expect(loggedError).toContain("[REDACTED]");
  });

  // T-171 regression guard: veniceStreamChat must redact secret-like tokens from
  // inspector log errors instead of storing the raw exception text.
  it("redacts secret-like tokens in inspector log errors for desktop veniceStreamChat", async () => {
    const dispatch = vi.fn() as unknown as AppDispatch;
    vi.mocked(desktopVenice.streamChat).mockRejectedValue(
      new Error("Desktop stream failed with vn-leaked-key-12345678")
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
});
