/**
 * @fileoverview Centralized structured-error serializer.
 *
 * Replaces ad-hoc `String(err)`, `err.toString()`, `event.error.toString()`,
 * and template-literal coercions that historically produced the unhelpful
 * diagnostic string `[object Object]`. The serializer recognizes:
 *
 *   - Error and Error subclasses (includes `name`, `message`, `stack`,
 *     `cause`, and any custom enumerable properties)
 *   - DOMException (`name`, `message`, `code`, `stack`)
 *   - DOM Event (extracts `type`, `target` summary, `currentTarget` summary;
 *     never stringifies the entire Event)
 *   - Response (status, statusText, contentType, byte count, body summary)
 *   - AggregateError (recurse over `.errors`)
 *   - unknown values (returns a tagged placeholder rather than `[object Object]`)
 *
 * Nested cause chains are followed up to {@link MAX_CAUSE_DEPTH} to bound
 * diagnostic size.
 *
 * Secrets and local paths are redacted via {@link redactSecrets}; only the
 * serializer's output is exposed to consumers.
 *
 * This module deliberately avoids throwing so it can be used inside global
 * error handlers (window.onerror, process.on('uncaughtException')) without
 * causing recursive failures.
 */

import { redactSecrets } from "./redaction";

/** Maximum cause-chain depth to avoid pathological recursion. */
export const MAX_CAUSE_DEPTH = 8;

/** Maximum byte length of a stringified body in Response summary. */
const RESPONSE_BODY_SUMMARY_LIMIT = 512;

export interface SerializedError {
  kind: "Error" | "DOMException" | "Event" | "Response" | "AggregateError" | "Unknown" | "Null" | "Primitive";
  name?: string;
  message?: string;
  stack?: string;
  code?: string | number;
  type?: string;
  status?: number;
  statusText?: string;
  contentType?: string;
  byteCount?: number;
  bodySummary?: string;
  errors?: SerializedError[];
  cause?: SerializedError | null;
  /** Free-form additional properties (already redacted). */
  extra?: Record<string, unknown>;
}

function isErrorLike(value: unknown): value is Error {
  return value instanceof Error;
}

function isAggregateErrorLike(value: unknown): value is AggregateError {
  return (
    typeof AggregateError !== "undefined" &&
    value instanceof AggregateError
  );
}

function isDomExceptionLike(value: unknown): value is DOMException {
  return (
    typeof DOMException !== "undefined" &&
    value instanceof DOMException
  );
}

function isResponseLike(value: unknown): value is Response {
  return (
    typeof Response !== "undefined" &&
    value instanceof Response
  );
}

function isEventLike(value: unknown): value is Event {
  // Event isn't constructable in jsdom-less environments; rely on duck typing.
  if (!value || typeof value !== "object") return false;
  const v = value as { type?: unknown; target?: unknown; currentTarget?: unknown };
  return (
    typeof v.type === "string" &&
    (v.target !== undefined || v.currentTarget !== undefined)
  );
}

/**
 * Detect whether a value is already a SerializedError produced by
 * {@link serializeError}. We duck-type via the `kind` discriminator so this
 * remains stable even if the import graph shifts between bundles.
 */
function isSerializedError(value: unknown): value is SerializedError {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.kind === "string" &&
    [
      "Error",
      "DOMException",
      "Event",
      "Response",
      "AggregateError",
      "Unknown",
      "Null",
      "Primitive",
    ].includes(v.kind)
  );
}

function safeString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (isSerializedError(value)) {
    return renderSerializedHeadline(value);
  }
  try {
    const s = String(value);
    // Avoid the unhelpful "[object Object]" fallback when the value has
    // enumerable properties — surface a tag instead.
    if (s === "[object Object]") {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).slice(0, 3).join(",");
      return `[object Object keys=${keys || "(none)"}]`;
    }
    return s;
  } catch {
    return "[Unstringifiable]";
  }
}

function renderSerializedHeadline(s: SerializedError): string {
  switch (s.kind) {
    case "Null":
      return "null";
    case "Primitive":
      return s.message ?? "primitive";
    case "Error":
    case "AggregateError":
    case "DOMException": {
      const head = `${s.name ?? "Error"}${s.kind === "AggregateError" ? " (aggregate)" : ""}: ${s.message ?? "(no message)"}`;
      if (s.cause) return `${head} (cause: ${renderSerializedHeadline(s.cause)})`;
      return head;
    }
    case "Event":
      return s.message ?? `Event(type=${s.type ?? "?"})`;
    case "Response":
      return `Response(${s.status ?? "?"} ${s.statusText ?? ""} contentType=${s.contentType ?? "?"} bytes=${s.byteCount ?? "?"})`;
    case "Unknown":
      return s.message ?? "Unknown thrown value";
  }
}

function summarizeTarget(target: EventTarget | null): string | undefined {
  if (!target) return undefined;
  const t = target as { tagName?: string; id?: string; nodeName?: string };
  const tag = t.tagName ?? t.nodeName ?? "unknown";
  const id = typeof t.id === "string" && t.id ? `#${t.id}` : "";
  return `<${String(tag)}${id}>`;
}

