/** @fileoverview Application constants for fallback models, tabs, diagnostics headers, and database configuration. */

/** Default models used when the Venice API model list is unavailable. */
export const FALLBACK_MODELS = {
  text: [
    { id: "venice-uncensored", type: "text", name: "venice-uncensored", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "venice-uncensored-1-2", type: "text", name: "venice-uncensored-1-2", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "llama-3.3-70b", type: "text", name: "llama-3.3-70b", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "llama-3.2-3b", type: "text", name: "llama-3.2-3b", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "zai-org-glm-5.1", type: "text", name: "zai-org-glm-5.1", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "zai-org-glm-4.7", type: "text", name: "zai-org-glm-4.7", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "mistral-31-24b", type: "text", name: "mistral-31-24b", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "qwen3-4b", type: "text", name: "qwen3-4b", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "deepseek-ai-DeepSeek-R1", type: "text", name: "deepseek-ai-DeepSeek-R1", traits: ["fallback"], isFallback: true, source: "fallback" }
  ],
  image: [
    { id: "flux-dev", type: "image", name: "flux-dev", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "lustify-sdxl", type: "image", name: "lustify-sdxl", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "z-image-turbo", type: "image", name: "z-image-turbo", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "nano-banana-pro", type: "image", name: "nano-banana-pro", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "venice-sd35", type: "image", name: "venice-sd35", traits: ["fallback"], isFallback: true, source: "fallback" }
  ],
  audio: [
    { id: "tts-kokoro", type: "audio", name: "tts-kokoro", traits: ["fallback"], isFallback: true, source: "fallback" }
  ],
  video: [
    { id: "wan-2.6-text-to-video", type: "video", name: "wan-2.6-text-to-video", traits: ["fallback", "text-to-video"], isFallback: true, source: "fallback" },
    { id: "wan-2.6-image-to-video", type: "video", name: "wan-2.6-image-to-video", traits: ["fallback", "image-to-video"], isFallback: true, source: "fallback" },
    { id: "topaz-video-upscale", type: "video", name: "topaz-video-upscale", traits: ["fallback", "upscale"], isFallback: true, source: "fallback" }
  ],
  embeddings: [
    { id: "text-embedding-bge-m3", type: "embeddings", name: "text-embedding-bge-m3", traits: ["fallback"], isFallback: true, source: "fallback" }
  ],
  unknown: []
};

/** Ordered list of application tabs with their display labels. */
export const TABS = [
  ["chat", "Prompt"],
  ["image", "Create"],
  ["video", "Video"],
  ["batch", "Batch"],
  ["search", "Research"],
  ["models", "Catalog"],
  ["gallery", "Library"],
  ["settings", "Config"],
  ["diagnostics", "Status"]
];

/** Response header names captured for diagnostics. */
export const DIAG_HEADER_NAMES = [
  "retry-after",
  "CF-RAY",
  "x-venice-version",
  "x-venice-timestamp",
  "x-venice-model-id",
  "x-venice-model-name",
  "x-venice-model-router",
  "x-venice-model-deprecation-warning",
  "x-venice-model-deprecation-date",
  "x-ratelimit-limit-requests",
  "x-ratelimit-remaining-requests",
  "x-ratelimit-reset-requests",
  "x-ratelimit-limit-tokens",
  "x-ratelimit-remaining-tokens",
  "x-ratelimit-reset-tokens",
  "x-ratelimit-type",
  "x-venice-balance-usd",
  "x-venice-balance-diem",
  "x-venice-is-content-violation",
  "x-venice-is-blurred",
  "x-venice-contains-minor",
  "x-venice-is-adult-model-content-violation"
];

/** Default system prompt applied to new chat conversations. */
export const DEFAULT_SYSTEM_PROMPT = "You are a precise, useful AI assistant inside Venice Forge.";

/** IndexedDB object store names used by the application. */
export const STORE_NAMES = ["images", "chats", "settings", "diagnostics", "conversations", "ai_memory", "files"];

/** Name of the IndexedDB database. */
export const DB_NAME = "venice_canvas_studio_v1";

/** Version of the IndexedDB schema. */
export const DB_VERSION = 4;

/**
 * Known vision-capable model ids and id-patterns.
 * TODO: Replace with a live capability flag from the Venice API once available.
 */
export const VISION_CAPABLE_MODEL_IDS = new Set<string>([
  "llama-3.2-11b-vision",
  "qwen2.5-vl",
  "qwen2.5-vl-72b",
  "qwen2.5-vl-7b",
  "gemini-2.0-flash",
  "gemini-2.5-flash",
]);

/** Regex patterns that suggest a model supports vision. */
export const VISION_CAPABLE_PATTERNS = [/vision/i, /-vl/i, /gemini-2\.[05]/i];

/** Returns true if the given model id is believed to support vision. */
export function modelSupportsVision(modelId: string): boolean {
  const id = String(modelId || "").toLowerCase();
  if (VISION_CAPABLE_MODEL_IDS.has(id)) return true;
  return VISION_CAPABLE_PATTERNS.some((p) => p.test(id));
}

/** Regex patterns that identify Venice video generation or video upscaling models. */
export const VIDEO_CAPABLE_PATTERNS = [
  /video/i,
  /text-to-video/i,
  /image-to-video/i,
  /reference-to-video/i,
  /video-to-video/i,
  /topaz-video-upscale/i,
  /\bwan[-.]/i,
  /\bkling[-.]/i,
  /\bveo(?:3|\d|\.)/i,
  /\bltx[-.]/i,
  /\bpixverse[-.]/i,
  /\bseedance[-.]/i,
  /\brunway[-.]/i,
];

/** Returns true if the model id or traits indicate video generation/upscaling support. */
export function modelSupportsVideo(model: { id?: string; name?: string; type?: string; model_type?: string; modelType?: string; traits?: unknown; capabilities?: unknown; features?: unknown }): boolean {
  const haystack = [
    model.id,
    model.name,
    model.type,
    model.model_type,
    model.modelType,
    JSON.stringify(model.traits || {}),
    JSON.stringify(model.capabilities || {}),
    JSON.stringify(model.features || {}),
  ].join(" ").toLowerCase();
  return VIDEO_CAPABLE_PATTERNS.some((pattern) => pattern.test(haystack));
}

/** Maximum size of a single file attachment (text extraction). */
export const MAX_ATTACHMENT_FILE_BYTES = 256 * 1024;

/** Maximum total injected context from attachments per message. */
export const MAX_TOTAL_ATTACHMENT_CONTEXT_BYTES = 1024 * 1024;

/** Maximum attachments per message. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

/** Maximum memory block characters injected into a prompt. */
export const MAX_MEMORY_BLOCK_CHARS = 2000;

/** Maximum number of memories to inject. */
export const MAX_INJECTED_MEMORIES = 5;

/** Delay between batched image generation requests to avoid rate limits. */
export const IMAGE_BATCH_INTER_REQUEST_DELAY_MS = 750;
