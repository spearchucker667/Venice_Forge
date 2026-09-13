/** @fileoverview Transport-neutral incremental SSE decoder shared by the Web
 *  renderer and the Electron main process.
 *
 *  Contract (per the SSE specification plus the OpenAI-compatible chat
 *  stream convention used by Venice):
 *
 *    - Incremental UTF-8 decoding: multibyte code points split across chunk
 *      boundaries are held by the streaming TextDecoder, never corrupted.
 *      Invalid UTF-8 mid-stream throws `SseDecodeError("invalid_utf8")`; a
 *      truncated multibyte sequence at EOF throws
 *      `SseDecodeError("truncated_utf8")` from `flush()`.
 *    - Line endings: `\r\n`, `\n`, or `\r` all terminate a line.
 *    - Event framing: an event is dispatched only on a blank line (SSE spec)
 *      or at end-of-stream via `flush()`. A single newline after a `data:`
 *      line is NOT an event boundary.
 *    - Multiple `data:` lines in one event are joined with `\n` (SSE spec).
 *    - Comment lines (`: ...`) are ignored; unknown fields are ignored;
 *      `event:` / `id:` / `retry:` are captured onto the emitted event.
 *    - `data: [DONE]` is surfaced as `SseEvent.isDone === true` so both
 *      transports treat the provider terminator identically.
 *
 *  Both transport integrations MUST use this decoder so that identical byte
 *  streams produce identical event/error sequences.
 */

/** A single completed SSE event. `data` is the raw joined payload; the
 *  caller decides how to interpret it (JSON delta, error frame, etc.). */
export interface SseEvent {
  event?: string;
  id?: string;
  retry?: number;
  /** Joined `data:` payload (lines joined with `\n`). Empty if none. */
  data: string;
  /** True when the data payload is exactly `[DONE]` (stream terminator). */
  isDone: boolean;
}

export type SseDecodeErrorCode = "invalid_utf8" | "truncated_utf8";

/** Typed decoding failure. The message is intentionally generic and safe to
 *  surface; transports may log the detail redacted, never raw payloads. */
export class SseDecodeError extends Error {
  readonly code: SseDecodeErrorCode;

  constructor(code: SseDecodeErrorCode, message: string) {
    super(message);
    this.name = "SseDecodeError";
    this.code = code;
  }
}

/**
 * Incremental SSE decoder. Feed raw bytes with `push()`, drain the returned
 * complete events, then call `flush()` at end-of-stream to dispatch any
 * pending partial event and validate trailing UTF-8.
 */
export class SseDecoder {
  private decoder = new TextDecoder("utf-8", { fatal: true });
  private lineBuffer = "";
  private dataLines: string[] = [];
  private eventName: string | undefined;
  private eventId: string | undefined;
  private retryValue: number | undefined;
  private streamEnded = false;

  /** Processes one raw chunk of bytes and returns every event completed by
   *  it. Throws `SseDecodeError("invalid_utf8")` on undecodable bytes. */
  push(chunk: Uint8Array): SseEvent[] {
    if (this.streamEnded) return [];
    let text: string;
    try {
      text = this.decoder.decode(chunk, { stream: true });
    } catch {
      throw new SseDecodeError(
        "invalid_utf8",
        "Decoded bytes are not valid UTF-8.",
      );
    }
    this.lineBuffer += text;
    return this.consumeLines();
  }

  /** Signals end-of-stream: validates trailing UTF-8, processes any
   *  remaining complete lines, and dispatches the pending partial event
   *  (SSE dispatches the last event when the stream closes). Returns the
   *  pending events, if any. Throws `SseDecodeError("truncated_utf8")`
   *  when the stream ends mid-multibyte-sequence. */
  flush(): SseEvent[] {
    if (this.streamEnded) return [];
    this.streamEnded = true;
    let trailing = "";
    try {
      trailing = this.decoder.decode();
    } catch {
      throw new SseDecodeError(
        "truncated_utf8",
        "Stream ended with a truncated UTF-8 sequence.",
      );
    }
    this.lineBuffer += trailing;
    const events = this.consumeLines();
    // EOF with a trailing partial line (no terminator): consume it now so a
    // final `data:` payload without a trailing newline is still dispatched.
    if (this.lineBuffer.length > 0) {
      const ev = this.consumeLine(this.lineBuffer);
      this.lineBuffer = "";
      if (ev) events.push(ev);
    }
    const pending = this.dispatchEvent();
    if (pending) events.push(pending);
    return events;
  }

