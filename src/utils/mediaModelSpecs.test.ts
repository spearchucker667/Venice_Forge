import { describe, it, expect } from "vitest";
import { normalizeMediaModelSpec } from "./mediaModelSpecs";

describe("normalizeMediaModelSpec", () => {
  it("detects topaz-video-upscale correctly", () => {
    const spec = normalizeMediaModelSpec({
      id: "topaz-video-upscale",
      type: "video"
    });
    expect(spec.directions).toContain("video-upscale");
    expect(spec.inputs).toContain("video_url");
    expect(spec.inputs).toContain("upscale_factor");
    expect(spec.inputs).not.toContain("prompt");
  });

  it("detects image-to-video correctly from traits", () => {
    const spec = normalizeMediaModelSpec({
      id: "some-model",
      type: "video",
      traits: { image_to_video: true }
    });
    expect(spec.directions).toContain("image-to-video");
    expect(spec.inputs).toContain("image_url");
  });

  it("detects text-to-image correctly", () => {
    const spec = normalizeMediaModelSpec({
      id: "some-model",
      type: "image"
    });
    expect(spec.directions).toContain("text-to-image");
    expect(spec.inputs).toContain("prompt");
  });

  it("preserves exact resolutions when provided", () => {
    const spec = normalizeMediaModelSpec({
      id: "res-model",
      type: "image",
      traits: { resolutions: ["1024x1024", "800x600"] }
    });
    expect(spec.resolutions).toEqual(["1024x1024", "800x600"]);
  });
});