async function tryReadResponseBody(response: Response): Promise<{
  byteCount?: number;
  contentType?: string;
  bodySummary?: string;
}> {
  const result: { byteCount?: number; contentType?: string; bodySummary?: string } = {};
  const contentLength = response.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength)) {
    result.byteCount = Number(contentLength);
  }
  const ct = response.headers.get("content-type");
  if (ct) result.contentType = ct.split(";")[0].trim();
  try {
    const cloned = response.clone();
    const buf = await cloned.arrayBuffer();
    result.byteCount = buf.byteLength;
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const text = decoder.decode(buf, { stream: false });
    if (text.length > RESPONSE_BODY_SUMMARY_LIMIT) {
      result.bodySummary = `${text.slice(0, RESPONSE_BODY_SUMMARY_LIMIT)}…[truncated]`;
    } else {
      result.bodySummary = text;
    }
  } catch {
    // best-effort only; do not throw from serializer
  }
  return result;
}

/**
 * Serialize an arbitrary thrown value to a structured, JSON-safe object.
 * Never throws. Safe to use inside global error handlers.
 *
 * @param value The thrown value (Error, DOMException, Event, Response, unknown).
 * @param depth Current cause-chain depth (internal).
 */
export function serializeError(value: unknown, depth = 0): SerializedError {
  if (value === null) {
    return { kind: "Null" };
  }
  if (value === undefined) {
    return { kind: "Primitive", message: "undefined" };
  }
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean" || t === "bigint" || t === "symbol") {
    return { kind: "Primitive", message: safeString(value) };
  }

  if (isErrorLike(value)) {
    const out: SerializedError = {
      kind: isAggregateErrorLike(value) ? "AggregateError" : "Error",
      name: value.name,
      message: safeString(value.message),
    };
    if (value.stack) out.stack = value.stack;
    if (isAggregateErrorLike(value)) {
      out.errors = (value.errors ?? []).map((e) => serializeError(e, depth + 1));
    }
    if ((value as { cause?: unknown }).cause !== undefined && depth < MAX_CAUSE_DEPTH) {
      out.cause = serializeError((value as { cause?: unknown }).cause, depth + 1);
    }
    const extra = extractSafeExtras(value);
    if (extra) out.extra = extra;
    return out;
  }

  if (isDomExceptionLike(value)) {
    return {
      kind: "DOMException",
      name: value.name,
      message: safeString(value.message),
      code: value.code,
      stack: value.stack,
    };
  }

  if (isResponseLike(value)) {
    const out: SerializedError = {
      kind: "Response",
      status: value.status,
      statusText: value.statusText,
    };
    // Best-effort sync body summary (cannot await in synchronous serializer).
    try {
      const ct = value.headers.get("content-type");
      if (ct) out.contentType = ct.split(";")[0].trim();
      const cl = value.headers.get("content-length");
      if (cl && /^\d+$/.test(cl)) out.byteCount = Number(cl);
    } catch {
      // ignore — some Headers implementations are restrictive
    }
    return out;
  }

  if (isEventLike(value)) {
    const e = value as unknown as Event;
    return {
      kind: "Event",
      type: e.type,
      message: `Event(type=${e.type}, target=${summarizeTarget(e.target) ?? "?"})`,
    };
  }

  // Unknown: extract enumerable keys but never throw. Best-effort.
  try {
    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const redacted = redactSecrets(obj);
      const out: SerializedError = { kind: "Unknown" };
      const typeName = (obj as { constructor?: { name?: string } }).constructor?.name;
      if (typeName && typeName !== "Object") {
        out.name = typeName;
      }
      out.message = safeString(value);
      const extras: Record<string, unknown> = {};
      let count = 0;
      for (const [k, v] of Object.entries(redacted)) {
        if (count >= 8) break;
        extras[k] = typeof v === "object" && v !== null ? "[object]" : safeString(v);
        count += 1;
      }
      if (Object.keys(extras).length > 0) out.extra = extras;
      return out;
    }
  } catch {
    // fall through
  }

  return { kind: "Unknown", message: safeString(value) };
}

function extractSafeExtras(error: Error): Record<string, unknown> | undefined {
  const enumerable: Record<string, unknown> = {};
  let count = 0;
  // Filter out fields already represented in the top-level output.
  const skip = new Set(["name", "message", "stack", "cause"]);
  for (const key of Object.getOwnPropertyNames(error)) {
    if (skip.has(key)) continue;
    if (count >= 8) break;
    try {
      const v = (error as unknown as Record<string, unknown>)[key];
      if (typeof v === "function") continue;
      enumerable[key] = v;
      count += 1;
    } catch {
      // ignore un-gettable properties
    }
  }
  if (Object.keys(enumerable).length === 0) return undefined;
  return redactSecrets(enumerable) as Record<string, unknown>;
}

/**
 * Render a SerializedError as a single-line human-readable string suitable
 * for log records. Never throws. Falls back gracefully when fields are
 * missing so consumers see meaningful data instead of `[object Object]`.
 *
 * Accepts either a raw thrown value or an already-serialized {@link SerializedError}.
 */
export function serializeErrorToString(value: unknown): string {
  if (isSerializedError(value)) return renderSerializedHeadline(value);
  const s = serializeError(value);
  return renderSerializedHeadline(s);
}

/**
 * Async variant of {@link serializeError} that, when given a Response, will
 * also extract a bounded body summary. For non-Response values the result is
 * identical to the sync {@link serializeError} call.
 */
export async function serializeErrorAsync(
  value: unknown,
  depth = 0,
): Promise<SerializedError> {
  const base = serializeError(value, depth);
  if (base.kind === "Response" && isResponseLike(value)) {
    const extra = await tryReadResponseBody(value);
    if (extra.byteCount !== undefined) base.byteCount = extra.byteCount;
    if (extra.contentType !== undefined) base.contentType = extra.contentType;
    if (extra.bodySummary !== undefined) base.bodySummary = extra.bodySummary;
  }
  return base;
}
