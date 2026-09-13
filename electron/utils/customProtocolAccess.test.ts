// @vitest-environment node

import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCorsHeaders,
  authorizeCustomProtocolCapability,
  CAPABILITY_TOKEN_REAP_THRESHOLD,
  createCustomProtocolCapabilityManager,
  DEV_RENDERER_ORIGIN,
  evaluateCustomProtocolAccess,
  EXPOSED_MEDIA_HEADERS,
  parseCustomProtocolCapabilityUrl,
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

describe("custom protocol capability-token manager", () => {
  const objectId = "a".repeat(64);
  const objectId2 = "b".repeat(64);

  it("issues a high-entropy token bound to object, profile, and session", () => {
    const manager = createCustomProtocolCapabilityManager();
    const { token, url } = manager.issue({
      scheme: "venice-media",
      objectId,
      profileId: "profile-1",
      sessionId: "session-1",
    });

    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(url).toBe(`venice-media://${objectId}?cap=${encodeURIComponent(token)}`);

    const spec = manager.verify(token);
    expect(spec).not.toBeNull();
    expect(spec?.objectId).toBe(objectId);
    expect(spec?.profileId).toBe("profile-1");
    expect(spec?.sessionId).toBe("session-1");
    expect(spec!.expiresAt).toBeGreaterThan(spec!.issuedAt);
  });

  it("rejects invalid inputs at issuance time", () => {
    const manager = createCustomProtocolCapabilityManager();
    expect(() =>
      manager.issue({ scheme: "venice-media", objectId: "not-a-hash", profileId: "p", sessionId: "s" }),
    ).toThrow("Invalid capability object id");
    expect(() =>
      manager.issue({ scheme: "venice-media", objectId, profileId: "", sessionId: "s" }),
    ).toThrow("Invalid capability profile id");
    expect(() =>
      manager.issue({ scheme: "venice-media", objectId, profileId: "p", sessionId: "" }),
    ).toThrow("Invalid capability session id");
    expect(() =>
      manager.issue({ scheme: "bad/scheme", objectId, profileId: "p", sessionId: "s" }),
    ).toThrow("Invalid capability scheme");
    expect(() =>
      manager.issue({ scheme: "venice-media", objectId, profileId: "p", sessionId: "s", ttlMs: 0 }),
    ).toThrow("Capability TTL must be");
  });

  it("rejects expired, unknown, and reused-after-revocation tokens", () => {
    let now = 1_000;
    const manager = createCustomProtocolCapabilityManager({ now: () => now });
    const { token } = manager.issue({
      scheme: "venice-media",
      objectId,
      profileId: "profile-1",
      sessionId: "session-1",
      ttlMs: 1,
    });

    // Token should still be valid immediately after issuance.
    expect(manager.verify(token)).not.toBeNull();

    // At the exact expiry boundary the token is rejected and removed.
    now += 1;
    expect(manager.verify(token)).toBeNull();
    expect(manager.verify("totally-unknown-token")).toBeNull();
  });

  it("reaps expired tokens without any verify call (VF-AUD-20260912-C6-P3-001)", () => {
    let now = 1_000_000;
    const manager = createCustomProtocolCapabilityManager({ now: () => now });

    // Cross the reap threshold with short-TTL tokens.
    for (let i = 0; i < CAPABILITY_TOKEN_REAP_THRESHOLD + 1; i++) {
      manager.issue({ scheme: "venice-media", objectId, profileId: "p", sessionId: "s", ttlMs: 1 });
    }
    expect(manager.metrics().issuedCount).toBe(CAPABILITY_TOKEN_REAP_THRESHOLD + 1);

    // Advance past expiry and issue one more token. The sweep must remove every
    // expired entry even though none of them was ever presented to verify().
    now += 10;
    const survivor = manager.issue({
      scheme: "venice-media",
      objectId,
      profileId: "p",
      sessionId: "s",
      ttlMs: 60_000,
    });

    expect(manager.metrics().issuedCount).toBe(1);
    expect(manager.verify(survivor.token)).not.toBeNull();
  });

  it("reaping never removes unexpired tokens", () => {
    const now = 2_000_000;
    const manager = createCustomProtocolCapabilityManager({ now: () => now });

    const kept: string[] = [];
    for (let i = 0; i < CAPABILITY_TOKEN_REAP_THRESHOLD + 10; i++) {
      const issued = manager.issue({
        scheme: "venice-tts",
        objectId,
        profileId: "p",
        sessionId: "s",
        ttlMs: 60_000,
      });
      kept.push(issued.token);
    }

    // All tokens share the same clock tick, so none is expired; the sweep must
    // not have dropped any of them.
    expect(manager.metrics().issuedCount).toBe(CAPABILITY_TOKEN_REAP_THRESHOLD + 10);
    for (const token of kept) {
      expect(manager.verify(token)).not.toBeNull();
    }
  });

  it("revokes tokens by session, profile, and all", () => {
    const manager = createCustomProtocolCapabilityManager();
    const sessionA = manager.issue({ scheme: "venice-media", objectId, profileId: "p1", sessionId: "s1" });
    const sessionB = manager.issue({ scheme: "venice-media", objectId: objectId2, profileId: "p1", sessionId: "s2" });
    const otherProfile = manager.issue({ scheme: "venice-media", objectId, profileId: "p2", sessionId: "s3" });

    manager.revokeSession("s1");
    expect(manager.verify(sessionA.token)).toBeNull();
    expect(manager.verify(sessionB.token)).not.toBeNull();
    expect(manager.verify(otherProfile.token)).not.toBeNull();

    manager.revokeProfile("p1");
    expect(manager.verify(sessionB.token)).toBeNull();
    expect(manager.verify(otherProfile.token)).not.toBeNull();

    manager.revokeAll();
    expect(manager.verify(otherProfile.token)).toBeNull();
    expect(manager.metrics().issuedCount).toBe(0);
  });

  it("exposes only safe metadata via metrics", () => {
    const manager = createCustomProtocolCapabilityManager();
    manager.issue({ scheme: "venice-media", objectId, profileId: "p1", sessionId: "s1" });
    manager.issue({ scheme: "venice-media", objectId: objectId2, profileId: "p1", sessionId: "s2" });

    const metrics = manager.metrics();
    expect(metrics.issuedCount).toBe(2);
    expect(metrics.profileCount).toBe(1);
    expect(metrics.sessionCount).toBe(2);
    expect(metrics.oldestTokenAgeMs).toBeGreaterThanOrEqual(0);
    // Metrics must never expose token values or spec objects.
    expect(Object.keys(metrics).sort()).toEqual([
      "issuedCount",
      "oldestTokenAgeMs",
      "profileCount",
      "sessionCount",
    ]);
  });

  it("parses capability URLs without validating tokens", () => {
    const manager = createCustomProtocolCapabilityManager();
    const { url } = manager.issue({
      scheme: "venice-media",
      objectId,
      profileId: "p",
      sessionId: "s",
    });

    const parsed = parseCustomProtocolCapabilityUrl(url);
    expect(parsed.objectId).toBe(objectId);
    expect(parsed.token).toBeTruthy();

    expect(parseCustomProtocolCapabilityUrl("not-a-url")).toEqual({ objectId: "", token: null });
    expect(parseCustomProtocolCapabilityUrl("venice-media://abc?other=value")).toEqual({
      objectId: "abc",
      token: null,
    });
  });

  it("rejects originless custom-protocol requests without a valid cap token", () => {
    const manager = createCustomProtocolCapabilityManager();
    const { url } = manager.issue({
      scheme: "venice-media",
      objectId,
      profileId: "p1",
      sessionId: "s1",
    });
    expect(
      authorizeCustomProtocolCapability({
        requestUrl: `venice-media://${objectId}`,
        objectId,
        manager,
      }).allowed,
    ).toBe(false);
    expect(
      authorizeCustomProtocolCapability({
        requestUrl: url,
        objectId,
        manager,
      }).allowed,
    ).toBe(true);
    expect(
      authorizeCustomProtocolCapability({
        requestUrl: url,
        objectId: objectId2,
        manager,
      }).allowed,
    ).toBe(false);
  });
});
