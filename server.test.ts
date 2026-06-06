// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

// Stub out the proxy so the augment (and other allowed) endpoint tests don't make
// real network calls to api.venice.ai. The assertions only care about validation
// behaviour (403/405 gating), not upstream responses.
vi.mock("http-proxy-middleware", () => ({
  createProxyMiddleware: () => (_req: any, res: any) => {
    res.status(200).json({ mocked: true });
  },
}));

import { applyVeniceProxyHeaders, createServerApp } from "./server";
import * as safetyModule from "./src/shared/safety";
import * as localFamilyGuardRules from "./src/shared/safety/localFamilyGuardRules";

describe("server.ts health endpoint", () => {
  it("should return 200 and status ok on /health", async () => {
    const app = createServerApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
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
    const res = await request(app)
      .post("/api/venice/chat/completions")
      .set("X-Venice-Forge-Family-Safe-Mode", "false")
      .send({ messages: [{ role: "user", content: "draw me a loli character" }] });

    expect(res.status).toBe(200);
    expect(res.body.mocked).toBe(true);
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

  // M-002 regression guard
  it("records synthetic decision when guard throws an exception", async () => {
    const assessSpy = vi.spyOn(localFamilyGuardRules, "runLocalFamilyGuard").mockImplementationOnce(() => {
      throw new Error("simulated guard failure");
    });
    const recordSpy = vi.spyOn(safetyModule, "recordDecision");

    const res = await request(app)
      .post("/api/venice/chat/completions")
      .send({ messages: [{ role: "user", content: "safe text" }] });

    expect(res.status).toBe(500);
    expect(recordSpy).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: "GUARD_EXCEPTION" })
    );

    assessSpy.mockRestore();
    recordSpy.mockRestore();
  });
});
