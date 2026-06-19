/**
 * @fileoverview Integration tests for the central guard pipeline (VERIFY-015).
 *
 * Locks the contract that:
 *   - `checkLocalFamilyGuard` reads the runtime snapshot, not the renderer payload
 *   - `performGuardedVeniceRequest` returns a 451 block on guard denial
 *   - `performGuardedVeniceRequest` forwards to `performVeniceRequest` on pass
 *   - `screenResponseBody` blocks via the same pipeline on web-proxy/scrape return
 *   - `buildGuardedBlock` emits the canonical 451 shape
 *
 * The runtime snapshot (`runtimeSafetySettings`) is mutated directly in tests
 * (it is a module-level boolean by design — P0 source-of-truth).
 */

// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  setRuntimeLocalFamilySafeModeEnabled,
  getRuntimeLocalFamilySafeModeEnabled,
} from "../../electron/services/runtimeSafetySettings";
import {
  buildGuardedBlock,
  checkLocalFamilyGuard,
  performGuardedVeniceRequest,
} from "../../electron/services/guardPipeline";
import { maybeRunLocalFamilyGuard } from "../../src/shared/safety";
import { screenResponseBody } from "../../src/shared/safety/localFamilySafeGuard";
import { triggerInput, benignInput } from "./fixtureBuilders";

vi.mock("../../electron/services/veniceClient", () => ({
  performVeniceRequest: vi.fn(),
}));

import { performVeniceRequest } from "../../electron/services/veniceClient";

const mockedPerformVeniceRequest = vi.mocked(performVeniceRequest);

beforeEach(() => {
  setRuntimeLocalFamilySafeModeEnabled(true);
  mockedPerformVeniceRequest.mockReset();
});

afterEach(() => {
  setRuntimeLocalFamilySafeModeEnabled(true);
  vi.restoreAllMocks();
});

describe("VERIFY-015 guard pipeline — runtime source of truth", () => {
  it("checkLocalFamilyGuard blocks CSAM trigger regardless of request payload flag", () => {
    // Even if the IPC request tried to set localFamilySafeModeEnabled = true
    // (default), a CSAM trigger must be blocked because the guard evaluates
    // the prompt content, not the flag.
    const block = checkLocalFamilyGuard({
      text: triggerInput("CSAM_EXPLICIT"),
      endpoint: "/chat/completions",
      method: "POST",
      source: "ipc",
    });
    expect(block).not.toBeNull();
    expect(block?.status).toBe(451);
    expect(block?.body.error).toMatch(/Family Safe Mode/i);
  });

  it("checkLocalFamilyGuard returns null when the input is benign", () => {
    const block = checkLocalFamilyGuard({
      text: benignInput("GENERIC"),
      endpoint: "/chat/completions",
      method: "POST",
      source: "ipc",
    });
    expect(block).toBeNull();
  });

  it("checkLocalFamilyGuard skips rule evaluation when runtime snapshot is OFF (Adult Mode)", () => {
    setRuntimeLocalFamilySafeModeEnabled(false);
    const block = checkLocalFamilyGuard({
      text: triggerInput("CSAM_EXPLICIT"),
      endpoint: "/chat/completions",
      method: "POST",
      source: "ipc",
    });
    expect(block).toBeNull();
    // And the runtime snapshot remains the source of truth:
    expect(getRuntimeLocalFamilySafeModeEnabled()).toBe(false);
  });
});

