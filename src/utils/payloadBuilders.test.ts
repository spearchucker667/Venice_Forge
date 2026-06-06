/** @fileoverview Unit tests for chat and image payload builders. */

import { describe, expect, it } from "vitest";
import { buildChatPayload, normalizeImageDraft, buildImagePayload } from "./payloadBuilders";

/** Tests for the buildChatPayload helper. */
describe("buildChatPayload", () => {
  /** Verifies that a legacy boolean true is serialised to the "on" enum. */
  it("serializes web search as enum string for legacy boolean true", () => {
    const payload = buildChatPayload(
      "venice-uncensored",
      [{ role: "user", content: "hello" }],
      { webSearch: true as any }
    );
    expect((payload.venice_parameters as any).enable_web_search).toBe("on");
  });

  /** Verifies that a legacy boolean false is serialised to the "off" enum. */
  it("serializes web search as enum string for legacy boolean false", () => {
    const payload = buildChatPayload(
      "venice-uncensored",
      [{ role: "user", content: "hello" }],
      { webSearch: false as any }
    );
    expect((payload.venice_parameters as any).enable_web_search).toBe("off");
  });

  /** Verifies that invalid web search values fall back to "off". */
  it("falls back to off for invalid web search values", () => {
    const payload = buildChatPayload(
      "venice-uncensored",
      [{ role: "user", content: "hello" }],
      { webSearch: "invalid-mode" }
    );
    expect((payload.venice_parameters as any).enable_web_search).toBe("off");
  });
});

/** Tests for the normalizeImageDraft helper. */
describe("normalizeImageDraft", () => {
  /** Verifies that out-of-range dimensions are clamped to valid multiples
   *  within the Venice swagger `GenerateImageRequest` bound of [64, 1280]. */
  it("clamps dimensions to nearest 64px multiple within [64, 1280]", () => {
    const result = normalizeImageDraft({
      prompt: "test",
      width: 50,
      height: 3000,
    });
    expect(result.width).toBe(64);
    expect(result.height).toBe(1280);
  });

  /** Verifies that steps are clamped to [1, 50]. */
  it("clamps steps to [1, 50]", () => {
    const low = normalizeImageDraft({ prompt: "test", steps: 0 });
    expect(low.steps).toBe(1);
    const high = normalizeImageDraft({ prompt: "test", steps: 100 });
    expect(high.steps).toBe(50);
  });

  /** Verifies that cfg is clamped to [1, 20]. */
  it("clamps cfg to [1, 20]", () => {
    const low = normalizeImageDraft({ prompt: "test", cfg: -5 });
    expect(low.cfg).toBe(1);
    const high = normalizeImageDraft({ prompt: "test", cfg: 99 });
    expect(high.cfg).toBe(20);
  });

  /** Verifies that imageCount is clamped to the spec's [1, 4] range. */
  it("clamps imageCount to [1, 4] (spec `variants` maximum)", () => {
    const low = normalizeImageDraft({ prompt: "test", imageCount: 0 });
    expect(low.imageCount).toBe(1);
    const high = normalizeImageDraft({ prompt: "test", imageCount: 50 });
    expect(high.imageCount).toBe(4);
  });

  /** Verifies that oversized prompts are truncated to the 7500-char limit. */
  it("truncates prompts longer than 7500 characters", () => {
    const longPrompt = "a".repeat(8000);
    const result = normalizeImageDraft({ prompt: longPrompt });
    expect(result.prompt.length).toBe(7500);
  });

  /** Verifies that oversized negative prompts are truncated to 7500. */
  it("truncates negative prompts longer than 7500 characters", () => {
    const long = "b".repeat(8000);
    const result = normalizeImageDraft({ prompt: "p", negative: long });
    expect((result.negative ?? "").length).toBe(7500);
  });

  /** Verifies that empty prompts are preserved (rejected later by UI). */
  it("trims empty prompts", () => {
    const result = normalizeImageDraft({ prompt: "   " });
    expect(result.prompt).toBe("");
  });

  /** Verifies that an absent aspectRatio is normalised to undefined, NOT
   *  silently defaulted to "1:1" (the previous behaviour forced every
   *  model into aspect-ratio mode and broke SD-classic models that
   *  need raw width/height). */
  it("does not default aspectRatio when the caller did not supply one", () => {
    const result = normalizeImageDraft({ prompt: "test" });
    expect(result.aspectRatio).toBeUndefined();
  });
});

