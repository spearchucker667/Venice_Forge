/** @fileoverview Unit tests for src/services/modelClassification.ts. */

import { describe, it, expect } from "vitest";
import { classifyModel, flattenModels, normalizeModelInfo, resolveModelUncensored } from "./modelClassification";
import type { VeniceModel } from "../types/venice";

describe("classifyModel", () => {
  it("prefers explicit type over regex heuristics", () => {
    expect(classifyModel({ id: "flux-dev", type: "text" })).toBe("text");
    expect(classifyModel({ id: "llama-3.3-70b", type: "image" })).toBe("image");
    expect(classifyModel({ id: "wan-2.6-text-to-video", model_type: "audio" })).toBe("audio");
    expect(classifyModel({ id: "tts-kokoro", modelType: "video" })).toBe("video");
  });

  it("maps all required explicit Venice type values", () => {
    expect(classifyModel({ id: "m", type: "text" })).toBe("text");
    expect(classifyModel({ id: "m", type: "llm" })).toBe("text");
    expect(classifyModel({ id: "m", type: "chat" })).toBe("text");
    expect(classifyModel({ id: "m", type: "code" })).toBe("text");
    expect(classifyModel({ id: "m", type: "image" })).toBe("image");
    expect(classifyModel({ id: "m", type: "inpaint" })).toBe("image");
    expect(classifyModel({ id: "m", type: "upscale" })).toBe("image");
    expect(classifyModel({ id: "m", type: "tts" })).toBe("audio");
    expect(classifyModel({ id: "m", type: "asr" })).toBe("audio");
    expect(classifyModel({ id: "m", type: "audio" })).toBe("audio");
    expect(classifyModel({ id: "m", type: "music" })).toBe("audio");
    expect(classifyModel({ id: "m", type: "video" })).toBe("video");
    expect(classifyModel({ id: "m", type: "video-generation" })).toBe("video");
    expect(classifyModel({ id: "m", type: "embedding" })).toBe("embeddings");
    expect(classifyModel({ id: "m", type: "embeddings" })).toBe("embeddings");
  });

  it("falls back to regex when type is missing", () => {
    expect(classifyModel({ id: "llama-3.3-70b" })).toBe("text");
    expect(classifyModel({ id: "flux-dev" })).toBe("image");
    expect(classifyModel({ id: "tts-kokoro" })).toBe("audio");
    expect(classifyModel({ id: "wan-2.6-text-to-video" })).toBe("video");
    expect(classifyModel({ id: "text-embedding-bge-m3" })).toBe("embeddings");
  });

  it("does not override unrecognized explicit metadata with regex guesses", () => {
    expect(classifyModel({ id: "flux-dev", type: "unknown-type" })).toBe("unknown");
    expect(classifyModel({ id: "llama-3.3-70b", type: "foobar" })).toBe("unknown");
  });

  it("returns 'unknown' when no heuristic matches", () => {
    expect(classifyModel({ id: "xyz-abc" })).toBe("unknown");
    expect(classifyModel({ id: "xyz-abc", type: "unrecognized" })).toBe("unknown");
  });
});

describe("resolveModelUncensored", () => {
  const baseModel: VeniceModel = {
    id: "qwen-coder",
    object: "model",
    created: 0,
    owned_by: "venice",
    model_spec: { traits: [] },
  };

  it("prefers explicit model_spec.uncensored=true over any legacy trait signal", () => {
    const m: VeniceModel = {
      ...baseModel,
      model_spec: {
        traits: ["most_uncensored", "function_calling_default"],
        uncensored: true,
      },
    };
    expect(resolveModelUncensored(m)).toBe(true);
  });

  it("uses model_spec.uncensored=false even when the legacy trait is present", () => {
    // This is the key precedence rule: an explicit `false` from Venice
    // overrides the legacy trait heuristic. Without this guard a provider
    // change to a model's classification could be silently reverted by a
    // catalog stale enough to still carry `most_uncensored`.
    const m: VeniceModel = {
      ...baseModel,
      model_spec: {
        traits: ["most_uncensored"],
        uncensored: false,
      },
    };
    expect(resolveModelUncensored(m)).toBe(false);
  });

  it("falls back to the legacy `most_uncensored` trait when upstream did not set the flag", () => {
    const m: VeniceModel = {
      ...baseModel,
      model_spec: { traits: ["most_uncensored"] },
    };
    expect(resolveModelUncensored(m)).toBe(true);
  });

  it("returns false when neither signal is present", () => {
    expect(resolveModelUncensored({ ...baseModel, model_spec: { traits: ["function_calling_default"] } })).toBe(false);
    expect(resolveModelUncensored({ ...baseModel, model_spec: {} })).toBe(false);
    expect(resolveModelUncensored({ ...baseModel })).toBe(false);
  });

  it("returns false for null/undefined input rather than throwing", () => {
    expect(resolveModelUncensored(undefined)).toBe(false);
    expect(resolveModelUncensored(null)).toBe(false);
  });
});

describe("normalizeModelInfo uncensored propagation", () => {
  it("propagates model_spec.uncensored onto the normalized record", () => {
    const raw = {
      id: "venice-uncensored-llm",
      object: "model",
      created: 0,
      owned_by: "venice",
      type: "text",
      model_spec: { traits: [], uncensored: true },
    };
    const out = normalizeModelInfo(raw);
    expect(out.model_spec?.uncensored).toBe(true);
  });

  it("leaves model_spec.uncensored undefined when upstream omits it", () => {
    const raw = {
      id: "venice-standard-llm",
      object: "model",
      created: 0,
      owned_by: "venice",
      type: "text",
      model_spec: { traits: ["function_calling_default"] },
    };
    const out = normalizeModelInfo(raw);
    expect(out.model_spec?.uncensored).toBeUndefined();
  });
});

describe("flattenModels", () => {
  it("returns all-empty groups for an empty payload", () => {
    const groups = flattenModels([]);
    expect(groups).toEqual({
      text: [],
      image: [],
      audio: [],
      video: [],
      embeddings: [],
      unknown: [],
    });
  });

  it("classifies a model by explicit type field", () => {
    const groups = flattenModels([
      { id: "m1", type: "text" },
    ]);
    expect(groups.text).toHaveLength(1);
    expect(groups.text[0].id).toBe("m1");
    expect(groups.text[0].type).toBe("text");
  });

  it("classifies by id when type is missing", () => {
    const groups = flattenModels([
      { id: "llama-3.3-70b" },
      { id: "flux-dev" },
      { id: "wan-2.6-text-to-video" },
    ]);
    expect(groups.text).toHaveLength(1);
    expect(groups.image).toHaveLength(1);
    expect(groups.video).toHaveLength(1);
  });

  it("prefers explicit type over regex when populating normalized type", () => {
    const groups = flattenModels([
      { id: "flux-dev", type: "text" },
    ]);
    expect(groups.text).toHaveLength(1);
    expect(groups.text[0].type).toBe("text");
    expect(groups.image).toHaveLength(0);
  });

  it("unwraps a { data: [...] } envelope", () => {
    const groups = flattenModels({ data: [{ id: "llama-3.3-70b" }] });
    expect(groups.text).toHaveLength(1);
  });

  it("marks source as 'live' on normalized models", () => {
    const groups = flattenModels([{ id: "x", type: "text" }]);
    expect(groups.text[0].source).toBe("live");
  });

  it("places models with no matching heuristic into unknown", () => {
    const groups = flattenModels([{ id: "mystery-model" }]);
    expect(groups.unknown).toHaveLength(1);
    expect(groups.unknown[0].type).toBe("unknown");
  });
});
