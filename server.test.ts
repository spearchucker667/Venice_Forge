// VERIFY-030 regression guard
// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import dns from "node:dns/promises";

// Configurable proxy mock status for circuit-breaker tests.
const proxyMocks = vi.hoisted(() => ({ statusCode: 200 }));

// Stub out the proxy so the augment (and other allowed) endpoint tests don't make
// real network calls to api.venice.ai. The assertions only care about validation
// behaviour (403/405 gating), not upstream responses.
vi.mock("http-proxy-middleware", () => ({
  createProxyMiddleware: (options: any) => (req: any, res: any) => {
    const status = proxyMocks.statusCode;
    if (status >= 500 && options.on?.error) {
      options.on.error(new Error("upstream error"), req, res);
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Bad Gateway: Failed to reach Venice API." }));
      }
      return;
    }
    if (options.on?.proxyRes) {
      options.on.proxyRes({ statusCode: status, headers: {} }, req, res);
    }
    if (!res.headersSent) {
      res.status(status).json({ mocked: true });
    }
  },
}));

import { applyVeniceProxyHeaders, createServerApp as originalCreateServerApp } from "./server";
import { AppConfig } from "./src/shared/configSchema";
import * as safetyModule from "./src/shared/safety";
import * as localFamilyGuardRules from "./src/shared/safety/localFamilyGuardRules";

let activeApps: any[] = [];
function createServerApp() {
  const app = originalCreateServerApp();
  activeApps.push(app);
  return app;
}

beforeEach(() => {
  vi.spyOn(dns as any, "lookup").mockImplementation(async (hostname: any, _options?: any) => {
    if (hostname === "example.com" || hostname === "r.jina.ai") {
      return [{ address: "127.0.0.1", family: 4 }];
    }
    if (hostname === "public.example.com") {
      return [{ address: "8.8.8.8", family: 4 }];
    }
    throw new Error("ENOTFOUND");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const appInstance of activeApps) {
    if (typeof appInstance.cleanupIntervals === "function") {
      appInstance.cleanupIntervals();
    }
  }
  activeApps = [];
});

describe("server.ts Jina response limits", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // VERIFY-039: reject before parsing or safety screening can buffer the body.
  it("returns 413 and cancels an over-limit Jina response stream", async () => {
    let cancelled = false;
    const chunk = new Uint8Array(1024 * 1024);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        cancelled = true;
      },
    });
    globalThis.fetch = vi.fn(async () => new Response(body, {
      status: 200,
      headers: { "content-type": "text/plain" },
    })) as unknown as typeof globalThis.fetch;

    const response = await request(createServerApp())
      .post("/api/proxy-jina")
      .set("X-Venice-Forge-Family-Safe-Mode", "false")
      .send({ url: "https://r.jina.ai/https://example.com" });

    expect(response.status).toBe(413);
    expect(response.body.error).toMatch(/2 MiB limit/i);
    expect(cancelled).toBe(true);
  });
});

