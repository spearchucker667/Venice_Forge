/** @fileoverview Tests for image model capabilities + dimension resolver. */

import { describe, expect, it } from "vitest";
import {
  buildDimensionOptions,
  getEditModelCapabilities,
  getImageModelCapabilities,
  getRecipeCapabilityList,
  getTextToImageModelCapabilities,
  getUnsupportedRecipeFields,
  isDimensionSupported,
  normalizeDimensionsForModel,
  SEEDREAM_EDIT_IDS,
  SEEDREAM_TEXT_TO_IMAGE_IDS,
} from "./image-model-capabilities";
import type { ImageConstraints } from "../types/venice";

describe("getImageModelCapabilities", () => {
  it("returns pixel (widthHeight) for SD-classic models", () => {
    const caps = getImageModelCapabilities("flux-dev");
    expect(caps.dimensionMode).toBe("widthHeight");
    expect(caps.supportsSeed).toBe(true);
    expect(caps.supportsVariants).toBe(true);
  });

  it("returns aspectResolution for nano-banana-v1", () => {
    const caps = getImageModelCapabilities("nano-banana-v1");
    expect(caps.dimensionMode).toBe("aspectResolution");
    expect(caps.aspectRatios?.length).toBeGreaterThan(0);
    expect(caps.resolutions?.length).toBeGreaterThan(0);
  });

  it("does NOT register venice-uncensored-1-2 as an image model", () => {
    const caps = getImageModelCapabilities("venice-uncensored-1-2");
    // Pattern-match would not match because the registry does not
    // contain it — so we should fall back to widthHeight.
    expect(caps.dimensionMode).toBe("widthHeight");
  });

  it("falls back to widthHeight for unknown models", () => {
    const caps = getImageModelCapabilities("unknown-model-xyz");
    expect(caps.dimensionMode).toBe("widthHeight");
    expect(caps.widthHeightOptions?.length).toBeGreaterThan(0);
  });

  it("supports quality + variants in nano-banana-v1 capabilities", () => {
    const caps = getImageModelCapabilities("nano-banana-v1");
    expect(caps.qualities?.length).toBeGreaterThan(0);
    expect(caps.supportsVariants).toBe(true);
  });
});

describe("buildDimensionOptions — widthHeight fallback", () => {
  it("returns widthHeight mode with default pairs for SD-classic models", () => {
    const out = buildDimensionOptions("flux-dev", null);
    expect(out.dimensionMode).toBe("widthHeight");
    expect(out.widthHeightOptions?.length).toBeGreaterThan(0);
  });
});

describe("buildDimensionOptions — camelCase constraints", () => {
  it("treats camelCase aspectRatios as aspect-only mode", () => {
    const constraints: ImageConstraints = {
      aspectRatios: ["1:1", "16:9"],
      defaultAspectRatio: "16:9",
    };
    const out = buildDimensionOptions("some-model", constraints);
    expect(out.dimensionMode).toBe("aspectRatio");
    expect(out.aspectRatios?.map((a) => a.id)).toEqual(["1:1", "16:9"]);
    expect(out.defaultDimensions.aspectRatio).toBe("16:9");
  });

  it("treats camelCase aspectRatios + resolutions as aspectResolution", () => {
    const constraints: ImageConstraints = {
      aspectRatios: ["1:1", "16:9"],
      defaultAspectRatio: "1:1",
      resolutions: ["1k", "2k"],
      defaultResolution: "2k",
    };
    const out = buildDimensionOptions("some-model", constraints);
    expect(out.dimensionMode).toBe("aspectResolution");
    expect(out.resolutions?.map((r) => r.id)).toEqual(["1k", "2k"]);
    expect(out.defaultDimensions.resolution).toBe("2k");
  });
});

describe("buildDimensionOptions — snake_case constraints", () => {
  it("normalises snake_case aspect_ratios + default_aspect_ratio", () => {
    const raw = {
      aspect_ratios: ["1:1", "4:3"],
      default_aspect_ratio: "4:3",
    };
    const out = buildDimensionOptions("some-model", raw as unknown as ImageConstraints);
    expect(out.dimensionMode).toBe("aspectRatio");
    expect(out.aspectRatios?.map((a) => a.id)).toEqual(["1:1", "4:3"]);
    expect(out.defaultDimensions.aspectRatio).toBe("4:3");
  });

  it("normalises snake_case resolutions + default_resolution", () => {
    const raw = {
      aspect_ratios: ["1:1"],
      resolutions: ["1k", "4k"],
      default_resolution: "4k",
    };
    const out = buildDimensionOptions("some-model", raw as unknown as ImageConstraints);
    expect(out.dimensionMode).toBe("aspectResolution");
    expect(out.resolutions?.map((r) => r.id)).toEqual(["1k", "4k"]);
    expect(out.defaultDimensions.resolution).toBe("4k");
  });

  it("normalises width_height_divisor", () => {
    const raw = {
      aspect_ratios: ["1:1"],
      width_height_divisor: 128,
    };
    const out = buildDimensionOptions("some-model", raw as unknown as ImageConstraints);
    expect(out.dimensionMode).toBe("aspectRatio");
  });
});

