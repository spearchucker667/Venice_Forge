// @vitest-environment node

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
  getApiKey: vi.fn(() => "vn-test"),
}));

vi.mock("./logger", () => ({
  logError: vi.fn(),
  setLastApiError: vi.fn(),
}));

import { VENICE_API_STREAM_TIMEOUT_MS } from "../../src/shared/apiConfig";
import { abortVeniceRequest, getVeniceConcurrencyStateForTests, MAX_CONCURRENT_VENICE_REQUESTS, performVeniceRequest } from "./veniceClient";

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

describe("performVeniceRequest streaming safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects successful SSE responses that exceed the local response cap", async () => {
    const requestMock = https.request as unknown as HttpsRequestMock;
    requestMock.mockImplementation((_options, callback) => {
      const req = new EventEmitter() as MockRequest;
      req.write = vi.fn();
      req.destroy = (error?: Error) => {
        req.emit("error", error || new Error("destroyed"));
        req.emit("close");
      };
      req.end = vi.fn(() => {
        const res = new EventEmitter() as MockResponse;
        res.headers = { "content-type": "text/event-stream" };
        res.statusCode = 200;
        res.statusMessage = "OK";
        callback(res);
        res.emit("data", Buffer.alloc(25 * 1024 * 1024 + 1));
      });
      return req;
    });

    await expect(
      performVeniceRequest(
        { endpoint: "/chat/completions", method: "POST", body: { model: "venice-uncensored" } },
        { onDelta: vi.fn() }
      )
    ).rejects.toThrow("Venice response exceeded the local safety limit.");
  });

  it("returns ok:false when the SSE stream ends on truncated UTF-8", async () => {
    const requestMock = https.request as unknown as HttpsRequestMock;
    requestMock.mockImplementation((_options, callback) => {
      const req = new EventEmitter() as MockRequest;
      req.write = vi.fn();
      req.destroy = (error?: Error) => {
        req.emit("error", error || new Error("destroyed"));
        req.emit("close");
      };
      req.end = vi.fn(() => {
        const res = new EventEmitter() as MockResponse;
        res.headers = { "content-type": "text/event-stream" };
        res.statusCode = 200;
        res.statusMessage = "OK";
        callback(res);
        res.emit("data", Buffer.from("data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\n"));
        res.emit("data", Buffer.from([0xe2, 0x82]));
        res.emit("end");
        req.emit("close");
      });
      return req;
    });

    const response = await performVeniceRequest(
      { endpoint: "/chat/completions", method: "POST", body: { model: "venice-uncensored" } },
      { onDelta: vi.fn() },
    );
    expect(response.ok).toBe(false);
    expect(response.body).toMatchObject({ error: "Venice stream ended with a truncated data sequence." });
  });

  it("caps concurrent Venice requests and queues overflow", async () => {
    const requestMock = https.request as unknown as HttpsRequestMock;
    const inflight: Array<{ req: MockRequest; res: MockResponse }> = [];
    requestMock.mockImplementation((_options, callback) => {
      const req = new EventEmitter() as MockRequest;
      req.write = vi.fn();
      req.destroy = (error?: Error) => {
        req.emit("error", error || new Error("destroyed"));
        req.emit("close");
      };
      req.end = vi.fn(() => {
        const res = new EventEmitter() as MockResponse;
        res.headers = { "content-type": "application/json" };
        res.statusCode = 200;
        res.statusMessage = "OK";
        inflight.push({ req, res });
        callback(res);
      });
      return req;
    });

    const requests = Array.from({ length: MAX_CONCURRENT_VENICE_REQUESTS + 2 }, () =>
      performVeniceRequest({ endpoint: "/models", method: "GET" })
    );
    await Promise.resolve();

    expect(getVeniceConcurrencyStateForTests()).toEqual({ active: MAX_CONCURRENT_VENICE_REQUESTS, queued: 2 });
    expect(inflight).toHaveLength(MAX_CONCURRENT_VENICE_REQUESTS);

    const finishCurrent = async () => {
      const current = inflight.splice(0);
      for (const { req, res } of current) {
        res.emit("data", Buffer.from("{}"));
        res.emit("end");
        req.emit("close");
      }
      await Promise.resolve();
      await Promise.resolve();
    };

    await finishCurrent();
    expect(inflight).toHaveLength(2);
    await finishCurrent();
    while (inflight.length > 0) {
      await finishCurrent();
    }

    await expect(Promise.all(requests)).resolves.toHaveLength(MAX_CONCURRENT_VENICE_REQUESTS + 2);
    expect(getVeniceConcurrencyStateForTests()).toEqual({ active: 0, queued: 0 });
  });

  it("aborts a queued request waiting for a concurrency slot (VF-AUD-20260912-P2-001)", async () => {
    const requestMock = https.request as unknown as HttpsRequestMock;
    const inflight: Array<{ req: MockRequest; res: MockResponse }> = [];
    requestMock.mockImplementation((_options, callback) => {
      const req = new EventEmitter() as MockRequest;
      req.write = vi.fn();
      req.end = vi.fn();
      req.destroy = vi.fn();
      const res = new EventEmitter() as MockResponse;
      res.headers = { "content-type": "application/json" };
      res.statusCode = 200;
      res.statusMessage = "OK";
      inflight.push({ req, res });
      callback(res);
      return req;
    });

    // Fill up all active slots
    const activeReqs = Array.from({ length: MAX_CONCURRENT_VENICE_REQUESTS }, () =>
      performVeniceRequest({ endpoint: "/models", method: "GET" })
    );
    await Promise.resolve();

    expect(getVeniceConcurrencyStateForTests()).toEqual({ active: MAX_CONCURRENT_VENICE_REQUESTS, queued: 0 });

    // Enqueue an 11th request with a signalId
    const queuedPromise = performVeniceRequest({
      endpoint: "/models",
      method: "GET",
      signalId: "queued-slot-test",
    });
    await Promise.resolve();

    expect(getVeniceConcurrencyStateForTests()).toEqual({ active: MAX_CONCURRENT_VENICE_REQUESTS, queued: 1 });

    // Abort the queued request before any active request completes
    const abortResult = abortVeniceRequest("queued-slot-test");
    expect(abortResult.ok).toBe(true);

    await expect(queuedPromise).rejects.toThrow("Request aborted");
    expect(getVeniceConcurrencyStateForTests()).toEqual({ active: MAX_CONCURRENT_VENICE_REQUESTS, queued: 0 });

    // Clean up inflight requests
    for (const { req, res } of inflight) {
      res.emit("data", Buffer.from("{}"));
      res.emit("end");
      req.emit("close");
    }
    await Promise.all(activeReqs);
    expect(getVeniceConcurrencyStateForTests()).toEqual({ active: 0, queued: 0 });
  });

  it("aborts a healthy SSE trickle at the absolute stream lifetime (VCS-P2-005)", async () => {
    vi.useFakeTimers();
    const requestMock = https.request as unknown as HttpsRequestMock;
    let destroyedError: Error | undefined;
    let destroyCount = 0;
    const sseFrame = Buffer.from('data: {"choices":[{"delta":{"content":"."}}]}\n\n');
    requestMock.mockImplementation((_options, callback) => {
      const req = new EventEmitter() as MockRequest;
      let trickle: ReturnType<typeof setInterval> | undefined;
      req.write = vi.fn();
      req.destroy = (error?: Error) => {
        destroyCount += 1;
        destroyedError = error || new Error("destroyed");
        if (trickle) clearInterval(trickle);
        req.emit("error", destroyedError);
        req.emit("close");
      };
      req.end = vi.fn(() => {
        const res = new EventEmitter() as MockResponse;
        res.headers = { "content-type": "text/event-stream" };
        res.statusCode = 200;
        res.statusMessage = "OK";
        callback(res);
        res.emit("data", sseFrame);
        trickle = setInterval(() => {
          res.emit("data", sseFrame);
        }, 10_000);
      });
      return req;
    });

    const onDelta = vi.fn();
    const promise = performVeniceRequest(
      { endpoint: "/chat/completions", method: "POST", body: { model: "venice-uncensored" } },
      { onDelta },
    ).catch((err: unknown) => err);

    await vi.advanceTimersByTimeAsync(0);
    expect(onDelta).toHaveBeenCalled();
    expect(destroyedError).toBeUndefined();

    await vi.advanceTimersByTimeAsync(VENICE_API_STREAM_TIMEOUT_MS - 1);
    expect(destroyedError).toBeUndefined();
    expect(destroyCount).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(destroyedError).toBeDefined();
    expect(destroyedError?.message).toMatch(/timed out after 5 minutes/i);
    expect(destroyCount).toBe(1);

    const err = await promise;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/timed out after 5 minutes/i);
  });

  it("does not apply the SSE absolute lifetime to non-streaming requests (VCS-P2-005)", async () => {
    vi.useFakeTimers();
    const requestMock = https.request as unknown as HttpsRequestMock;
    let destroyed = false;
    let pendingReq: MockRequest | undefined;
    let pendingRes: MockResponse | undefined;
    requestMock.mockImplementation((_options, callback) => {
      const req = new EventEmitter() as MockRequest;
      req.write = vi.fn();
      req.destroy = (error?: Error) => {
        destroyed = true;
        req.emit("error", error || new Error("destroyed"));
        req.emit("close");
      };
      req.end = vi.fn(() => {
        const res = new EventEmitter() as MockResponse;
        res.headers = { "content-type": "application/json" };
        res.statusCode = 200;
        res.statusMessage = "OK";
        pendingReq = req;
        pendingRes = res;
        callback(res);
      });
      return req;
    });

    const promise = performVeniceRequest({ endpoint: "/models", method: "GET" });
    await vi.advanceTimersByTimeAsync(VENICE_API_STREAM_TIMEOUT_MS + 5_000);
    expect(destroyed).toBe(false);

    pendingRes!.emit("data", Buffer.from("{}"));
    pendingRes!.emit("end");
    pendingReq!.emit("close");
    await expect(promise).resolves.toMatchObject({ ok: true, status: 200 });
  });

  it("lets a user abort win over the SSE absolute lifetime (VCS-P2-005)", async () => {
    vi.useFakeTimers();
    const requestMock = https.request as unknown as HttpsRequestMock;
    let destroyCount = 0;
    let lastDestroyMessage: string | undefined;
    requestMock.mockImplementation((_options, callback) => {
      const req = new EventEmitter() as MockRequest;
      req.write = vi.fn();
      req.destroy = (error?: Error) => {
        destroyCount += 1;
        lastDestroyMessage = error?.message;
        req.emit("error", error || new Error("destroyed"));
        req.emit("close");
      };
      req.end = vi.fn(() => {
        const res = new EventEmitter() as MockResponse;
        res.headers = { "content-type": "text/event-stream" };
        res.statusCode = 200;
        res.statusMessage = "OK";
        callback(res);
        res.emit("data", Buffer.from('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n'));
      });
      return req;
    });

    const promise = performVeniceRequest(
      {
        endpoint: "/chat/completions",
        method: "POST",
        body: { model: "venice-uncensored" },
        signalId: "sse-absolute-deadline-abort",
      },
      { onDelta: vi.fn() },
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(abortVeniceRequest("sse-absolute-deadline-abort")).toEqual({ ok: true });
    await expect(promise).rejects.toThrow("Request aborted");
    expect(lastDestroyMessage).toBe("Request aborted");
    expect(destroyCount).toBe(1);

    await vi.advanceTimersByTimeAsync(VENICE_API_STREAM_TIMEOUT_MS + 1_000);
    expect(destroyCount).toBe(1);
    expect(lastDestroyMessage).toBe("Request aborted");
  });
});
