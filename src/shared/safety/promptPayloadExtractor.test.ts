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

  // C-001 regression guard
  it("falls back to generic object extraction when serialized FormData entries is malformed", () => {
    const payload = {
      _isSerializedFormData: true,
      entries: "not-an-array",
      prompt: "draw a sunset",
    };
    const fields = extractPromptLikeFields(payload, "/image/generate");

    expect(fields).toEqual([
      { path: "prompt", value: "draw a sunset" },
    ]);
  });

  // H-001 regression guard
  it("performs shallow recursive scan for unknown endpoints when top-level fields are empty", () => {
    const payload = {
      wrapper: {
        nested: {
          prompt: "generate a fantasy landscape",
        },
      },
    };
    const fields = extractPromptLikeFields(payload, "/unknown/endpoint");

    expect(fields).toContainEqual({ path: "wrapper.nested.prompt", value: "generate a fantasy landscape" });
  });

  // M-003 regression guard
  it("extracts deeply nested fields up to depth 8", () => {
    const payload = {
      prompt: {
        a: {
          b: {
            c: {
              d: {
                e: {
                  f: {
                    g: {
                      text: "deep nested prompt",
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const fields = extractPromptLikeFields(payload, "/chat/completions");
    expect(fields).toContainEqual({ path: "prompt.a.b.c.d.e.f.g.text", value: "deep nested prompt" });
  });

  // M-004 regression guard
  it("extracts all string fields from array payloads", () => {
    const payload = [
      { role: "user", text: "hello world" },
      { role: "assistant", content: "how can I help?" },
    ];
    const fields = extractPromptLikeFields(payload, "/chat/completions");

    expect(fields).toContainEqual({ path: "[0].text", value: "hello world" });
    expect(fields).toContainEqual({ path: "[0].role", value: "user" });
    expect(fields).toContainEqual({ path: "[1].content", value: "how can I help?" });
    expect(fields).toContainEqual({ path: "[1].role", value: "assistant" });
  });

  // M-005 regression guard
  it("extracts all string properties from vision content array parts", () => {
    const payload = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "describe this image" },
            { type: "image_url", image_url: "https://example.com/img.png" },
          ],
        },
      ],
    };
    const fields = extractPromptLikeFields(payload, "/chat/completions");

    expect(fields).toContainEqual({ path: "messages[0].content[0].text", value: "describe this image" });
    expect(fields).toContainEqual({ path: "messages[0].content[1].image_url", value: "https://example.com/img.png" });
  });

  // M-006 regression guard
  it("returns raw decoded string for multipart-like bodies without regex stripping", () => {
    const multipartLike = Buffer.from(
      "--boundary123\r\nContent-Disposition: form-data; name=\"text\"\r\n\r\nsome parsed text content\r\n--boundary123--"
    );
    const fields = extractPromptLikeFields(multipartLike, "/augment/text-parser");

    expect(fields.length).toBeGreaterThan(0);
    expect(fields[0].path).toBe("body_raw");
    expect(fields[0].value).toContain("some parsed text content");
  });

  // CRIT-004 regression guard: native FormData must be handled in web mode
  it("extracts prompt-like text from native FormData entries", () => {
    const formData = new FormData();
    formData.append("query", "summarize this page");
    formData.append("model", "venice-model");
    const fields = extractPromptLikeFields(formData, "/augment/search");

    expect(fields).toEqual([
      { path: "formData.query", value: "summarize this page" },
    ]);
  });

  it("ignores deny-listed native FormData fields", () => {
    const formData = new FormData();
    formData.append("model", "venice-model");
    formData.append("prompt", "draw a skyline");
    const fields = extractPromptLikeFields(formData, "/image/generate");

    expect(fields).toEqual([
      { path: "formData.prompt", value: "draw a skyline" },
    ]);
  });

  it("returns no fields for native FormData when endpoint has no extractable fields", () => {
    const formData = new FormData();
    formData.append("prompt", "should not be extracted for upscale endpoint");
    const fields = extractPromptLikeFields(formData, "/image/upscale");

    expect(fields).toEqual([]);
  });

  it("extracts prompt and negative_prompt for /video/queue payloads", () => {
    const payload = {
      model: "wan-2.6-text-to-video",
      prompt: "Create a cinematic ocean shot at sunset",
      negative_prompt: "no text overlays",
    };
    const fields = extractPromptLikeFields(payload, "/video/queue");

    expect(fields).toEqual([
      { path: "prompt", value: "Create a cinematic ocean shot at sunset" },
      { path: "negative_prompt", value: "no text overlays" },
    ]);
  });
});