describe("buildDimensionOptions — quality / variants", () => {
  it("returns qualities + defaultQuality for nano-banana-v1", () => {
    const out = buildDimensionOptions("nano-banana-v1", null);
    expect(out.qualities?.length).toBeGreaterThan(0);
    expect(["low", "medium", "high"]).toContain(out.defaultQuality);
  });

  it("omits quality for SD-classic models", () => {
    const out = buildDimensionOptions("flux-dev", null);
    expect(out.qualities).toBeUndefined();
    expect(out.defaultQuality).toBeUndefined();
  });
});

// Phase 2A: Phase 2A model-aware recipe surface (VERIFY-043).
describe("isDimensionSupported", () => {
  it("returns true for a widthHeight model with matching pair", () => {
    const caps = getImageModelCapabilities("flux-dev");
    expect(isDimensionSupported(caps, 1024, 1024)).toBe(true);
  });

  it("returns false for a widthHeight model with non-listed pair", () => {
    const caps = getImageModelCapabilities("flux-dev");
    expect(isDimensionSupported(caps, 333, 333)).toBe(false);
  });

  it("returns true for aspect-only / aspect-resolution models regardless of pixel pair", () => {
    const caps = getImageModelCapabilities("nano-banana-v1");
    expect(isDimensionSupported(caps, 1024, 1024)).toBe(true);
    expect(isDimensionSupported(caps, undefined, undefined)).toBe(false);
  });

  it("returns false for invalid input", () => {
    const caps = getImageModelCapabilities("flux-dev");
    expect(isDimensionSupported(caps, NaN, 100)).toBe(false);
    expect(isDimensionSupported(caps, 100, Infinity)).toBe(false);
  });
});

describe("normalizeDimensionsForModel", () => {
  it("keeps a supported widthHeight pair and returns no warning", () => {
    const caps = getImageModelCapabilities("flux-dev");
    const out = normalizeDimensionsForModel(caps, { width: 1024, height: 1024 });
    expect(out.width).toBe(1024);
    expect(out.height).toBe(1024);
    expect(out.warning).toBeUndefined();
  });

  it("defaults unsupported widthHeight pair and emits a warning", () => {
    const caps = getImageModelCapabilities("flux-dev");
    const out = normalizeDimensionsForModel(caps, { width: 333, height: 333 });
    expect(out.width).toBe(1024);
    expect(out.height).toBe(1024);
    expect(out.warning).toMatch(/Adjusted dimensions/);
  });

  it("drops width/height for aspectRatio / aspectResolution models and keeps the ratio", () => {
    const caps = getImageModelCapabilities("nano-banana-v1");
    const out = normalizeDimensionsForModel(caps, {
      width: 1024,
      height: 1024,
      aspectRatio: "99:1",
    });
    expect(out.width).toBeUndefined();
    expect(out.height).toBeUndefined();
    expect(out.aspectRatio).toBe("1:1"); // default fallback
    expect(out.warning).toMatch(/aspect ratio/i);
  });

  it("keeps valid aspect ratio + resolution on aspectResolution models", () => {
    const caps = getImageModelCapabilities("nano-banana-v1");
    const out = normalizeDimensionsForModel(caps, {
      aspectRatio: "16:9",
      resolution: "2k",
    });
    expect(out.aspectRatio).toBe("16:9");
    expect(out.resolution).toBe("2k");
  });
});

