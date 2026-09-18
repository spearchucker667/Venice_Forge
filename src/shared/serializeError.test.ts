/**
 * @fileoverview Regression tests for the structured-error serializer.
 *
 * Verifies that all common thrown-value shapes serialize to meaningful
 * structured objects (never `[object Object]`) and that nested cause
 * chains are bounded.
 */

import { describe, expect, it } from "vitest";
import { serializeError, serializeErrorToString, MAX_CAUSE_DEPTH } from "./serializeError";

describe("serializeError", () => {
  it("serializes a basic Error", () => {
    const e = new Error("boom");
    const s = serializeError(e);
    expect(s.kind).toBe("Error");
    expect(s.name).toBe("Error");
    expect(s.message).toBe("boom");
    expect(s.stack).toBeDefined();
  });

  it("serializes Error subclasses with custom fields", () => {
    class CustomError extends Error {
      code = "E_FOO";
      requestId = "req-123";
    }
    const e = new CustomError("custom");
    const s = serializeError(e);
    expect(s.kind).toBe("Error");
    expect(s.message).toBe("custom");
    expect(s.extra).toBeDefined();
    expect(s.extra?.code).toBe("E_FOO");
    expect(s.extra?.requestId).toBe("req-123");
  });

  it("serializes cause chains up to MAX_CAUSE_DEPTH", () => {
    let cur: Error = new Error("root");
    for (let i = 0; i < MAX_CAUSE_DEPTH + 4; i += 1) {
      cur = new Error(`level-${i}`, { cause: cur });
    }
    const s = serializeError(cur);
    expect(s.kind).toBe("Error");
    let depth = 0;
    let cursor: { cause?: unknown } = s;
    while (cursor?.cause && typeof cursor.cause === "object") {
      depth += 1;
      cursor = cursor.cause as { cause?: unknown };
      if (depth > MAX_CAUSE_DEPTH + 2) break;
    }
    // cause chain is bounded, not exhaustive
    expect(depth).toBeLessThanOrEqual(MAX_CAUSE_DEPTH + 1);
  });

  it("serializes AggregateError", () => {
    const agg = new AggregateError([new Error("a"), new Error("b")], "both");
    const s = serializeError(agg);
    expect(s.kind).toBe("AggregateError");
    expect(s.errors).toBeDefined();
    expect(s.errors?.length).toBe(2);
    expect(s.errors?.[0].message).toBe("a");
  });

  it("serializes DOMException when available", () => {
    if (typeof DOMException === "undefined") return;
    const dom = new DOMException("write denied", "NotAllowedError");
    const s = serializeError(dom);
    expect(s.kind).toBe("DOMException");
    expect(s.name).toBe("NotAllowedError");
    expect(s.message).toBe("write denied");
    expect(s.code).toBe(dom.code);
  });

  it("serializes Event-like objects without stringifying the whole Event", () => {
    const target = { tagName: "BUTTON", id: "submit" };
    const event = {
      type: "click",
      target,
      currentTarget: target,
      // intentionally large to confirm we don't stringify it
      _internal: { big: "x".repeat(2000) },
    };
    const s = serializeError(event);
    expect(s.kind).toBe("Event");
    expect(s.type).toBe("click");
    expect(s.message).toContain("Event(type=click");
    expect(s.message).toContain("<BUTTON#submit>");
  });

  it("serializes Response without throwing", () => {
    if (typeof Response === "undefined") return;
    const r = new Response("body text", { status: 418, statusText: "I'm a teapot", headers: { "content-type": "text/plain" } });
    const s = serializeError(r);
    expect(s.kind).toBe("Response");
    expect(s.status).toBe(418);
    expect(s.statusText).toBe("I'm a teapot");
    expect(s.contentType).toBe("text/plain");
  });

  it("serializes unknown objects without producing '[object Object]'", () => {
    const o = { foo: 1, bar: 2, baz: 3, qux: 4 };
    const s = serializeError(o);
    expect(s.kind).toBe("Unknown");
    expect(s.message).toBeDefined();
    expect(s.message).not.toBe("[object Object]");
  });

  it("serializes null/undefined/primitives", () => {
    expect(serializeError(null).kind).toBe("Null");
    expect(serializeError(undefined).kind).toBe("Primitive");
    expect(serializeError("hello").kind).toBe("Primitive");
    expect(serializeError(42).kind).toBe("Primitive");
    expect(serializeError(true).kind).toBe("Primitive");
  });

  it("never throws on pathological input", () => {
    // object whose property access throws
    const evil = Object.create(null);
    Object.defineProperty(evil, "boom", {
      get() {
        throw new Error("inner");
      },
      enumerable: true,
    });
    expect(() => serializeError(evil)).not.toThrow();
    expect(() => serializeError({ get x() { throw new Error("x"); } })).not.toThrow();
  });

  it("redacts secrets inside custom extras", () => {
    const e = new Error("fail");
    (e as unknown as { apiKey: string }).apiKey = "sk-1234567890abcdefABCDEF";
    const s = serializeError(e);
    expect(s.extra?.apiKey).toBe("[REDACTED]");
  });

  it("serializeErrorToString returns helpful message for Error", () => {
    expect(serializeErrorToString(new Error("x"))).toBe("Error: x");
    expect(serializeErrorToString(new TypeError("bad type"))).toContain("TypeError: bad type");
  });

  it("serializeErrorToString returns helpful message for unknown object", () => {
    const out = serializeErrorToString({ foo: 1 });
    expect(out).not.toBe("[object Object]");
    // Either a descriptive tag with keys or an "Unknown" prefix is acceptable;
    // both are strictly more informative than the bare `[object Object]` we
    // are replacing.
    const isDescriptive =
      out.includes("[object Object keys=foo]") ||
      out.toLowerCase().includes("unknown") ||
      out.includes("(no message)");
    expect(isDescriptive).toBe(true);
  });

  it("serializeErrorToString renders Response clearly", () => {
    if (typeof Response === "undefined") return;
    const r = new Response("body", { status: 500, statusText: "Server Error" });
    const out = serializeErrorToString(r);
    expect(out).toContain("500");
    expect(out).toContain("Server Error");
  });

  it("serializeErrorToString renders cause chains", () => {
    const inner = new Error("inner");
    const outer = new Error("outer", { cause: inner });
    expect(serializeErrorToString(outer)).toContain("cause: Error: inner");
  });
});
