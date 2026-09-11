import { translateRuntime } from "../i18n/runtimeTranslator";

/** Static application-wide policy for user-authored system prompts. */
export const SYSTEM_PROMPT_LIMITS = {
  maxTokens: 8_192,
  warningTokens: 6_144,
  maxCodePoints: 32_768,
  warningCodePoints: 24_576,
} as const;

export const SYSTEM_PROMPT_MAX_TOKENS = SYSTEM_PROMPT_LIMITS.maxTokens;
export const SYSTEM_PROMPT_WARNING_TOKENS = SYSTEM_PROMPT_LIMITS.warningTokens;
export const SYSTEM_PROMPT_MAX_CODE_POINTS = SYSTEM_PROMPT_LIMITS.maxCodePoints;
export const SYSTEM_PROMPT_WARNING_CODE_POINTS = SYSTEM_PROMPT_LIMITS.warningCodePoints;

export interface EstimatedTokenCount {
  count: number;
  method: "approximation";
  isEstimate: true;
}

export interface PromptLimitResult {
  codePointCount: number;
  estimatedTokenCount: number;
  isTokenCountEstimate: true;
  isWarning: boolean;
  isOverLimit: boolean;
  reason?: "token-limit" | "code-point-limit";
  message?: string;
}

/** Counts Unicode code points without conflating surrogate pairs with two characters. */
export function countCodePoints(text: string): number {
  let count = 0;
  for (const _codePoint of text) count += 1;
  return count;
}

export function countPromptCharacters(text: string): number {
  return countCodePoints(text);
}

/**
 * Repository-standard deterministic token estimate. It intentionally reports
 * itself as an approximation because Venice models do not share one tokenizer.
 */
export function estimateSystemPromptTokens(text: string): EstimatedTokenCount {
  const codePointCount = countCodePoints(text);
  return {
    count: codePointCount === 0 ? 0 : Math.max(1, Math.ceil(codePointCount / 4)),
    method: "approximation",
    isEstimate: true,
  };
}

export function checkSystemPromptLimit(systemPrompt: string): PromptLimitResult {
  const codePointCount = countCodePoints(systemPrompt);
  const estimatedTokenCount =
    codePointCount === 0 ? 0 : Math.max(1, Math.ceil(codePointCount / 4));
  const exceedsCodePoints = codePointCount > SYSTEM_PROMPT_MAX_CODE_POINTS;
  const exceedsEstimatedTokens = estimatedTokenCount > SYSTEM_PROMPT_MAX_TOKENS;
  const reason = exceedsCodePoints
    ? "code-point-limit"
    : exceedsEstimatedTokens
      ? "token-limit"
      : undefined;
  const isOverLimit = reason !== undefined;
  const isWarning =
    codePointCount >= SYSTEM_PROMPT_WARNING_CODE_POINTS ||
    estimatedTokenCount >= SYSTEM_PROMPT_WARNING_TOKENS;

  let message: string | undefined;
  if (isOverLimit) {
    message = translateRuntime(
      "runtimeGenerated.shared.promptLimits.notification.overLimit",
      "System prompt exceeds the application limit. Maximum fallback size: {{maximumCodePoints}} Unicode code points. Detected: {{codePointCount}} Unicode code points ({{estimatedTokenCount}} estimated tokens). The system-prompt policy is designed for approximately {{maximumTokens}} tokens. Please shorten the prompt before continuing.",
      {
        maximumCodePoints: SYSTEM_PROMPT_MAX_CODE_POINTS.toLocaleString("en-US"),
        codePointCount: codePointCount.toLocaleString("en-US"),
        estimatedTokenCount: estimatedTokenCount.toLocaleString("en-US"),
        maximumTokens: SYSTEM_PROMPT_MAX_TOKENS.toLocaleString("en-US"),
      },
    );
  } else if (isWarning) {
    message = translateRuntime(
      "runtimeGenerated.shared.promptLimits.notification.warning",
      "System prompt is approaching the application limit ({{estimatedTokenCount}} / {{maximumTokens}} estimated tokens; {{codePointCount}} / {{maximumCodePoints}} Unicode code points).",
      {
        estimatedTokenCount: estimatedTokenCount.toLocaleString("en-US"),
        maximumTokens: SYSTEM_PROMPT_MAX_TOKENS.toLocaleString("en-US"),
        codePointCount: codePointCount.toLocaleString("en-US"),
        maximumCodePoints: SYSTEM_PROMPT_MAX_CODE_POINTS.toLocaleString("en-US"),
      },
    );
  }

  return {
    codePointCount,
    estimatedTokenCount,
    isTokenCountEstimate: true,
    isWarning,
    isOverLimit,
    reason,
    message,
  };
}

/** Pulls user-visible text from string or multimodal array `content`. */
export function extractPromptContentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content) {
    if (typeof part === "string") {
      parts.push(part);
      continue;
    }
    if (!part || typeof part !== "object") continue;
    const record = part as Record<string, unknown>;
    if (typeof record.text === "string") parts.push(record.text);
  }
  return parts.join("");
}

/** Validates the complete system-message block so split messages cannot bypass policy. */
export function checkSystemPromptMessages(messages: unknown): PromptLimitResult | undefined {
  if (!Array.isArray(messages)) return undefined;
  const systemParts: string[] = [];
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const record = message as Record<string, unknown>;
    if (record.role !== "system") continue;
    const text = extractPromptContentText(record.content);
    if (text.length > 0) systemParts.push(text);
  }
  return systemParts.length > 0
    ? checkSystemPromptLimit(systemParts.join("\n\n"))
    : undefined;
}

export function enforceSystemPromptLimit(systemPrompt: string): string {
  const result = checkSystemPromptLimit(systemPrompt);
  if (result.isOverLimit) throw new Error(result.message);
  return systemPrompt;
}

export function validateUserSystemPrompt(systemPrompt: string): {
  valid: boolean;
  characterCount: number;
  estimatedTokenCount: number;
  warning: boolean;
  maximumCharacters: number;
  maximumTokens: number;
  reason?: "token-limit" | "code-point-limit";
  message?: string;
} {
  const result = checkSystemPromptLimit(systemPrompt);
  return {
    valid: !result.isOverLimit,
    characterCount: result.codePointCount,
    estimatedTokenCount: result.estimatedTokenCount,
    warning: result.isWarning,
    maximumCharacters: SYSTEM_PROMPT_MAX_CODE_POINTS,
    maximumTokens: SYSTEM_PROMPT_MAX_TOKENS,
    reason: result.reason,
    message: result.message,
  };
}
