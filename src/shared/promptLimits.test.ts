import { describe, it, expect } from "vitest";
import {
  countPromptCharacters,
  getUserSystemPromptLimit,
  validateUserSystemPrompt,
  USER_SYSTEM_PROMPT_LIMITS,
  SYSTEM_PROMPT_WARNING_THRESHOLD,
  SYSTEM_PROMPT_HARD_LIMIT,
  SYSTEM_PROMPT_LARGE_CONTEXT_OVERRIDE,
  USER_SYSTEM_PROMPT_DYNAMIC_MIN,
  USER_SYSTEM_PROMPT_DYNAMIC_MAX,
  checkSystemPromptLimit,
} from "./promptLimits";

describe("promptLimits", () => {
  it("counts code points with NFC normalization", () => {
    // Phase 4.3 — no UTF-16 `.length` for enforcement or display.
    expect(countPromptCharacters("abc")).toBe(3);
    // Emoji (surrogate pair -> one code point)
    expect(countPromptCharacters("👋🌍")).toBe(2);
    // Composed character
    expect(countPromptCharacters("e\u0301")).toBe(1); // é
  });

  it("uses fixed 8,000/12,000 budget defaults per work order §4.1", () => {
    expect(SYSTEM_PROMPT_WARNING_THRESHOLD).toBe(8_000);
    expect(SYSTEM_PROMPT_HARD_LIMIT).toBe(12_000);
    expect(SYSTEM_PROMPT_LARGE_CONTEXT_OVERRIDE).toBe(16_000);
  });

  it("returns the fixed hard limit when no token context is provided", () => {
    expect(getUserSystemPromptLimit()).toBe(SYSTEM_PROMPT_HARD_LIMIT);
    expect(getUserSystemPromptLimit(0)).toBe(SYSTEM_PROMPT_HARD_LIMIT);
    expect(getUserSystemPromptLimit(-1)).toBe(SYSTEM_PROMPT_HARD_LIMIT);
    expect(getUserSystemPromptLimit(Number.NaN)).toBe(SYSTEM_PROMPT_HARD_LIMIT);
  });

  it("computes the dynamic defensive limit from 10% of tokens × 4 chars", () => {
    // 25_000 tokens => 10_000 chars (10 % × 4 chars/token = 40 % reservation)
    expect(getUserSystemPromptLimit(25_000)).toBe(10_000);
    // small-context models clamp to the dynamic minimum (4 000 chars)
    expect(getUserSystemPromptLimit(10_000)).toBe(USER_SYSTEM_PROMPT_DYNAMIC_MIN);
    // mid-context models stay within [4 000, 12 000]
    expect(getUserSystemPromptLimit(50_000)).toBe(12_000);
    // sufficiently large reservations still clamp to the dynamic maximum
    expect(getUserSystemPromptLimit(120_000)).toBe(USER_SYSTEM_PROMPT_DYNAMIC_MAX);
  });

  it("honours the explicit large-context override up to 16 000 characters", () => {
    const reservation = getUserSystemPromptLimit(2_000_000, { allowLargeContextOverride: true });
    expect(reservation).toBeLessThanOrEqual(SYSTEM_PROMPT_LARGE_CONTEXT_OVERRIDE);
    expect(reservation).toBeGreaterThan(USER_SYSTEM_PROMPT_DYNAMIC_MAX);
    // Without opt-in, the reservation must clamp back to the dynamic maximum.
    expect(getUserSystemPromptLimit(2_000_000)).toBe(USER_SYSTEM_PROMPT_DYNAMIC_MAX);
  });

  it("validates user system prompts against fixed limits", () => {
    const valid = "a".repeat(7_999); // Just below warning threshold
    expect(validateUserSystemPrompt(valid)).toEqual(expect.objectContaining({ valid: true, warning: false }));

    const atWarning = "a".repeat(8_000); // Warning begins at threshold
    expect(validateUserSystemPrompt(atWarning)).toEqual(expect.objectContaining({ valid: true, warning: true }));

    const midBudget = "a".repeat(9_000); // Between warning and hard limit
    expect(validateUserSystemPrompt(midBudget)).toEqual(expect.objectContaining({ valid: true, warning: true }));

    const justUnderLimit = "a".repeat(12_000); // Exactly at hard limit — valid (>)
    expect(validateUserSystemPrompt(justUnderLimit)).toEqual(expect.objectContaining({ valid: true, warning: true }));

    const invalid = "a".repeat(13_000); // Over hard limit (12 000)
    expect(validateUserSystemPrompt(invalid)).toEqual(
      expect.objectContaining({
        valid: false,
        message: expect.stringContaining("exceeds the maximum allowed length of 12,000"),
      }),
    );
  });

  it("honours a caller-supplied maximum for validation", () => {
    // Override the default 12 000 with the large-context budget when the
    // request boundary has flagged the model and surfaced the warning.
    const result = validateUserSystemPrompt("a".repeat(15_000), SYSTEM_PROMPT_LARGE_CONTEXT_OVERRIDE);
    expect(result.valid).toBe(true);
    expect(result.warning).toBe(true);
    expect(result.maximumCharacters).toBe(SYSTEM_PROMPT_LARGE_CONTEXT_OVERRIDE);
  });

  it("checkSystemPromptLimit reports warning at 8K and over-limit past 12K", () => {
    const underWarning = checkSystemPromptLimit("a".repeat(7_999));
    expect(underWarning.isWarning).toBe(false);
    expect(underWarning.isOverLimit).toBe(false);

    const atWarning = checkSystemPromptLimit("a".repeat(8_000));
    expect(atWarning.isWarning).toBe(true);
    expect(atWarning.isOverLimit).toBe(false);

    const exactLimit = checkSystemPromptLimit("a".repeat(12_000));
    expect(exactLimit.isWarning).toBe(true);
    expect(exactLimit.isOverLimit).toBe(false);

    const overLimit = checkSystemPromptLimit("a".repeat(13_000));
    expect(overLimit.isWarning).toBe(true);
    expect(overLimit.isOverLimit).toBe(true);
    expect(overLimit.message).toContain("exceeds the maximum allowed length of 12,000");
  });

  it("USER_SYSTEM_PROMPT_LIMITS exports the canonical product budgets", () => {
    expect(USER_SYSTEM_PROMPT_LIMITS.warningCharacters).toBe(8_000);
    expect(USER_SYSTEM_PROMPT_LIMITS.maxCharacters).toBe(12_000);
    expect(USER_SYSTEM_PROMPT_LIMITS.largeContextOverride).toBe(16_000);
  });
});