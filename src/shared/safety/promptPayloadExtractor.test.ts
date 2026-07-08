import { describe, expect, it } from "vitest";
import { extractPromptLikeFields } from "./promptPayloadExtractor";

describe("extractPromptLikeFields", () => {
  it("parses a prompt field that appears after the extraction value cap in JSON text", () => {
    const body = JSON.stringify({ padding: "x".repeat(40_000), prompt: "late prompt" });

    expect(extractPromptLikeFields(body, "/image/generate")).toContainEqual({
      path: "prompt",
      value: "late prompt",
    });
  });

  it("parses a prompt field that appears late in a UTF-8 request buffer", () => {
    const body = new TextEncoder().encode(
      JSON.stringify({ padding: "x".repeat(40_000), prompt: "late buffer prompt" })
    );

    expect(extractPromptLikeFields(body, "/image/generate")).toContainEqual({
      path: "prompt",
      value: "late buffer prompt",
    });
  });
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
        { name: "prompt", value: "should not be extracted for retrieve endpoint" },
      ],
    };
    const fields = extractPromptLikeFields(payload, "/video/retrieve");

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
    formData.append("prompt", "should not be extracted for retrieve endpoint");
    const fields = extractPromptLikeFields(formData, "/video/retrieve");

    expect(fields).toEqual([]);
  });

  it("extracts video queue prompt fields but not model parameters", () => {
    const fields = extractPromptLikeFields(
      {
        model: "wan-2.6-text-to-video",
        prompt: "cinematic city at sunset",
        negative_prompt: "blurry",
        duration: "5s",
      },
      "/video/queue"
    );

    expect(fields).toEqual([
      { path: "prompt", value: "cinematic city at sunset" },
      { path: "negative_prompt", value: "blurry" },
    ]);
  });

  // A4 regression: every FormData entry must be decoded (not just entry[0])
  it("detects trigger in third entry of multi-chunk serialised FormData", () => {
    const trigger = "loli"; // matches LOLI_TERM in the safety guard
    const entries = [
      { name: "text", value: Buffer.from("benign content one", "utf-8").toString("base64"), filename: "a.txt", _isFile: true },
      { name: "text", value: Buffer.from("benign content two", "utf-8").toString("base64"), filename: "b.txt", _isFile: true },
      { name: "text", value: Buffer.from(trigger, "utf-8").toString("base64"), filename: "c.txt", _isFile: true },
    ];
    const body = { _isSerializedFormData: true, entries };
    const fields = extractPromptLikeFields(body, "/augment/text-parser");
    const concat = fields.map((f) => f.value).join("\n").toLowerCase();
    expect(concat).toContain(trigger);
  });

  it("extracts from plain text strings", () => {
    const fields = extractPromptLikeFields("just some text", "/chat/completions");
    expect(fields).toContainEqual({ path: "body", value: "just some text" });
  });

  it("extracts from JSON strings", () => {
    const fields = extractPromptLikeFields('{"prompt": "hello from json"}', "/image/generate");
    expect(fields).toContainEqual({ path: "prompt", value: "hello from json" });
  });

  it("handles excessively long plain strings", () => {
    const longString = "x".repeat(11 * 1024 * 1024); // 11MB
    const fields = extractPromptLikeFields(longString, "/chat/completions");
    expect(fields).toContainEqual({ path: "body", value: longString.slice(0, 8000) }); // MAX_FIELD_CHARS
  });

  it("handles unknown endpoints by scanning common prompt fields", () => {
    // Tests line 208 default return
    const fields = extractPromptLikeFields({ instruction: "do the thing" }, "/unknown/path");
    expect(fields).toContainEqual({ path: "instruction", value: "do the thing" });
  });

  it("handles unknown endpoints by falling back to recursive scan for nested fields", () => {
    // Tests lines 254-256 recursive scan when common fields aren't found
    const fields = extractPromptLikeFields({ someOuter: { randomInner: "find me" } }, "/unknown/path");
    expect(fields).toContainEqual({ path: "someOuter.randomInner", value: "find me" });
  });

  it("extracts from array payloads directly", () => {
    // Tests lines 260-276
    const payload = [
      { text: "first text", ignoreMe: 123 },
      { content: "second content", model: "deny-listed-so-ignored" }
    ];
    const fields = extractPromptLikeFields(payload, "/unknown/path");
    expect(fields).toContainEqual({ path: "[0].text", value: "first text" });
    expect(fields).toContainEqual({ path: "[1].content", value: "second content" });
  });

  it("handles non-file serialized FormData entries", () => {
    // Tests line 85 and number serialization
    const payload = {
      _isSerializedFormData: true,
      entries: [
        { name: "query", value: "normal string value" },
        { name: "temperature", value: 0.5 }, // will be ignored due to DENY_FIELD_NAMES
        { name: "question", value: 42 } // number converted to string
      ],
    };
    const fields = extractPromptLikeFields(payload, "/augment/search");
    expect(fields).toContainEqual({ path: "formData.query", value: "normal string value" });
    expect(fields).toContainEqual({ path: "formData.question", value: "42" });
  });

  it("extracts native FormData entries taking max string cap into account", () => {
    const formData = new FormData();
    formData.append("query", "   "); // Empty when trimmed
    formData.append("text", "valid text");
    const fields = extractPromptLikeFields(formData, "/augment/text-parser");
    expect(fields).toEqual([{ path: "formData.text", value: "valid text" }]);
  });

  // VERIFY-067 regression guard: /image/upscale must extract prompt-like enhancer text
  describe("VERIFY-067 /image/upscale prompt extraction", () => {
    it("extracts enhancePrompt from JSON payload", () => {
      const fields = extractPromptLikeFields(
        { enhancePrompt: "add more detail to the portrait" },
        "/image/upscale"
      );
      expect(fields).toEqual([
        { path: "enhancePrompt", value: "add more detail to the portrait" },
      ]);
    });

    it("extracts enhance_prompt and prompt aliases", () => {
      const fields = extractPromptLikeFields(
        { enhance_prompt: "make it sharper", prompt: "enhance this image" },
        "/image/upscale"
      );
      expect(fields).toContainEqual({ path: "enhance_prompt", value: "make it sharper" });
      expect(fields).toContainEqual({ path: "prompt", value: "enhance this image" });
    });

    it("extracts enhancePrompt from serialized FormData", () => {
      const payload = {
        _isSerializedFormData: true,
        entries: [{ name: "enhancePrompt", value: "upscale with better lighting" }],
      };
      const fields = extractPromptLikeFields(payload, "/image/upscale");
      expect(fields).toEqual([
        { path: "formData.enhancePrompt", value: "upscale with better lighting" },
      ]);
    });

    it("extracts enhancePrompt from native FormData", () => {
      const formData = new FormData();
      formData.append("enhancePrompt", "sharpen and denoise");
      const fields = extractPromptLikeFields(formData, "/image/upscale");
      expect(fields).toEqual([
        { path: "formData.enhancePrompt", value: "sharpen and denoise" },
      ]);
    });

    it("does not extract deny-listed fields on upscale", () => {
      const fields = extractPromptLikeFields(
        { enhancePrompt: "improve quality", model: "upscaler", seed: "123" },
        "/image/upscale"
      );
      expect(fields).toEqual([
        { path: "enhancePrompt", value: "improve quality" },
      ]);
    });
  });
});

