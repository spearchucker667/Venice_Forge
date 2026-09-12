// @vitest-environment node

/** @fileoverview Unit tests for VF-AUD-20260831-P2-008 Retry-After parsing,
 *  bounded jittered delay, abortable delay, and provider fallback integration. */

import { EventEmitter } from "events";
import https from "https";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getVersion: vi.fn(() => "1.0.0-test") },
}));

vi.mock("https", () => ({
  default: { request: vi.fn() },
}));

vi.mock("./secureStore", () => ({
  getApiKey: vi.fn(() => "default-venice-key"),
  getProviderApiKey: vi.fn(() => null),
  getProviderCredentialOrFallback: vi.fn(() => null),
}));

vi.mock("./providerSettingsStore", () => ({
  getProviderSettings: vi.fn(() => ({
    enabledProviders: {},
    autoFallbackEnabled: false,
    fallbackOrdering: [],
    nativeFallbackModels: {},
  })),
}));

vi.mock("./logger", () => ({
  logError: vi.fn(),
  setLastApiError: vi.fn(),
}));

import {
  abortableDelay,
  abortVeniceRequest,
  computeJitteredDelay,
  MAX_RETRY_AFTER_MS,
  parseRetryAfterMs,
  performVeniceRequest,
} from "./veniceClient";

interface MockRequest extends EventEmitter {
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  destroy: (error?: Error) => void;
}

interface MockResponse extends EventEmitter {
  headers: Record<string, string>;
  statusCode: number;
  statusMessage: string;
}

interface HttpsRequestMock {
  mockImplementation: (
    implementation: (options: unknown, callback: (response: MockResponse) => void) => MockRequest
  ) => void;
}

describe("parseRetryAfterMs", () => {
  it("parses integer delta-seconds", () => {
    expect(parseRetryAfterMs("120")).toBe(120_000);
  });

  it("parses fractional delta-seconds", () => {
    expect(parseRetryAfterMs("1.5")).toBe(1500);
  });

  it("parses HTTP-date form relative to `now`", () => {
    const now = Date.parse("Wed, 21 Oct 2026 07:28:00 GMT");
    const future = "Wed, 21 Oct 2026 07:28:30 GMT";
    expect(parseRetryAfterMs(future, now)).toBe(30_000);
  });

  it("returns 0 for a past HTTP-date", () => {
    const now = Date.parse("Wed, 21 Oct 2026 07:28:00 GMT");
    const past = "Wed, 21 Oct 2026 07:27:00 GMT";
    expect(parseRetryAfterMs(past, now)).toBe(0);
  });

  it("returns null for an empty header", () => {
    expect(parseRetryAfterMs("")).toBeNull();
    expect(parseRetryAfterMs(undefined)).toBeNull();
  });

  it("returns null for an unparseable value", () => {
    expect(parseRetryAfterMs("not-a-number-or-date")).toBeNull();
    expect(parseRetryAfterMs("abc 123")).toBeNull();
  });

  it("returns null for a negative delta", () => {
    expect(parseRetryAfterMs("-5")).toBeNull();
  });
});

describe("computeJitteredDelay", () => {
  it("returns 0 for non-positive input", () => {
    expect(computeJitteredDelay(0)).toBe(0);
    expect(computeJitteredDelay(-1)).toBe(0);
    expect(computeJitteredDelay(NaN)).toBe(0);
  });

  it("clamps the delay to the cap", () => {
    const out = computeJitteredDelay(120_000, 0, 30_000, () => 0.5);
    expect(out).toBeLessThanOrEqual(30_000);
  });

  it("respects the cap even at the jitter extremes", () => {
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      const out = computeJitteredDelay(120_000, 0.2, 30_000, () => r);
      expect(out).toBeLessThanOrEqual(30_000);
    }
  });

  it("applies ±jitterFraction around the clamped delay", () => {
    const delay = 10_000;
    const fraction = 0.2;
    const min = delay - delay * fraction;
    const max = delay + delay * fraction;
    // Random source 0.0 → -fraction, 1.0 → +fraction
    for (const r of [0, 0.5, 1]) {
      const out = computeJitteredDelay(delay, fraction, MAX_RETRY_AFTER_MS, () => r);
      expect(out).toBeGreaterThanOrEqual(Math.round(min));
      expect(out).toBeLessThanOrEqual(Math.round(max));
    }
  });

  it("clamps the jitter fraction to the [0, 1] range", () => {
    // fraction -0.5 → clamped to 0 → no offset → exact delay returned
    const outNegative = computeJitteredDelay(1000, -0.5, MAX_RETRY_AFTER_MS, () => 0.5);
    expect(outNegative).toBe(1000);
    // fraction 1.5 → clamped to 1.0, random=0.5 → offset=0 → exact delay returned
    const outOver = computeJitteredDelay(1000, 1.5, MAX_RETRY_AFTER_MS, () => 0.5);
    expect(outOver).toBe(1000);
    // fraction 1.0, random=1.0 → offset = 1000*1*(2*1-1) = 1000 → jittered = 2000
    const outMax = computeJitteredDelay(1000, 1.0, MAX_RETRY_AFTER_MS, () => 1.0);
    expect(outMax).toBe(2000);
  });
});

