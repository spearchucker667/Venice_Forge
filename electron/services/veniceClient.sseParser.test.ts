// @vitest-environment node
/** @fileoverview Unit tests for the SSE parser used by `performVeniceRequest`.
 *  These tests target the parser in isolation — the higher-level streaming
 *  tests in `veniceClient.stream.test.ts` cover the end-to-end flow.
 *
 *  Coverage:
 *    - Plain `data: <json>` events with content and reasoning deltas
 *    - The `[DONE]` terminator
 *    - Comment lines (`: heartbeat`) — must be ignored
 *    - `event:`, `id:`, `retry:` lines — must not abort parsing
 *    - Blank-line event boundaries
 *    - Multi-line `data:` events (SSE spec: lines joined with \n)
 *    - Malformed JSON in a `data:` line — must be surfaced, not silently dropped
 *    - Provider error chunks (e.g. `data: {"error": "rate limited"}`) — must
 *      not be silently dropped on the happy path
 *    - Partial buffer at end of input (no trailing blank line) is preserved
 *      in the returned `buffer` field
 */
import { describe, it, expect, vi } from "vitest";
import { parseSseLines, extractStreamDelta } from "./veniceClient";

describe("extractStreamDelta", () => {
  it("parses a normal Venice content delta", () => {
    const delta = extractStreamDelta(
      JSON.stringify({ choices: [{ delta: { content: "hello" } }] }),
    );
    expect(delta.parsed).toBe(true);
    expect(delta.malformed).toBe(false);
    expect(delta.content).toBe("hello");
    expect(delta.reasoning).toBe("");
  });

  it("parses reasoning_content when present", () => {
    const delta = extractStreamDelta(
      JSON.stringify({ choices: [{ delta: { content: "ans", reasoning_content: "think" } }] }),
    );
    expect(delta.parsed).toBe(true);
    expect(delta.content).toBe("ans");
    expect(delta.reasoning).toBe("think");
  });

  it("returns malformed=true on JSON parse error and retains rawData for diagnostics", () => {
    const delta = extractStreamDelta("not-json");
    expect(delta.parsed).toBe(false);
    expect(delta.malformed).toBe(true);
    expect(delta.rawData).toBe("not-json");
  });

  it("treats [DONE] as a benign non-delta terminator", () => {
    const delta = extractStreamDelta("[DONE]");
    expect(delta.parsed).toBe(true);
    expect(delta.malformed).toBe(false);
    expect(delta.content).toBe("");
  });

  it("treats empty data as benign", () => {
    const delta = extractStreamDelta("");
    expect(delta.parsed).toBe(false);
    expect(delta.malformed).toBe(false);
  });
});

