/** @fileoverview Shared payload builders for Venice API chat and image requests. */
import { applyVeniceApiSafeMode } from "../shared/veniceSafeMode";

/**
 * Venice API hard limits for image generation, lifted directly from
 * `docs/Venice_swagger_api.yaml` `GenerateImageRequest` (verified 2026-06-05):
 *  - `width` / `height`: max 1280 (server rejects > 1280)
 *  - `variants`: 1–4 (server rejects > 4)
 *  - `cfg_scale`: 0 < x ≤ 20
 *  - `prompt` / `negative_prompt`: max 7500 chars
 * Sending values outside these ranges produces 400s that surface to the
 * user as a generic "invalid params" — keeping the clamps here means a
 * future UI tweak cannot regress the API contract.
 */
export const VENICE_IMAGE_MAX_DIMENSION = 1280;
export const VENICE_IMAGE_MIN_DIMENSION = 64;
export const VENICE_IMAGE_DIMENSION_DIVISOR = 64;
export const VENICE_IMAGE_MAX_VARIANTS = 4;
export const VENICE_IMAGE_MAX_PROMPT_CHARS = 7500;
export const VENICE_SEED_MIN = -999999999;
export const VENICE_SEED_MAX = 999999999;

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
  role: "system" | "user" | "assistant" | "tool";
  content: ChatMessageContent;
  metadata?: {
    injectedContext?: string;
    [key: string]: unknown;
  };
}

/** Configures Venice-specific chat behaviour such as web search and citations. */
export interface ChatSettings {
  includeVeniceSystemPrompt?: boolean;
  /** Specifies the web search mode; Venice expects "auto", "off", or "on". */
  webSearch?: string;
  webScraping?: boolean;
  webCitations?: boolean;
  /**
   * Venice provider-side safe_mode toggle. When set, the payload includes
   * a top-level `safe_mode: boolean`. This is separate from the local
   * Family Safe Mode that runs in the renderer/main process — both must
   * be on for the full protection chain. Defaults to undefined (omitted),
   * so existing callers that don't pass it keep their current shape.
   */
  safeMode?: boolean;
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
  return applyVeniceApiSafeMode("/chat/completions", payload, settings.safeMode);
}

/** Seed mode for image generation. */
export type ImageSeedMode = "off" | "fixed" | "null";

/** Full seed state including mode and value. */
export interface ImageSeedState {
  mode: ImageSeedMode;
  value: number | null;
}

/** Clamp an arbitrary value to a valid integer seed in the
 *  supported range, returning `null` for non-finite / non-numeric
 *  input. The output is always a safe finite integer. */
export function clampSeed(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.max(VENICE_SEED_MIN, Math.min(VENICE_SEED_MAX, n));
}

/** Generate a fresh random seed uniformly in the supported range
 *  (full ±999999999 — including negative values). The result is
 *  always a valid integer the API will accept. */
export function randomSeed(): number {
  const span = VENICE_SEED_MAX - VENICE_SEED_MIN + 1;
  // Math.random() is in [0,1); shift to [0,span) then offset by MIN.
  return VENICE_SEED_MIN + Math.floor(Math.random() * span);
}

/**
 * Serializes a seed state for an image generation request payload.
 *
 * - "off" mode: seed key is omitted entirely
 * - "fixed" mode: sends seed value if valid integer
 * - "null" mode: sends seed: null only when apiSupportsNullSeed is true
 *
 * @see docs/Venice_swagger_api.yaml — seed is integer, min: -999999999, max: 999999999.
 *   "If not provided, a random seed will be used." NULL is NOT explicitly
 *   documented as supported — we only send it when the caller opts in.
 */
export function serializeSeed(
  seed: ImageSeedState,
  apiSupportsNullSeed: boolean,
): { seed?: number | null } {
  if (seed.mode === "off") return {};
  if (seed.mode === "null" && apiSupportsNullSeed) return { seed: null };
  if (seed.mode === "fixed" && typeof seed.value === "number" && Number.isFinite(seed.value)) {
    const clamped = clampSeed(seed.value);
    if (clamped === null) return {};
    return { seed: clamped };
  }
  return {};
}