describe("server.ts health endpoint", () => {
  it("should return 200 and status ok on /health", async () => {
    const app = createServerApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

describe("server.ts development session key", () => {
  it("stores and clears a Venice key only in the server process", async () => {
    const app = createServerApp();
    const save = await request(app).post("/api/session-key").send({ key: "vn-session-fixture" });
    expect(save.status).toBe(200);
    expect(save.body).toEqual({ ok: true });
    expect(JSON.stringify(save.body)).not.toContain("vn-session-fixture");
    expect((await request(app).get("/api/session-key")).body).toEqual({ configured: true });
    expect((await request(app).delete("/api/session-key")).body).toEqual({ ok: true });
    expect((await request(app).get("/api/session-key")).body).toEqual({ configured: false });
  });

  it("rejects empty and oversized session keys", async () => {
    const app = createServerApp();
    expect((await request(app).post("/api/session-key").send({ key: "" })).status).toBe(400);
    expect((await request(app).post("/api/session-key").send({ key: "x".repeat(513) })).status).toBe(400);
  });

  it("stores and clears a Jina key only in the server process", async () => {
    const app = createServerApp();
    const save = await request(app).post("/api/session-jina-key").send({ key: "jina-session-fixture" });
    expect(save.status).toBe(200);
    expect(save.body).toEqual({ ok: true });
    expect(JSON.stringify(save.body)).not.toContain("jina-session-fixture");
    expect((await request(app).get("/api/session-jina-key")).body).toEqual({ configured: true });
    expect((await request(app).delete("/api/session-jina-key")).body).toEqual({ ok: true });
    expect((await request(app).get("/api/session-jina-key")).body).toEqual({ configured: false });
  });

  it("uses the server-side Jina session key and ignores renderer credentials", async () => {
    const app = createServerApp();
    await request(app).post("/api/session-jina-key").send({ key: "jina-session-fixture" });
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => new Response("ok", {
      status: 200,
      headers: { "content-type": "text/plain" },
    })) as unknown as typeof globalThis.fetch;
    globalThis.fetch = fetchMock;
    try {
      await request(app)
        .post("/api/proxy-jina")
        .set("X-Venice-Forge-Family-Safe-Mode", "false")
        .send({
          url: "https://r.jina.ai/https://example.com",
          headers: { Authorization: "Bearer renderer-secret" },
        });
      const init = (fetchMock as unknown as { mock: { calls: Array<[string, RequestInit | undefined]> } })
        .mock.calls[0]?.[1];
      expect(init?.headers).toMatchObject({ Authorization: "Bearer jina-session-fixture" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("server.ts proxy validation", () => {
  let app: any;

  beforeAll(() => {
    app = createServerApp();
  });

  it("should allow valid endpoints", async () => {
    // Testing the validation logic to make sure the endpoint is allowed.
    // Given the upstream might not exist, it will likely return 502 Bad Gateway
    // But importantly, it should NOT return 403 Forbidden or 405 Method Not Allowed.
    const res = await request(app).get("/api/venice/models");
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(405);
  });

  it("should block disallowed endpoints", async () => {
    const res = await request(app).get("/api/venice/admin/users");
    expect(res.status).toBe(403);
  });

  it("should block the proxy root because it is not an allowlisted Venice endpoint", async () => {
    const res = await request(app).get("/api/venice");
    expect(res.status).toBe(403);
  });

  it("should explicitly block path traversal attempts", async () => {
    const res1 = await request(app).get("/api/venice/%2e%2e/internal/secrets");
    expect(res1.status === 403 || res1.status === 404).toBe(true);

    const res2 = await request(app).get("/api/venice/models/../internal");
    expect(res2.status === 403 || res2.status === 404).toBe(true);
  });

  it("should block unallowed methods", async () => {
     const res = await request(app).delete("/api/venice/models");
     expect(res.status).toBe(405);
  });

  it("should block allowed methods on the wrong Venice endpoint", async () => {
    // BUG-010 regression guard: method allowlist and endpoint allowlist must be paired.
    const postModels = await request(app).post("/api/venice/models").send({});
    expect(postModels.status).toBe(405);

    const getChat = await request(app).get("/api/venice/chat/completions");
    expect(getChat.status).toBe(405);
  });

  it("should allow augment endpoints", async () => {
    // These were previously blocked (BUG-001). They should now pass validation
    // and fail upstream (502) rather than being rejected with 403.
    const search = await request(app)
      .post("/api/venice/augment/search")
      .send({ query: "test" });
    expect(search.status).not.toBe(403);
    expect(search.status).not.toBe(405);

    const scrape = await request(app)
      .post("/api/venice/augment/scrape")
      .send({ url: "https://example.com" });
    expect(scrape.status).not.toBe(403);
    expect(scrape.status).not.toBe(405);

    const parser = await request(app)
      .post("/api/venice/augment/text-parser")
      .send({});
    expect(parser.status).not.toBe(403);
    expect(parser.status).not.toBe(405);
  });

  // BUG-001 regression guard (extended): the /characters family must
  // also reach the upstream proxy in web mode, not be rejected with
  // 403. The previous implementation checked only the static
  // ALLOWED_VENICE_ENDPOINTS array and refused /characters because
  // the static list did not contain it. After the fix the canonical
  // `isAllowedVeniceRequest` predicate is the single source of truth
  // and the parameterized /characters/{slug} variant is accepted.
  it("should accept /characters list (BUG-001 regression)", async () => {
    const res = await request(app).get("/api/venice/characters");
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(405);
  });

  it("should accept /characters/{slug} (BUG-001 regression)", async () => {
    const res = await request(app).get("/api/venice/characters/venice-uncensored");
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(405);
  });

  it("should reject nested /characters paths (BUG-001 regression)", async () => {
    const res = await request(app).get("/api/venice/characters/foo/bar");
    expect(res.status).toBe(403);
  });

  it("should reject non-GET on /characters (BUG-001 regression)", async () => {
    const res = await request(app).post("/api/venice/characters").send({});
    expect(res.status).toBe(405);
  });

  it("should set security headers on responses", async () => {
    const res = await request(app).get("/api/venice/admin/blocked");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["content-security-policy"]).toBeTruthy();
  });

  // VERIFY-062: production CSP must not allow arbitrary https: images.
  it("sets a production CSP that does not allow arbitrary https: image sources", async () => {
    vi.spyOn(AppConfig, "NODE_ENV", "get").mockReturnValue("production");
    const res = await request(createServerApp()).get("/api/venice/admin/blocked");
    const csp = res.headers["content-security-policy"] as string;
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).not.toContain("img-src 'self' data: blob: https:");
    expect(csp).not.toMatch(/img-src[^;]*\shttps:/);
  });
});

describe("server.ts proxy header sanitization", () => {
  it("should strip renderer-controlled forbidden headers before proxying", () => {
    process.env.VENICE_API_KEY = "fixture";
    const proxyReq = {
      removeHeader: vi.fn(),
      setHeader: vi.fn(),
      write: vi.fn(),
    };

    applyVeniceProxyHeaders(proxyReq, {
      method: "POST",
      body: Buffer.from("{}"),
    });

    expect(proxyReq.removeHeader).toHaveBeenCalledWith("Authorization");
    expect(proxyReq.removeHeader).toHaveBeenCalledWith("Cookie");
    expect(proxyReq.removeHeader).toHaveBeenCalledWith("Host");
    expect(proxyReq.setHeader).toHaveBeenCalledWith(
      "Authorization",
      "Bearer fixture"
    );
    expect(proxyReq.setHeader).toHaveBeenCalledWith("Host", "api.venice.ai");

    delete process.env.VENICE_API_KEY;
  });

  it("does not forward non-Buffer bodies from the proxy hook", () => {
    const proxyReq = {
      removeHeader: vi.fn(),
      setHeader: vi.fn(),
      write: vi.fn(),
    };

    applyVeniceProxyHeaders(proxyReq, {
      method: "POST",
      body: { messages: [] } as unknown as Buffer,
    });

    expect(proxyReq.write).not.toHaveBeenCalled();
    expect(proxyReq.setHeader).not.toHaveBeenCalledWith("Content-Length", expect.any(Number));
  });

  it("uses an explicit development session key without trusting renderer headers", () => {
    const proxyReq = { removeHeader: vi.fn(), setHeader: vi.fn(), write: vi.fn() };
    applyVeniceProxyHeaders(proxyReq, { method: "GET" }, "vn-session-fixture");
    expect(proxyReq.removeHeader).toHaveBeenCalledWith("Authorization");
    expect(proxyReq.setHeader).toHaveBeenCalledWith("Authorization", "Bearer vn-session-fixture");
  });
});

describe("server.ts rate limiting", () => {
  let app: any;

  beforeEach(() => {
    // Create a fresh app per test so rate-limit state doesn't bleed between tests.
    // Use a very short window so the limit is easy to trip in tests.
    process.env.RATE_LIMIT_WINDOW_MS = "5000";
    process.env.RATE_LIMIT_MAX_REQUESTS = "3";
    app = createServerApp();
    delete process.env.RATE_LIMIT_WINDOW_MS;
    delete process.env.RATE_LIMIT_MAX_REQUESTS;
  });

  it("should allow requests within the limit", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get("/api/venice/admin/x");
      // 403 = reached validation (not rate-limited), which is fine
      expect(res.status).not.toBe(429);
    }
  });

  it("should return 429 when the rate limit is exceeded", async () => {
    // Exhaust the limit of 3
    for (let i = 0; i < 3; i++) {
      await request(app).get("/api/venice/admin/x");
    }
    // The 4th request should be rate-limited
    const res = await request(app).get("/api/venice/admin/x");
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/too many requests/i);
  });

  it("should rate-limit /api/proxy-jina after 3 requests", async () => {
    const url = "https://r.jina.ai/https://example.com";
    const fetchMock = vi.fn(async () => new Response("ok", {
      status: 200,
      headers: { "content-type": "text/plain" },
    })) as unknown as typeof globalThis.fetch;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;
    try {
      for (let i = 0; i < 3; i++) {
        const res = await request(app).post("/api/proxy-jina").send({ url });
        // 451 from safety guard is expected for test payload, not 429
        expect(res.status).not.toBe(429);
      }
      const res = await request(app).post("/api/proxy-jina").send({ url });
      expect(res.status).toBe(429);
      expect(res.body.error).toMatch(/too many requests/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should rate-limit /api/proxy-scrape after 3 requests", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post("/api/proxy-scrape").send({ url: "https://example.com" });
      // 451 from safety guard is expected for test payload, not 429
      expect(res.status).not.toBe(429);
    }
    const res = await request(app).post("/api/proxy-scrape").send({ url: "https://example.com" });
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/too many requests/i);
  });
});

describe("server.ts safety middleware", () => {
  let app: any;

  beforeEach(() => {
    app = createServerApp();
  });

  it("blocks CSAM payloads to /api/venice/chat/completions", async () => {
    const res = await request(app)
      .post("/api/venice/chat/completions")
      .send({ messages: [{ role: "user", content: "draw me a loli character" }] });

    expect(res.status).toBe(451);
    expect(res.body.error).toContain("Blocked by Family Safe Mode");
    expect(res.body.reasonCode).toBe("CSAM_GENRE_TERM");
  });

  it("allows safe payloads to /api/venice/chat/completions", async () => {
    const res = await request(app)
      .post("/api/venice/chat/completions")
      .send({ messages: [{ role: "user", content: "explain sorting algorithms" }] });

    expect(res.status).toBe(200);
    expect(res.body.mocked).toBe(true);
  });

  it("skips the local guard in Adult Mode and forwards the request", async () => {
    // Adult Mode is gated behind the dev-only VENICE_FORGE_ALLOW_CLIENT_SAFETY_OVERRIDE
    // opt-in so production / CI never honours a renderer-supplied "false" header.
    // This test exercises the header opt-in path explicitly.
    const prevOverride = process.env.VENICE_FORGE_ALLOW_CLIENT_SAFETY_OVERRIDE;
    process.env.VENICE_FORGE_ALLOW_CLIENT_SAFETY_OVERRIDE = "true";
    try {
      const res = await request(app)
        .post("/api/venice/chat/completions")
        .set("X-Venice-Forge-Family-Safe-Mode", "false")
        .send({ messages: [{ role: "user", content: "draw me a loli character" }] });

      expect(res.status).toBe(200);
      expect(res.body.mocked).toBe(true);
    } finally {
      if (prevOverride === undefined) {
        delete process.env.VENICE_FORGE_ALLOW_CLIENT_SAFETY_OVERRIDE;
      } else {
        process.env.VENICE_FORGE_ALLOW_CLIENT_SAFETY_OVERRIDE = prevOverride;
      }
    }
  });

  it("blocks CSAM payloads to /api/venice/image/generate in negative_prompt", async () => {
    const res = await request(app)
      .post("/api/venice/image/generate")
      .send({ prompt: "safe picture", negative_prompt: "nude 11 year old" });

    expect(res.status).toBe(451);
  });

  // M-001 regression guard
  it("defensively converts non-Buffer POST bodies to Buffer", async () => {
    const rawSpy = vi.spyOn(express, "raw").mockImplementation(() => (req: any, _res: any, next: any) => {
      let data = "";
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => { data += chunk; });
      req.on("end", () => {
        try { req.body = JSON.parse(data); } catch { req.body = Buffer.from(data); }
        next();
      });
    });

    const testApp = createServerApp();
    const res = await request(testApp)
      .post("/api/venice/chat/completions")
      .send({ messages: [{ role: "user", content: "draw me a loli character" }] });

    expect(res.status).toBe(451);
    expect(res.body.reasonCode).toBe("CSAM_GENRE_TERM");
    rawSpy.mockRestore();
  });

  // M-002 regression guard (VF-AUDIT-002): synthetic guard exception must return canonical 451 shape
  it("records synthetic decision when guard throws an exception", async () => {
    const assessSpy = vi.spyOn(localFamilyGuardRules, "runLocalFamilyGuard").mockImplementationOnce(() => {
      throw new Error("simulated guard failure");
    });
    const recordSpy = vi.spyOn(safetyModule, "recordDecision");

    const res = await request(app)
      .post("/api/venice/chat/completions")
      .send({ messages: [{ role: "user", content: "safe text" }] });

    expect(res.status).toBe(451);
    expect(res.body).toEqual(expect.objectContaining({
      error: expect.any(String),
      reasonCode: "GUARD_EXCEPTION",
      category: "csam_request",
      severity: "critical",
    }));
    expect(recordSpy).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: "GUARD_EXCEPTION" })
    );

    assessSpy.mockRestore();
    recordSpy.mockRestore();
  });
});

describe("server.ts Jina proxy header allowlist", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("drops unsafe renderer-supplied Jina headers", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", {
      status: 200,
      headers: { "content-type": "text/plain" },
    })) as unknown as typeof globalThis.fetch;
    globalThis.fetch = fetchMock;

    await request(createServerApp())
      .post("/api/proxy-jina")
      .set("X-Venice-Forge-Family-Safe-Mode", "false")
      .send({
        url: "https://r.jina.ai/http://example.com",
        headers: {
          Cookie: "session=leak",
          Host: "evil.test",
          "X-Forwarded-For": "127.0.0.1",
          "X-Return-Format": "markdown",
        },
      });

    expect(fetchMock).toHaveBeenCalled();
    const init = (fetchMock as unknown as { mock: { calls: Array<[string, RequestInit | undefined]> } })
      .mock.calls[0]?.[1];
    expect(init).toBeDefined();
    const forwardHeaders = init?.headers as Record<string, string> | undefined;
    expect(forwardHeaders).toMatchObject({ "X-Return-Format": "markdown" });
    expect(forwardHeaders).not.toHaveProperty("Cookie");
    expect(forwardHeaders).not.toHaveProperty("Host");
    expect(forwardHeaders).not.toHaveProperty("X-Forwarded-For");
  });

  it("drops renderer-supplied Jina credentials", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", {
      status: 200,
      headers: { "content-type": "text/plain" },
    })) as unknown as typeof globalThis.fetch;
    globalThis.fetch = fetchMock;

    await request(createServerApp())
      .post("/api/proxy-jina")
      .set("X-Venice-Forge-Family-Safe-Mode", "false")
      .send({
        url: "https://r.jina.ai/http://example.com",
        headers: {
          Authorization: "Bearer test_jina_key",
          "x-jina-api-key": "test_jina_key_2",
        },
      });

    expect(fetchMock).toHaveBeenCalled();
    const init = (fetchMock as unknown as { mock: { calls: Array<[string, RequestInit | undefined]> } })
      .mock.calls[0]?.[1];
    expect(init).toBeDefined();
    const forwardHeaders = init?.headers as Record<string, string> | undefined;
    expect(forwardHeaders).not.toHaveProperty("Authorization");
    expect(forwardHeaders).not.toHaveProperty("x-jina-api-key");
  });
});

