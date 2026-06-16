import { describe, it, expect } from "vitest";
import { normalizeMediaModelSpec } from "./mediaModelSpecs";
import type { ModelInfo } from "../types/venice";

describe("normalizeMediaModelSpec", () => {
  it("maps basic model information correctly", () => {
    const model: ModelInfo = {
      id: "test-model",
      name: "Test Model",
      type: "unknown",
      owned_by: "venice",
      source: "live-model-spec",
    };

    const result = normalizeMediaModelSpec(model);

    expect(result.id).toBe("test-model");
    expect(result.name).toBe("Test Model");
    expect(result.type).toBe("unknown");
    expect(result.ownedBy).toBe("venice");
    expect(result.specSource).toBe("inferred"); // because traits/capabilities/features are empty
    expect(result.directions).toEqual([]);
    expect(result.inputs).toEqual(["prompt"]);
  });

  it("uses display_name as fallback for name and falls back to id if neither provided", () => {
    const model1: ModelInfo = {
      id: "model1",
      display_name: "Model One",
    };
    expect(normalizeMediaModelSpec(model1).name).toBe("Model One");

    const model2: ModelInfo = {
      id: "model2",
    };
    expect(normalizeMediaModelSpec(model2).name).toBe("model2");
  });

  it("maps traits/capabilities/features to rawSpec and sets correct specSource", () => {
    const modelWithTraits: ModelInfo = {
      id: "model3",
      traits: { privacy: "public", deprecated: true, beta: true, pricing: { input: 1 } },
    };
    
    const result = normalizeMediaModelSpec(modelWithTraits);
    expect(result.specSource).toBe("live-model-spec");
    expect(result.privacy).toBe("public");
    expect(result.deprecated).toBe(true);
    expect(result.beta).toBe(true);
    expect(result.pricing).toEqual({ input: 1 });
    expect(result.raw).toEqual({ privacy: "public", deprecated: true, beta: true, pricing: { input: 1 } });
  });

  it("handles fallback specSource", () => {
    const model: ModelInfo = {
      id: "model",
      source: "fallback"
    };
    expect(normalizeMediaModelSpec(model).specSource).toBe("fallback");
  });

  describe("video models", () => {
    it("handles topaz-video-upscale specifically", () => {
      const model: ModelInfo = {
        id: "topaz-video-upscale-v1",
        type: "video"
      };
      
      const result = normalizeMediaModelSpec(model);
      expect(result.directions).toEqual(["video-upscale"]);
      expect(result.inputs).toEqual(["video_url", "upscale_factor"]);
      expect(result.upscaleFactors).toEqual([2, 4]);
      expect(result.defaultUpscaleFactor).toBe(2);
    });

    it("maps upscale_factors from rawSpec for topaz-video-upscale", () => {
      const model: ModelInfo = {
        id: "topaz-video-upscale-v2",
        type: "video",
        features: { upscale_factors: [2, 4, 8] }
      };
      
      const result = normalizeMediaModelSpec(model);
      expect(result.upscaleFactors).toEqual([2, 4, 8]);
    });

    it("adds video directions based on id", () => {
      const model: ModelInfo = {
        id: "some-text-to-video-model",
        type: "video"
      };
      
      const result = normalizeMediaModelSpec(model);
      expect(result.directions).toContain("text-to-video");
    });

    it("adds video directions based on rawSpec", () => {
      const model: ModelInfo = {
        id: "some-model",
        type: "video",
        capabilities: { image_to_video: true, video_to_video: true } as any
      };
      
      const result = normalizeMediaModelSpec(model);
      expect(result.directions).toContain("image-to-video");
      expect(result.directions).toContain("video-to-video");
      expect(result.inputs).toContain("image_url");
      expect(result.inputs).toContain("video_url");
      expect(result.inputs).toContain("duration");
    });

    it("provides fallback directions for generic video models", () => {
      const model: ModelInfo = {
        id: "generic-video-model",
        type: "video"
      };
      
      const result = normalizeMediaModelSpec(model);
      expect(result.directions).toEqual(["text-to-video", "image-to-video"]);
      expect(result.inputs).toContain("image_url");
    });

    it("sets default properties for wan models", () => {
      const model: ModelInfo = {
        id: "wan-video-v1",
        type: "video"
      };
      
      const result = normalizeMediaModelSpec(model);
      expect(result.durations).toEqual(["5s"]);
      expect(result.defaultDuration).toBe("5s");
      expect(result.resolutions).toEqual(["480p", "720p", "1080p"]);
      expect(result.defaultResolution).toBe("1080p");
    });
  });

  describe("image models", () => {
    it("handles edit/inpaint models", () => {
      const editModel: ModelInfo = {
        id: "some-edit-model",
        type: "image"
      };
      
      const resultEdit = normalizeMediaModelSpec(editModel);
      expect(resultEdit.directions).toEqual(["image-edit", "image-multi-edit"]);
      expect(resultEdit.inputs).toEqual(["prompt", "image_url", "aspect_ratio", "resolution", "output_format", "safe_mode", "quality"]);

      const inpaintModel: ModelInfo = {
        id: "some-inpaint-model",
        type: "image"
      };
      const resultInpaint = normalizeMediaModelSpec(inpaintModel);
      expect(resultInpaint.directions).toEqual(["image-edit", "image-multi-edit"]);
    });

    it("handles upscale models", () => {
      const model: ModelInfo = {
        id: "image-upscale-v1",
        type: "image"
      };
      
      const result = normalizeMediaModelSpec(model);
      expect(result.directions).toEqual(["image-upscale"]);
      expect(result.inputs).toEqual(["image_url", "upscale_factor"]);
    });

    it("handles generic text-to-image models", () => {
      const model: ModelInfo = {
        id: "standard-image-model",
        type: "image",
        traits: {
          resolutions: ["512x512", "1024x1024"],
          aspect_ratios: ["1:1", "16:9"],
        }
      };
      
      const result = normalizeMediaModelSpec(model);
      expect(result.directions).toEqual(["text-to-image"]);
      expect(result.inputs).toEqual(["prompt", "negative_prompt", "aspect_ratio", "resolution", "safe_mode"]);
      expect(result.resolutions).toEqual(["512x512", "1024x1024"]);
      expect(result.aspectRatios).toEqual(["1:1", "16:9"]);
    });
  });
});
