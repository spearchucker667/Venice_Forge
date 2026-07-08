/** @fileoverview Edge-case unit tests for veniceClient FormData and rate-limit handling. */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AppDispatch } from "../types/app";
import { serializeFormData, veniceFetch, veniceBlob, veniceFormData } from "./veniceClient";
import { useSettingsStore } from "../stores/settings-store";
import { useInspectorStore } from "../stores/inspector-store";

const originalFetch = globalThis.fetch;

describe("serializeFormData", () => {
  it("serializes string entries", async () => {
    const form = new FormData();
    form.append("model", "test-model");
    form.append("prompt", "hello");
    const result = await serializeFormData(form);
    expect(result._isSerializedFormData).toBe(true);
    expect(result.entries).toEqual([
      { name: "model", value: "test-model" },
      { name: "prompt", value: "hello" },
    ]);
  });

  it("serializes File entries with base64 encoding", async () => {
    const file = new File(["hello world"], "test.txt", { type: "text/plain" });
    const form = new FormData();
    form.append("file", file);
    const result = await serializeFormData(form);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      name: "file",
      filename: "test.txt",
      type: "text/plain",
      _isFile: true,
    });
    expect(result.entries[0].value).toBe(btoa("hello world"));
  });

  it("serializes Blob entries", async () => {
    const blob = new Blob(["blob content"], { type: "application/octet-stream" });
    const form = new FormData();
    form.append("data", blob);
    const result = await serializeFormData(form);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      name: "data",
      filename: "blob",
      type: "application/octet-stream",
      _isFile: true,
    });
    expect(result.entries[0].value).toBe(btoa("blob content"));
  });

  it("throws when a File exceeds MAX_RAW_UPLOAD_BYTES", async () => {
    const largeContent = new Uint8Array(50 * 1024 * 1024 + 1); // 50 MiB + 1 byte
    const file = new File([largeContent], "huge.bin", { type: "application/octet-stream" });
    const form = new FormData();
    form.append("file", file);
    await expect(serializeFormData(form)).rejects.toThrow("File too large");
  });
});

describe("veniceFetch rate-limit handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it("respects Retry-After (seconds) on 429 and retries", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const dispatch = vi.fn() as unknown as AppDispatch;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "rate limited" }), {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": "2" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    globalThis.fetch = fetchMock;

    const request = veniceFetch("/models", { method: "GET", dispatch });
    await vi.advanceTimersByTimeAsync(3000);

    await expect(request).resolves.toMatchObject({ data: { data: [] } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("respects x-ratelimit-reset-requests as seconds on 429", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const dispatch = vi.fn() as unknown as AppDispatch;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "rate limited" }), {
          status: 429,
          headers: {
            "content-type": "application/json",
            "x-ratelimit-reset-requests": "3",
          },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    globalThis.fetch = fetchMock;

    const request = veniceFetch("/models", { method: "GET", dispatch });
    await vi.advanceTimersByTimeAsync(4000);

    await expect(request).resolves.toMatchObject({ data: { data: [] } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to exponential backoff when no rate-limit headers are present", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const dispatch = vi.fn() as unknown as AppDispatch;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "rate limited" }), {
          status: 429,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    globalThis.fetch = fetchMock;

    const request = veniceFetch("/models", { method: "GET", dispatch });
    await vi.advanceTimersByTimeAsync(3000);

    await expect(request).resolves.toMatchObject({ data: { data: [] } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("respects Retry-After as HTTP-date on 429 and retries", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const dispatch = vi.fn() as unknown as AppDispatch;
    // Set a Retry-After date 2 seconds in the future
    const retryDate = new Date(Date.now() + 2000).toUTCString();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "rate limited" }), {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": retryDate },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    globalThis.fetch = fetchMock;

    const request = veniceFetch("/models", { method: "GET", dispatch });
    await vi.advanceTimersByTimeAsync(3000);

    await expect(request).resolves.toMatchObject({ data: { data: [] } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("veniceBlob response screening", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    useInspectorStore.getState().clearLogs();
    useSettingsStore.getState().setLocalFamilySafeModeEnabled(true);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("blocks textual JSON responses that fail the safety guard", async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: "draw me a loli character" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    await expect(
      veniceBlob("/api/v1/image/upscale", {
        image: "data:image/png;base64,iVBORw0KGgo=",
      })
    ).rejects.toThrow("Blocked by Family Safe Mode");

    expect(useInspectorStore.getState().logs[0]?.status).toBe(451);
  });

  it("does not stringify binary image responses", async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: { "content-type": "image/png" },
      })
    );

    const blob = await veniceBlob("/api/v1/image/upscale", {
      image: "data:image/png;base64,iVBORw0KGgo=",
    });

    expect(blob.type).toBe("image/png");
    expect(useInspectorStore.getState().logs[0]?.status).toBe(200);
  });

  it("skips response screening when Family Safe Mode is disabled", async () => {
    useSettingsStore.getState().setLocalFamilySafeModeEnabled(false);
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: "draw me a loli character" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const blob = await veniceBlob("/api/v1/image/upscale", {
      image: "data:image/png;base64,iVBORw0KGgo=",
    });

    expect(blob.type).toBe("application/json");
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe("veniceFormData response screening", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    useInspectorStore.getState().clearLogs();
    useSettingsStore.getState().setLocalFamilySafeModeEnabled(true);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function safeFormData(): FormData {
    const form = new FormData();
    form.append("model", "test-model");
    form.append("prompt", "hello");
    return form;
  }

  it("blocks JSON responses that fail the safety guard", async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: "draw me a loli character" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    await expect(veniceFormData("/api/v1/image/edit", safeFormData())).rejects.toThrow(
      "Blocked by Family Safe Mode"
    );

    expect(useInspectorStore.getState().logs[0]?.status).toBe(451);
  });

  it("does not stringify binary image responses", async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: { "content-type": "image/png" },
      })
    );

    const body = await veniceFormData<{ text: string }>("/api/v1/image/edit", safeFormData());

    expect(body.text).toBeDefined();
    expect(useInspectorStore.getState().logs[0]?.status).toBe(200);
  });

  it("skips response screening when Family Safe Mode is disabled", async () => {
    useSettingsStore.getState().setLocalFamilySafeModeEnabled(false);
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: "draw me a loli character" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const body = await veniceFormData<{ message: string }>("/api/v1/image/edit", safeFormData());

    expect(body.message).toBe("draw me a loli character");
  });
});
