import { describe, expect, it } from "vitest";
import {
  VENICE_API_SAFE_MODE_MATRIX,
  VENICE_PROVIDER_SAFETY_MATRIX,
  applyVeniceApiSafeMode,
  applyVeniceProviderSafetyPreference,
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

  it("adds safe_mode for /image/edit and /image/multi-edit", () => {
    const edit = applyVeniceApiSafeMode("/image/edit", { model: "m", prompt: "p" }, true);
    expect(edit.safe_mode).toBe(true);
    const multi = applyVeniceApiSafeMode("/image/multi-edit", { model: "m" }, false);
    expect(multi.safe_mode).toBe(false);
  });

  it("omits safe_mode for /image/upscale (no extractable prompt fields)", () => {
    const out = applyVeniceApiSafeMode("/image/upscale", { model: "m" }, true);
    expect(out.safe_mode).toBeUndefined();
  });

  it("omits safe_mode for /images/generations because its request schema uses moderation", () => {
    expect(endpointSupportsSafeMode("/images/generations")).toBe(false);
    expect(
      applyVeniceApiSafeMode("/images/generations", { model: "gpt-image-1", prompt: "minimal shapes" }, true),
    ).not.toHaveProperty("safe_mode");
  });

  it.each([
    [true, "low", "auto"],
    [false, "auto", "low"],
    [true, undefined, "auto"],
    [false, undefined, "low"],
  ])("makes the provider setting authoritative for OpenAI image moderation (%s, %s)", (enabled, callerValue, expected) => {
    const input = { model: "image-model", ...(callerValue ? { moderation: callerValue } : {}) };
    const result = applyVeniceProviderSafetyPreference("/images/generations", input, enabled);
    expect(result).toMatchObject({ moderation: expected });
    expect(result).not.toHaveProperty("safe_mode");
    expect(input).toEqual({ model: "image-model", ...(callerValue ? { moderation: callerValue } : {}) });
  });

  it("removes the unsupported safe_mode field from OpenAI-compatible image requests", () => {
    expect(applyVeniceProviderSafetyPreference("/images/generations", {
      model: "image-model", safe_mode: false, moderation: "low",
    }, true)).toEqual({ model: "image-model", moderation: "auto" });
  });

  it("records every provider-safety image endpoint in the schema matrix", () => {
    expect(VENICE_PROVIDER_SAFETY_MATRIX.map((row) => row.endpoint)).toEqual([
      "/image/generate", "/image/edit", "/image/multi-edit", "/images/generations",
    ]);
  });

  it("omits safe_mode for endpoints whose request schemas do not declare it", () => {
    // Strict schemas (CreateSpeechRequestSchema, CreateTranscriptionRequestSchema,
    // CreateEmbeddingRequestSchema) set additionalProperties: false — an
    // undocumented safe_mode field would be rejected with a 400.
    expect(applyVeniceApiSafeMode("/audio/speech", { model: "m", input: "x" }, true).safe_mode).toBeUndefined();
    expect(applyVeniceApiSafeMode("/audio/transcriptions", { model: "m" }, true).safe_mode).toBeUndefined();
    expect(applyVeniceApiSafeMode("/embeddings", { model: "m", input: "x" }, true).safe_mode).toBeUndefined();
    // Augment requests do not declare safe_mode either.
    expect(applyVeniceApiSafeMode("/augment/search", { query: "q" }, true).safe_mode).toBeUndefined();
    expect(applyVeniceApiSafeMode("/augment/scrape", { url: "https://a.b" }, true).safe_mode).toBeUndefined();
    expect(applyVeniceApiSafeMode("/augment/text-parser", {}, true).safe_mode).toBeUndefined();
  });

  it("omits safe_mode for /audio/queue and /audio/retrieve (returned-content only)", () => {
    expect(applyVeniceApiSafeMode("/audio/queue", {}, true).safe_mode).toBeUndefined();
    expect(applyVeniceApiSafeMode("/audio/retrieve", {}, true).safe_mode).toBeUndefined();
  });

  it("omits safe_mode for /video/{retrieve,quote,complete} (returned-content only)", () => {
    expect(applyVeniceApiSafeMode("/video/queue", {}, true).safe_mode).toBeUndefined();
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
      "/images/generations",
      "/image/upscale",
      "/audio/speech",
      "/audio/transcriptions",
      "/audio/queue",
      "/audio/retrieve",
      "/audio/quote",
      "/audio/complete",
      "/audio/voices",
      "/embeddings",
      "/video/queue",
      "/video/retrieve",
      "/video/quote",
      "/video/complete",
      "/video/transcriptions",
      "/augment/search",
      "/augment/scrape",
      "/augment/text-parser",
      "/models",
      "/models/traits",
      "/models/compatibility_mapping",
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

  it("endpointSupportsSafeMode accepts /api/v1/* prefix from thin-client callers", () => {
    expect(endpointSupportsSafeMode("/api/v1/image/generate")).toBe(true);
    expect(endpointSupportsSafeMode("/api/v1/image/edit")).toBe(true);
    expect(endpointSupportsSafeMode("/api/v1/image/multi-edit")).toBe(true);
    expect(endpointSupportsSafeMode("/api/v1/embeddings")).toBe(false);
    expect(endpointSupportsSafeMode("/api/v1/audio/transcriptions")).toBe(false);
    expect(endpointSupportsSafeMode("/api/v1/chat/completions")).toBe(false);
    expect(endpointSupportsSafeMode("/api/v1/models")).toBe(false);
  });

  it("applyVeniceApiSafeMode works when given /api/v1/* prefixed endpoint", () => {
    const out = applyVeniceApiSafeMode("/api/v1/image/generate", { model: "m" }, true);
    expect(out.safe_mode).toBe(true);
  });
});
