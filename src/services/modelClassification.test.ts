/** @fileoverview Unit tests for src/services/modelClassification.ts. */

import { describe, it, expect } from "vitest";
import { flattenModels } from "./modelClassification";

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

  it("unwraps a { data: [...] } envelope", () => {
    const groups = flattenModels({ data: [{ id: "llama-3.3-70b" }] });
    expect(groups.text).toHaveLength(1);
  });

  it("marks source as 'live' on normalized models", () => {
    const groups = flattenModels([{ id: "x", type: "text" }]);
    expect(groups.text[0].source).toBe("live");
  });
});