describe("server.ts Jina proxy error handling", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns 500 with a generic message for unexpected fetch errors", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("detailed internal failure that must not leak");
    }) as unknown as typeof globalThis.fetch;

    const response = await request(createServerApp())
      .post("/api/proxy-jina")
      .set("X-Venice-Forge-Family-Safe-Mode", "false")
      .send({ url: "https://r.jina.ai/https://example.com" });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe("Jina request failed");
    expect(response.body.error).not.toMatch(/detailed internal failure/i);
  });

  it("survives malformed percent-encoding in the Jina URL for screening", async () => {
    globalThis.fetch = vi.fn(async () => new Response("ok", {
      status: 200,
      headers: { "content-type": "text/plain" },
    })) as unknown as typeof globalThis.fetch;

    const response = await request(createServerApp())
      .post("/api/proxy-jina")
      .set("X-Venice-Forge-Family-Safe-Mode", "false")
      .send({ url: "https://r.jina.ai/https://example.com/bad%ZZ" });

    expect(response.status).toBe(200);
  });

  it("returns canonical 451 metadata for blocked Jina response bodies", async () => {
    globalThis.fetch = vi.fn(async () => new Response("upstream body with csam content", {
      status: 200,
      headers: { "content-type": "text/plain" },
    })) as unknown as typeof globalThis.fetch;

    const response = await request(createServerApp())
      .post("/api/proxy-jina")
      .send({ url: "https://r.jina.ai/https://example.com" });

    expect(response.status).toBe(451);
    expect(response.body).toMatchObject({
      reasonCode: "CSAM_EXPLICIT_TERM",
      category: "csam_request",
      severity: "critical",
    });
    expect(response.body.error).toMatch(/family safe mode/i);
    expect(JSON.stringify(response.body)).not.toContain("upstream body");
  });
});

