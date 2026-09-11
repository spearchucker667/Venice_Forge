import { describe, expect, it } from "vitest";
import {
  SYSTEM_PROMPT_LIMITS,
  checkSystemPromptLimit,
  checkSystemPromptMessages,
  countPromptCharacters,
  estimateSystemPromptTokens,
  validateUserSystemPrompt,
} from "./promptLimits";

describe("static system-prompt policy", () => {
  it("publishes one static policy independent of model context", () => {
    expect(SYSTEM_PROMPT_LIMITS).toEqual({
      maxTokens: 8_192,
      warningTokens: 6_144,
      maxCodePoints: 32_768,
      warningCodePoints: 24_576,
    });
    expect(checkSystemPromptLimit("a".repeat(32_768)).isOverLimit).toBe(false);
  });

  it("counts Unicode code points without treating UTF-16 units as characters", () => {
    expect(countPromptCharacters("ASCII")).toBe(5);
    expect(countPromptCharacters("漢字")).toBe(2);
    expect(countPromptCharacters("👋🌍")).toBe(2);
    expect(countPromptCharacters("e\u0301")).toBe(2);
    expect(countPromptCharacters("A👋漢e\u0301")).toBe(5);
  });

  it("marks estimated-token warning and maximum boundaries without blocking valid prompts", () => {
    const cases = [
      { codePoints: 24_572, warning: false, over: false, estimate: 6_143 },
      { codePoints: 24_576, warning: true, over: false, estimate: 6_144 },
      { codePoints: 32_764, warning: true, over: false, estimate: 8_191 },
      { codePoints: 32_768, warning: true, over: false, estimate: 8_192 },
      { codePoints: 32_772, warning: true, over: true, estimate: 8_193 },
    ];

    for (const expected of cases) {
      const result = checkSystemPromptLimit("a".repeat(expected.codePoints));
      expect(result).toMatchObject({
        estimatedTokenCount: expected.estimate,
        isWarning: expected.warning,
        isOverLimit: expected.over,
      });
    }
  });

  it("enforces the independent code-point fallback boundary", () => {
    expect(validateUserSystemPrompt("a".repeat(32_767)).valid).toBe(true);
    expect(validateUserSystemPrompt("a".repeat(32_768)).valid).toBe(true);
    const over = validateUserSystemPrompt("a".repeat(32_769));
    expect(over).toMatchObject({
      valid: false,
      characterCount: 32_769,
      maximumCharacters: 32_768,
      reason: "code-point-limit",
    });
    expect(over.message).toContain("32,768 Unicode code points");
    expect(over.message).toContain("approximately 8,192 tokens");
  });

  it("combines split system messages before enforcing the policy", () => {
    const result = checkSystemPromptMessages([
      { role: "system", content: "a".repeat(16_384) },
      { role: "user", content: "ignored" },
      { role: "system", content: "b".repeat(16_384) },
    ]);
    expect(result).toMatchObject({ isOverLimit: true, reason: "code-point-limit" });
  });

  it("enforces the policy on array/multimodal system content", () => {
    const result = checkSystemPromptMessages([
      {
        role: "system",
        content: [{ type: "text", text: "a".repeat(32_769) }],
      },
    ]);
    expect(result).toMatchObject({ isOverLimit: true, reason: "code-point-limit" });
  });

  it("labels the repository tokenizer as an estimate", () => {
    expect(estimateSystemPromptTokens("")).toEqual({
      count: 0,
      method: "approximation",
      isEstimate: true,
    });
    expect(estimateSystemPromptTokens("mixed technical text")).toEqual({
      count: 5,
      method: "approximation",
      isEstimate: true,
    });
  });
});
