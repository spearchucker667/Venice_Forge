/** @fileoverview VERIFY-043 — payloadBuilders honors per-capability stripping
 *  flags so the form's model-aware visibility decisions cannot regress
 *  at the network boundary. */

import { describe, expect, it } from "vitest";
import { buildImagePayload } from "./payloadBuilders";

describe("buildImagePayload — model-aware sanitization (VERIFY-043)", () => {
  it("strips negative_prompt when supportsNegativePrompt is false", () => {
    const payload = buildImagePayload("flux-dev", {
      prompt: "A copper city at dusk",
      negative: "blurry",
      supportsNegativePrompt: false,
    });
    expect(payload).not.toHaveProperty("negative_prompt");
  });

  it("strips style_preset when supportsStyle is false", () => {
    const payload = buildImagePayload("flux-dev", {
      prompt: "A copper city at dusk",
      style: "photo",
      supportsStyle: false,
    });
    expect(payload).not.toHaveProperty("style_preset");
  });

  it("strips steps when supportsSteps is false", () => {
    const payload = buildImagePayload("flux-dev", {
      prompt: "A copper city at dusk",
      steps: 25,
      supportsSteps: false,
    });
    expect(payload).not.toHaveProperty("steps");
  });

  it("strips cfg_scale when supportsCfgScale is false", () => {
    const payload = buildImagePayload("flux-dev", {
      prompt: "A copper city at dusk",
      cfg: 7,
      supportsCfgScale: false,
    });
    expect(payload).not.toHaveProperty("cfg_scale");
  });

  it("omits the seed key when supportsSeed is false", () => {
    const payload = buildImagePayload("flux-dev", {
      prompt: "A copper city at dusk",
      supportsSeed: false,
    }, undefined, { mode: "fixed", value: 42 });
    expect(payload).not.toHaveProperty("seed");
  });

  it("keeps the field when supports* is undefined (legacy callers)", () => {
    const payload = buildImagePayload("flux-dev", {
      prompt: "A copper city at dusk",
      negative: "blurry",
      style: "photo",
      steps: 25,
      cfg: 7,
      // no supports* flags — legacy path
    }, undefined, { mode: "fixed", value: 42 });
    expect(payload).toHaveProperty("negative_prompt", "blurry");
    expect(payload).toHaveProperty("style_preset", "photo");
    expect(payload).toHaveProperty("steps", 25);
    expect(payload).toHaveProperty("cfg_scale", 7);
    expect(payload).toHaveProperty("seed", 42);
  });

  it("preserves supportsVariants gating", () => {
    const on = buildImagePayload("flux-dev", {
      prompt: "A copper city at dusk",
      imageCount: 2,
      supportsVariants: true,
    });
    expect(on).toHaveProperty("variants", 2);

    const off = buildImagePayload("flux-dev", {
      prompt: "A copper city at dusk",
      imageCount: 2,
      supportsVariants: false,
    });
    expect(off).not.toHaveProperty("variants");
  });

  // VERIFY-082 — reference images are emitted only for supported models.
  it("emits reference_image_urls when supportsReferences is true", () => {
    const payload = buildImagePayload("flux-dev", {
      prompt: "Alice in a garden",
      supportsReferences: true,
      references: [
        { entityId: "alice", mimeType: "image/png", contentHash: "abc", data: "iVBORw0KGgo=" },
      ],
    });
    expect(payload).toHaveProperty("reference_image_urls");
    expect(Array.isArray(payload.reference_image_urls)).toBe(true);
    expect((payload.reference_image_urls as string[])[0]).toMatch(/^data:image\/png;base64,/);
  });

  it("drops reference_image_urls when supportsReferences is false", () => {
    const payload = buildImagePayload("flux-dev", {
      prompt: "Alice in a garden",
      supportsReferences: false,
      references: [
        { entityId: "alice", mimeType: "image/png", contentHash: "abc", data: "iVBORw0KGgo=" },
      ],
    });
    expect(payload).not.toHaveProperty("reference_image_urls");
  });

  it("drops reference_image_urls when references array is empty", () => {
    const payload = buildImagePayload("flux-dev", {
      prompt: "Alice in a garden",
      supportsReferences: true,
      references: [],
    });
    expect(payload).not.toHaveProperty("reference_image_urls");
  });
});
