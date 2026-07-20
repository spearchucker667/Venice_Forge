// Phase 4.1 — User-created system prompt budgets are expressed in Unicode
// code points (per work-order §4.1, §4.3). The historically-binary rounded
// 8192 / 12288 values conflated 8 KiB with 8 000 characters — the user-facing
// display reads "7,942 / 12,000 characters", not "7,942 / 12 288 code points".
export const SYSTEM_PROMPT_WARNING_THRESHOLD = 8_000;
export const SYSTEM_PROMPT_HARD_LIMIT = 12_000;
export const SYSTEM_PROMPT_LARGE_CONTEXT_OVERRIDE = 16_000;

// Phase 4.2 — dynamic defensive limit derived from the active model's context.
// Reserve 10 % of the context window × 4 chars/token for the user-tunable system
// prompt slot. The raw reservation is clamped to [4 000, 12 000] unless the
// caller invokes the explicit large-context override (16 000 — Phase 4.2
// requires a flagged large-context model and explicit user opt-in; the override
// path must be invoked from a UI boundary that already shows the warning).
export const USER_SYSTEM_PROMPT_DYNAMIC_MIN = 4_000;
export const USER_SYSTEM_PROMPT_DYNAMIC_MAX = 12_000;
export const SYSTEM_PROMPT_CONTEXT_CHAR_PER_TOKEN = 4;

export interface PromptLimitResult {
  codePointCount: number;
  isWarning: boolean;
  isOverLimit: boolean;
  message?: string;
}

export interface DynamicLimitOptions {
  /** Approved by an explicit user-driven boundary for a flagged large-context model. */
  allowLargeContextOverride?: boolean;
}

export function countCodePoints(text: string): number {
  const normalized = text.normalize('NFC');
  return Array.from(normalized).length;
}

export function countPromptCharacters(text: string): number {
  return countCodePoints(text);
}

/**
 * Dynamic defensive user-prompt limit based on the live model's context
 * window. The caller supplies the available token count so the editor can warn
 * if the user's selection is consuming more or less of the available slot than
 * the configured product baseline suggests.
 */
export function getUserSystemPromptLimit(
  availableContextTokens?: number,
  options: DynamicLimitOptions = {},
): number {
  if (typeof availableContextTokens !== "number" || !Number.isFinite(availableContextTokens) || availableContextTokens <= 0) {
    return SYSTEM_PROMPT_HARD_LIMIT;
  }

  const reservation = Math.floor(availableContextTokens * 0.1 * SYSTEM_PROMPT_CONTEXT_CHAR_PER_TOKEN);
  const clamped = Math.min(
    Math.max(reservation, USER_SYSTEM_PROMPT_DYNAMIC_MIN),
    USER_SYSTEM_PROMPT_DYNAMIC_MAX,
  );

  if (options.allowLargeContextOverride && reservation > USER_SYSTEM_PROMPT_DYNAMIC_MAX) {
    return Math.min(reservation, SYSTEM_PROMPT_LARGE_CONTEXT_OVERRIDE);
  }

  return clamped;
}

export function checkSystemPromptLimit(systemPrompt: string, maximumCharacters: number = SYSTEM_PROMPT_HARD_LIMIT): PromptLimitResult {
  const codePointCount = countCodePoints(systemPrompt);
  const isWarning = codePointCount >= SYSTEM_PROMPT_WARNING_THRESHOLD;
  const isOverLimit = codePointCount > maximumCharacters;

  let message: string | undefined;
  if (isOverLimit) {
    message = `System prompt exceeds the maximum allowed length of ${maximumCharacters.toLocaleString("en-US")} Unicode code points (${codePointCount.toLocaleString("en-US")} detected). Please shorten the prompt.`;
  } else if (isWarning) {
    message = `System prompt is approaching the limit (${codePointCount.toLocaleString("en-US")} / ${maximumCharacters.toLocaleString("en-US")} code points). Consider shortening to avoid truncation.`;
  }

  return {
    codePointCount,
    isWarning,
    isOverLimit,
    message,
  };
}

export function enforceSystemPromptLimit(systemPrompt: string, maximumCharacters: number = SYSTEM_PROMPT_HARD_LIMIT): string {
  const result = checkSystemPromptLimit(systemPrompt, maximumCharacters);
  if (result.isOverLimit) {
    throw new Error(result.message);
  }
  return systemPrompt;
}

// Backward compatibility exports
export const USER_SYSTEM_PROMPT_LIMITS = {
  warningCharacters: SYSTEM_PROMPT_WARNING_THRESHOLD,
  maxCharacters: SYSTEM_PROMPT_HARD_LIMIT,
  largeContextOverride: SYSTEM_PROMPT_LARGE_CONTEXT_OVERRIDE,
} as const;

export function validateUserSystemPrompt(
  systemPrompt: string,
  maximumCharacters: number = SYSTEM_PROMPT_HARD_LIMIT,
): { valid: boolean; characterCount?: number; warning?: boolean; maximumCharacters?: number; message?: string } {
  const result = checkSystemPromptLimit(systemPrompt, maximumCharacters);
  return {
    valid: !result.isOverLimit,
    characterCount: result.codePointCount,
    warning: result.isWarning,
    maximumCharacters,
    message: result.message,
  };
}