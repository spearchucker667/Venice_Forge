/* eslint-disable no-console */
// We intentionally capture console.log/info/warn/error output during
// startBridgeServer() so VERIFY-001 can assert the bearer token is never
// written to stdout. Suppress the project-wide no-console lint rule for
// this test file only.
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { Server as HttpServer } from "http";
import { startBridgeServer, stopBridgeServer, getBridgeToken, validateHeadlessBridgeToken } from "./bridgeServer";
import { performVeniceRequest } from "./veniceClient";
import { assessChildExploitationSafety } from "../../src/shared/safety";

vi.mock("./veniceClient", () => ({
  performVeniceRequest: vi.fn(),
  abortVeniceRequest: vi.fn(() => ({ ok: true })),
  validateVeniceIpcRequest: vi.fn((input) => input),
}));

// Keep the default unit suite independent from Electron's runtime package.
// The real logger imports `electron`; bridge behavior only needs these sinks.
vi.mock("./logger", () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("../../src/shared/safety", () => {
  const assessChildExploitationSafety = vi.fn();
  class SafetyGuardBlockedError extends Error {
    readonly decision: unknown;
    readonly status = 451;
    constructor(decision: unknown) {
      super("Blocked by Family Safe Mode");
      this.name = "SafetyGuardBlockedError";
      this.decision = decision;
    }
  }
  return {
    SafetyGuardBlockedError,
    assessChildExploitationSafety,
    recordDecision: vi.fn(),
    safetyBlockBodyFromResponseScreen: vi.fn((screen: { userMessage: string; reasonCode: string; category: string; severity: string }) => ({
      error: screen.userMessage,
      reasonCode: screen.reasonCode,
      category: screen.category,
      severity: screen.severity,
    })),
    screenResponseBody: vi.fn(() => ({ allowed: true, skipped: false })),
    maybeRunLocalFamilyGuard: vi.fn((input: unknown, enabled: boolean) => {
      if (!enabled) return { allowed: true, skipped: true, reason: "local-family-safe-mode-disabled" };
      const guardDecision = assessChildExploitationSafety(input);
      return guardDecision.allow
        ? { allowed: true, guardDecision }
        : { allowed: false, reason: guardDecision.reasonCode, userMessage: guardDecision.userMessage, guardDecision };
    }),
  };
});

describe("bridgeServer", () => {
  let token: string;
  const port = 5063;
  const host = "127.0.0.1";

  // Captured console output during the startBridgeServer call. The VERIFY-001
  // regression guard inspects this buffer to assert the bearer token is
  // never written to stdout/stderr.
  const startupConsole: string[] = [];
  const origLog = console.log;
  const origInfo = console.info;
  const origWarn = console.warn;
  const origError = console.error;

  beforeAll(async () => {
    vi.mocked(assessChildExploitationSafety).mockReturnValue({
      allow: true,
      action: "allow",
      severity: "safe",
      category: "general_safety",
      reasonCode: "OK",
      userMessage: "OK",
      developerMessage: "OK",
      normalizedChanged: false,
      signals: [],
      audit: {
        decisionId: "123",
        createdAt: new Date().toISOString(),
        promptHash: "abc",
        promptLength: 10,
        matchedFieldPaths: [],
      },
    });

    vi.mocked(performVeniceRequest).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: {},
      body: { data: "mock response" },
      contentType: "application/json",
    });

    // Install console capture around startBridgeServer so VERIFY-001 can
    // assert the token never reaches stdout.
    console.log = (...args: unknown[]) => {
      startupConsole.push(args.map(String).join(" "));
      origLog(...args);
    };
    console.info = (...args: unknown[]) => {
      startupConsole.push(args.map(String).join(" "));
      origInfo(...args);
    };
    console.warn = (...args: unknown[]) => {
      startupConsole.push(args.map(String).join(" "));
      origWarn(...args);
    };
    console.error = (...args: unknown[]) => {
      startupConsole.push(args.map(String).join(" "));
      origError(...args);
    };

    token = await startBridgeServer(port, host);

    console.log = origLog;
    console.info = origInfo;
    console.warn = origWarn;
    console.error = origError;
  });

  afterAll(() => {
    console.log = origLog;
    console.info = origInfo;
    console.warn = origWarn;
    console.error = origError;
    stopBridgeServer();
  });

  it("generates a valid bridge token", () => {
    expect(token).toBeDefined();
    expect(token.length).toBeGreaterThan(0);
    expect(getBridgeToken()).toBe(token);
  });

  it("rejects unauthorized requests", async () => {
    const res = await fetch(`http://${host}:${port}/ping`);
    expect(res.status).toBe(401);
  });

  it("allows authorized requests and proxies them", async () => {
    const res = await fetch(`http://${host}:${port}/ping`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("enforces child safety guard and blocks request if unsafe", async () => {
    vi.mocked(assessChildExploitationSafety).mockReturnValueOnce({
      allow: false,
      action: "block",
      severity: "critical",
      category: "child_sexual_abuse_material",
      reasonCode: "CSAM_DETECTED",
      userMessage: "Safety block",
      developerMessage: "CSAM",
      normalizedChanged: false,
      signals: [],
      audit: {
        decisionId: "456",
        createdAt: new Date().toISOString(),
        promptHash: "xyz",
        promptLength: 10,
        matchedFieldPaths: [],
      },
    });

    const res = await fetch(`http://${host}:${port}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "test payload" }],
      }),
    });

    expect(res.status).toBe(451);
    const json = await res.json();
    // P1-015: bridge server uses the same canonical 451 block body as the
    // IPC path (flat: error / reasonCode / category / severity at top level).
    expect(json.error).toBe("Safety block");
    expect(json.reasonCode).toBe("CSAM_DETECTED");
  });

  // VERIFY-001 regression guard: SEC-1 / Bridge bearer token MUST NOT appear
  // in console output. We capture every console.log/info/warn/error emitted
  // while startBridgeServer is running, then assert the generated token is
  // not present in the joined transcript.
  it("does not log the bearer token to console (VERIFY-001)", () => {
    const transcript = startupConsole.join("\n");
    expect(transcript).not.toContain(token);
    // Also confirm the bridge server does not advertise a "Token:" prefix
    // containing the value in any of its startup log lines.
    expect(transcript).not.toMatch(new RegExp(`Token:\\s*${token}`));
  });

  // VERIFY-002 regression guard: SEC-1.5 / Token comparison must be
  // constant-time. A wrong-length token must still produce a 401, and a
  // same-length-but-wrong token must produce 401. Both paths are guaranteed
  // to call timingSafeEqual in our implementation.
  it("rejects a wrong-length bearer token (VERIFY-002)", async () => {
    const wrongLength = token + "x";
    const res = await fetch(`http://${host}:${port}/ping`, {
      headers: { Authorization: `Bearer ${wrongLength}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a same-length but wrong bearer token (VERIFY-002)", async () => {
    const mutated =
      token.slice(0, -1) +
      (token[token.length - 1] === "0" ? "1" : "0");
    expect(mutated.length).toBe(token.length);
    const res = await fetch(`http://${host}:${port}/ping`, {
      headers: { Authorization: `Bearer ${mutated}` },
    });
    expect(res.status).toBe(401);
  });

  // VERIFY-003 regression guard: SEC-10 / When a streaming client disconnects
  // mid-stream, the bridge MUST call abortVeniceRequest to tear down the
  // upstream HTTPS request. We simulate the disconnect by aborting the
  // fetch ReadableStream after the first delta, then assert abortVeniceRequest
  // was called with the signalId the bridge generated.
  it("aborts the upstream request when the streaming client disconnects (VERIFY-003)", async () => {
    const { abortVeniceRequest, performVeniceRequest } = await import("./veniceClient");
    let capturedSignalId: string | undefined;
    vi.mocked(performVeniceRequest).mockImplementationOnce(
      async (
        _raw: unknown,
        opts?: { onDelta?: (chunk: { content: string; reasoning: string }) => void },
      ) => {
        // Pull the signalId out of the request payload.
        const req = _raw as { signalId?: string };
        capturedSignalId = req.signalId;
        // Emit a single delta so the bridge flushes it to the response
        // before we abort the request.
        opts?.onDelta?.({ content: "hi", reasoning: "" });
        // Hold the upstream "open" by waiting on a never-resolving promise.
        // The bridge's req.on("close") handler should fire and call
        // abortVeniceRequest even though performVeniceRequest is still pending.
        await new Promise(() => {});
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          headers: {},
          body: null,
          contentType: "text/event-stream",
        };
      },
    );

    const controller = new AbortController();
    const res = await fetch(`http://${host}:${port}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        stream: true,
        model: "llama-3.3-70b",
        messages: [{ role: "user", content: "hi" }],
      }),
      signal: controller.signal,
    });
    expect(res.status).toBe(200);
    // Read whatever the bridge flushed, then abort the request. Node's
    // undici fetch will close the underlying socket when the AbortController
    // fires, which causes the bridge's req.on("close") handler to run.
    const reader = res.body?.getReader();
    if (reader) {
      try {
        await reader.read();
      } catch {
        // AbortError is fine — we expected to be cut off.
      }
    }
    controller.abort();

    // Poll for up to 1s for the abort to be observed.
    const deadline = Date.now() + 1000;
    while (Date.now() < deadline) {
      if (vi.mocked(abortVeniceRequest).mock.calls.length > 0) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(capturedSignalId).toBeDefined();
    expect(vi.mocked(abortVeniceRequest)).toHaveBeenCalledWith(capturedSignalId);
  }, 10000);

  // VERIFY-004 regression guard: SEC-9 / The bridge MUST cap request body size
  // to prevent OOM. A 12 MiB JSON body must be rejected with 413 (Payload Too
  // Large). We construct a 12 MiB string of 'a's and POST it to /chat/completions.
  // Regression guard for the 2026-06-09 bug-hunt finding: the bridge MUST
  // pass a signalId to the non-streaming performGuardedVeniceRequest call
  // so the 5-minute timeout can abort the upstream Venice HTTPS request.
  // Before the fix, the non-streaming branch omitted signalId entirely,
  // so the timeout only closed the HTTP response — the upstream request
  // kept running in the background, burning Venice quota.
  //
  // We assert the wiring (signalId is present, non-empty, and a string)
  // rather than running a 5-minute end-to-end timeout. The streaming
  // VERIFY-003 test already proves the abortVeniceRequest + signalId
  // mechanism works end-to-end; the new invariant is that non-streaming
  // requests participate in the same flow.
  it("forwards a signalId for non-streaming requests (regression guard for the 2026-06-09 bridge abort gap)", async () => {
    const { performVeniceRequest } = await import("./veniceClient");
    let capturedRequest: unknown;
    vi.mocked(performVeniceRequest).mockImplementationOnce(async (raw: unknown) => {
      capturedRequest = raw;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {},
        body: { data: "ok" },
        contentType: "application/json",
      };
    });
    const res = await fetch(`http://${host}:${port}/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const req = capturedRequest as { signalId?: unknown };
    expect(req).toBeDefined();
    expect(typeof req.signalId).toBe("string");
    // signalId is crypto.randomUUID() — a 36-char string with hyphens at
    // fixed positions. Asserting the format proves the bridge generated
    // a real ID and did not, e.g., accidentally pass an empty string or
    // a literal "undefined" sentinel.
    expect((req.signalId as string).length).toBe(36);
  }, 5000);

  // VERIFY-004 regression guard: SEC-9 / The bridge MUST cap request body size
  // to prevent OOM. A 12 MiB JSON body must be rejected with 413 (Payload Too
  // Large). We construct a 12 MiB string of 'a's and POST it to /chat/completions.
  it("rejects an oversized request body (VERIFY-004, 10 MiB limit)", async () => {
    const bigPayload = "a".repeat(12 * 1024 * 1024);
    const res = await fetch(`http://${host}:${port}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b",
        messages: [{ role: "user", content: bigPayload }],
      }),
    });
    // express.json({ limit: "10mb" }) returns 413 on oversized payloads.
    expect(res.status).toBe(413);
  });

  it("rejects a non-loopback host at startup", async () => {
    // Stop the existing server so the guard is actually evaluated.
    stopBridgeServer();
    await expect(startBridgeServer(5064, "0.0.0.0")).rejects.toThrow(/Invalid bridge host/);
    await expect(startBridgeServer(5064, "192.168.1.1")).rejects.toThrow(/Invalid bridge host/);
    await expect(startBridgeServer(5064, "example.com")).rejects.toThrow(/Invalid bridge host/);
    await expect(startBridgeServer(5064, "")).rejects.toThrow(/Invalid bridge host/);
    // Restart a valid server for any subsequent tests.
    await startBridgeServer(port, host);
  });
});

describe("validateBridgeTokenStrength (P2-009)", () => {
  it("imports the validator from bridgeServer", async () => {
    const { validateBridgeTokenStrength } = await import("./bridgeServer");
    expect(typeof validateBridgeTokenStrength).toBe("function");
  });

  it("accepts a canonical 32-byte hex token (the generated default)", async () => {
    const { validateBridgeTokenStrength } = await import("./bridgeServer");
    // 64-char hex string with 16 distinct chars (0-9, a-f). Mirrors
    // the actual output of crypto.randomBytes(32).toString("hex").
    const ok = "0123456789abcdef".repeat(4);
    expect(ok.length).toBe(64);
    expect(validateBridgeTokenStrength(ok)).toBeNull();
  });

  it("rejects a too-short env-supplied token", async () => {
    const { validateBridgeTokenStrength } = await import("./bridgeServer");
    expect(validateBridgeTokenStrength("abc")).toMatch(/too short/);
    expect(validateBridgeTokenStrength("dev")).toMatch(/too short/);
  });

  it("rejects a token made entirely of one repeated character (low entropy)", async () => {
    const { validateBridgeTokenStrength } = await import("./bridgeServer");
    const weak = "a".repeat(64);
    expect(validateBridgeTokenStrength(weak)).toMatch(/insufficient entropy/);
  });

  it("rejects a periodic low-entropy token (e.g. 12abc repeating)", async () => {
    const { validateBridgeTokenStrength } = await import("./bridgeServer");
    const weak = "12abc".repeat(13); // 65 chars, but only 4 distinct chars
    expect(validateBridgeTokenStrength(weak)).toMatch(/insufficient entropy/);
  });

  it("rejects an all-whitespace token", async () => {
    const { validateBridgeTokenStrength } = await import("./bridgeServer");
    expect(validateBridgeTokenStrength(" ".repeat(64))).toMatch(/whitespace/);
  });

  it("rejects a non-string input", async () => {
    const { validateBridgeTokenStrength } = await import("./bridgeServer");
    // @ts-expect-error — intentionally passing a bad type to test the runtime guard.
    expect(validateBridgeTokenStrength(12345)).toMatch(/must be a string/);
  });
});

describe("startBridgeServer env-var fallback (P2-009)", () => {
  const port = 5065;
  const host = "127.0.0.1";
  let envBackup: string | undefined;

  beforeAll(() => {
    envBackup = process.env.VENICE_BRIDGE_TOKEN;
  });

  afterAll(() => {
    stopBridgeServer();
    if (envBackup === undefined) {
      delete process.env.VENICE_BRIDGE_TOKEN;
    } else {
      process.env.VENICE_BRIDGE_TOKEN = envBackup;
    }
  });

  it("falls back to a generated token when VENICE_BRIDGE_TOKEN is too short", async () => {
    stopBridgeServer();
    process.env.VENICE_BRIDGE_TOKEN = "abc"; // 3 chars — way below MIN_BRIDGE_TOKEN_LENGTH
    const generated = await startBridgeServer(port, host);
    expect(generated).not.toBe("abc");
    expect(generated.length).toBe(64); // 32 bytes hex
    // The generated token must satisfy the strength validator too.
    const { validateBridgeTokenStrength } = await import("./bridgeServer");
    expect(validateBridgeTokenStrength(generated)).toBeNull();
  }, 10000);

  it("falls back to a generated token when VENICE_BRIDGE_TOKEN is low-entropy", async () => {
    stopBridgeServer();
    process.env.VENICE_BRIDGE_TOKEN = "a".repeat(64); // length ok, but only 1 distinct char
    const generated = await startBridgeServer(port, host);
    expect(generated).not.toBe("a".repeat(64));
    expect(generated.length).toBe(64);
  }, 10000);

  it("accepts a strong VENICE_BRIDGE_TOKEN (the operator path)", async () => {
    stopBridgeServer();
    const strong = "x9K!qL_2#pNz" + "wR4v" + "mZbH" + "Tf8" + "gPj" + "Cy3" + "Ae5" + "Yh1"; // 48 chars, high entropy
    process.env.VENICE_BRIDGE_TOKEN = strong;
    const accepted = await startBridgeServer(port, host);
    expect(accepted).toBe(strong);
  }, 10000);
});

describe("headless bridge token delivery contract", () => {
  it("fails closed when the operator did not provide a retrievable token", () => {
    expect(validateHeadlessBridgeToken(undefined)).toBe("VENICE_BRIDGE_TOKEN is required");
    expect(validateHeadlessBridgeToken("short")).toMatch(/too short/);
    expect(validateHeadlessBridgeToken("A9!bcdefghijklmnopqrstuvwxyz0123456789")).toBeNull();
  });
});

describe("bridgeServer restart lifecycle", () => {
  const port = 5066;
  const host = "127.0.0.1";

  afterAll(() => {
    stopBridgeServer();
  });

  it("waits for an in-flight close before rebinding the same host and port", async () => {
    stopBridgeServer();
    await startBridgeServer(port, host);

    const originalClose = HttpServer.prototype.close;
    const closeSpy = vi.spyOn(HttpServer.prototype, "close").mockImplementation(function delayedClose(
      this: HttpServer,
      callback?: (err?: Error) => void,
    ) {
      setTimeout(() => {
        originalClose.call(this, callback);
      }, 50);
      return this;
    } as typeof HttpServer.prototype.close);

    const stopResult = stopBridgeServer();
    const restart = startBridgeServer(port, host);

    try {
      await Promise.resolve(stopResult);
      await expect(restart).resolves.toBe(getBridgeToken());
    } finally {
      closeSpy.mockRestore();
      stopBridgeServer();
    }
  }, 10000);
});

// Bug 7.1 regression guard: the loopback bridge previously accepted
// unlimited POSTs from any authenticated caller. The IPC layer has its
// own per-channel limiter, but the bridge is reachable from any
// loopback client (renderer, plugin host, automation tool) and from any
// path/method combination, so it needs a separate
// per-(client, method, path) rate-limit before any provider request
// round-trip. The default floors must be at least as strict as the IPC
// STRICT_LIMIT (30/min). /ping is exempt so monitor sweeps do not burn
// the bucket.
describe("bridgeServer rate limiting (Bug 7.1)", () => {
  // Import the pure function. We use a fresh module each test by
  // resetting the buckets before each scenario.
  beforeEach(async () => {
    const { resetBridgeRateLimitForTests } = await import("./bridgeServer");
    resetBridgeRateLimitForTests();
  });

  it("imports checkBridgeRateLimit + resetBridgeRateLimitForTests", async () => {
    const bridge = await import("./bridgeServer");
    expect(typeof (bridge as { checkBridgeRateLimit?: unknown }).checkBridgeRateLimit).toBe("function");
    expect(typeof (bridge as { resetBridgeRateLimitForTests?: unknown }).resetBridgeRateLimitForTests).toBe("function");
  });

  it("allows the first N POST requests and blocks the (N+1)th", async () => {
    const { checkBridgeRateLimit } = await import("./bridgeServer");
    const client = "test-client-strict";
    for (let i = 0; i < 30; i++) {
      expect(checkBridgeRateLimit(client, "POST", "/chat/completions")).toBeNull();
    }
    const denied = checkBridgeRateLimit(client, "POST", "/chat/completions");
    expect(denied).not.toBeNull();
    expect(denied?.limit).toBe(30);
    expect(denied?.windowMs).toBe(60_000);
    expect(denied?.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("allows more GET requests than POST before tripping the limit", async () => {
    const { checkBridgeRateLimit } = await import("./bridgeServer");
    const client = "test-client-relaxed";
    // 120 GET requests should all succeed.
    for (let i = 0; i < 120; i++) {
      expect(checkBridgeRateLimit(client, "GET", "/models")).toBeNull();
    }
    const denied = checkBridgeRateLimit(client, "GET", "/models");
    expect(denied?.limit).toBe(120);
  });

  it("exempts /ping from rate limiting regardless of caller", async () => {
    const { checkBridgeRateLimit } = await import("./bridgeServer");
    const client = "test-ping-client";
    for (let i = 0; i < 200; i++) {
      expect(checkBridgeRateLimit(client, "GET", "/ping")).toBeNull();
    }
  });

  it("uses separate buckets per (client, method, path) tuple", async () => {
    const { checkBridgeRateLimit } = await import("./bridgeServer");
    const clientA = "test-bucket-A";
    const clientB = "test-bucket-B";
    // Burn clientA's POST /chat/completions budget.
    for (let i = 0; i < 30; i++) {
      checkBridgeRateLimit(clientA, "POST", "/chat/completions");
    }
    expect(checkBridgeRateLimit(clientA, "POST", "/chat/completions")).not.toBeNull();
    // clientB remains unaffected.
    expect(checkBridgeRateLimit(clientB, "POST", "/chat/completions")).toBeNull();
    // clientA at a different path remains unaffected.
    expect(checkBridgeRateLimit(clientA, "POST", "/image/generate")).toBeNull();
    // clientA on GET remains unaffected (relaxed limit, fresh bucket).
    expect(checkBridgeRateLimit(clientA, "GET", "/models")).toBeNull();
  });

  it("does not leak state across calls within the same window", async () => {
    const { checkBridgeRateLimit } = await import("./bridgeServer");
    const client = "test-call-shape";
    expect(checkBridgeRateLimit(client, "POST", "/chat/completions")).toBeNull();
    const empty = checkBridgeRateLimit(client, "POST", "/chat/completions");
    expect(empty).toBeNull(); // 2nd call still permitted
  });
});