  private consumeLines(): SseEvent[] {
    const events: SseEvent[] = [];
    for (;;) {
      const idx = this.findLineEnd();
      if (idx < 0) break;
      // If a trailing \r is at the very end of the buffer and the stream
      // has not ended, wait for the next chunk to see if it is part of \r\n.
      if (!this.streamEnded && idx === this.lineBuffer.length - 1 && this.lineBuffer[idx] === "\r") {
        break;
      }
      const line = this.lineBuffer.slice(0, idx);
      const consumed =
        this.lineBuffer[idx] === "\r" && this.lineBuffer[idx + 1] === "\n"
          ? 2
          : 1;
      this.lineBuffer = this.lineBuffer.slice(idx + consumed);
      const event = this.consumeLine(line);
      if (event) events.push(event);
    }
    return events;
  }

  /** Finds the earliest line terminator (`\r\n`, `\n`, or `\r`). */
  private findLineEnd(): number {
    const nl = this.lineBuffer.indexOf("\n");
    const cr = this.lineBuffer.indexOf("\r");
    if (nl < 0) return cr;
    if (cr < 0) return nl;
    return Math.min(nl, cr);
  }

  private consumeLine(line: string): SseEvent | null {
    if (line === "") return this.dispatchEvent();
    if (line.startsWith(":")) return null; // comment line
    if (line.startsWith("data:")) {
      this.dataLines.push(line.slice("data:".length).replace(/^ /, ""));
      return null;
    }
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    const value =
      colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
    switch (field) {
      case "event":
        this.eventName = value;
        return null;
      case "id":
        if (!value.includes("\0")) this.eventId = value;
        return null;
      case "retry": {
        const n = Number(value);
        if (Number.isInteger(n) && n >= 0) this.retryValue = n;
        return null;
      }
      default:
        return null; // unknown fields are ignored per the SSE spec
    }
  }

  private dispatchEvent(): SseEvent | null {
    const data = this.dataLines.join("\n");
    this.dataLines = [];
    if (
      data === "" &&
      this.eventName === undefined &&
      this.eventId === undefined &&
      this.retryValue === undefined
    ) {
      return null;
    }
    const event: SseEvent = { data, isDone: data === "[DONE]" };
    if (this.eventName !== undefined) event.event = this.eventName;
    if (this.eventId !== undefined) event.id = this.eventId;
    if (this.retryValue !== undefined) event.retry = this.retryValue;
    this.eventName = undefined;
    this.eventId = undefined;
    this.retryValue = undefined;
    return event;
  }
}

// ============================================================================
// OpenAI-compatible delta extraction (shared by both transports)
// ============================================================================

/** Result of extracting a delta from an SSE data payload. */
export interface StreamDelta {
  content: string;
  reasoning: string;
  /** True when the data was a JSON object with a recognizable delta shape. */
  parsed: boolean;
  /** True when JSON.parse failed or the payload is a provider error frame. */
  malformed: boolean;
  /** Raw data when malformed (for redacted diagnostics; never user output). */
  rawData?: string;
  /** The upstream provider's unique request ID, typically on the first chunk. */
  providerRequestId?: string;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: "function";
    function?: { name?: string; arguments?: string };
  }>;
  finish_reason?: string | null;
  usage?: Record<string, unknown>;
}

/**
 * Extracts text/reasoning deltas from a single SSE `data:` payload.
 *
 *  - `{ parsed: true, malformed: false, ... }` for a recognizable JSON
 *    delta (or a benign non-delta JSON object).
 *  - `{ parsed: true, malformed: true, rawData }` for a provider error
 *    frame (OpenAI-style `{"type":"error","error":{...}}`, `{"error": "..."}`,
 *    or any JSON with an `error` member and no recognisable delta).
 *  - `{ parsed: false, malformed: true, rawData }` when JSON.parse fails.
 *  - `[DONE]` and empty data are benign (no delta, not malformed).
 *
 *  `rawData` is only for redacted diagnostics, never for user-visible output.
 */
