/**
 * @fileoverview VERIFY-018 — Provider `safe_mode` endpoint matrix.
 *
 * Regression guard for P1 #7 of the safety batch:
 *   - `applyVeniceApiSafeMode` adds `safe_mode` only for endpoints in
 *     the supported set.
 *   - `endpointSupportsSafeMode` matches the matrix exactly.
 *   - Undefined input is a no-op (never adds the field).
 *   - The matrix covers every endpoint in the IPC + proxy allowlist.
 */

import { describe, expect, it } from "vitest";
import {
  VENICE_API_SAFE_MODE_MATRIX,
  applyVeniceApiSafeMode,
  endpointSupportsSafeMode,
} from "../../src/shared/veniceSafeMode";

describe("VERIFY-018 safe_mode endpoint matrix", () => {
  it("omits safe_mode for /chat/completions (not supported)", () => {
    const out = applyVeniceApiSafeMode("/chat/completions", { model: "m" }, true);
    expect(out.safe_mode).toBeUndefined();
  });

  it("adds safe_mode for /image/generate", () => {
    const out = applyVeniceApiSafeMode("/image/generate", { model: "m" }, false);
    expect(out.safe_mode).toBe(false);
  });

  it("omits safe_mode for /image/upscale (no extractable prompt fields)", () => {
    const out = applyVeniceApiSafeMode("/image/upscale", { model: "m" }, true);
    expect(out.safe_mode).toBeUndefined();
  });

  it("omits safe_mode for /audio/queue and /audio/retrieve (returned-content only)", () => {
    expect(applyVeniceApiSafeMode("/audio/queue", {}, true).safe_mode).toBeUndefined();
    expect(applyVeniceApiSafeMode("/audio/retrieve", {}, true).safe_mode).toBeUndefined();
  });

  it("omits safe_mode for /video/{retrieve,quote,complete} (returned-content only)", () => {
    expect(applyVeniceApiSafeMode("/video/retrieve", {}, true).safe_mode).toBeUndefined();
    expect(applyVeniceApiSafeMode("/video/quote", {}, true).safe_mode).toBeUndefined();
    expect(applyVeniceApiSafeMode("/video/complete", {}, true).safe_mode).toBeUndefined();
  });

  it("omits safe_mode for /models (read-only)", () => {
    expect(applyVeniceApiSafeMode("/models", {}, true).safe_mode).toBeUndefined();
  });

  it("does not mutate the input payload", () => {
    const input: Record<string, unknown> = { model: "m", temperature: 0.5 };
    const out = applyVeniceApiSafeMode("/image/generate", input, true);
    expect(input.safe_mode).toBeUndefined();
    expect(out.safe_mode).toBe(true);
    expect(input.model).toBe("m");
  });

  it("does not add safe_mode when enabled is undefined", () => {
    const out = applyVeniceApiSafeMode("/image/generate", { model: "m" }, undefined);
    expect(out.safe_mode).toBeUndefined();
  });

  it("the matrix row count matches the allowlist endpoints (no drift)", () => {
    const matrixEndpoints = new Set(VENICE_API_SAFE_MODE_MATRIX.map((r) => r.endpoint));
    const required = [
      "/chat/completions",
      "/image/generate",
      "/image/edit",
      "/image/multi-edit",
      "/image/upscale",
      "/audio/speech",
      "/audio/transcriptions",
      "/audio/queue",
      "/audio/retrieve",
      "/embeddings",
      "/video/queue",
      "/video/retrieve",
      "/video/quote",
      "/video/complete",
      "/augment/search",
      "/augment/scrape",
      "/augment/text-parser",
      "/models",
    ];
    for (const e of required) {
      expect(matrixEndpoints.has(e), `matrix missing ${e}`).toBe(true);
    }
    expect(VENICE_API_SAFE_MODE_MATRIX.length).toBe(required.length);
  });

  it("endpointSupportsSafeMode agrees with the matrix", () => {
    for (const row of VENICE_API_SAFE_MODE_MATRIX) {
      expect(endpointSupportsSafeMode(row.endpoint)).toBe(row.supportsSafeMode);
    }
  });
});