describe("getUnsupportedRecipeFields", () => {
  it("lists negativePrompt + seed + variants when caps disable them", () => {
    const caps = {
      modelId: "x",
      label: "x",
      dimensionMode: "widthHeight" as const,
      defaultDimensions: { width: 1024, height: 1024 },
      supportsNegativePrompt: false,
      supportsSeed: false,
      supportsVariants: false,
    };
    expect(
      getUnsupportedRecipeFields(
        { negativePrompt: "x", seed: 1, variants: 2, steps: 5 },
        caps,
      ),
    ).toEqual(expect.arrayContaining(["negativePrompt", "seed", "variants"]));
  });

  it("lists width/height outside widthHeight dimension mode", () => {
    const caps = {
      modelId: "x",
      label: "x",
      dimensionMode: "aspectResolution" as const,
      defaultDimensions: { aspectRatio: "1:1", resolution: "1k" },
      supportsNegativePrompt: true,
      supportsSeed: true,
      supportsVariants: true,
    };
    expect(
      getUnsupportedRecipeFields({ width: 1024, height: 1024 }, caps),
    ).toEqual(expect.arrayContaining(["width", "height"]));
  });
});

describe("getRecipeCapabilityList", () => {
  it("describes a widthHeight SD-classic model", () => {
    const caps = getImageModelCapabilities("flux-dev");
    const list = getRecipeCapabilityList(caps);
    expect(list.join(" ")).toMatch(/sizes/);
    expect(list.join(" ")).toMatch(/Negative prompt/);
    expect(list.join(" ")).toMatch(/Seed/);
  });

  it("describes an aspect-resolution model with ratio × resolution count", () => {
    const caps = getImageModelCapabilities("nano-banana-v1");
    const list = getRecipeCapabilityList(caps);
    expect(list.join(" ")).toMatch(/ratios/);
    expect(list.join(" ")).toMatch(/resolutions/);
    expect(list.join(" ")).toMatch(/Quality/);
  });

  it("flags disabled features when the model does not support them", () => {
    const caps = {
      modelId: "x",
      label: "x",
      dimensionMode: "widthHeight" as const,
      defaultDimensions: { width: 1024, height: 1024 },
      supportsNegativePrompt: false,
      supportsSeed: true,
      supportsVariants: true,
      supportsSteps: false,
      supportsCfgScale: false,
      supportsStyle: false,
    };
    const list = getRecipeCapabilityList(caps);
    expect(list.join(" ")).toMatch(/No negative prompt/);
    expect(list.join(" ")).toMatch(/No steps/);
    expect(list.join(" ")).toMatch(/No CFG/);
    expect(list.join(" ")).toMatch(/No style preset/);
  });
});

// ── Seedream model registration and operation discrimination ─────────────────

describe("Seedream text-to-image models", () => {
  const TEXT_TO_IMAGE_IDS = ["seedream-v5-pro", "seedream-v5-lite", "seedream-v4"];

  it("SEEDREAM_TEXT_TO_IMAGE_IDS contains all three generate model IDs", () => {
    for (const id of TEXT_TO_IMAGE_IDS) {
      expect(SEEDREAM_TEXT_TO_IMAGE_IDS.has(id)).toBe(true);
    }
  });

  it("each Seedream text-to-image model is registered with operation='text-to-image'", () => {
    for (const id of TEXT_TO_IMAGE_IDS) {
      const caps = getImageModelCapabilities(id);
      expect(caps.modelId).toBe(id);
      expect(caps.operation).toBe("text-to-image");
    }
  });

  it("Seedream text-to-image models use aspectRatio dimensionMode", () => {
    for (const id of TEXT_TO_IMAGE_IDS) {
      const caps = getImageModelCapabilities(id);
      expect(caps.dimensionMode).toBe("aspectRatio");
      expect(caps.aspectRatios?.length).toBeGreaterThan(0);
    }
  });

  it("Seedream text-to-image models default to 1:1 aspect ratio", () => {
    for (const id of TEXT_TO_IMAGE_IDS) {
      const caps = getImageModelCapabilities(id);
      expect(caps.defaultDimensions.aspectRatio).toBe("1:1");
    }
  });

  it("Seedream text-to-image models do NOT support negative prompts", () => {
    for (const id of TEXT_TO_IMAGE_IDS) {
      const caps = getImageModelCapabilities(id);
      expect(caps.supportsNegativePrompt).toBe(false);
    }
  });

  it("Seedream text-to-image models support seed and variants", () => {
    for (const id of TEXT_TO_IMAGE_IDS) {
      const caps = getImageModelCapabilities(id);
      expect(caps.supportsSeed).toBe(true);
      expect(caps.supportsVariants).toBe(true);
    }
  });

  it("getTextToImageModelCapabilities returns non-null for Seedream generate models", () => {
    for (const id of TEXT_TO_IMAGE_IDS) {
      expect(getTextToImageModelCapabilities(id)).not.toBeNull();
    }
  });

  it("getEditModelCapabilities returns null for Seedream generate models", () => {
    for (const id of TEXT_TO_IMAGE_IDS) {
      expect(getEditModelCapabilities(id)).toBeNull();
    }
  });
});