/** Describes the user-editable fields of an image generation draft. */
export interface ImageDraftLike {
  prompt: string;
  negative?: string;
  width?: number | string;
  height?: number | string;
  aspectRatio?: string;
  resolution?: string;
  quality?: "low" | "medium" | "high" | "auto" | string;
  steps?: number | string;
  cfg?: number | string;
  style?: string;
  safeMode?: boolean;
  disableWatermark?: boolean;
  imageCount?: number | string;
  /** When true, the builder will emit a `variants` field. Some model
   *  classes (e.g. SD-classic) accept it; nano-class models with
   *  `additionalProperties: false` may reject it. Defaults to true when
   *  the draft has a positive `imageCount`. */
  supportsVariants?: boolean;
  /** Per-capability flags from `ImageModelCapabilities`. When a flag is
   *  explicitly `false`, the builder strips the corresponding field from
   *  the payload even if the draft contains a value. When the flag is
   *  `undefined` the builder keeps its existing behaviour (always emit
   *  the field). Image-view sets these from `getImageModelCapabilities`
   *  so the form and the network boundary agree on what the model
   *  accepts. */
  supportsNegativePrompt?: boolean;
  supportsSeed?: boolean;
  supportsStyle?: boolean;
  supportsSteps?: boolean;
  supportsCfgScale?: boolean;
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

/** Round a dimension to the nearest valid multiple (64px for most SD pipelines).
 *  Capped at 1280 per the Venice swagger `GenerateImageRequest`. */
function clampDimension(value: unknown): number {
  const n = clampInt(value, VENICE_IMAGE_MIN_DIMENSION, VENICE_IMAGE_MAX_DIMENSION);
  return Math.round(n / VENICE_IMAGE_DIMENSION_DIVISOR) * VENICE_IMAGE_DIMENSION_DIVISOR;
}

/**
 * Normalizes and clamps an image draft so invalid UI or imported state
 * cannot produce out-of-range API requests.
 *
 * `aspectRatio` is preserved as the user-supplied value (or undefined if
 * none was given) so the payload builder can decide which dimension
 * fields to emit; defaulting to "1:1" here would force every model into
 * aspect-ratio mode and break SD-classic models that need raw width/height.
 *
 * @param draft The raw image draft.
 * @returns A normalized draft with safe values.
 */
export function normalizeImageDraft(draft: ImageDraftLike): ImageDraftLike {
  const prompt = String(draft.prompt ?? "").trim();
  const negative = String(draft.negative ?? "").trim();
  const aspectRatio = String(draft.aspectRatio ?? "").trim();
  const resolution = String(draft.resolution ?? "").trim();
  const rawQuality = String(draft.quality ?? "").trim().toLowerCase();
  const quality: "low" | "medium" | "high" | "auto" | undefined = (() => {
    if (rawQuality === "low" || rawQuality === "medium" || rawQuality === "high" || rawQuality === "auto") {
      return rawQuality;
    }
    return undefined;
  })();
  return {
    prompt: prompt.slice(0, VENICE_IMAGE_MAX_PROMPT_CHARS),
    negative: negative.slice(0, VENICE_IMAGE_MAX_PROMPT_CHARS),
    width: clampDimension(draft.width),
    height: clampDimension(draft.height),
    aspectRatio: aspectRatio || undefined,
    resolution: resolution || undefined,
    quality,
    steps: clampInt(draft.steps, 1, 50),
    cfg: clampFloat(draft.cfg, 1, 20),
    style: draft.style ?? "",
    safeMode: !!draft.safeMode,
    disableWatermark: !!draft.disableWatermark,
    imageCount: clampInt(draft.imageCount, 1, VENICE_IMAGE_MAX_VARIANTS),
    supportsVariants: draft.supportsVariants !== false,
  };
}

/**
 * Builds an image generation payload for the Venice API.
 *
 * Only ONE of the dimension modes is emitted per request — the API
 * expects either an `aspect_ratio` string OR explicit `width`/`height`
 * integers, not both:
 *  - If the caller supplies an `aspect_ratio` (e.g. "16:9", "1:1"), the
 *    builder emits `aspect_ratio` and OMITS `width`/`height`. Models in
 *    the Nano Banana class ignore the integer fields when an aspect ratio
 *    is set, but the swagger specifies `additionalProperties: false` for
 *    some model classes, so leaving them out is the safe default.
 *  - Otherwise the builder emits `width`/`height` and OMITS `aspect_ratio`
 *    — this is the path SD-classic models (flux-dev, z-image-turbo, etc.)
 *    require.
 *
 * `safe_mode` is added by `applyVeniceApiSafeMode` from the centralised
 * endpoint matrix, so this builder does NOT assign it directly.
 *
 * @param model The target image model identifier.
 * @param draft The user's image generation draft.
 * @param promptOverride An optional prompt that overrides the draft value.
 * @param seedState Optional seed state (off/fixed/null).
 * @returns A record ready to be serialised and sent to /image/generate.
 */
export function buildImagePayload(
  model: string,
  draft: ImageDraftLike,
  promptOverride?: string,
  seedState?: ImageSeedState,
): Record<string, unknown> {
  const normalized = normalizeImageDraft(draft);
  const payload: Record<string, unknown> = {
    model,
    prompt: (promptOverride ?? normalized.prompt).trim(),
    steps: normalized.steps,
    cfg_scale: normalized.cfg,
    hide_watermark: normalized.disableWatermark,
    return_binary: false,
  };

  // Sizing: pick exactly one shape. Caller decides via aspectRatio.
  if (normalized.aspectRatio) {
    payload.aspect_ratio = normalized.aspectRatio;
    // `resolution` is only meaningful in the aspect-resolution mode
    // (e.g. nano-banana-v1); never emit it alongside width/height
    // because that produces a malformed request.
    if (normalized.resolution) {
      payload.resolution = normalized.resolution;
    }
  } else {
    payload.width = normalized.width;
    payload.height = normalized.height;
  }

  // Quality is only emitted when the model supports it; the caller
  // decides by passing `quality` in the draft (image-view reads the
  // capabilities layer for this). Some model classes reject
  // `quality` as a foreign field, so we do not emit it by default.
  if (normalized.quality) {
    payload.quality = normalized.quality;
  }

  // Per-capability stripping. The builder only honours a `false` flag;
  // an `undefined` value preserves the existing "always emit" path so
  // legacy callers (and tests) keep their current shape. The form
  // (image-view) reads the live capability contract via
  // `getImageModelCapabilities` and forwards each flag so the form and
  // the network boundary agree.
  if (draft.supportsSteps === false) delete payload.steps;
  if (draft.supportsCfgScale === false) delete payload.cfg_scale;

  // Variants is only emitted when the draft's imageCount is positive
  // and the model class supports it. We do not auto-enable variants
  // for unknown models; image-view must pass `supportsVariants: true`
  // explicitly via the capabilities check.
  const imageCount = Number(normalized.imageCount);
  if (normalized.supportsVariants && Number.isFinite(imageCount) && imageCount > 1) {
    payload.variants = Math.min(
      VENICE_IMAGE_MAX_VARIANTS,
      Math.max(1, imageCount),
    );
  }

  const negative = normalized.negative?.trim();
  if (negative && draft.supportsNegativePrompt !== false) {
    payload.negative_prompt = negative;
  }
  if (normalized.style && draft.supportsStyle !== false) {
    payload.style_preset = normalized.style;
  }

  // Seed: only emit when valid/supported
  if (seedState && draft.supportsSeed !== false) {
    const serialized = serializeSeed(seedState, false);
    if ("seed" in serialized) payload.seed = serialized.seed;
  }

  return applyVeniceApiSafeMode("/image/generate", payload, normalized.safeMode);
}