describe("VERIFY-015 guard pipeline — canonical block shape", () => {
  it("buildGuardedBlock emits the 451 response shape with reason code, category, severity", () => {
    const decision = maybeRunLocalFamilyGuard(
      {
        text: triggerInput("LOLI_TERM"),
        endpoint: "/image/generate",
        method: "POST",
        source: "image",
      },
      true,
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked decision");
    const block = buildGuardedBlock(decision);
    expect(block.ok).toBe(false);
    expect(block.status).toBe(451);
    expect(block.statusText).toBe("Blocked by Family Safe Mode");
    expect(block.contentType).toBe("application/json");
    expect(block.body.error).toMatch(/Family Safe Mode/i);
    expect(typeof block.body.reasonCode).toBe("string");
    expect(typeof block.body.category).toBe("string");
    expect(typeof block.body.severity).toBe("string");
  });
});

describe("VERIFY-015 guard pipeline — performGuardedVeniceRequest", () => {
  it("returns a blocked result on CSAM trigger and never calls performVeniceRequest", async () => {
    const result = await performGuardedVeniceRequest({
      endpoint: "/chat/completions",
      method: "POST",
      body: {
        model: "test-model",
        messages: [{ role: "user", content: triggerInput("CSAM_EXPLICIT") }],
      },
    });
    expect(result.kind).toBe("blocked");
    if (result.kind !== "blocked") throw new Error("expected blocked");
    expect(result.block.status).toBe(451);
    expect(mockedPerformVeniceRequest).not.toHaveBeenCalled();
  });

  it("returns a response result on benign input and forwards to performVeniceRequest", async () => {
    const upstream = {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: {},
      body: { id: "x" },
      contentType: "application/json",
    };
    mockedPerformVeniceRequest.mockResolvedValue(upstream);
    const result = await performGuardedVeniceRequest({
      endpoint: "/chat/completions",
      method: "POST",
      body: { model: "m", messages: [{ role: "user", content: benignInput("GENERIC") }] },
    });
    expect(result.kind).toBe("response");
    if (result.kind !== "response") throw new Error("expected response");
    expect(result.response).toEqual(upstream);
    expect(mockedPerformVeniceRequest).toHaveBeenCalledTimes(1);
  });

  it("skips the guard when runtime snapshot is OFF (Adult Mode)", async () => {
    setRuntimeLocalFamilySafeModeEnabled(false);
    const upstream = { ok: true, status: 200, statusText: "OK", headers: {}, body: {}, contentType: "application/json" };
    mockedPerformVeniceRequest.mockResolvedValue(upstream);
    const result = await performGuardedVeniceRequest({
      endpoint: "/chat/completions",
      method: "POST",
      body: { model: "m", messages: [{ role: "user", content: triggerInput("CSAM_EXPLICIT") }] },
    });
    // Adult Mode: still forwards, because the runtime flag is OFF.
    expect(result.kind).toBe("response");
    expect(mockedPerformVeniceRequest).toHaveBeenCalledTimes(1);
  });

  it("forwards onDelta callback verbatim to performVeniceRequest", async () => {
    const onDelta = vi.fn();
    mockedPerformVeniceRequest.mockResolvedValue({ ok: true, status: 200, statusText: "OK", headers: {}, body: {}, contentType: "application/json" });
    await performGuardedVeniceRequest(
      { endpoint: "/chat/completions", method: "POST", body: { model: "m", messages: [] } },
      { onDelta },
    );
    expect(mockedPerformVeniceRequest).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "/chat/completions" }),
      expect.objectContaining({ onDelta }),
    );
  });

  it("wraps a SafetyGuardBlockedError thrown by performVeniceRequest into a 451 block result", async () => {
    // Defensive path: if downstream `performVeniceRequest` ever re-throws
    // a SafetyGuardBlockedError (e.g. an inline guard in venice.ts), the
    // wrapper must convert it to a 451, not propagate the throw.
    const { SafetyGuardBlockedError } = await import("../../src/shared/safety");
    const decision = {
      allow: false,
      action: "block" as const,
      severity: "high" as const,
      category: "csam_request" as const,
      reasonCode: "CSAM_BLOCKED",
      userMessage: "blocked",
      developerMessage: "blocked",
      normalizedChanged: false,
      signals: [],
      audit: { decisionId: "d1", createdAt: "0", promptHash: "h", promptLength: 0, matchedFieldPaths: [] },
    };
    mockedPerformVeniceRequest.mockRejectedValue(new SafetyGuardBlockedError(decision));
    const result = await performGuardedVeniceRequest({
      endpoint: "/chat/completions",
      method: "POST",
      body: { model: "m", messages: [] },
    });
    expect(result.kind).toBe("blocked");
    if (result.kind !== "blocked") throw new Error("expected blocked");
    expect(result.block.status).toBe(451);
    expect(result.block.body.reasonCode).toBe("CSAM_BLOCKED");
  });

  it("wraps a SafetyGuardBlockedError thrown by checkLocalFamilyGuard into a 451 block result", async () => {
    // Tests that if the guard payload analysis throws a SafetyGuardBlockedError 
    // (the "synthetic exception"), it is correctly caught and converted to a 451 block.
    const { SafetyGuardBlockedError } = await import("../../src/shared/safety");
    const decision = {
      allow: false,
      action: "block" as const,
      severity: "high" as const,
      category: "none" as const,
      reasonCode: "SYNTHETIC_BLOCK",
      userMessage: "synthetic block",
      developerMessage: "synthetic block",
      normalizedChanged: false,
      signals: [],
      audit: { decisionId: "d2", createdAt: "0", promptHash: "h", promptLength: 0, matchedFieldPaths: [] },
    };
    
    // We can spy on maybeRunLocalFamilyGuard so it throws.
    const safetyModule = await import("../../src/shared/safety");
    const spy = vi.spyOn(safetyModule, "maybeRunLocalFamilyGuard").mockImplementation(() => {
      throw new SafetyGuardBlockedError(decision);
    });

    try {
      const result = await performGuardedVeniceRequest({
        endpoint: "/chat/completions",
        method: "POST",
        body: { model: "m", messages: [] },
      });
      expect(result.kind).toBe("blocked");
      if (result.kind === "blocked") {
        expect(result.block.status).toBe(451);
        expect(result.block.body.reasonCode).toBe("SYNTHETIC_BLOCK");
      }
    } finally {
      spy.mockRestore();
    }
  });
});

