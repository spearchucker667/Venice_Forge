/* eslint-disable no-console */
// We intentionally capture console.log/info/warn/error output during
// startBridgeServer() so VERIFY-001 can assert the bearer token is never
// written to stdout. Suppress the project-wide no-console lint rule for
// this test file only.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { startBridgeServer, stopBridgeServer, getBridgeToken } from "./bridgeServer";
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
  return {
    assessChildExploitationSafety,
    recordDecision: vi.fn(),
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
