import { describe, it, expect } from "vitest";
import { formatModelLabelWithCost, type PricingDisplayInput, extractChatResponseCost, estimateChatCostFromListPricing } from "./pricing";
import type { VeniceModel } from "../types/venice";

function makeVeniceModel(
  overrides: Partial<VeniceModel> & { id: string },
): VeniceModel {
  return {
    object: "model",
    created: 1700000000,
    owned_by: "test",
    ...overrides,
  } as VeniceModel;
}

describe("formatModelLabelWithCost", () => {
  it("formats a text model with input/output per-1M-token prices", () => {
    const model = makeVeniceModel({
      id: "llama-3.3-70b",
      model_spec: {
        name: "Llama 3.3 70B",
        pricing: { input: { usd: 3.75 }, output: { usd: 18.75 } },
      },
    });
    expect(formatModelLabelWithCost(model)).toBe(
      "Llama 3.3 70B (Input $3.75 / 1M tokens · Output $18.75 / 1M tokens)",
    );
  });

  it("formats an image model per-image price", () => {
    const model = makeVeniceModel({
      id: "flux-dev",
      model_spec: {
        name: "FLUX.1 [dev]",
        constraints: { resolutions: ["1024x1024"] },
        pricing: { generation: { usd: 0.27 } },
      },
    });
    expect(formatModelLabelWithCost(model)).toBe("FLUX.1 [dev] ($0.27/image)");
  });

  it("prefers generation pricing over an auxiliary upscale table for image models", () => {
    const model = makeVeniceModel({
      id: "multi-price-image",
      type: "image",
      model_spec: {
        name: "Multi Price Image",
        pricing: {
          generation: { usd: 0.03 },
          upscale: { "2x": { usd: 0.02 }, "4x": { usd: 0.08 } },
        },
      },
    });
    expect(formatModelLabelWithCost(model)).toBe(
      "Multi Price Image ($0.03/image)",
    );
  });

  it("does not say 'Live' for fallback or catalog sources", () => {
    const liveModel = makeVeniceModel({
      id: "gpt-4o",
      model_spec: {
        name: "GPT-4o",
        pricing: { output: { usd: 10 } },
      },
    });
    expect(formatModelLabelWithCost(liveModel, { provenance: "live" })).toBe(
      "GPT-4o (Output $10.00 / 1M tokens)",
    );

    const fallbackModel = makeVeniceModel({
      id: "gpt-4o",
      model_spec: {
        name: "GPT-4o",
        pricing: { output: { usd: 10 } },
      },
    });
    expect(
      formatModelLabelWithCost(fallbackModel, { provenance: "fallback" }),
    ).toBe("GPT-4o (Estimated: Output $10.00 / 1M tokens)");
    expect(
      formatModelLabelWithCost(fallbackModel, { provenance: "fallback" }),
    ).not.toContain("Live");

    const catalogModel = makeVeniceModel({
      id: "gpt-4o",
      model_spec: {
        name: "GPT-4o",
        pricing: { output: { usd: 10 } },
      },
    });
    expect(
      formatModelLabelWithCost(catalogModel, { provenance: "catalog" }),
    ).toBe("GPT-4o (Catalog: Output $10.00 / 1M tokens)");
  });

  it("reads provenance from the model object", () => {
    const model = {
      id: "llama-3.3-70b",
      source: "fallback",
      isFallback: true,
      model_spec: {
        name: "Llama 3.3 70B",
        pricing: { input: { usd: 3.75 }, output: { usd: 18.75 } },
      },
    } satisfies PricingDisplayInput;
    expect(formatModelLabelWithCost(model)).toBe(
      "Llama 3.3 70B (Estimated: Input $3.75 / 1M tokens · Output $18.75 / 1M tokens)",
    );
  });

  it("returns Price unavailable when pricing is missing", () => {
    const model = makeVeniceModel({
      id: "mystery-model",
      model_spec: { name: "Mystery" },
    });
    expect(formatModelLabelWithCost(model)).toBe(
      "Mystery (Price unavailable)",
    );
  });

  it("returns just the model name for minimal selectors when price is unavailable", () => {
    const model = makeVeniceModel({
      id: "mystery-model",
      model_spec: { name: "Mystery" },
    });
    expect(formatModelLabelWithCost(model, { minimal: true })).toBe("Mystery");
  });

  it("does not display discount_to_user as the base price", () => {
    const model = makeVeniceModel({
      id: "reseller-model",
      discount_to_user: 0.2,
      model_spec: {
        name: "Reseller Model",
        pricing: { output: { usd: 10 } },
      },
    });
    expect(formatModelLabelWithCost(model)).toBe(
      "Reseller Model (Output $10.00 / 1M tokens)",
    );
    expect(formatModelLabelWithCost(model)).not.toContain("$8");
  });

  it("formats video durations as a per-second or per-generation price", () => {
    const model = makeVeniceModel({
      id: "wan-2.6-text-to-video",
      model_spec: {
        name: "Wan 2.6",
        pricing: {
          durations: {
            "5s": { usd: 0.5, min_seconds: 5, max_seconds: 5 },
            "10s": { usd: 0.9, min_seconds: 10, max_seconds: 10 },
          },
        },
      },
    });
    expect(formatModelLabelWithCost(model)).toBe(
      "Wan 2.6 (from $0.50/generation (5s))",
    );
  });

  it("falls back to a duration range per-second rate when min and max differ", () => {
    const model = makeVeniceModel({
      id: "stable-audio",
      model_spec: {
        name: "Stable Audio",
        pricing: { per_second: { usd: 0.06 } },
      },
    });
    expect(formatModelLabelWithCost(model)).toBe("Stable Audio ($0.06/second)");
  });

  it("formats image resolution, edit, and upscale pricing with declared units", () => {
    expect(formatModelLabelWithCost(makeVeniceModel({
      id: "resolution-image",
      type: "image",
      model_spec: {
        name: "Resolution Image",
        pricing: { resolutions: { "1K": { usd: 0.18 }, "2K": { usd: 0.24 } } },
      },
    }))).toBe("Resolution Image (from $0.18/image (1K))");

    expect(formatModelLabelWithCost(makeVeniceModel({
      id: "edit-model",
      type: "inpaint",
      model_spec: { name: "Edit Model", pricing: { inpaint: { usd: 0.04 } } },
    }))).toBe("Edit Model ($0.04/edit)");

    expect(formatModelLabelWithCost(makeVeniceModel({
      id: "upscale-model",
      type: "upscale",
      model_spec: {
        name: "Upscale Model",
        pricing: { upscale: { "2x": { usd: 0.02 }, "4x": { usd: 0.08 } } },
      },
    }))).toBe("Upscale Model (from $0.02/2x upscale)");
  });

  it("formats TTS and ASR pricing without treating characters as tokens", () => {
    expect(formatModelLabelWithCost(makeVeniceModel({
      id: "tts-model",
      type: "tts",
      model_spec: { name: "TTS", pricing: { input: { usd: 3.5 } } },
    }))).toBe("TTS ($3.50 / 1M characters)");

    expect(formatModelLabelWithCost(makeVeniceModel({
      id: "asr-model",
      type: "asr",
      model_spec: { name: "ASR", pricing: { per_audio_second: { usd: 0.0001 } } },
    }))).toBe("ASR ($0.0001/audio second)");
  });

  it("labels cached pricing as cached rather than live", () => {
    const model = {
      id: "cached-image",
      type: "image",
      source: "cache",
      model_spec: { name: "Cached Image", pricing: { generation: { usd: 0.03 } } },
    } satisfies PricingDisplayInput;
    expect(formatModelLabelWithCost(model)).toBe(
      "Cached Image (Cached: $0.03/image)",
    );
  });
});

