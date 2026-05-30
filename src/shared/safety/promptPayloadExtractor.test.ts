import { describe, expect, it } from "vitest";
import { extractPromptLikeFields } from "./promptPayloadExtractor";

describe("extractPromptLikeFields", () => {
  it("extracts prompt-like text from serialized FormData object entries", () => {
    const payload = {
      _isSerializedFormData: true,
      entries: [
        { name: "query", value: "summarize this page" },
      ],
    };
    const fields = extractPromptLikeFields(payload, "/augment/search");

    expect(fields).toEqual([
      { path: "formData.query", value: "summarize this page" },
    ]);
  });

  it("ignores deny-listed serialized FormData fields", () => {
    const payload = {
      _isSerializedFormData: true,
      entries: [
        { name: "model", value: "venice-model" },
        { name: "prompt", value: "draw a skyline" },
      ],
    };
    const fields = extractPromptLikeFields(payload, "/image/generate");

    expect(fields).toEqual([
      { path: "formData.prompt", value: "draw a skyline" },
    ]);
  });

  it("returns no fields when endpoint does not allow FormData prompt fields", () => {
    const payload = {
      _isSerializedFormData: true,
      entries: [
        { name: "prompt", value: "should not be extracted for upscale endpoint" },
      ],
    };
    const fields = extractPromptLikeFields(payload, "/image/upscale");

    expect(fields).toEqual([]);
  });
});