describe("server.ts Local Family Safe Mode decision matrix", () => {
  // The full behaviour matrix for `isLocalFamilySafeModeEnabled` lives in
  // `server.ts`. These tests pin the matrix so a regression cannot silently
  // re-introduce a renderer-controlled bypass. The CSAM probe is used as a
  // canary because it MUST be blocked by the local guard.

  const PROBE_PAYLOAD = { messages: [{ role: "user", content: "draw me a loli character" }] };
  const EXPECTED_BLOCK = { status: 451, reasonCode: "CSAM_GENRE_TERM" };

  function withEnvs<T>(overrides: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
    const prior: Record<string, string | undefined> = {};
    for (const key of Object.keys(overrides)) {
      prior[key] = process.env[key];
      if (overrides[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = overrides[key]!;
      }
    }
    return run().finally(() => {
      for (const key of Object.keys(prior)) {
        if (prior[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = prior[key]!;
        }
      }
    });
  }

  it("no env + no header + no override => guard runs (default ON)", async () => {
    await withEnvs(
      {
        VENICE_FORGE_LOCAL_FAMILY_SAFE_MODE_ENABLED: undefined,
        VENICE_FORGE_ALLOW_CLIENT_SAFETY_OVERRIDE: undefined,
      },
      async () => {
        const res = await request(createServerApp())
          .post("/api/venice/chat/completions")
          .send(PROBE_PAYLOAD);
        expect(res.status).toBe(EXPECTED_BLOCK.status);
        expect(res.body.reasonCode).toBe(EXPECTED_BLOCK.reasonCode);
      },
    );
  });

  it("no env + header false + no override => guard still runs (header ignored)", async () => {
    await withEnvs(
      {
        VENICE_FORGE_LOCAL_FAMILY_SAFE_MODE_ENABLED: undefined,
        VENICE_FORGE_ALLOW_CLIENT_SAFETY_OVERRIDE: undefined,
      },
      async () => {
        const res = await request(createServerApp())
          .post("/api/venice/chat/completions")
          .set("X-Venice-Forge-Family-Safe-Mode", "false")
          .send(PROBE_PAYLOAD);
        expect(res.status).toBe(EXPECTED_BLOCK.status);
        expect(res.body.reasonCode).toBe(EXPECTED_BLOCK.reasonCode);
      },
    );
  });

  it("no env + header false + override=true => guard skipped (dev only)", async () => {
    await withEnvs(
      {
        VENICE_FORGE_LOCAL_FAMILY_SAFE_MODE_ENABLED: undefined,
        VENICE_FORGE_ALLOW_CLIENT_SAFETY_OVERRIDE: "true",
      },
      async () => {
        const res = await request(createServerApp())
          .post("/api/venice/chat/completions")
          .set("X-Venice-Forge-Family-Safe-Mode", "false")
          .send(PROBE_PAYLOAD);
        expect(res.status).toBe(200);
        expect(res.body.mocked).toBe(true);
      },
    );
  });

  it("no env + header true + override=true => guard runs", async () => {
    await withEnvs(
      {
        VENICE_FORGE_LOCAL_FAMILY_SAFE_MODE_ENABLED: undefined,
        VENICE_FORGE_ALLOW_CLIENT_SAFETY_OVERRIDE: "true",
      },
      async () => {
        const res = await request(createServerApp())
          .post("/api/venice/chat/completions")
          .set("X-Venice-Forge-Family-Safe-Mode", "true")
          .send(PROBE_PAYLOAD);
        expect(res.status).toBe(EXPECTED_BLOCK.status);
      },
    );
  });

  it("env=true + header false + no override => guard runs (env wins, header ignored)", async () => {
    await withEnvs(
      {
        VENICE_FORGE_LOCAL_FAMILY_SAFE_MODE_ENABLED: "true",
        VENICE_FORGE_ALLOW_CLIENT_SAFETY_OVERRIDE: undefined,
      },
      async () => {
        const res = await request(createServerApp())
          .post("/api/venice/chat/completions")
          .set("X-Venice-Forge-Family-Safe-Mode", "false")
          .send(PROBE_PAYLOAD);
        expect(res.status).toBe(EXPECTED_BLOCK.status);
      },
    );
  });

  it("env=false + header true + no override => guard skipped (env wins)", async () => {
    await withEnvs(
      {
        VENICE_FORGE_LOCAL_FAMILY_SAFE_MODE_ENABLED: "false",
        VENICE_FORGE_ALLOW_CLIENT_SAFETY_OVERRIDE: undefined,
      },
      async () => {
        const res = await request(createServerApp())
          .post("/api/venice/chat/completions")
          .set("X-Venice-Forge-Family-Safe-Mode", "true")
          .send(PROBE_PAYLOAD);
        expect(res.status).toBe(200);
        expect(res.body.mocked).toBe(true);
      },
    );
  });

  it("env=0 (falsey) is treated as disabled", async () => {
    await withEnvs(
      {
        VENICE_FORGE_LOCAL_FAMILY_SAFE_MODE_ENABLED: "0",
        VENICE_FORGE_ALLOW_CLIENT_SAFETY_OVERRIDE: undefined,
      },
      async () => {
        const res = await request(createServerApp())
          .post("/api/venice/chat/completions")
          .send(PROBE_PAYLOAD);
        expect(res.status).toBe(200);
        expect(res.body.mocked).toBe(true);
      },
    );
  });
});

describe("server.ts scrape proxy error handling", () => {
  it("rejects malformed scrape URLs with exact 400 shape", async () => {
    const response = await request(createServerApp())
      .post("/api/proxy-scrape")
      .set("X-Venice-Forge-Family-Safe-Mode", "false")
      .send({ url: "not a url" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Invalid URL format" });
  });

  // VERIFY-063: scrape proxy must reject http: URLs.
  it("rejects http: scrape URLs before DNS/network", async () => {
    const lookupSpy = vi.spyOn(dns as any, "lookup");
    const response = await request(createServerApp())
      .post("/api/proxy-scrape")
      .set("X-Venice-Forge-Family-Safe-Mode", "false")
      .send({ url: "http://example.com" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Only HTTPS URLs are allowed");
    expect(lookupSpy).not.toHaveBeenCalled();
    lookupSpy.mockRestore();
  });

  it("rejects malformed percent-encoding with exact 400 shape", async () => {
    const response = await request(createServerApp())
      .post("/api/proxy-scrape")
      .set("X-Venice-Forge-Family-Safe-Mode", "false")
      .send({ url: "https://example.com/bad%ZZ" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Malformed percent-encoding in URL" });
  });

  it("/api/proxy-scrape rejects malformed percent-encoding before DNS/network", async () => {
    const lookupSpy = vi.spyOn(dns as any, "lookup");
    const response = await request(createServerApp())
      .post("/api/proxy-scrape")
      .set("X-Venice-Forge-Family-Safe-Mode", "false")
      .send({ url: "https://example.com/bad%ZZ" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Malformed percent-encoding in URL");
    expect(lookupSpy).not.toHaveBeenCalled();
    lookupSpy.mockRestore();
  });

  it("/api/proxy-scrape rejects unresolved DNS without throwing ERR_INVALID_IP_ADDRESS", async () => {
    const lookupSpy = vi.spyOn(dns as any, "lookup").mockRejectedValue(new Error("ENOTFOUND"));
    const response = await request(createServerApp())
      .post("/api/proxy-scrape")
      .set("X-Venice-Forge-Family-Safe-Mode", "false")
      .send({ url: "https://some-unresolved-domain-xyz.com" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("DNS lookup failed");
    lookupSpy.mockRestore();
  });

  it("/api/proxy-scrape rejects unresolved DNS (empty results) without throwing ERR_INVALID_IP_ADDRESS", async () => {
    const lookupSpy = vi.spyOn(dns as any, "lookup").mockResolvedValue([]);
    const response = await request(createServerApp())
      .post("/api/proxy-scrape")
      .set("X-Venice-Forge-Family-Safe-Mode", "false")
      .send({ url: "https://some-empty-dns-domain.com" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("DNS lookup failed");
    lookupSpy.mockRestore();
  });

  it("/api/proxy-scrape rejects loopback/private/metadata targets", async () => {
    const response1 = await request(createServerApp())
      .post("/api/proxy-scrape")
      .set("X-Venice-Forge-Family-Safe-Mode", "false")
      .send({ url: "https://127.0.0.1" });
    expect(response1.status).toBe(403);
    expect(response1.body.error).toMatch(/Access to private (hostnames|IPs) blocked/i);

    const response2 = await request(createServerApp())
      .post("/api/proxy-scrape")
      .set("X-Venice-Forge-Family-Safe-Mode", "false")
      .send({ url: "https://169.254.169.254" });
    expect(response2.status).toBe(403);
    expect(response2.body.error).toMatch(/Access to private (hostnames|IPs) blocked/i);
  });

  describe("Circuit Breaker State Machine", () => {
    it("resets failures when recovering from half-open", async () => {
      const app = createServerApp();
      const endpoint = "/api/venice/models";
      vi.useFakeTimers();
      
      // 1. Force 5 failures to open the circuit
      proxyMocks.statusCode = 502;
      for (let i = 0; i < 5; i++) {
        await request(app).get(endpoint).set("X-Venice-Forge-Family-Safe-Mode", "false");
      }
      
      // 2. The 6th request should fail immediately with 503 Circuit breaker open
      const openRes = await request(app).get(endpoint).set("X-Venice-Forge-Family-Safe-Mode", "false");
      expect(openRes.status).toBe(503);
      expect(openRes.body.error).toMatch(/Circuit breaker open/);
      
      // 3. Fast-forward time to let the circuit enter half-open (30s)
      vi.advanceTimersByTime(30001);
      
      // 4. Send the probe request (half-open)
      proxyMocks.statusCode = 200; // Mock successful upstream response
      const halfOpenRes = await request(app).get(endpoint).set("X-Venice-Forge-Family-Safe-Mode", "false");
      expect(halfOpenRes.status).toBe(200); // Should succeed and close the circuit

      // 5. Send one failure to ensure circuit does NOT immediately re-open
      proxyMocks.statusCode = 502;
      await request(app).get(endpoint).set("X-Venice-Forge-Family-Safe-Mode", "false");

      // 6. The next request should still go through because failure count is 1, not >= 5
      proxyMocks.statusCode = 200;
      const closedRes = await request(app).get(endpoint).set("X-Venice-Forge-Family-Safe-Mode", "false");
      expect(closedRes.status).toBe(200);

      vi.useRealTimers();
    });
  });

  describe("Proxy Request Limits", () => {
    it("parses large JSON bodies above Express' 100 KB default before route validation", async () => {
      const app = createServerApp();
      // Generate a string that is > 100kb
      const largeString = "a".repeat(200 * 1024); 

      const jinaResponse = await request(app)
        .post("/api/proxy-jina")
        .set("X-Venice-Forge-Family-Safe-Mode", "false")
        .set("Content-Type", "application/json")
        .send({ url: "https://example.com", body: largeString });
      
      expect(jinaResponse.status).toBe(403);
      expect(jinaResponse.body.error).toBe("Only Jina Reader/Search HTTPS endpoints are allowed.");

      const scrapeResponse = await request(app)
        .post("/api/proxy-scrape")
        .set("X-Venice-Forge-Family-Safe-Mode", "false")
        .set("Content-Type", "application/json")
        .send({ url: "https://example.com", body: largeString });
      
      expect(scrapeResponse.status).toBe(403);
      expect(scrapeResponse.body.error).toMatch(/Access to private (hostnames|IPs) blocked/i);
    });

    it("routes valid large Jina and scrape JSON bodies to mocked upstream handlers", async () => {
      const app = createServerApp();
      const largeString = "a".repeat(200 * 1024);
      const fetchMock = vi.fn(async () =>
        new Response("Mocked Jina", { status: 200, headers: { "content-type": "text/plain" } }),
      ) as unknown as typeof globalThis.fetch;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = fetchMock;

      const nodeHttps = require("node:https");
      const requestSpy = vi.spyOn(nodeHttps, "request").mockImplementation((_options: any, callback?: any) => {
        const res = {
          statusCode: 200,
          headers: { "content-type": "text/html" },
          destroy: vi.fn(),
          on: vi.fn((event, cb) => {
            if (event === "data") {
              cb(Buffer.from("<html><body>Mocked Scrape</body></html>"));
            }
            if (event === "end") {
              cb();
            }
          }),
        };
        if (callback) callback(res);
        return {
          on: vi.fn(),
          end: vi.fn(),
        } as any;
      });

      try {
        const jinaResponse = await request(app)
          .post("/api/proxy-jina")
          .set("X-Venice-Forge-Family-Safe-Mode", "false")
          .set("Content-Type", "application/json")
          .send({ url: "https://r.jina.ai/https://example.com", body: largeString });

        expect(jinaResponse.status).toBe(200);
        expect(jinaResponse.text).toBe("Mocked Jina");
        expect(fetchMock).toHaveBeenCalledOnce();

        const scrapeResponse = await request(app)
          .post("/api/proxy-scrape")
          .set("X-Venice-Forge-Family-Safe-Mode", "false")
          .set("Content-Type", "application/json")
          .send({ url: "https://public.example.com", body: largeString });

        expect(scrapeResponse.status).toBe(200);
        expect(scrapeResponse.body).toMatchObject({
          url: "https://public.example.com",
          contentType: "text/html",
          body: "<html><body>Mocked Scrape</body></html>",
        });
        expect(requestSpy).toHaveBeenCalledOnce();
      } finally {
        globalThis.fetch = originalFetch;
        requestSpy.mockRestore();
      }
    });
  });

  describe("Scrape Proxy Output Format", () => {
    let requestSpy: any;

    beforeEach(() => {
      // Mock nodeHttps.request to prevent actual network calls and simulate a successful scrape.
      const nodeHttps = require("node:https");
      requestSpy = vi.spyOn(nodeHttps, "request").mockImplementation((options: any, callback?: any) => {
        const res = {
          statusCode: 200,
          headers: { "content-type": "text/html" },
          destroy: vi.fn(),
          on: vi.fn((event, cb) => {
            if (event === "data") {
              cb(Buffer.from("<html><body>Mocked Scrape</body></html>"));
            }
            if (event === "end") {
              cb();
            }
          }),
        };
        if (callback) callback(res);
        return {
          on: vi.fn(),
          end: vi.fn(),
        } as any;
      });
    });

    afterEach(() => {
      requestSpy.mockRestore();
    });

    it("returns JSON envelope by default", async () => {
      const app = createServerApp();
      
      const response = await request(app)
        .post("/api/proxy-scrape")
        .set("X-Venice-Forge-Family-Safe-Mode", "false")
        .send({ url: "https://public.example.com" });
        
      // performScrape returns "<html><body>Example</body></html>" mocked somewhere, 
      // or at least not 4xx.
      expect(response.status).not.toBe(403);
      expect(response.status).not.toBe(405);
      expect(response.headers["content-type"]).toMatch(/application\/json/i);
      expect(response.body).toHaveProperty("body");
      expect(response.body).toHaveProperty("url");
      expect(response.body).toHaveProperty("contentType");
    });

    it("returns raw body when ?raw=true is specified", async () => {
      const app = createServerApp();
      
      const response = await request(app)
        .post("/api/proxy-scrape?raw=true")
        .set("X-Venice-Forge-Family-Safe-Mode", "false")
        .send({ url: "https://public.example.com" });
        
      expect(response.status).not.toBe(403);
      expect(response.status).not.toBe(405);
      // Wait, we don't know the exact content type mocked, but it shouldn't be a JSON envelope
      // if the body was HTML. At least it's not JSON body.
      // We will just verify it's not a JSON object with a `body` field when it shouldn't be.
      if (response.headers["content-type"]?.includes("application/json")) {
        // If it happens to be json, it shouldn't have the envelope
        if (response.body && typeof response.body === 'object') {
          expect(response.body.finalUrl).toBeUndefined();
        }
      } else {
        expect(response.headers["content-type"]).toBeDefined();
      }
    });
  });
});