describe("extractChatResponseCost", () => {
  it("returns the caller-specific cost with source='response' when present", () => {
    const out = extractChatResponseCost({
      prompt_tokens: 12,
      completion_tokens: 8,
      total_tokens: 20,
      cost: { usd: 0.0021, diem: 0.042 },
    });
    expect(out).toEqual({ usd: 0.0021, diem: 0.042, source: "response" });
  });

  it("returns null when usage has no cost block — does NOT silently substitute list pricing", () => {
    expect(extractChatResponseCost({ prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 })).toBeNull();
    expect(extractChatResponseCost(null)).toBeNull();
    expect(extractChatResponseCost(undefined)).toBeNull();
  });

  it("returns null when the cost block is present but carries no finite values", () => {
    expect(extractChatResponseCost({ prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost: {} })).toBeNull();
    expect(
      extractChatResponseCost({ prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost: { usd: NaN } }),
    ).toBeNull();
  });
});

describe("estimateChatCostFromListPricing", () => {
  it("computes a per-1M-tokens estimate and labels it as an estimate", () => {
    const model: PricingDisplayInput = {
      id: "llm",
      type: "text",
      model_spec: {
        pricing: {
          input: { usd: 2 },
          output: { usd: 8 },
        },
      },
    };
    const out = estimateChatCostFromListPricing(model, { prompt_tokens: 1000, completion_tokens: 500 });
    expect(out).not.toBeNull();
    expect(out!.source).toBe("list-pricing-estimate");
    // (1000 / 1_000_000) * 2 + (500 / 1_000_000) * 8 = 0.002 + 0.004 = 0.006
    expect(out!.usd).toBeCloseTo(0.006, 6);
  });

  it("returns null when no input/output pricing is configured", () => {
    const model: PricingDisplayInput = { id: "llm", type: "text", model_spec: { pricing: {} } };
    expect(estimateChatCostFromListPricing(model, { prompt_tokens: 100, completion_tokens: 100 })).toBeNull();
  });

  it("returns null when total tokens is zero", () => {
    const model: PricingDisplayInput = {
      id: "llm",
      type: "text",
      model_spec: { pricing: { input: { usd: 2 }, output: { usd: 8 } } },
    };
    expect(estimateChatCostFromListPricing(model, { prompt_tokens: 0, completion_tokens: 0 })).toBeNull();
  });
});
