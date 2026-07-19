// @vitest-environment node

import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCorsHeaders,
  DEV_RENDERER_ORIGIN,
  evaluateCustomProtocolAccess,
  EXPOSED_MEDIA_HEADERS,
} from "./customProtocolAccess";

const rendererRoot = path.resolve(__dirname, "../../dist");
const rendererIndex = path.join(rendererRoot, "index.html");

describe("custom protocol access guard", () => {
  it("releases the Vite origin in development", () => {
    const decision = evaluateCustomProtocolAccess({
      isDev: true,
      origin: DEV_RENDERER_ORIGIN,
      referrer: `${DEV_RENDERER_ORIGIN}/`,
      rendererRoot,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.allowOrigin).toBe(DEV_RENDERER_ORIGIN);
    expect(decision.vary).toBe("Origin");
  });

  it("rejects an atomic dev allow with an explicit foreign referrer", () => {
    const decision = evaluateCustomProtocolAccess({
      isDev: true,
      origin: DEV_RENDERER_ORIGIN,
      referrer: "https://evil.example/index.html",
      rendererRoot,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.allowOrigin).toBeNull();
  });

  it("releases the opaque null origin in the packaged renderer", () => {
    const decision = evaluateCustomProtocolAccess({
      isDev: false,
      origin: "null",
      referrer: `file://${rendererIndex}`,
      rendererRoot,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.allowOrigin).toBe("null");
    expect(decision.vary).toBe("Origin");
  });

  it("rejects the opaque null origin when the referrer is foreign", () => {
    const decision = evaluateCustomProtocolAccess({
      isDev: false,
      origin: "null",
      referrer: "https://evil.example/index.html",
      rendererRoot,
    });
    expect(decision.allowed).toBe(false);
  });

  it("rejects any explicit non-renderer origin", () => {
    const decision = evaluateCustomProtocolAccess({
      isDev: true,
      origin: "https://evil.example",
      referrer: "https://evil.example/app",
      rendererRoot,
    });
    expect(decision.allowed).toBe(false);
  });

  it("rejects foreign file referrers even when no origin header is present", () => {
    const decision = evaluateCustomProtocolAccess({
      isDev: false,
      origin: null,
      referrer: "file:///etc/passwd",
      rendererRoot,
    });
    expect(decision.allowed).toBe(false);
  });

  it("treats originless requests with no referrer as renderer-initiated", () => {
    const dev = evaluateCustomProtocolAccess({
      isDev: true,
      origin: null,
      referrer: "",
      rendererRoot,
    });
    expect(dev.allowed).toBe(true);
    expect(dev.allowOrigin).toBe(DEV_RENDERER_ORIGIN);

    const prod = evaluateCustomProtocolAccess({
      isDev: false,
      origin: null,
      referrer: "",
      rendererRoot,
    });
    expect(prod.allowed).toBe(true);
    expect(prod.allowOrigin).toBe("null");
  });

  it("treats originless dev requests with an unparseable referrer as renderer-initiated", () => {
    const decision = evaluateCustomProtocolAccess({
      isDev: true,
      origin: null,
      referrer: "about:blank",
      rendererRoot,
    });
    expect(decision.allowed).toBe(false);
  });

  it("rejects http referrers in packaged mode even when origin is null", () => {
    const decision = evaluateCustomProtocolAccess({
      isDev: false,
      origin: "null",
      referrer: "http://localhost:5173/",
      rendererRoot,
    });
    expect(decision.allowed).toBe(false);
  });
});

describe("CORS response header builder", () => {
  it("emits Allow-Origin + Vary + Expose-Headers for an allowed dev request", () => {
    const decision = evaluateCustomProtocolAccess({
      isDev: true,
      origin: DEV_RENDERER_ORIGIN,
      referrer: "",
      rendererRoot,
    });
    const headers = buildCorsHeaders(decision);
    expect(headers["Access-Control-Allow-Origin"]).toBe(DEV_RENDERER_ORIGIN);
    expect(headers["Vary"]).toBe("Origin");
    expect(headers["Access-Control-Expose-Headers"]).toBe(EXPOSED_MEDIA_HEADERS);
    expect(headers["Access-Control-Expose-Headers"]).toContain("Content-Range");
    expect(headers["Access-Control-Expose-Headers"]).toContain("Accept-Ranges");
  });

  it("emits null origin for packaged renderer requests", () => {
    const decision = evaluateCustomProtocolAccess({
      isDev: false,
      origin: "null",
      referrer: `file://${rendererIndex}`,
      rendererRoot,
    });
    const headers = buildCorsHeaders(decision);
    expect(headers["Access-Control-Allow-Origin"]).toBe("null");
    expect(headers["Vary"]).toBe("Origin");
  });

  it("never emits a wildcard origin", () => {
    const allowedDecision = evaluateCustomProtocolAccess({
      isDev: true,
      origin: DEV_RENDERER_ORIGIN,
      referrer: "",
      rendererRoot,
    });
    const blockedDecision = evaluateCustomProtocolAccess({
      isDev: true,
      origin: "https://evil.example",
      referrer: "https://evil.example/",
      rendererRoot,
    });
    expect(buildCorsHeaders(allowedDecision)["Access-Control-Allow-Origin"]).not.toBe("*");
    expect(buildCorsHeaders(blockedDecision)).toEqual({});
  });
});