describe("parseSseLines", () => {
  it("dispatches a single data: line and preserves the trailing partial buffer", () => {
    const onDelta = vi.fn();
    const onMalformed = vi.fn();
    const result = parseSseLines(
      'data: {"choices":[{"delta":{"content":"hi"}}]}\n\npartial',
      onDelta,
      onMalformed,
    );
    expect(onDelta).toHaveBeenCalledWith({ content: "hi", reasoning: "" });
    expect(result.text).toBe("hi");
    expect(result.buffer).toBe("partial");
    expect(result.malformedFrameCount).toBe(0);
    expect(onMalformed).not.toHaveBeenCalled();
  });

  it("ignores comment lines beginning with a colon", () => {
    const onDelta = vi.fn();
    parseSseLines(
      ': this is a comment\ndata: {"choices":[{"delta":{"content":"x"}}]}\n\n',
      onDelta,
    );
    expect(onDelta).toHaveBeenCalledTimes(1);
  });

  it("ignores event:, id:, and retry: lines without breaking the parser", () => {
    const onDelta = vi.fn();
    parseSseLines(
      'event: message\nid: 42\nretry: 1000\ndata: {"choices":[{"delta":{"content":"y"}}]}\n\n',
      onDelta,
    );
    expect(onDelta).toHaveBeenCalledWith({ content: "y", reasoning: "" });
  });

  it("joins multiple data: lines in one event with newlines (SSE spec)", () => {
    const onDelta = vi.fn();
    // SSE spec: a single event may contain multiple data: lines, which
    // must be joined with \n into one payload before being parsed as a
    // single JSON object. This is typically used to split a very large
    // payload across lines. Two events separated by a blank line are
    // dispatched as two separate callbacks (see other tests).
    parseSseLines(
      'data: {"choices":[{"delta":\ndata: {"content":"joined"}}]}\n\n',
      onDelta,
    );
    expect(onDelta).toHaveBeenCalledTimes(1);
    expect(onDelta.mock.calls[0][0].content).toBe("joined");
  });

  it("treats [DONE] as a benign terminator without invoking onDelta", () => {
    const onDelta = vi.fn();
    const result = parseSseLines("data: [DONE]\n\n", onDelta);
    expect(onDelta).not.toHaveBeenCalled();
    expect(result.malformedFrameCount).toBe(0);
  });

  it("counts malformed JSON frames and surfaces them via onMalformed", () => {
    const onDelta = vi.fn();
    const onMalformed = vi.fn();
    const result = parseSseLines(
      'data: not-json\n\ndata: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: also-not-json\n\n',
      onDelta,
      onMalformed,
    );
    expect(onDelta).toHaveBeenCalledTimes(1);
    expect(onDelta.mock.calls[0][0].content).toBe("ok");
    expect(result.malformedFrameCount).toBe(2);
    expect(onMalformed).toHaveBeenCalledTimes(2);
    expect(onMalformed.mock.calls[0][0]).toBe("not-json");
    expect(onMalformed.mock.calls[1][0]).toBe("also-not-json");
    expect(result.malformedSamples).toContain("not-json");
  });

  it("does not invoke onDelta for a provider error frame with no recognisable delta", () => {
    // Provider error frames are sometimes emitted on the SSE stream when
    // the model is rate-limited mid-completion. The previous parser
    // silently dropped them. The new parser still does not forward
    // them to the renderer (the JSON shape has no delta), but it must
    // record them as malformed for diagnostics.
    const onDelta = vi.fn();
    const onMalformed = vi.fn();
    const result = parseSseLines(
      'data: {"error":"rate_limited","message":"slow down"}\n\n',
      onDelta,
      onMalformed,
    );
    expect(onDelta).not.toHaveBeenCalled();
    expect(result.malformedFrameCount).toBe(1);
  });

  it("handles \\r\\n line endings", () => {
    const onDelta = vi.fn();
    parseSseLines(
      'data: {"choices":[{"delta":{"content":"crlf"}}]}\r\n\r\n',
      onDelta,
    );
    expect(onDelta).toHaveBeenCalledWith({ content: "crlf", reasoning: "" });
  });

  it("does not throw when onMalformed itself throws", () => {
    const onDelta = vi.fn();
    const onMalformed = vi.fn(() => {
      throw new Error("diagnostics exploded");
    });
    expect(() =>
      parseSseLines('data: not-json\n\n', onDelta, onMalformed),
    ).not.toThrow();
  });

  it("returns the trailing partial frame in the buffer field for the next call", () => {
    const onDelta = vi.fn();
    // The buffer has two complete events separated by a single \n (no
    // trailing blank line). The first event is fully terminated by the
    // \n; the second is the partial tail that the next call will see.
    const r1 = parseSseLines(
      'data: {"choices":[{"delta":{"content":"a"}}]}\ndata: {"choices":[{"delta":{"content":"b"}}]}',
      onDelta,
    );
    // First call: the first event is complete and should be dispatched.
    expect(onDelta).toHaveBeenCalledTimes(1);
    expect(onDelta.mock.calls[0][0].content).toBe("a");
    expect(r1.text).toBe("a");
    // The second (incomplete) event is preserved in the tail buffer.
    expect(r1.buffer).toContain('data: {"choices":[{"delta":{"content":"b"}}]}');
    // Second call with the trailing buffer plus a blank line dispatches
    // the second event. Each call returns only the text dispatched
    // *during that call*; the caller is expected to accumulate `text`
    // across calls if it needs the full transcript.
    const r2 = parseSseLines(`${r1.buffer}\n\n`, onDelta);
    expect(onDelta).toHaveBeenCalledTimes(2);
    expect(onDelta.mock.calls[1][0].content).toBe("b");
    expect(r2.text).toBe("b");
  });
});
