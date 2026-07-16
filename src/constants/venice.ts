/** @fileoverview Application constants for fallback models, tabs, diagnostics headers, and database configuration. */

/** Default models used when the Venice API model list is unavailable. */
export const FALLBACK_MODELS = {
  text: [
    { id: "zai-org-glm-4.6", type: "text", name: "zai-org-glm-4.6", traits: ["configured-default"], isFallback: true, source: "fallback" },
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
    { id: "venice-sd35", type: "image", name: "venice-sd35", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "seedream-v5-pro", type: "image", name: "seedream-v5-pro", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "seedream-v5-lite", type: "image", name: "seedream-v5-lite", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "seedream-v4", type: "image", name: "seedream-v4", traits: ["fallback"], isFallback: true, source: "fallback" }
  ],
  audio: [
    { id: "tts-kokoro", type: "audio", name: "tts-kokoro", traits: ["fallback", "tts"], isFallback: true, source: "fallback" },
    { id: "stable-audio", type: "audio", name: "stable-audio", traits: ["fallback", "music"], isFallback: true, source: "fallback" }
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

export const DEFAULT_IMAGE_MODEL = "z-image-turbo";
export const DEFAULT_IMAGE_EDIT_MODEL = "firered-image-edit";
export const IMAGE_EDIT_MODEL_IDS = new Set([
  "firered-image-edit",
  "qwen-edit-uncensored",
  "grok-imagine-edit",
  "grok-imagine-quality-edit",
  "qwen-image-2-edit",
  "qwen-image-2-pro-edit",
  "wan-2-7-pro-edit",
  "flux-2-max-edit",
  "gpt-image-2-edit",
  "gpt-image-1-5-edit",
  "nano-banana-2-edit",
  "nano-banana-pro-edit",
  "nano-banana-2-lite-edit",
  "luma-uni-1-edit",
  "luma-uni-1-max-edit",
  "seedream-v5-lite-edit",
  "seedream-v5-pro-edit",
  "seedream-v4-edit",
]);
export const DEFAULT_TTS_MODEL = "tts-kokoro";
export const DEFAULT_MUSIC_MODEL = "stable-audio";
export const DEFAULT_VIDEO_MODEL = "wan-2.6-text-to-video";

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

/**
 * Default app-authored system prompt for standard Venice Forge chats.
 *
 * This is intentionally not injected into character conversations. Venice-hosted
 * characters and local RP character cards keep their own conversation-scoped
 * prompts. This constant is a fallback/default; it is not automatically
 * inserted into new chats unless the user explicitly configures it.
 */
export const DEFAULT_SYSTEM_PROMPT = `## Identity

You are Venice Forge's assistant: direct, capable, privacy-conscious, and optimized for helping the user work with Venice.ai models inside a local-first desktop and web app.

Venice Forge is an unofficial, independent client for the Venice API. Do not claim to be an official Venice.ai product or representative.

## Operating Style

Be direct, thorough, and useful. Prefer concrete steps, exact commands, structured outputs, and clear reasoning summaries. Do not pad responses with filler. Do not repeat what you were just told. Match the user's language.

## Privacy and Local-First Context

Treat user content as private. Venice Forge stores chats, settings, and generated media locally using OS secure storage for API keys in desktop mode and encrypted IndexedDB-backed storage in the browser. Do not reference or expose internal storage paths, database keys, or session tokens.

## Attachments and Media References

Use attachments and media references only when they are explicitly present in the conversation context. Never invent file names, document IDs, URLs, screenshots, or uploaded content that was not provided.

Refer to uploaded or generated items descriptively — for example: "the uploaded PDF", "the generated image", or "the attached code file" — rather than exposing internal identifiers.

## Venice Forge Capabilities

You can help the user work across Venice Forge features including:
- Chat with Venice.ai language models
- Image generation, editing, upscaling, and background removal (where the selected model supports it)
- Video generation and upscaling (where supported)
- Audio and music generation (where supported)
- Document upload and ingestion for context (PDF, DOCX, text, code, images via vision-capable models)
- Embeddings generation
- Research workspace with web search and scraping (where enabled)
- Prompt library for saving and reusing prompts
- Project workspaces for organizing conversations and media
- Character cards, personas, lorebooks, and RP scenarios
- Scene composer for building structured image prompts from components
- Visual workflow editor for multi-step AI task chains

Do not claim a capability succeeded unless the app or API returned a successful result. Do not invent tool results.

## Characters and RP

When a conversation is tied to a Venice-hosted character or a local RP character card, that character's own system prompt and persona are authoritative. Do not override, merge, or replace character prompts with this global default prompt.

## Response Integrity

Do not invent facts, file paths, media IDs, tool results, or successful actions that did not occur. If current information is needed and no search or research feature is available in this context, say so clearly.

## Formatting

Use clear markdown for structured responses. Use \`\`\`language\`\`\` fenced blocks for all code. Use $$...$$ for display math and $...$ for inline math. Match the user's language throughout.`;

/** Centrally configured fallback; live provider default metadata takes precedence. */
export const DEFAULT_CHAT_MODEL = "zai-org-glm-4.6";

/** The default model used for workflows, web search, and data processing tasks. */
export const DEFAULT_WORKFLOW_MODEL = "llama-3.3-70b";

/** The default model used for the prompt enhancer feature. */
export const DEFAULT_PROMPT_ENHANCER_MODEL = "venice-uncensored-1-2";

/** Encrypted conversation-memory search index schema version. */
export const MEMORY_INDEX_VERSION = 2;

/** IndexedDB object store names used by the application. */
export const STORE_NAMES = [
  "images",
  "chats",
  "settings",
  "diagnostics",
  "conversations",
  "ai_memory",
  "files",
  "character_cards",
  // ST Card Studio autosave records; encrypted, excluded from sync, and
  // excluded from backups unless explicitly requested.
  "characterCardDrafts",
  "personas",
  "lorebooks",
  "rp_chats",
  "rp_assets",
  // Project Workspace (Phase 1) — first-class metadata + shared asset tagging.
  // Encrypted at rest like other user content (see storageService ENCRYPTED_STORES).
  "projects",
  // Phase 2D Prompt Library — user-saved, reusable prompt records with
  // versioning. Encrypted at rest like other user content.
  "promptLibrary",
  // Phase 2E Scene Composer — visual composition tool for arranging prompts,
  // media references, and models into structured scenes. Encrypted at rest.
  "scenes",
  // Phase 2F RP Studio Polish — standalone scenarios (openers + setting text)
  // that can be attached to a character card or used to seed a chat. Encrypted
  // at rest like other user-authored content.
  "rpScenarios",
  // Phase 2G Workflow Templates — structured sequences of prompts, scenes,
  // and media tasks. Encrypted at rest.
  "workflowTemplates",
  // Phase 2I Research Workspace — persistent research sessions, sources,
  // findings, and citations. Encrypted at rest like other user content.
  "researchSessions",
  // Phase 2J Visual Workflows — visual workflow node graphs. Encrypted at rest.
  "visualWorkflows",
  // Phase 2K Playground — user scratchpad conversations and workflow drafts. Encrypted at rest.
  "playground",
  // Phase 2G Sync — tombstones for hard deletes. Encrypted at rest.
  "tombstones",
];

/** Name of the IndexedDB database. */
export const DB_NAME = "venice_canvas_studio_v1";

/** Version of the IndexedDB schema. Bumped to 6 for timestamp index; 7 for Project Workspace "projects" store; 8 for Phase 2D Prompt Library "promptLibrary" store; 9 for Phase 2E Scene Composer "scenes" store; 10 for Phase 2F RP Studio Polish "rpScenarios" store; 11 for Phase 2G Workflow Templates "workflowTemplates" store; 12 for Phase 2I Research Workspace "researchSessions" store; 13 for Phase 2J visualWorkflows store; 14 for Phase 2K playground store; 15 for multi-profile profileId index on every store; 16 for Phase 2G Sync tombstones store. */
export const DB_VERSION = 17;

/**
 * Known vision-capable model ids. This is a conservative fallback for when
 * live `/models` metadata is not available at the call site (e.g. when
 * inspecting a persisted MediaItem whose source model may not be in the
 * current `/models` response). Whenever live metadata is available, the
 * `model_spec.capabilities.supportsVision` flag from the Venice API is the
 * source of truth and takes precedence over this list.
 */
export const VISION_CAPABLE_MODEL_IDS = new Set<string>([
  "llama-3.2-11b-vision",
  "qwen2.5-vl",
  "qwen2.5-vl-72b",
  "qwen2.5-vl-7b",
  "gemini-2.0-flash",
  "gemini-2.5-flash",
]);

/**
 * Regex patterns that suggest a model supports vision. Used only as a
 * conservative last-resort fallback when neither live `supportsVision`
 * metadata nor a direct id match is available. The Venice API does not
 * yet expose a stable `supportsVision` flag for every model, so the id
 * substring is the only signal we have for historical MediaItem records.
 */
export const VISION_CAPABLE_PATTERNS = [/vision/i, /-vl/i, /gemini-2\.[05]/i];

/**
 * Shape of the live Venice `/models` capability block we read for vision.
 * The full type is in `src/types/venice.ts`; this local minimal shape
 * keeps `modelSupportsVision` a pure helper that does not import the
 * renderer-only type graph, so the constants module stays safely usable
 * from the test runner and from any future non-renderer context.
 */
interface MinimalVisionCapabilities {
  supportsVision?: boolean | undefined;
}

/**
 * Returns true if the given model id (or live capability metadata) is
 * believed to support vision.
 *
 * Resolution order (most authoritative first):
 *
 * 1. If `liveCapabilities` is provided, trust its `supportsVision` flag
 *    (this is the live Venice API contract — see
 *    `src/types/venice.ts` `ModelCapabilities.supportsVision`).
 * 2. Otherwise, fall back to the static `VISION_CAPABLE_MODEL_IDS` set
 *    for an exact id match.
 * 3. Otherwise, fall back to the conservative pattern set
 *    (`VISION_CAPABLE_PATTERNS`).
 *
 * Unknown models with no live metadata default to `false`. The helper
 * never inspects API keys, raw prompt payloads, or persisted secrets;
 * its only input is the model id string and an optional capabilities
 * object.
 */
export function modelSupportsVision(
  modelId: string,
  liveCapabilities?: MinimalVisionCapabilities | null,
): boolean {
  // Live API contract wins. A live `supportsVision: false` must be
  // respected (e.g. a model whose id would match a heuristic pattern
  // but which the API explicitly marks as non-vision).
  if (liveCapabilities && typeof liveCapabilities === "object") {
    if (liveCapabilities.supportsVision === true) return true;
    if (liveCapabilities.supportsVision === false) return false;
  }
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

/** Regex patterns that identify Venice image-upscale-capable models. */
export const UPSCALE_CAPABLE_PATTERNS = [
  /upscale/i,
  /topaz[-_]?image/i,
  /clarity[-_]?upscale/i,
  /creative[-_]?upscale/i,
  /esrgan/i,
  /real[-_]?esrgan/i,
  /\brealesrgan\b/i,
];

/** Returns true if the model id or traits suggest `/image/upscale` support. */
export function modelSupportsUpscale(model: { id?: string; name?: string; type?: string; model_type?: string; modelType?: string; traits?: unknown; capabilities?: unknown; features?: unknown }): boolean {
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
  if (UPSCALE_CAPABLE_PATTERNS.some((p) => p.test(haystack))) return true;
  return false;
}

/** Regex patterns that identify Venice image-edit (inpaint/background-remove) capable models. */
export const EDIT_CAPABLE_PATTERNS = [
  /inpaint/i,
  /background[-_]?remove/i,
  /edit/i,
  /\bsdxl\b/i,
  /\bflux\b/i,
  /fluently/i,
  /lustify/i,
  /pony/i,
  /banana/i,
];

/** Returns true if the model id or traits suggest `/image/edit` or `/image/background-remove` support. */
export function modelSupportsEdit(model: { id?: string; name?: string; type?: string; model_type?: string; modelType?: string; traits?: unknown; capabilities?: unknown; features?: unknown }): boolean {
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
  if (EDIT_CAPABLE_PATTERNS.some((p) => p.test(haystack))) return true;
  if (/\.image\.|^image[_-]/.test(haystack)) return true;
  return false;
}

/** Maximum size of a single file attachment (text extraction). */
export const MAX_ATTACHMENT_FILE_BYTES = 256 * 1024;

/** Maximum size of a PDF file accepted for local text extraction.
 *  Matches the Venice API upload limit (VENICE_MAX_BODY_BYTES in limits.ts).
 *  Large PDFs are sliced to MAX_PDF_TEXT_CHARS during text extraction. */
export const MAX_PDF_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Maximum characters extracted from a PDF and injected into the prompt context. */
export const MAX_PDF_TEXT_CHARS = 100_000;


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