export function extractStreamDelta(data: string): StreamDelta {
  if (!data) return { content: "", reasoning: "", parsed: false, malformed: false };
  if (data === "[DONE]") return { content: "", reasoning: "", parsed: true, malformed: false };
  try {
    const json: unknown = JSON.parse(data);
    if (json && typeof json === "object") {
      const record = json as Record<string, unknown>;
      const isErrorFrame =
        (typeof record.type === "string" && record.type.toLowerCase() === "error") ||
        record.error !== undefined;
      const choices = Array.isArray(record.choices) ? record.choices : [];
      const choice = (choices[0] ?? {}) as Record<string, unknown>;
      const delta = (choice.delta ??
        choice.message ??
        (typeof choice.text === "string" ? { content: choice.text } : {})) as Record<string, unknown>;
      const content = typeof delta.content === "string" ? delta.content : "";
      const reasoning = typeof delta.reasoning_content === "string" ? delta.reasoning_content : "";
      const providerRequestId = typeof record.id === "string" ? record.id : undefined;
      const tool_calls = delta.tool_calls as StreamDelta["tool_calls"];
      const finish_reason = (choice.finish_reason as string | null | undefined) ?? null;
      const usage = record.usage as StreamDelta["usage"];
      if (isErrorFrame && !content && !reasoning) {
        return { content: "", reasoning: "", providerRequestId, parsed: true, malformed: true, rawData: data };
      }
      return { content, reasoning, providerRequestId, tool_calls, finish_reason, usage, parsed: true, malformed: false };
    }
    return { content: "", reasoning: "", parsed: true, malformed: false };
  } catch {
    return { content: "", reasoning: "", parsed: false, malformed: true, rawData: data };
  }
}

/** Result of applying one complete SSE event to the stream consumer. */
export interface SseEventOutcome {
  /** True when the event was the `[DONE]` terminator. */
  done: boolean;
  /** Extracted text delta (content only, not reasoning). */
  text: string;
  /** True when the payload was malformed JSON or a provider error frame. */
  malformed: boolean;
  /** Raw frame for redacted diagnostics only. */
  rawData?: string;
  /** Normalized (bounded) provider message when derivable from an error frame. */
  errorMessage?: string;
}

function normalizeErrorFrameMessage(rawData?: string): string | undefined {
  if (!rawData) return undefined;
  try {
    const json: unknown = JSON.parse(rawData);
    if (json && typeof json === "object") {
      const record = json as Record<string, unknown>;
      const err = record.error;
      const message =
        typeof err === "string"
          ? err
          : err && typeof err === "object" && typeof (err as Record<string, unknown>).message === "string"
            ? (err as Record<string, unknown>).message
            : undefined;
      if (typeof message === "string" && message.trim()) {
        return message.trim().slice(0, 300);
      }
    }
  } catch {
    // not JSON — no normalized message
  }
  return undefined;
}

/**
 * Applies a decoded SSE event to the shared delta callback contract.
 * Both transports call this so identical byte streams produce identical
 * delta sequences, `[DONE]` handling, and malformed-frame outcomes.
 *
 * @param ev The decoded event.
 * @param callbacks.onDelta Invoked when the event carries content.
 * @param callbacks.extractFn Optional provider-specific extractor
 *        (fallback providers); defaults to `extractStreamDelta`.
 */
export function applyStreamSseEvent(
  ev: SseEvent,
  callbacks: {
    onDelta: (chunk: {
      content: string;
      reasoning: string;
      providerRequestId?: string;
      usage?: Record<string, unknown>;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: "function";
        function?: { name?: string; arguments?: string };
      }>;
      finish_reason?: string | null;
    }) => void;
    extractFn?: (data: string) => StreamDelta;
  },
): SseEventOutcome {
  if (ev.isDone) return { done: true, text: "", malformed: false };
  const extractFn = callbacks.extractFn ?? extractStreamDelta;
  const delta = extractFn(ev.data);
  if (delta.malformed) {
    return {
      done: false,
      text: "",
      malformed: true,
      rawData: delta.rawData,
      errorMessage: normalizeErrorFrameMessage(delta.rawData),
    };
  }
  if (
    delta.content ||
    delta.reasoning ||
    delta.providerRequestId ||
    delta.tool_calls ||
    delta.finish_reason !== undefined ||
    delta.usage
  ) {
    callbacks.onDelta({
      content: delta.content,
      reasoning: delta.reasoning,
      providerRequestId: delta.providerRequestId,
      tool_calls: delta.tool_calls,
      finish_reason: delta.finish_reason,
      usage: delta.usage,
    });
    return { done: false, text: delta.content, malformed: false };
  }
  return { done: false, text: "", malformed: false };
}