describe("VERIFY-015 guard pipeline — screenResponseBody (web-proxy/scrape return content)", () => {
  it("blocks trigger embedded in web-proxy response body when Family Safe Mode is ON", () => {
    const r = screenResponseBody(
      triggerInput("CSAM_EXPLICIT"),
      { endpoint: "https://r.jina.example/page", method: "GET", source: "web-proxy" },
      true,
    );
    expect(r.allowed).toBe(false);
    if (r.allowed) throw new Error("expected blocked");
    expect(r.userMessage).toMatch(/Family Safe Mode/i);
  });

  it("blocks trigger embedded in scrape response body when Family Safe Mode is ON", () => {
    const r = screenResponseBody(
      triggerInput("LOLI_TERM"),
      { endpoint: "https://example.com/page", method: "GET", source: "scrape" },
      true,
    );
    expect(r.allowed).toBe(false);
  });

  it("allows benign web-proxy response body", () => {
    const r = screenResponseBody(
      benignInput("GENERIC"),
      { endpoint: "https://r.jina.example/page", method: "GET", source: "web-proxy" },
      true,
    );
    expect(r.allowed).toBe(true);
  });

  it("skips screening and reports skipped=true when Family Safe Mode is OFF", () => {
    const r = screenResponseBody(
      triggerInput("CSAM_EXPLICIT"),
      { endpoint: "https://r.jina.example/page", method: "GET", source: "web-proxy" },
      false,
    );
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.skipped).toBe(true);
  });

  it("samples large bodies (window-size guard for O(1) screening)", () => {
    // Pad a benign prefix with 50 KiB of filler; trigger should still be
    // found inside the 8 KiB sample window when appended at the end of
    // the sample — verifying the slice(0, sampleWindow) contract.
    const benign = benignInput("GENERIC");
    const filler = benignInput("GENERIC").repeat(1000);
    const trigger = triggerInput("CSAM_EXPLICIT");
    const body = benign + filler + trigger;
    const r = screenResponseBody(
      body,
      { endpoint: "https://example.com/large", method: "GET", source: "web-proxy" },
      true,
    );
    // Trigger is OUTSIDE the 8 KiB sample window, so screening sees only benign
    // content and must allow. (Sampling is best-effort; this is the documented
    // contract, not a guarantee of detection outside the window.)
    expect(r.allowed).toBe(true);
  });

  it("screening handles empty body gracefully", () => {
    const r = screenResponseBody(
      "",
      { endpoint: "https://example.com/empty", method: "GET", source: "web-proxy" },
      true,
    );
    expect(r.allowed).toBe(true);
  });
});

describe("VERIFY-015 guard pipeline — endpoint coverage matrix", () => {
  // Locks the contract that the centralized guard evaluates against the
  // allowlisted Venice endpoints. Each entry point uses the canonical
  // payload shape so the extractor picks the trigger up.
  const trigger = () => triggerInput("CSAM_EXPLICIT");
  const matrix: { endpoint: string; method: string; body: Record<string, unknown> }[] = [
    { endpoint: "/chat/completions", method: "POST", body: { model: "m", messages: [{ role: "user", content: trigger() }] } },
    { endpoint: "/image/generate", method: "POST", body: { model: "m", prompt: trigger() } },
    { endpoint: "/image/edit", method: "POST", body: { model: "m", prompt: trigger() } },
    { endpoint: "/image/multi-edit", method: "POST", body: { model: "m", prompt: trigger() } },
    { endpoint: "/augment/search", method: "POST", body: { model: "m", query: trigger() } },
    { endpoint: "/augment/scrape", method: "POST", body: { model: "m", url: "https://example.com/" + trigger() } },
    { endpoint: "/augment/text-parser", method: "POST", body: { model: "m", text: trigger() } },
    { endpoint: "/embeddings", method: "POST", body: { model: "m", input: trigger() } },
    { endpoint: "/audio/speech", method: "POST", body: { model: "m", input: trigger() } },
    { endpoint: "/audio/transcriptions", method: "POST", body: { model: "m", text: trigger() } },
    { endpoint: "/video/queue", method: "POST", body: { model: "m", prompt: trigger() } },
  ];

  for (const { endpoint, method, body } of matrix) {
    it(`blocks ${endpoint} (${method}) when payload contains CSAM trigger`, async () => {
      const result = await performGuardedVeniceRequest({ endpoint, method, body });
      expect(result.kind).toBe("blocked");
      if (result.kind === "blocked") {
        expect(result.block.status).toBe(451);
        expect(mockedPerformVeniceRequest).not.toHaveBeenCalled();
      }
    });
  }

  it("documents that /image/upscale is a pass-through (no extractable prompt fields)", async () => {
    // The extractor returns an empty list for /image/upscale, so the guard
    // intentionally lets it through. This test pins that contract so a
    // future extractor change is forced to revisit the allowlist.
    const upstream = { ok: true, status: 200, statusText: "OK", headers: {}, body: {}, contentType: "application/json" };
    mockedPerformVeniceRequest.mockResolvedValue(upstream);
    const result = await performGuardedVeniceRequest({
      endpoint: "/image/upscale",
      method: "POST",
      body: { model: "m", image: "https://example.com/x.png" },
    });
    expect(result.kind).toBe("response");
    expect(mockedPerformVeniceRequest).toHaveBeenCalledTimes(1);
  });
});