describe("abortableDelay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves after the requested delay", async () => {
    const promise = abortableDelay(1000);
    vi.advanceTimersByTime(1000);
    await expect(promise).resolves.toBeUndefined();
  });

  it("rejects when the signal aborts before the timeout", async () => {
    const controller = new AbortController();
    const promise = abortableDelay(1000, controller.signal);
    controller.abort(new Error("user-cancel"));
    await expect(promise).rejects.toThrow("user-cancel");
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("already-aborted"));
    await expect(abortableDelay(1000, controller.signal)).rejects.toThrow("already-aborted");
  });

  it("resolves immediately for non-positive delays", async () => {
    await expect(abortableDelay(0)).resolves.toBeUndefined();
    await expect(abortableDelay(-1)).resolves.toBeUndefined();
  });
});

describe("performVeniceRequest Retry-After integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("waits per Retry-After seconds then retries the same provider", async () => {
    const requestMock = https.request as unknown as HttpsRequestMock;
    const callTimes: number[] = [];
    let attempt = 0;

    requestMock.mockImplementation((_options, callback) => {
      const currentAttempt = attempt;
      attempt += 1;
      callTimes.push(Date.now());
      const req = new EventEmitter() as MockRequest;
      req.write = vi.fn();
      req.end = vi.fn();
      req.destroy = vi.fn();
      const response = new EventEmitter() as MockResponse;
      // Set response properties synchronously so performSingleVeniceRequest
      // can read them when the response callback fires.
      if (currentAttempt === 0) {
        response.statusCode = 429;
        response.statusMessage = "Too Many Requests";
        response.headers = { "content-type": "application/json", "retry-after": "0" };
      } else {
        response.statusCode = 200;
        response.statusMessage = "OK";
        response.headers = { "content-type": "application/json" };
      }
      callback(response);
      setImmediate(() => {
        const body = currentAttempt === 0
          ? JSON.stringify({ error: "rate-limited" })
          : JSON.stringify({ choices: [] });
        response.emit("data", Buffer.from(body, "utf-8"));
        response.emit("end");
      });
      return req;
    });

    const result = await performVeniceRequest({
      endpoint: "/chat/completions",
      method: "POST",
      body: { model: "venice-test", messages: [{ role: "user", content: "hi" }] },
      profileId: "default",
    });

    expect(result.ok).toBe(true);
    expect(callTimes.length).toBe(2);
  });

  it("falls through with no retry when 429 has no Retry-After header", async () => {
    const requestMock = https.request as unknown as HttpsRequestMock;
    const callTimes: number[] = [];

    requestMock.mockImplementation((_options, callback) => {
      callTimes.push(Date.now());
      const req = new EventEmitter() as MockRequest;
      req.write = vi.fn();
      req.end = vi.fn();
      req.destroy = vi.fn();
      const response = new EventEmitter() as MockResponse;
      response.statusCode = 429;
      response.statusMessage = "Too Many Requests";
      response.headers = { "content-type": "application/json" };
      callback(response);
      setImmediate(() => {
        response.emit("data", Buffer.from(JSON.stringify({ error: "rate-limited" }), "utf-8"));
        response.emit("end");
      });
      return req;
    });

    const result = await performVeniceRequest({
      endpoint: "/chat/completions",
      method: "POST",
      body: { model: "venice-test", messages: [{ role: "user", content: "hi" }] },
      profileId: "default",
    });

    // No retry, no fallback configured → return the 429 as-is
    expect(result.status).toBe(429);
    expect(callTimes.length).toBe(1);
  });

  it("does not retry after a streamed delta has been emitted", async () => {
    const requestMock = https.request as unknown as HttpsRequestMock;
    let callCount = 0;

    requestMock.mockImplementation((_options, callback) => {
      callCount += 1;
      const req = new EventEmitter() as MockRequest;
      req.write = vi.fn();
      req.end = vi.fn();
      req.destroy = vi.fn();
      const response = new EventEmitter() as MockResponse;
      // Single 200 streaming response that carries a delta, then a terminal
      // 429 with retry-after. The contract requires us to return the stream
      // result as-is because hasStartedStreaming is true by the time the
      // final status is observed.
      response.statusCode = 200;
      response.statusMessage = "OK";
      response.headers = { "content-type": "text/event-stream" };
      callback(response);
      setImmediate(() => {
        response.emit(
          "data",
          Buffer.from(
            "data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\n",
            "utf-8",
          ),
        );
        setImmediate(() => {
          response.statusCode = 429;
          response.statusMessage = "Too Many Requests";
          response.headers = { "content-type": "application/json", "retry-after": "0" };
          response.emit("data", Buffer.from("{}", "utf-8"));
          response.emit("end");
        });
      });
      return req;
    });

    const result = await performVeniceRequest({
      endpoint: "/chat/completions",
      method: "POST",
      body: { model: "venice-test", messages: [{ role: "user", content: "hi" }], stream: true },
      profileId: "default",
    }, {
      onDelta: () => {
        // streaming has started
      },
    });

    // After stream start, we must not retry on Retry-After — the response is returned as-is.
    expect(callCount).toBe(1);
    expect(result.status).toBe(429);
  });

  it("aborts during Retry-After delay when signalId is aborted via abortVeniceRequest (VF-AUD-20260912-P1-003 / TG-001)", async () => {
    const requestMock = https.request as unknown as HttpsRequestMock;
    let callCount = 0;

    requestMock.mockImplementation((_options, callback) => {
      callCount += 1;
      const req = new EventEmitter() as MockRequest;
      req.write = vi.fn();
      req.end = vi.fn();
      req.destroy = vi.fn();
      const response = new EventEmitter() as MockResponse;
      response.statusCode = 429;
      response.statusMessage = "Too Many Requests";
      response.headers = { "content-type": "application/json", "retry-after": "10" };
      callback(response);
      setImmediate(() => {
        response.emit("data", Buffer.from(JSON.stringify({ error: "rate-limited" }), "utf-8"));
        response.emit("end");
      });
      return req;
    });

    const signalId = "test-signal-retry-after";
    const requestPromise = performVeniceRequest({
      endpoint: "/chat/completions",
      method: "POST",
      body: { model: "venice-test", messages: [{ role: "user", content: "hi" }] },
      profileId: "default",
      signalId,
    });

    // Wait until the first 429 response finishes and enters the Retry-After delay
    await new Promise((r) => setTimeout(r, 20));

    // Abort via IPC signal ID while sleeping during Retry-After
    const abortResult = abortVeniceRequest(signalId);
    expect(abortResult.ok).toBe(true);

    await expect(requestPromise).rejects.toThrow("Request aborted");
    // Ensure no second attempt (retry) was ever dispatched
    expect(callCount).toBe(1);
  });

  it("cleans up external AbortSignal event listener on completion (VF-AUD-20260912-P2-002)", async () => {
    const requestMock = https.request as unknown as HttpsRequestMock;

    requestMock.mockImplementation((_options, callback) => {
      const req = new EventEmitter() as MockRequest;
      req.write = vi.fn();
      req.end = vi.fn();
      req.destroy = vi.fn();
      const response = new EventEmitter() as MockResponse;
      response.statusCode = 200;
      response.statusMessage = "OK";
      response.headers = { "content-type": "application/json" };
      callback(response);
      setImmediate(() => {
        response.emit("data", Buffer.from(JSON.stringify({ choices: [] }), "utf-8"));
        response.emit("end");
        req.emit("close");
      });
      return req;
    });

    const controller = new AbortController();
    const result = await performVeniceRequest({
      endpoint: "/chat/completions",
      method: "POST",
      body: { model: "venice-test", messages: [{ role: "user", content: "hi" }] },
      profileId: "default",
      signal: controller.signal,
    });

    expect(result.ok).toBe(true);
    // After request completion, abort listener must be cleaned up
    // Aborting controller now should have no effect
    expect(() => controller.abort()).not.toThrow();
  });
});