/** Tests for buildImagePayload with normalization integration. */
describe("buildImagePayload", () => {
  /** Verifies that invalid imported state is normalized before building payload. */
  it("normalizes invalid imported state before building payload", () => {
    const payload = buildImagePayload("flux-dev", {
      prompt: "test",
      width: "invalid",
      height: "",
      steps: "abc",
      cfg: null as any,
    });
    expect(payload.width).toBe(64);
    expect(payload.height).toBe(64);
    expect(payload.steps).toBe(1);
    expect(payload.cfg_scale).toBe(1);
  });

  /** When the caller provides an aspect_ratio, the builder must NOT also
   *  emit width/height — the swagger allows `additionalProperties: false`
   *  for some model classes and Venice ignores integer fields anyway. */
  it("emits aspect_ratio and omits width/height when the caller sets an aspectRatio", () => {
    const payload = buildImagePayload("nano-banana", {
      prompt: "test",
      width: 1024,
      height: 1024,
      aspectRatio: "16:9",
    });
    expect(payload.aspect_ratio).toBe("16:9");
    expect(payload.width).toBeUndefined();
    expect(payload.height).toBeUndefined();
  });

  /** Without an aspectRatio, the builder emits width/height (SD-classic
   *  models like flux-dev, z-image-turbo, hidream require this). */
  it("emits width/height and omits aspect_ratio when no aspectRatio is supplied", () => {
    const payload = buildImagePayload("flux-dev", {
      prompt: "test",
      width: 1024,
      height: 768,
    });
    expect(payload.width).toBe(1024);
    expect(payload.height).toBe(768);
    expect(payload.aspect_ratio).toBeUndefined();
  });

  /** safe_mode is added by applyVeniceApiSafeMode from the endpoint matrix;
   *  the builder must NOT assign it directly (defence against double-emit). */
  it("does not duplicate safe_mode in the payload (applyVeniceApiSafeMode owns it)", () => {
    const payload = buildImagePayload("flux-dev", {
      prompt: "test",
      width: 1024,
      height: 1024,
      safeMode: false,
    });
    expect(payload.safe_mode).toBe(false);
    // Only one safe_mode key — applyVeniceApiSafeMode either omits it (when
    // safeMode is undefined or non-boolean) or sets it once.
    const keyCount = Object.keys(payload).filter((k) => k === "safe_mode").length;
    expect(keyCount).toBe(1);
  });
});

/** Tests for memory block injection in buildChatPayload. */
describe("buildChatPayload with memory block", () => {
  it("prepends a memory system message when memoryBlock is provided", () => {
    const payload = buildChatPayload(
      "venice-uncensored",
      [{ role: "user", content: "hello" }],
      {},
      {},
      "Memory A\nMemory B"
    );
    const messages = payload.messages as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("<memory>");
    expect(messages[0].content).toContain("Memory A");
    expect(messages[1].role).toBe("user");
  });

  it("does not add a system message when memoryBlock is empty", () => {
    const payload = buildChatPayload(
      "venice-uncensored",
      [{ role: "user", content: "hello" }],
      {},
      {},
      ""
    );
    const messages = payload.messages as Array<{ role: string; content: string }>;
    expect(messages.length).toBe(1);
    expect(messages[0].role).toBe("user");
  });

  it("supports array content for vision-capable models", () => {
    const payload = buildChatPayload(
      "llama-3.2-11b-vision",
      [
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this image" },
            { type: "image_url", image_url: { url: "data:image/png;base64,abc", detail: "low" } },
          ],
        },
      ],
      {}
    );
    const messages = payload.messages as Array<{ role: string; content: unknown }>;
    expect(Array.isArray(messages[0].content)).toBe(true);
    const parts = messages[0].content as Array<{ type: string }>;
    expect(parts[0].type).toBe("text");
    expect(parts[1].type).toBe("image_url");
  });
});
