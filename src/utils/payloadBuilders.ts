/** @fileoverview Shared payload builders for Venice API chat and image requests. */

/** A content part for vision-capable models. */
export interface ImageContentPart {
  type: "image_url";
  image_url: { url: string; detail?: "low" | "high" | "auto" };
}

/** A text content part. */
export interface TextContentPart {
  type: "text";
  text: string;
}

/** Content for a single message — string for text-only models, array for vision. */
export type ChatMessageContent = string | (TextContentPart | ImageContentPart)[];

/** Represents a single message in a chat conversation. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: ChatMessageContent;
}

/** Configures Venice-specific chat behaviour such as web search and citations. */
export interface ChatSettings {
  includeVeniceSystemPrompt?: boolean;
  /** Specifies the web search mode; Venice expects "auto", "off", or "on". */
  webSearch?: string;
  webScraping?: boolean;
  webCitations?: boolean;
}

/** Options that control streaming, character slugs, reasoning, and thinking output. */
export interface ChatPayloadOptions {
  stream?: boolean;
  characterSlug?: string;
  reasoningEffort?: string;
  enableXSearch?: boolean;
  stripThinking?: boolean;
  disableThinking?: boolean;
}

/**
 * Normalises a loose web search value to a strict Venice enum.
 *
 * @param value An unknown value that may represent a web search mode.
 * @returns The normalised mode: "off", "on", or "auto".
 */
export function normalizeWebSearchMode(value: unknown): "off" | "on" | "auto" {
  if (value === true) return "on";
  if (value === false) return "off";
  if (value === "off" || value === "on" || value === "auto") return value;
  return "off";
}

/**
 * Builds a complete chat completion payload for the Venice API.
 *
 * @param model The target model identifier.
 * @param messages An ordered array of chat messages.
 * @param settings Venice-specific behaviour settings.
 * @param options Optional flags for streaming, characters, and reasoning.
 * @returns A record ready to be serialised and sent to /chat/completions.
 */
/** Builds a system message from a plain string. */
function makeSystemMessage(text: string): ChatMessage {
  return { role: "system", content: text };
}

/** Builds a complete chat completion payload for the Venice API.
 *
 * @param model The target model identifier.
 * @param messages An ordered array of chat messages.
 * @param settings Venice-specific behaviour settings.
 * @param options Optional flags for streaming, characters, and reasoning.
 * @param memoryBlock Optional memory block text to prepend as a system message.
 * @returns A record ready to be serialised and sent to /chat/completions.
 */
export function buildChatPayload(
  model: string,
  messages: ChatMessage[],
  settings: ChatSettings,
  options: ChatPayloadOptions = {},
  memoryBlock?: string
): Record<string, unknown> {
  const assembled: ChatMessage[] = memoryBlock
    ? [makeSystemMessage(`<memory>\n${memoryBlock}\n</memory>`), ...messages]
    : [...messages];

  const payload: Record<string, unknown> = {
    model,
    messages: assembled,
    venice_parameters: {
      include_venice_system_prompt: !!settings.includeVeniceSystemPrompt,
      // Venice requires string enum "auto" | "off" | "on" — never a boolean.
      enable_web_search: normalizeWebSearchMode(settings.webSearch),
      enable_web_scraping: !!settings.webScraping,
      enable_web_citations: !!settings.webCitations,
      enable_x_search: !!options.enableXSearch,
      strip_thinking_response: !!options.stripThinking,
      disable_thinking: !!options.disableThinking,
    },
  };
  if (options.stream) payload.stream = true;
  const slug = options.characterSlug?.trim();
  if (slug) (payload.venice_parameters as Record<string, unknown>).character_slug = slug;
  if (options.reasoningEffort) payload.reasoning = { effort: options.reasoningEffort };
  return payload;
}

/** Describes the user-editable fields of an image generation draft. */
export interface ImageDraftLike {
  prompt: string;
  negative?: string;
  width?: number | string;
  height?: number | string;
  aspectRatio?: string;
  steps?: number | string;
  cfg?: number | string;
  style?: string;
  safeMode?: boolean;
  disableWatermark?: boolean;
  imageCount?: number | string;
}

/** Clamp a number to an inclusive integer range. */
function clampInt(value: unknown, min: number, max: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** Clamp a number to an inclusive float range. */
function clampFloat(value: unknown, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** Round a dimension to the nearest valid multiple (64px for most SD pipelines). */
function clampDimension(value: unknown): number {
  const n = clampInt(value, 64, 2048);
  return Math.round(n / 64) * 64;
}

/** Maximum prompt length accepted by Venice image generation (conservative). */
const MAX_IMAGE_PROMPT_LENGTH = 4000;

/**
 * Normalizes and clamps an image draft so invalid UI or imported state
 * cannot produce out-of-range API requests.
 *
 * @param draft The raw image draft.
 * @returns A normalized draft with safe values.
 */
export function normalizeImageDraft(draft: ImageDraftLike): ImageDraftLike {
  const prompt = String(draft.prompt ?? "").trim();
  const negative = String(draft.negative ?? "").trim();
  return {
    prompt: prompt.slice(0, MAX_IMAGE_PROMPT_LENGTH),
    negative: negative.slice(0, MAX_IMAGE_PROMPT_LENGTH),
    width: clampDimension(draft.width),
    height: clampDimension(draft.height),
    aspectRatio: draft.aspectRatio || "1:1",
    steps: clampInt(draft.steps, 1, 50),
    cfg: clampFloat(draft.cfg, 1, 20),
    style: draft.style ?? "",
    safeMode: !!draft.safeMode,
    disableWatermark: !!draft.disableWatermark,
    imageCount: clampInt(draft.imageCount, 1, 10),
  };
}

/**
 * Builds an image generation payload for the Venice API.
 *
 * @param model The target image model identifier.
 * @param draft The user's image generation draft.
 * @param promptOverride An optional prompt that overrides the draft value.
 * @returns A record ready to be serialised and sent to /image/generate.
 */
export function buildImagePayload(
  model: string,
  draft: ImageDraftLike,
  promptOverride?: string
): Record<string, unknown> {
  const normalized = normalizeImageDraft(draft);
  const payload: Record<string, unknown> = {
    model,
    prompt: (promptOverride ?? normalized.prompt).trim(),
    width: normalized.width,
    height: normalized.height,
    aspect_ratio: normalized.aspectRatio,
    steps: normalized.steps,
    cfg_scale: normalized.cfg,
    safe_mode: normalized.safeMode,
    hide_watermark: normalized.disableWatermark,
    return_binary: false,
  };
  const negative = normalized.negative?.trim();
  if (negative) payload.negative_prompt = negative;
  if (normalized.style) payload.style_preset = normalized.style;
  return payload;
}
