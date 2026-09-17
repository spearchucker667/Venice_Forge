// VERIFY-030 regression guard
// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import dns from "node:dns/promises";
import nodeHttp from "node:http";
import { EventEmitter } from "node:events";
// Configurable proxy mock status for circuit-breaker tests.
const proxyMocks = vi.hoisted(() => ({
  statusCode: 200,
  lastRequestBody: null as unknown,
  proxyResponse: null as (() => EventEmitter & {
    statusCode: number;
    headers: Record<string, string>;
    pause: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }) | null,
}));

// Stub out the proxy so the augment (and other allowed) endpoint tests don't make
// real network calls to api.venice.ai. The assertions only care about validation
// behaviour (403/405 gating), not upstream responses.
vi.mock("http-proxy-middleware", () => ({
  createProxyMiddleware: (options: any) => (req: any, res: any) => {
    if (req.body !== undefined) proxyMocks.lastRequestBody = req.body;
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
      const proxyResponse = proxyMocks.proxyResponse?.() ?? { statusCode: status, headers: {} };
      options.on.proxyRes(proxyResponse, req, res);
      if (proxyMocks.proxyResponse) return;
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
import { triggerInput } from "./tests/safety/fixtureBuilders";

let activeApps: any[] = [];
function createServerApp() {
  const app = originalCreateServerApp();
  activeApps.push(app);
  return app;
}

function mockSseResponse(
  events: string[] | null,
  terminal: "end" | "error" | "none" = events ? "end" : "none",
): EventEmitter & {
  statusCode: number;
  headers: Record<string, string>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
} {
  const upstream = new EventEmitter() as EventEmitter & {
    statusCode: number;
    headers: Record<string, string>;
    pause: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
  upstream.statusCode = 200;
  upstream.headers = { "content-type": "text/event-stream" };
  upstream.pause = vi.fn();
  upstream.resume = vi.fn();
  upstream.destroy = vi.fn();
  proxyMocks.proxyResponse = () => {
    setImmediate(() => {
      if (events) {
        for (const event of events) upstream.emit("data", Buffer.from(event));
      }
      if (terminal === "end") upstream.emit("end");
      if (terminal === "error") {
        setImmediate(() => upstream.emit("error", new Error("upstream failure")));
      }
    });
    return upstream;
  };
  return upstream;
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
  proxyMocks.lastRequestBody = null;
  vi.restoreAllMocks();
  for (const appInstance of activeApps) {
    if (typeof appInstance.cleanupIntervals === "function") {
      appInstance.cleanupIntervals();
    }
  }
  activeApps = [];
  proxyMocks.proxyResponse = null;
});

beforeEach(() => {
  // Suppress expected proxy errors from reaching stderr during tests.
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("server.ts lifecycle cleanup", () => {
  it("removes per-app process shutdown listeners during test cleanup", () => {
    const beforeExit = process.listenerCount("exit");
    const beforeSigint = process.listenerCount("SIGINT");
    const beforeSigterm = process.listenerCount("SIGTERM");

    const app = createServerApp();

    expect(process.listenerCount("exit")).toBe(beforeExit + 1);
    expect(process.listenerCount("SIGINT")).toBe(beforeSigint + 1);
    expect(process.listenerCount("SIGTERM")).toBe(beforeSigterm + 1);

    (app as express.Application & { cleanupIntervals?: () => void }).cleanupIntervals?.();

    expect(process.listenerCount("exit")).toBe(beforeExit);
    expect(process.listenerCount("SIGINT")).toBe(beforeSigint);
    expect(process.listenerCount("SIGTERM")).toBe(beforeSigterm);
  });
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

describe("server.ts Family Safe Mode SSE lifecycle", () => {
  it("terminates an approved streamed response after the upstream ends", async () => {
    const upstream = mockSseResponse(["data: hello\n\n", "data: [DONE]\n\n"]);
    const response = await request(createServerApp())
      .post("/api/venice/chat/completions")
      .send({ model: "test", messages: [{ role: "user", content: "hello" }] });
    expect(response.status).toBe(200);
    expect(response.text).toContain("data: hello");
    expect(response.text).toContain("data: [DONE]");
    expect(upstream.pause).toHaveBeenCalled();
    expect(upstream.destroy).not.toHaveBeenCalled();
  });

  it("initializes SSE headers for an empty upstream response", async () => {
    const upstream = mockSseResponse([]);
    const response = await request(createServerApp())
      .post("/api/venice/chat/completions")
      .send({ model: "test", messages: [] });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^text\/event-stream/);
    expect(response.text).toBe("");
    expect(upstream.destroy).not.toHaveBeenCalled();
  });

  it("blocks an unsafe first event before sending response headers", async () => {
    const upstream = mockSseResponse([`data: ${triggerInput("CSAM_EXPLICIT")}\n\n`]);
    const response = await request(createServerApp())
      .post("/api/venice/chat/completions")
      .send({ model: "test", messages: [] });

    expect(response.status).toBe(451);
    expect(upstream.destroy).toHaveBeenCalledOnce();
    expect(response.text).not.toContain(triggerInput("CSAM_EXPLICIT"));
  });

  it("ends a partially released response when a later event is unsafe", async () => {
    const upstream = mockSseResponse([
      "data: safe\n\n",
      `data: ${triggerInput("CSAM_EXPLICIT")}\n\n`,
    ]);
    const response = await request(createServerApp())
      .post("/api/venice/chat/completions")
      .send({ model: "test", messages: [] });

    expect(response.status).toBe(200);
    expect(response.text).toContain("data: safe");
    expect(response.text).not.toContain(triggerInput("CSAM_EXPLICIT"));
    expect(upstream.destroy).toHaveBeenCalledOnce();
  });

  it("blocks a choice delta whose unsafe text spans two SSE events", async () => {
    const trigger = triggerInput("CSAM_EXPLICIT");
    const parts = [trigger.slice(0, 2), trigger.slice(2)];
    const events = parts.map((content) =>
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content } }] })}\n\n`,
    );
    const upstream = mockSseResponse([events.join("")]);
    const response = await request(createServerApp())
      .post("/api/venice/chat/completions")
      .send({ model: "test", messages: [] });

    expect(response.status).toBe(200);
    expect(response.text).toContain(events[0]);
    expect(response.text).not.toContain(events[1]);
    expect(upstream.destroy).toHaveBeenCalledOnce();
  });

  it("returns 413 and destroys the upstream when the SSE queue overflows", async () => {
    const upstream = mockSseResponse([
      "data: first\n\n",
      "data: second\n\n",
      "data: third\n\n",
    ]);
    const response = await request(createServerApp())
      .post("/api/venice/chat/completions")
      .send({ model: "test", messages: [] });

    expect(response.status).toBe(413);
    expect(response.body.error).toMatch(/bounded/i);
    expect(upstream.destroy).toHaveBeenCalledOnce();
  });

  it("returns 502 when the SSE upstream errors before sending data", async () => {
    const upstream = mockSseResponse(null, "error");
    const response = await request(createServerApp())
      .post("/api/venice/chat/completions")
      .send({ model: "test", messages: [] });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: "Proxy error" });
    expect(upstream.destroy).toHaveBeenCalledOnce();
  });

  it("ends a partially released response when the SSE upstream errors", async () => {
    const upstream = mockSseResponse(["data: safe\n\n"], "error");
    const response = await request(createServerApp())
      .post("/api/venice/chat/completions")
      .send({ model: "test", messages: [] });

    expect(response.status).toBe(200);
    expect(response.text).toContain("data: safe");
    expect(upstream.destroy).toHaveBeenCalledOnce();
  });

  it("destroys the upstream when the client disconnects before completion", async () => {
    const upstream = mockSseResponse(null);
    let proxyInvoked = false;
    proxyMocks.proxyResponse = () => {
      proxyInvoked = true;
      return upstream;
    };
    const app = createServerApp();
    const listener = app.listen(0);
    await new Promise<void>((resolve) => listener.once("listening", resolve));
    const address = listener.address();
    if (!address || typeof address === "string") throw new Error("expected an ephemeral HTTP port");

    const client = nodeHttp.request({
      host: "127.0.0.1",
      port: address.port,
      path: "/api/venice/chat/completions",
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    client.on("error", () => {});
    client.end(JSON.stringify({ model: "test", messages: [] }));
    await vi.waitFor(() => expect(proxyInvoked).toBe(true));
    client.destroy();
    await vi.waitFor(() => expect(upstream.destroy).toHaveBeenCalledOnce());
    await new Promise<void>((resolve) => listener.close(() => resolve()));
  });
});

describe("server.ts Responses API (alpha) FSM lifecycle", () => {
  const responsesDelta = (delta: string) =>
    `data: ${JSON.stringify({ type: "response.output_text.delta", output_index: 0, content_index: 0, delta })}\n\n`;
  const responsesCompleted =
    `data: ${JSON.stringify({ type: "response.completed", response: { id: "resp_1", status: "completed" } })}\n\n`;

  it("allows POST /responses (allowlist gate, POST-only)", async () => {
    const response = await request(createServerApp())
      .post("/api/venice/responses")
      .send({ model: "test", input: "hello" });
    // The mocked standard proxy answers 200 for allowlisted POSTs.
    expect(response.status).toBe(200);
  });

  it("rejects GET /responses with 405 (method gate)", async () => {
    const response = await request(createServerApp())
      .get("/api/venice/responses");
    expect(response.status).toBe(405);
  });

  it("rejects nested /responses paths with 403 (no wildcard routing)", async () => {
    const response = await request(createServerApp())
      .post("/api/venice/responses/extra")
      .send({ model: "test", input: "hello" });
    expect(response.status).toBe(403);
  });

  it("blocks CSAM payloads in the Responses input array (request guard)", async () => {
    const response = await request(createServerApp())
      .post("/api/venice/responses")
      .send({
        model: "test",
        input: [{ type: "message", role: "user", content: triggerInput("LOLI_TERM") }],
      });
    expect(response.status).toBe(451);
  });

  it("blocks CSAM payloads in a string Responses input", async () => {
    const response = await request(createServerApp())
      .post("/api/venice/responses")
      .send({ model: "test", input: triggerInput("CSAM_EXPLICIT") });
    expect(response.status).toBe(451);
  });

  it("releases a safe Responses SSE stream end-to-end", async () => {
    // Events arrive in ONE upstream chunk: the FSM SSE queue is bounded and
    // multiple synchronous chunks would trip the overflow guard (same
    // constraint as the chat stream tests).
    const upstream = mockSseResponse([
      [
        responsesDelta("Hello "),
        responsesDelta("world"),
        responsesCompleted,
        "data: [DONE]\n\n",
      ].join(""),
    ]);
    const response = await request(createServerApp())
      .post("/api/venice/responses")
      .send({ model: "test", input: "hi" });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^text\/event-stream/);
    expect(response.text).toContain("response.output_text.delta");
    expect(response.text).toContain("data: [DONE]");
    expect(upstream.destroy).not.toHaveBeenCalled();
  });

  it("blocks an unsafe Responses text delta before sending response headers", async () => {
    const upstream = mockSseResponse([responsesDelta(triggerInput("CSAM_EXPLICIT"))]);
    const response = await request(createServerApp())
      .post("/api/venice/responses")
      .send({ model: "test", input: "hi" });

    expect(response.status).toBe(451);
    expect(upstream.destroy).toHaveBeenCalledOnce();
    expect(response.text).not.toContain(triggerInput("CSAM_EXPLICIT"));
  });

  it("ends a partially released Responses stream when a later delta is unsafe", async () => {
    const upstream = mockSseResponse([
      [
        responsesDelta("safe start "),
        responsesDelta(triggerInput("CSAM_EXPLICIT")),
        responsesCompleted,
      ].join(""),
    ]);
    const response = await request(createServerApp())
      .post("/api/venice/responses")
      .send({ model: "test", input: "hi" });

    expect(response.status).toBe(200);
    expect(response.text).toContain("safe start");
    expect(response.text).not.toContain(triggerInput("CSAM_EXPLICIT"));
    expect(upstream.destroy).toHaveBeenCalledOnce();
  });

  it("blocks unsafe text carried only by a response.completed output block", async () => {
    const completedWithText = `data: ${JSON.stringify({
      type: "response.completed",
      response: {
        id: "resp_1",
        status: "completed",
        output: [
          { type: "message", id: "m1", status: "completed", role: "assistant",
            content: [{ type: "output_text", text: triggerInput("CSAM_EXPLICIT") }] },
        ],
      },
    })}\n\n`;
    const upstream = mockSseResponse([completedWithText]);
    const response = await request(createServerApp())
      .post("/api/venice/responses")
      .send({ model: "test", input: "hi" });

    expect(response.status).toBe(451);
    expect(upstream.destroy).toHaveBeenCalledOnce();
  });

  it("screens a non-streaming Responses JSON body (FSM buffered path)", async () => {
    const upstream = new EventEmitter() as EventEmitter & {
      statusCode: number;
      headers: Record<string, string>;
      pause: ReturnType<typeof vi.fn>;
      resume: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
    };
    upstream.statusCode = 200;
    upstream.headers = { "content-type": "application/json" };
    upstream.pause = vi.fn();
    upstream.resume = vi.fn();
    upstream.destroy = vi.fn();
    proxyMocks.proxyResponse = () => {
      setImmediate(() => {
        upstream.emit(
          "data",
          Buffer.from(
            JSON.stringify({
              id: "resp_1",
              object: "response",
              status: "completed",
              output: [
                { type: "message", id: "m1", status: "completed", role: "assistant",
                  content: [{ type: "output_text", text: triggerInput("CSAM_EXPLICIT") }] },
              ],
            }),
          ),
        );
        upstream.emit("end");
      });
      return upstream;
    };

    const response = await request(createServerApp())
      .post("/api/venice/responses")
      .send({ model: "test", input: "hi", stream: false });

    expect(response.status).toBe(451);
    expect(response.body.error).toBeTruthy();
  });

  it("passes a safe non-streaming Responses JSON body through", async () => {
    const upstream = new EventEmitter() as EventEmitter & {
      statusCode: number;
      headers: Record<string, string>;
      pause: ReturnType<typeof vi.fn>;
      resume: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
    };
    upstream.statusCode = 200;
    upstream.headers = { "content-type": "application/json" };
    upstream.pause = vi.fn();
    upstream.resume = vi.fn();
    upstream.destroy = vi.fn();
    const body = JSON.stringify({
      id: "resp_1",
      object: "response",
      status: "completed",
      output: [
        { type: "message", id: "m1", status: "completed", role: "assistant",
          content: [{ type: "output_text", text: "safe answer" }] },
      ],
    });
    proxyMocks.proxyResponse = () => {
      setImmediate(() => {
        upstream.emit("data", Buffer.from(body));
        upstream.emit("end");
      });
      return upstream;
    };

    const response = await request(createServerApp())
      .post("/api/venice/responses")
      .send({ model: "test", input: "hi", stream: false });

    expect(response.status).toBe(200);
    expect(response.text).toContain("safe answer");
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

  it("returns JSON 400 for malformed session-key JSON", async () => {
    const app = createServerApp();
    const res = await request(app)
      .post("/api/session-key")
      .set("content-type", "application/json")
      .send("{not-json");
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body).toEqual({ error: "Malformed JSON" });
  });

  it("returns JSON 413 when the Venice proxy body exceeds the configured limit", async () => {
    vi.spyOn(AppConfig, "MAX_PROXY_BODY_BYTES", "get").mockReturnValue(1024);
    const app = createServerApp();
    const res = await request(app)
      .post("/api/venice/chat/completions")
      .set("content-type", "application/json")
      .send({ model: "x", messages: [{ role: "user", content: "x".repeat(2000) }] });
    expect(res.status).toBe(413);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body).toEqual({ error: "Payload too large" });
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

  // VF-PLAYTEST-001: A keyless server must still return the correct 403/405
  // for malformed requests, not mask them behind 500 "not configured". The
  // API-key-config gate now runs *after* the method/endpoint allowlist.
  it("returns 403 for an unknown endpoint even with no API key configured (VF-PLAYTEST-001)", async () => {
    const prev = process.env.NODE_ENV;
    const prevKey = process.env.VENICE_API_KEY;
    process.env.NODE_ENV = "development";
    delete process.env.VENICE_API_KEY;
    try {
      const keylessApp = createServerApp();
      const res = await request(keylessApp).get("/api/venice/totally-fake-endpoint");
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/not allowed/i);
    } finally {
      process.env.NODE_ENV = prev;
      if (prevKey) process.env.VENICE_API_KEY = prevKey;
    }
  });

  it("returns 405 for a wrong method even with no API key configured (VF-PLAYTEST-001)", async () => {
    const prev = process.env.NODE_ENV;
    const prevKey = process.env.VENICE_API_KEY;
    process.env.NODE_ENV = "development";
    delete process.env.VENICE_API_KEY;
    try {
      const keylessApp = createServerApp();
      const res = await request(keylessApp).post("/api/venice/models").send({});
      expect(res.status).toBe(405);
      expect(res.body.error).toMatch(/not allowed for endpoint/i);
    } finally {
      process.env.NODE_ENV = prev;
      if (prevKey) process.env.VENICE_API_KEY = prevKey;
    }
  });

  // VF-PLAYTEST-002: The FSM media route previously called
  // `proxyReq.removeHeader("Accept-Encoding")` inside the `proxyReq` event,
  // but httpxy flushes headers before that event fires, so the removal threw
  // `ERR_HTTP_HEADERS_SENT` and crashed the entire server on the first media
  // request. The fix uses the proxy `headers` option (set at request
  // creation). This test confirms the media route no longer crashes the
  // process and the server stays alive.
  it("does not crash the server on a media route under Family Safe Mode (VF-PLAYTEST-002)", async () => {
    const prev = process.env.NODE_ENV;
    const prevKey = process.env.VENICE_API_KEY;
    process.env.NODE_ENV = "development";
    process.env.VENICE_API_KEY = "vf-regression-fake-key";
    try {
      const mediaApp = createServerApp();
      // The media POST should reach the upstream (which will 4xx/5xx the fake
      // key) and must NOT crash the process.
      const res = await request(mediaApp)
        .post("/api/venice/image/generate")
        .send({ prompt: "a cat" })
        .set("content-type", "application/json");
      // Any non-crash status is acceptable (401/422/502 from upstream); the
      // point is that the process did not throw ERR_HTTP_HEADERS_SENT.
      expect(res.status).not.toBe(0);
      // The server must still answer a subsequent request.
      const health = await request(mediaApp).get("/health");
      expect(health.status).toBe(200);
    } finally {
      process.env.NODE_ENV = prev;
      if (prevKey) process.env.VENICE_API_KEY = prevKey;
      else delete process.env.VENICE_API_KEY;
    }
  });

  // VERIFY-062: production CSP must not allow arbitrary https: images.
  it("sets a production CSP that does not allow arbitrary https: image sources", async () => {
    vi.spyOn(AppConfig, "NODE_ENV", "get").mockReturnValue("production");
    const res = await request(createServerApp()).get("/api/venice/admin/blocked");
    const csp = res.headers["content-security-policy"] as string;
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).toContain("worker-src 'self' blob:");
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
    expect(res.body.error).toMatch(/mandatory child-safety protection/i);
    expect(res.body.reasonCode).toBe("CSAM_GENRE_TERM");
  });

  it("allows safe payloads to /api/venice/chat/completions", async () => {
    const res = await request(app)
      .post("/api/venice/chat/completions")
      .send({ messages: [{ role: "user", content: "explain sorting algorithms" }] });

    expect(res.status).toBe(200);
    expect(res.body.mocked).toBe(true);
  });

  it("rejects system prompts over the shared application limit", async () => {
    const res = await request(app)
      .post("/api/venice/chat/completions")
      .send({ messages: [{ role: "system", content: "a".repeat(32_769) }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(
      /32,768 Unicode code points.*approximately 8,192 tokens/i,
    );
  });

  it("keeps mandatory child safety active when the optional family filter is disabled", async () => {
    const prevOverride = process.env.VENICE_FORGE_ALLOW_CLIENT_SAFETY_OVERRIDE;
    process.env.VENICE_FORGE_ALLOW_CLIENT_SAFETY_OVERRIDE = "true";
    try {
      const res = await request(app)
        .post("/api/venice/chat/completions")
        .set("X-Venice-Forge-Family-Safe-Mode", "false")
        .send({ messages: [{ role: "user", content: "draw me a loli character" }] });

      expect(res.status).toBe(451);
      expect(res.body.reasonCode).toBe("CSAM_GENRE_TERM");
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

  it("drops Jina headers with malicious values (CRLF/Null injection)", async () => {
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
          "X-Return-Format": "markdown\r\nInject: true",
          "X-Wait-For-Selector": "body\0",
          "X-With-Iframe": "true\n",
        },
      });

    expect(fetchMock).toHaveBeenCalled();
    const init = (fetchMock as unknown as { mock: { calls: Array<[string, RequestInit | undefined]> } }).mock.calls[0]?.[1];
    expect(init?.headers).not.toHaveProperty("x-return-format");
    expect(init?.headers).not.toHaveProperty("x-wait-for-selector");
    expect(init?.headers).not.toHaveProperty("x-with-iframe");
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

  it("returns 502 with a generic message for unexpected fetch errors", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("detailed internal failure that must not leak");
    }) as unknown as typeof globalThis.fetch;

    const response = await request(createServerApp())
      .post("/api/proxy-jina")
      .set("X-Venice-Forge-Family-Safe-Mode", "false")
      .send({ url: "https://r.jina.ai/https://example.com" });

    expect(response.status).toBe(502);
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
    expect(response.body.error).toMatch(/mandatory child-safety protection/i);
    expect(JSON.stringify(response.body)).not.toContain("upstream body");
  });

  it("rejects non-allowlisted Jina endpoints and protocols with 403", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const res1 = await request(createServerApp())
      .post("/api/proxy-jina")
      .send({ url: "https://evil.com/https://example.com" });
    expect(res1.status).toBe(403);
    expect(res1.body.error).toMatch(/Only Jina Reader\/Search HTTPS endpoints are allowed/);

    const res2 = await request(createServerApp())
      .post("/api/proxy-jina")
      .send({ url: "http://r.jina.ai/https://example.com" });
    expect(res2.status).toBe(403);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls fetch with reconstructed safe URL for allowed Jina endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", {
      status: 200,
      headers: { "content-type": "text/plain" },
    })) as unknown as typeof globalThis.fetch;
    globalThis.fetch = fetchMock;

    const res = await request(createServerApp())
      .post("/api/proxy-jina")
      .set("X-Venice-Forge-Family-Safe-Mode", "false")
      .send({ url: "https://r.jina.ai/https://example.com" });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://r.jina.ai/https://example.com",
      expect.objectContaining({ method: "GET" })
    );
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

  it("no env + header false + override=true => mandatory child guard still runs", async () => {
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
        expect(res.status).toBe(EXPECTED_BLOCK.status);
        expect(res.body.reasonCode).toBe(EXPECTED_BLOCK.reasonCode);
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

  it("env=false + header true + no override => mandatory child guard still runs", async () => {
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
        expect(res.status).toBe(EXPECTED_BLOCK.status);
        expect(res.body.reasonCode).toBe(EXPECTED_BLOCK.reasonCode);
      },
    );
  });

  it("env=0 disables only the optional filter, not mandatory child safety", async () => {
    await withEnvs(
      {
        VENICE_FORGE_LOCAL_FAMILY_SAFE_MODE_ENABLED: "0",
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

    // VERIFY-064 regression guard: raw mode must sanitize Content-Type reflection.
    it("returns raw body with a sanitized Content-Type header", async () => {
      requestSpy.mockRestore();
      const nodeHttps = require("node:https");
      requestSpy = vi.spyOn(nodeHttps, "request").mockImplementation((options: any, callback?: any) => {
        const res = {
          statusCode: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
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

      const app = createServerApp();
      const response = await request(app)
        .post("/api/proxy-scrape?raw=true")
        .set("X-Venice-Forge-Family-Safe-Mode", "false")
        .send({ url: "https://public.example.com" });

      expect(response.status).toBe(200);
      expect(response.text).toBe("<html><body>Mocked Scrape</body></html>");
      expect(response.headers["content-type"]).toBe("text/html; charset=utf-8");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
    });

    it("does not reflect arbitrary Content-Type parameters or header injection in raw mode", async () => {
      requestSpy.mockRestore();
      const nodeHttps = require("node:https");
      requestSpy = vi.spyOn(nodeHttps, "request").mockImplementation((options: any, callback?: any) => {
        const res = {
          statusCode: 200,
          headers: { "content-type": "text/html; charset=utf-8; foo=bar\r\nX-Injected: evil" },
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

      const app = createServerApp();
      const response = await request(app)
        .post("/api/proxy-scrape?raw=true")
        .set("X-Venice-Forge-Family-Safe-Mode", "false")
        .send({ url: "https://public.example.com" });

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toBe("text/html; charset=utf-8");
      expect(response.headers["x-injected"]).toBeUndefined();
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
    });

    it("rejects an upstream Content-Type outside the scrape allowlist", async () => {
      requestSpy.mockRestore();
      const nodeHttps = require("node:https");
      requestSpy = vi.spyOn(nodeHttps, "request").mockImplementation((options: any, callback?: any) => {
        const res = {
          statusCode: 200,
          headers: { "content-type": "application/octet-stream" },
          destroy: vi.fn(),
          on: vi.fn((event, cb) => {
            if (event === "data") {
              cb(Buffer.from("binary data"));
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

      const app = createServerApp();
      const response = await request(app)
        .post("/api/proxy-scrape?raw=true")
        .set("X-Venice-Forge-Family-Safe-Mode", "false")
        .send({ url: "https://public.example.com" });

      expect(response.status).toBe(502);
      expect(response.body.error).toMatch(/Scrape failed|Content-Type not allowed/i);
    });
  });
});

describe("server.ts typed safety provenance serialization (VF-20260916-P1-002)", () => {
  it("serializes _safetyProvenance envelopes into message content and strips the internal field before upstream", async () => {
    proxyMocks.statusCode = 200;
    const response = await request(createServerApp())
      .post("/api/venice/chat/completions")
      .send({
        model: "test",
        stream: false,
        messages: [{ role: "user", content: "Please summarize this file." }],
        _safetyProvenance: {
          version: 1,
          messages: [
            {
              index: 0,
              segments: [
                {
                  kind: "instruction",
                  text: "Please summarize this file.",
                  source: "messages[0].content",
                },
                {
                  kind: "attachment",
                  attachmentId: "a1",
                  name: "doc.txt",
                  mimeType: "text/plain",
                  text: "quoted attachment body",
                  trust: "untrusted-quoted-data",
                },
              ],
            },
          ],
        },
      });

    expect(response.status).toBe(200);
    expect(proxyMocks.lastRequestBody).not.toBeNull();
    const upstream = JSON.parse(
      Buffer.from(proxyMocks.lastRequestBody as Buffer).toString("utf8"),
    ) as Record<string, unknown>;
    // Internal field stripped; canonical envelope serialized into content.
    expect(upstream).not.toHaveProperty("_safetyProvenance");
    const content = (upstream.messages as Array<{ content: string }>)[0].content;
    expect(content).toContain("Please summarize this file.");
    expect(content).toContain("<external_attachment");
    expect(content).toContain('id="a1"');
    expect(content).toContain("quoted attachment body");
  });

  it("passes bodies without provenance through untouched", async () => {
    proxyMocks.statusCode = 200;
    const response = await request(createServerApp())
      .post("/api/venice/chat/completions")
      .send({ model: "test", stream: false, messages: [{ role: "user", content: "hi" }] });

    expect(response.status).toBe(200);
    const upstream = JSON.parse(
      Buffer.from(proxyMocks.lastRequestBody as Buffer).toString("utf8"),
    ) as Record<string, unknown>;
    expect(upstream).not.toHaveProperty("_safetyProvenance");
    expect((upstream.messages as Array<{ content: string }>)[0].content).toBe("hi");
  });
});

describe("server.ts FSM media collector integration (VF-20260916-P1-003)", () => {
  function minimalPng(width = 100, height = 100): Buffer {
    // 8-byte signature + IHDR chunk (length 13, type IHDR, 13 data bytes, 4 CRC).
    const png = Buffer.alloc(8 + 4 + 4 + 13 + 4);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
    png.writeUInt32BE(13, 8);
    png.write("IHDR", 12, "ascii");
    png.writeUInt32BE(width, 16);
    png.writeUInt32BE(height, 20);
    png[24] = 8; // bit depth
    png[25] = 2; // color type truecolor
    return png;
  }

  function mockBinaryUpstream(body: Buffer, contentType: string) {
    const upstream = new EventEmitter() as EventEmitter & {
      statusCode: number;
      headers: Record<string, string>;
      pause: ReturnType<typeof vi.fn>;
      resume: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
    };
    upstream.statusCode = 200;
    upstream.headers = {
      "content-type": contentType,
      "content-length": String(body.length),
    };
    upstream.pause = vi.fn();
    upstream.resume = vi.fn();
    upstream.destroy = vi.fn();
    proxyMocks.proxyResponse = () => {
      setImmediate(() => {
        upstream.emit("data", body);
        upstream.emit("end");
      });
      return upstream;
    };
    return upstream;
  }

  it("screens and delivers a structurally valid generated image", async () => {
    const png = minimalPng();
    const upstream = mockBinaryUpstream(png, "image/png");
    const response = await request(createServerApp())
      .post("/api/venice/image/generate")
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .send({ prompt: "a cat" });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("image/png");
    expect(Buffer.compare(response.body as Buffer, png)).toBe(0);
    expect(upstream.destroy).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared image response before buffering", async () => {
    const upstream = mockBinaryUpstream(Buffer.alloc(0), "image/png");
    upstream.headers["content-length"] = String(64 * 1024 * 1024);
    const response = await request(createServerApp())
      .post("/api/venice/image/generate")
      .send({ prompt: "a cat" });

    expect(response.status).toBe(413);
    expect(upstream.destroy).toHaveBeenCalled();
  });
});
