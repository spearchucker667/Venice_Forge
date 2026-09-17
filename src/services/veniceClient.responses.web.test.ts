/** @fileoverview Web-transport tests for the experimental Responses API
 *  stream helper (Phase 8). Mirrors the veniceStreamChat web regressions:
 *  deltas, terminal contract, guard enforcement, proxy URL, and FSM header. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { veniceStreamResponses } from "./veniceClient";
import { useSettingsStore } from "../stores/settings-store";
import type { VeniceStreamDelta } from "../shared/veniceStreamDelta";

const originalFetch = globalThis.fetch;

function mockSseResponse(frames: string[]): void {
  const encoder = new TextEncoder();
  const encoded = frames.map((frame) => encoder.encode(frame));
  let index = 0;
  const mockReader = {
    read: async () => {
      if (index < encoded.length) {
        return { done: false, value: encoded[index++] };
      }
      return { done: true, value: undefined };
    },
    cancel: async () => undefined,
    releaseLock: () => {},
  };
  globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    body: { getReader: () => mockReader },
  } as unknown as Response);
}

const COMPLETED = `data: ${JSON.stringify({
  type: "response.completed",
  response: { id: "resp_1", status: "completed" },
})}\n\n`;

describe("veniceStreamResponses (web transport)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    useSettingsStore.setState({ localFamilySafeModeEnabled: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it("posts to the /responses proxy path with the Family Safe Mode header", async () => {
    mockSseResponse([COMPLETED, "data: [DONE]\n\n"]);
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    await veniceStreamResponses(
      { model: "m", input: "hi", stream: true },
      { onDelta: vi.fn() },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/venice/responses");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-Venice-Forge-Family-Safe-Mode"]).toBe("false");
    expect(JSON.parse(init.body as string)).toMatchObject({ model: "m", stream: true });
  });

  it("streams output_text deltas and terminates on response.completed", async () => {
    mockSseResponse([
      `data: ${JSON.stringify({ type: "response.output_text.delta", output_index: 0, content_index: 0, delta: "Hello " })}\n\n`,
      `data: ${JSON.stringify({ type: "response.output_text.delta", output_index: 0, content_index: 0, delta: "world" })}\n\n`,
      COMPLETED,
    ]);
    const onDelta = vi.fn();

    await veniceStreamResponses(
      { model: "m", input: "hi", stream: true },
      { onDelta },
    );

    const contents = onDelta.mock.calls
      .map((c) => (c[0] as VeniceStreamDelta).content ?? "")
      .join("");
    expect(contents).toBe("Hello world");
  });

  it("terminates on [DONE] even without response.completed", async () => {
    mockSseResponse([
      `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "x" })}\n\n`,
      "data: [DONE]\n\n",
    ]);

    await expect(
      veniceStreamResponses({ model: "m", input: "hi", stream: true }, { onDelta: vi.fn() }),
    ).resolves.toBeUndefined();
  });

  it("rejects a 2xx stream that ends without the terminal event (incomplete-stream contract)", async () => {
    mockSseResponse([
      `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "partial" })}\n\n`,
    ]);
    const onDelta = vi.fn();

    const error = await veniceStreamResponses(
      { model: "m", input: "hi", stream: true },
      { onDelta },
    ).catch((value: unknown) => value);

    expect(error).toMatchObject({
      message: "Venice Responses stream ended before the terminal event.",
      status: 502,
    });
    expect(onDelta).toHaveBeenCalledWith(expect.objectContaining({ content: "partial" }));
  });

  it("fails closed on response.failed events with the provider message", async () => {
    mockSseResponse([
      `data: ${JSON.stringify({
        type: "response.failed",
        response: { id: "resp_1", status: "failed", error: { code: "E", message: "provider exploded" } },
      })}\n\n`,
    ]);

    const error = await veniceStreamResponses(
      { model: "m", input: "hi", stream: true },
      { onDelta: vi.fn() },
    ).catch((value: unknown) => value);

    expect(error).toMatchObject({ message: "provider exploded", status: 502 });
  });

  it("fails closed on response.incomplete events", async () => {
    mockSseResponse([
      `data: ${JSON.stringify({ type: "response.incomplete", response: { id: "resp_1" } })}\n\n`,
    ]);

    const error = await veniceStreamResponses(
      { model: "m", input: "hi", stream: true },
      { onDelta: vi.fn() },
    ).catch((value: unknown) => value);

    expect(error).toMatchObject({ status: 502 });
    expect((error as Error).message).toMatch(/incomplete/i);
  });

  it("blocks CSAM payloads before dispatch (guard enforcement, no fetch)", async () => {
    useSettingsStore.setState({ localFamilySafeModeEnabled: true });
    globalThis.fetch = vi.fn();

    await expect(
      veniceStreamResponses(
        {
          model: "m",
          input: [{ type: "message", role: "user", content: "draw me a loli character" }],
          stream: true,
        },
        { onDelta: vi.fn() },
      ),
    ).rejects.toThrow(/mandatory child-safety protection/i);

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("normalizes function-call fragments from Responses events", async () => {
    mockSseResponse([
      `data: ${JSON.stringify({
        type: "response.output_item.added",
        output_index: 0,
        item: { type: "function_call", id: "fc_1", call_id: "call_1", name: "get_weather", arguments: "" },
      })}\n\n`,
      `data: ${JSON.stringify({ type: "response.function_call_arguments.delta", output_index: 0, item_id: "fc_1", delta: "{\"city\":" })}\n\n`,
      COMPLETED,
    ]);
    const onDelta = vi.fn();

    await veniceStreamResponses(
      { model: "m", input: "hi", stream: true },
      { onDelta },
    );

    const fragments = onDelta.mock.calls
      .map((c) => (c[0] as VeniceStreamDelta).tool_calls)
      .filter(Boolean)
      .flat();
    expect(fragments).toContainEqual({
      index: 0,
      id: "fc_1",
      type: "function",
      function: { name: "get_weather" },
    });
    expect(fragments).toContainEqual({
      index: 0,
      id: "fc_1",
      type: "function",
      function: { arguments: "{\"city\":" },
    });
  });

  it("surfaces HTTP error statuses from the proxy", async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid responses payload" }), {
        status: 400,
        statusText: "Bad Request",
        headers: { "content-type": "application/json" },
      }),
    );

    const error = await veniceStreamResponses(
      { model: "m", input: "hi", stream: true },
      { onDelta: vi.fn() },
    ).catch((value: unknown) => value);

    expect(error).toMatchObject({ status: 400 });
    expect((error as Error).message).toMatch(/invalid responses payload/);
  });
});