describe("Seedream image-edit models", () => {
  const EDIT_IDS = ["seedream-v5-pro-edit", "seedream-v5-lite-edit", "seedream-v4-edit"];

  it("SEEDREAM_EDIT_IDS contains all three edit model IDs", () => {
    for (const id of EDIT_IDS) {
      expect(SEEDREAM_EDIT_IDS.has(id)).toBe(true);
    }
  });

  it("each Seedream edit model is registered with operation='image-edit'", () => {
    for (const id of EDIT_IDS) {
      const caps = getImageModelCapabilities(id);
      expect(caps.modelId).toBe(id);
      expect(caps.operation).toBe("image-edit");
    }
  });

  it("Seedream edit models use aspectRatio dimensionMode with 'auto' as default", () => {
    for (const id of EDIT_IDS) {
      const caps = getImageModelCapabilities(id);
      expect(caps.dimensionMode).toBe("aspectRatio");
      expect(caps.defaultDimensions.aspectRatio).toBe("auto");
    }
  });

  it("Seedream edit models do NOT support seed, variants, steps, cfgScale, style", () => {
    for (const id of EDIT_IDS) {
      const caps = getImageModelCapabilities(id);
      expect(caps.supportsSeed).toBe(false);
      expect(caps.supportsVariants).toBe(false);
      expect(caps.supportsSteps).toBe(false);
      expect(caps.supportsCfgScale).toBe(false);
      expect(caps.supportsStyle).toBe(false);
      expect(caps.supportsHideWatermark).toBe(false);
      expect(caps.supportsReturnBinary).toBe(false);
    }
  });

  it("getEditModelCapabilities returns non-null for Seedream edit models", () => {
    for (const id of EDIT_IDS) {
      expect(getEditModelCapabilities(id)).not.toBeNull();
    }
  });

  it("getTextToImageModelCapabilities returns null for Seedream edit models", () => {
    for (const id of EDIT_IDS) {
      expect(getTextToImageModelCapabilities(id)).toBeNull();
    }
  });

  it("Seedream edit model aspect ratios include 'auto'", () => {
    for (const id of EDIT_IDS) {
      const caps = getImageModelCapabilities(id);
      const autoRatio = caps.aspectRatios?.find((r) => r.id === "auto");
      expect(autoRatio).toBeDefined();
    }
  });
});

describe("Seedream model pattern matching", () => {
  it("seedream-v4-edit pattern matches unknown seedream edit variants", () => {
    const caps = getImageModelCapabilities("seedream-v99-edit");
    // Should pattern-match seedream-v4-edit and return operation='image-edit'
    expect(caps.operation).toBe("image-edit");
  });

  it("non-edit Seedream IDs do NOT match the edit pattern", () => {
    // Seedream text-to-image models should NOT be pattern-matched as image-edit
    const caps = getImageModelCapabilities("seedream-v5-pro");
    expect(caps.operation).toBe("text-to-image");
  });
});

describe("Seedream models do not interfere with existing models", () => {
  it("flux-dev remains widthHeight text-to-image", () => {
    const caps = getImageModelCapabilities("flux-dev");
    expect(caps.dimensionMode).toBe("widthHeight");
    expect(caps.operation).toBe("text-to-image");
  });

  it("nano-banana-v1 remains aspectResolution text-to-image", () => {
    const caps = getImageModelCapabilities("nano-banana-v1");
    expect(caps.dimensionMode).toBe("aspectResolution");
    expect(caps.operation).toBe("text-to-image");
  });

  it("flux-2-max-edit (not in static registry) falls back to widthHeight with no operation", () => {
    // flux-2-max-edit is not in the static registry — it falls back to widthHeight
    // and should NOT be tagged as image-edit by the capabilities registry
    // (IMAGE_EDIT_MODEL_IDS in constants/venice.ts handles that separately)
    const caps = getImageModelCapabilities("flux-2-max-edit");
    // The /^flux(?!.*edit)/i pattern must NOT match this model
    expect(caps.dimensionMode).toBe("widthHeight");
    // Note: operation is undefined for unknown models (not 'image-edit')
    expect(caps.operation).not.toBe("image-edit");
  });
});
