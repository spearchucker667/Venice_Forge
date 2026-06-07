/** @fileoverview Tests for image model capabilities + dimension resolver. */

import { describe, expect, it } from "vitest";
import {
  buildDimensionOptions,
  getImageModelCapabilities,
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
