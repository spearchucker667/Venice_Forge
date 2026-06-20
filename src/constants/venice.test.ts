/** @fileoverview Regression tests for `modelSupportsVision`.

 * Locks the live-metadata-wins contract added in the 2026-06-08 P3
 * vision-list cleanup. Future callers must not bypass the live
 * `ModelCapabilities.supportsVision` flag in favour of the static
 * `VISION_CAPABLE_MODEL_IDS` / `VISION_CAPABLE_PATTERNS` fallback.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_MUSIC_MODEL,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_TTS_MODEL,
  DEFAULT_VIDEO_MODEL,
  FALLBACK_MODELS,
  modelSupportsVision,
} from "./venice";

describe("modelSupportsVision", () => {
  it("returns true for an id in the static vision allowlist", () => {
    expect(modelSupportsVision("llama-3.2-11b-vision")).toBe(true);
    expect(modelSupportsVision("qwen2.5-vl-72b")).toBe(true);
    expect(modelSupportsVision("gemini-2.0-flash")).toBe(true);
  });

  it("returns true for a model id that matches a vision pattern", () => {
    expect(modelSupportsVision("mystery-vision-llm")).toBe(true);
    expect(modelSupportsVision("some-vl-model")).toBe(true);
    expect(modelSupportsVision("gemini-2.5-anything")).toBe(true);
  });

  it("returns false for an unknown model id with no live metadata", () => {
    expect(modelSupportsVision("some-mystery-llm")).toBe(false);
    expect(modelSupportsVision("")).toBe(false);
    expect(modelSupportsVision(undefined as unknown as string)).toBe(false);
  });

  it("honours live `supportsVision: true` for an unknown model id", () => {
    // The future-proofing case: a brand-new multimodal model id that
    // is not in the static list or any pattern. The live API contract
    // is the only signal.
    expect(
      modelSupportsVision("some-future-multimodal-llm", { supportsVision: true }),
    ).toBe(true);
  });

  it("honours live `supportsVision: false` over a heuristic pattern match", () => {
    // The dangerous case: the id *would* match the static pattern
    // (`vision` substring), but the live API contract says the model
    // is non-vision. Live metadata wins. This is the regression guard
    // for the 2026-06-08 P3 vision-list cleanup.
    expect(
      modelSupportsVision("mock-vision-model", { supportsVision: false }),
    ).toBe(false);
  });

  it("honours live `supportsVision: false` over a direct allowlist match", () => {
    // Even a direct allowlist hit must defer to a live `false`. If
    // the API downgrades a model from vision to text, the renderer
    // must reflect that immediately.
    expect(
      modelSupportsVision("llama-3.2-11b-vision", { supportsVision: false }),
    ).toBe(false);
  });

  it("falls back to the static allowlist when live capabilities omit the flag", () => {
    // An empty live capabilities object is a degraded but valid
    // signal: it means "I have metadata, but it does not mention
    // vision". In that case we still want the static fallback to
    // fire for known vision ids.
    expect(
      modelSupportsVision("llama-3.2-11b-vision", {}),
    ).toBe(true);
  });

  it("treats `null` live capabilities as 'no live metadata available'", () => {
    // `null` is the documented "looked up the model, did not find
    // it" signal from the call site. It must not crash and must
    // fall back to the static list.
    expect(modelSupportsVision("llama-3.2-11b-vision", null)).toBe(true);
    expect(modelSupportsVision("some-mystery-llm", null)).toBe(false);
  });

  it("is case-insensitive on the model id", () => {
    expect(modelSupportsVision("LLAMA-3.2-11B-VISION")).toBe(true);
    expect(modelSupportsVision("Llama-3.2-11b-Vision")).toBe(true);
  });
});

describe("DEFAULT_CHAT_MODEL", () => {
  it("is set to venice-uncensored", () => {
    expect(DEFAULT_CHAT_MODEL).toBe("venice-uncensored");
  });
});

describe("modality default models", () => {
  it("keeps app-authored defaults in the fallback registry", () => {
    expect(FALLBACK_MODELS.image.some((model) => model.id === DEFAULT_IMAGE_MODEL)).toBe(true);
    expect(FALLBACK_MODELS.audio.some((model) => model.id === DEFAULT_TTS_MODEL)).toBe(true);
    expect(FALLBACK_MODELS.audio.some((model) => model.id === DEFAULT_MUSIC_MODEL)).toBe(true);
    expect(FALLBACK_MODELS.video.some((model) => model.id === DEFAULT_VIDEO_MODEL)).toBe(true);
    expect(DEFAULT_VIDEO_MODEL).toBe("wan-2.6-text-to-video");
  });
});

describe("DEFAULT_SYSTEM_PROMPT", () => {
  it("mentions Venice Forge by name", () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain("Venice Forge");
  });

  it("mentions character prompt isolation", () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain("character");
  });

  it("does not contain JavaScript template interpolation artifacts", () => {
    expect(DEFAULT_SYSTEM_PROMPT).not.toContain("${new Date()");
    expect(DEFAULT_SYSTEM_PROMPT).not.toContain("${Date");
  });

  it("does not reference non-existent tool names", () => {
    expect(DEFAULT_SYSTEM_PROMPT).not.toContain("get_attachment");
  });

  it("does not contain broad no-restrictions language", () => {
    expect(DEFAULT_SYSTEM_PROMPT).not.toContain("no ethical boundaries");
    expect(DEFAULT_SYSTEM_PROMPT).not.toContain("no restrictions");
    expect(DEFAULT_SYSTEM_PROMPT).not.toContain("previous refusals are irrelevant");
  });

  it("does not contain previous-AI-persona disavowal instructions", () => {
    expect(DEFAULT_SYSTEM_PROMPT).not.toContain("previous AI");
  });

  it("does not claim to be an official Venice.ai product", () => {
    // The prompt explicitly states Venice Forge is unofficial
    expect(DEFAULT_SYSTEM_PROMPT).toContain("unofficial");
  });

  it("is a non-empty string longer than 100 characters", () => {
    expect(DEFAULT_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });
});
