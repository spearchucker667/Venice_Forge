/** @fileoverview Adversarial conformance tests for the shared incremental SSE
 *  decoder (VERIFY: WP-03 shared streaming conformance). Every byte boundary
 *  behavior that the Web and Electron transports must agree on is exercised
 *  here against the exact bytes, not against implementation details. */

import { describe, expect, it, vi } from "vitest";
import {
  SseDecodeError,
  SseDecoder,
  applyStreamSseEvent,
  extractStreamDelta,
  type SseEvent,
} from "./sseStreamDecoder";

function pushAll(decoder: SseDecoder, chunks: Uint8Array[]): SseEvent[] {
  const events: SseEvent[] = [];
  for (const chunk of chunks) events.push(...decoder.push(chunk));
  events.push(...decoder.flush());
  return events;
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const DELTA = (content: string) =>
  JSON.stringify({ choices: [{ delta: { content } }] });

describe("SseDecoder framing", () => {
  it("dispatches an event only on a blank line, not on a single newline", () => {
    const decoder = new SseDecoder();
    // Single newline after data: is NOT an event boundary per the SSE spec.
    expect(decoder.push(utf8(`data: ${DELTA("hi")}\n`))).toEqual([]);
    // The blank line completes the pending event with the single data line.
    const first = decoder.push(utf8("\n"));
    expect(first).toHaveLength(1);
    expect(first[0].data).toBe(DELTA("hi"));
    // A fresh event completes on its own blank line.
    const second = decoder.push(utf8(`data: ${DELTA("there")}\n\n`));
    expect(second).toHaveLength(1);
    expect(second[0].data).toBe(DELTA("there"));
  });

  it("handles \\r\\n and bare \\r line endings identically", () => {
    const crlf = pushAll(new SseDecoder(), [
      utf8(`data: ${DELTA("crlf")}\r\n\r\n`),
    ]);
    expect(crlf).toHaveLength(1);
    expect(crlf[0].data).toBe(DELTA("crlf"));

    const bare = pushAll(new SseDecoder(), [utf8(`data: ${DELTA("bare")}\r\r`)]);
    expect(bare).toHaveLength(1);
    expect(bare[0].data).toBe(DELTA("bare"));
  });

  it("preserves event integrity when CRLF is split across chunk boundaries (TG-001)", () => {
    const decoder = new SseDecoder();
    // Chunk 1 ends with \r
    const chunk1Events = decoder.push(utf8('event: delta\r\ndata: {"token":"hello"}\r'));
    expect(chunk1Events).toHaveLength(0); // Must NOT dispatch on trailing \r

    // Chunk 2 begins with \n followed by next event
    const chunk2Events = decoder.push(utf8('\n\nevent: delta\r\ndata: {"token":" world"}\r\n\r\n'));
    expect(chunk2Events).toHaveLength(2);
    expect(chunk2Events[0].data).toBe('{"token":"hello"}');
    expect(chunk2Events[1].data).toBe('{"token":" world"}');
  });

  it("joins multiline data payloads with newlines (SSE spec)", () => {
    const events = pushAll(new SseDecoder(), [
      utf8('data: {"choices":[{"delta":\ndata: {"content":"joined"}}]}\n\n'),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe(
      '{"choices":[{"delta":\n{"content":"joined"}}]}',
    );
  });

  it("ignores comment lines and unknown fields", () => {
    const events = pushAll(new SseDecoder(), [
      utf8(`: heartbeat\n: keep-alive\ndata: ${DELTA("x")}\n\n`),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe(DELTA("x"));
  });

  it("captures event, id, and retry fields onto the event", () => {
    const events = pushAll(new SseDecoder(), [
      utf8("event: message\nid: 42\nretry: 1000\n"),
      utf8(`data: ${DELTA("y")}\n\n`),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("message");
    expect(events[0].id).toBe("42");
    expect(events[0].retry).toBe(1000);
    expect(events[0].data).toBe(DELTA("y"));
  });

  it("surfaces [DONE] as an isDone event", () => {
    const events = pushAll(new SseDecoder(), [utf8("data: [DONE]\n\n")]);
    expect(events).toHaveLength(1);
    expect(events[0].isDone).toBe(true);
    expect(events[0].data).toBe("[DONE]");
  });

  it("does not emit an event for blank lines and comments with no data", () => {
    const decoder = new SseDecoder();
    expect(decoder.push(utf8("\n\n: comment\n\n"))).toEqual([]);
    expect(decoder.flush()).toEqual([]); // no pending data
  });

  it("flushes the pending partial event at EOF without a blank line", () => {
    const decoder = new SseDecoder();
    expect(decoder.push(utf8(`data: ${DELTA("tail")}`))).toEqual([]);
    const tail = decoder.flush();
    expect(tail).toHaveLength(1);
    expect(tail[0].data).toBe(DELTA("tail"));
  });

  it("does not dispatch between un-terminated chunks (mid-event chunking)", () => {
    const decoder = new SseDecoder();
    const bytes = utf8(`data: ${DELTA("chunked")}\ndata: {"choices":[{"delta":\n\n`);
    // Feed one byte at a time; only the terminating blank line completes the event.
    const events: SseEvent[] = [];
    for (let i = 0; i < bytes.length; i++) {
      events.push(...decoder.push(bytes.slice(i, i + 1)));
    }
    events.push(...decoder.flush());
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe(
      `${DELTA("chunked")}\n{"choices":[{"delta":`,
    );
  });
});

describe("SseDecoder UTF-8 handling", () => {
  it("preserves multibyte code points split across arbitrary chunk boundaries", () => {
    const text = `data: ${DELTA("caf\u00e9 \ud83c\udf0d \ud83d\udd0b")}\n\n`;
    const bytes = utf8(text);
    for (const split of [1, 2, 3, bytes.length - 1]) {
      const decoder = new SseDecoder();
      const events = pushAll(decoder, [bytes.slice(0, split), bytes.slice(split)]);
      expect(events).toHaveLength(1);
      expect(events[0].data).toBe(DELTA("caf\u00e9 \ud83c\udf0d \ud83d\udd0b"));
    }
  });

  it("throws SseDecodeError on invalid UTF-8 bytes", () => {
    const decoder = new SseDecoder();
    // 0xFF is never valid in UTF-8.
    expect(() => decoder.push(new Uint8Array([0xff, 0xfe]))).toThrow(
      SseDecodeError,
    );
  });

  it("throws truncated_utf8 when the stream ends mid-multibyte-sequence", () => {
    const decoder = new SseDecoder();
    decoder.push(new TextEncoder().encode("data: caf"));
    // First two bytes of the three-byte é; stream ends before the third.
    decoder.push(new Uint8Array([0xc3]));
    expect(() => decoder.flush()).toThrow(
      expect.objectContaining({ name: "SseDecodeError", code: "truncated_utf8" }),
    );
  });

  it("flush is idempotent and safe after the first call", () => {
    const decoder = new SseDecoder();
    decoder.push(utf8(`data: ${DELTA("a")}\n\n`));
    expect(decoder.flush()).toHaveLength(0);
    expect(decoder.flush()).toEqual([]);
    expect(decoder.push(utf8("data: b\n\n"))).toEqual([]);
  });
});

describe("extractStreamDelta", () => {
  it("parses content, reasoning, and provider request id", () => {
    const delta = extractStreamDelta(
      JSON.stringify({
        id: "chatcmpl-1",
        choices: [{ delta: { content: "hello", reasoning_content: "think" } }],
      }),
    );
    expect(delta).toMatchObject({
      parsed: true,
      malformed: false,
      content: "hello",
      reasoning: "think",
      providerRequestId: "chatcmpl-1",
    });
  });

  it("reads legacy choices[0].text fallback", () => {
    const delta = extractStreamDelta(JSON.stringify({ choices: [{ text: "legacy" }] }));
    expect(delta.content).toBe("legacy");
    expect(delta.malformed).toBe(false);
  });

  it("marks provider error frames malformed (never silently dropped)", () => {
    for (const frame of [
      JSON.stringify({ error: "rate_limited" }),
      JSON.stringify({ type: "error", error: { message: "slow down" } }),
      JSON.stringify({ error: { message: "quota exceeded" } }),
    ]) {
      const delta = extractStreamDelta(frame);
      expect(delta.malformed).toBe(true);
      expect(delta.parsed).toBe(true);
      expect(delta.rawData).toBe(frame);
    }
  });

  it("marks non-JSON payloads malformed", () => {
    const delta = extractStreamDelta("not-json");
    expect(delta.malformed).toBe(true);
    expect(delta.parsed).toBe(false);
  });

  it("treats empty data and [DONE] as benign", () => {
    expect(extractStreamDelta("")).toMatchObject({ malformed: false });
    expect(extractStreamDelta("[DONE]")).toMatchObject({ malformed: false });
  });
});

describe("applyStreamSseEvent", () => {
  it("invokes onDelta only for events that carry a delta", () => {
    const onDelta = vi.fn();
    const out = applyStreamSseEvent({ data: DELTA("hi"), isDone: false }, { onDelta });
    expect(out).toMatchObject({ text: "hi", malformed: false, done: false });
    expect(onDelta).toHaveBeenCalledWith(
      expect.objectContaining({ content: "hi", reasoning: "" }),
    );
  });

  it("returns done=true for [DONE] without invoking onDelta", () => {
    const onDelta = vi.fn();
    const out = applyStreamSseEvent({ data: "[DONE]", isDone: true }, { onDelta });
    expect(out.done).toBe(true);
    expect(onDelta).not.toHaveBeenCalled();
  });

  it("reports malformed frames with a normalized provider message", () => {
    const onDelta = vi.fn();
    const raw = JSON.stringify({ error: { message: "quota exceeded for this key" } });
    const out = applyStreamSseEvent({ data: raw, isDone: false }, { onDelta });
    expect(out.malformed).toBe(true);
    expect(out.errorMessage).toBe("quota exceeded for this key");
    expect(onDelta).not.toHaveBeenCalled();
  });

  it("supports provider-specific extractors (fallback adapters)", () => {
    const onDelta = vi.fn();
    const extractFn = (data: string) => ({
      content: data === "ping" ? "" : "adapter",
      reasoning: "",
      parsed: true,
      malformed: false,
    });
    const out = applyStreamSseEvent(
      { data: "anything", isDone: false },
      { onDelta, extractFn },
    );
    expect(out.text).toBe("adapter");
    expect(onDelta).toHaveBeenCalledWith(expect.objectContaining({ content: "adapter" }));
  });
});