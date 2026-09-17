import type { CharacterSceneGenerationResult } from "./characterSceneGeneration";
import type { ProviderModelLifecycle } from "./provider";
import type { ReasoningEffort } from "../shared/modelCapabilities";

export type ModelType = 'text' | 'image' | 'audio' | 'tts' | 'video' | 'music' | 'embedding' | 'upscale' | 'inpaint' | 'asr' | 'code'

export interface ImageConstraints {
  promptCharacterLimit?: number
  aspectRatios?: string[]
  defaultAspectRatio?: string
  resolutions?: string[]
  defaultResolution?: string
  steps?: { default: number; max: number }
  widthHeightDivisor?: number
  /** Maximum number of `style_references` accepted by POST /image/generate.
   *  Only present for models that support style references (Swagger
   *  `model_spec.constraints.maxStyleReferences`). Absent means unknown;
   *  treat as 1 when the model advertises `supportsStyleReferences: true`. */
  maxStyleReferences?: number
  /** Whether per-reference `strength` is honored. When false,
   *  `style_references` strength is ignored (Swagger
   *  `model_spec.constraints.supportsStyleReferenceStrength`). Absent means
   *  the model accepts strength. */
  supportsStyleReferenceStrength?: boolean
}

export interface VideoConstraints {
  model_type: 'text-to-video' | 'image-to-video' | 'video'
  aspect_ratios: string[]
  resolutions: string[]
  durations: string[]
  audio: boolean
  audio_configurable: boolean
  audio_input: boolean
  video_input: boolean
}

export interface ModelCapabilities {
  optimizedForCode?: boolean
  quantization?: string
  supportsAudioInput?: boolean
  supportsFunctionCalling?: boolean
  supportsLogProbs?: boolean
  supportsMultipleImages?: boolean
  supportsReasoning?: boolean
  supportsReasoningEffort?: boolean
  /** Per-model allowlist of valid `reasoning_effort` values (Swagger
   *  `TextModelCapabilities.reasoningEffortOptions`). Only present when
   *  `supportsReasoningEffort` is true; absent means the full documented
   *  enum is accepted. */
  reasoningEffortOptions?: ReasoningEffort[]
  /** Per-model default used when the request omits `reasoning_effort`
   *  (Swagger `TextModelCapabilities.defaultReasoningEffort`). Only present
   *  when `supportsReasoningEffort` is true. */
  defaultReasoningEffort?: ReasoningEffort
  supportsResponseSchema?: boolean
  supportsTeeAttestation?: boolean
  supportsE2EE?: boolean
  supportsVideoInput?: boolean
  supportsVision?: boolean
  supportsWebSearch?: boolean
  supportsXSearch?: boolean
}

/** Swagger `ModelResponse.model_spec.deprecation` — only present for models
 *  scheduled for retirement. See upstream overview/deprecations.mdx. */
export interface ModelDeprecation {
  /** When true, Venice may automatically remap API requests for this model
   *  ID to `replacementModelId` instead of returning an error. */
  autoRemap: boolean
  /** Legacy ISO 8601 instant aligned with the deprecation sunset used in
   *  response headers (`x-venice-model-deprecation-date`). Prefer
   *  `startsAt` / `removesAt` for new integrations. */
  date: string
  /** ISO 8601 instant when this model ID is omitted from public
   *  GET /models listings. */
  removesAt: string
  /** Suggested public API model ID to migrate to, when one exists. */
  replacementModelId?: string
  /** ISO 8601 instant when deprecation warnings should be considered
   *  active for this model. */
  startsAt?: string
}

export interface VenicePricingAmount {
  usd?: number
  diem?: number
}

/** Runtime `/models` pricing union normalized as optional fields. */
export interface VeniceModelPricing {
  input?: VenicePricingAmount
  output?: VenicePricingAmount
  cache_input?: VenicePricingAmount
  cache_write?: VenicePricingAmount
  generation?: VenicePricingAmount
  resolutions?: Record<string, VenicePricingAmount>
  quality?: Record<string, Record<string, VenicePricingAmount>>
  upscale?: Record<string, VenicePricingAmount>
  inpaint?: VenicePricingAmount
  inputImages?: { included?: number; additional?: VenicePricingAmount }
  durations?: Record<string, VenicePricingAmount & { min_seconds?: number; max_seconds?: number }>
  per_second?: VenicePricingAmount
  per_audio_second?: VenicePricingAmount
  per_thousand_characters?: VenicePricingAmount
  extended?: {
    context_token_threshold?: number
    input?: VenicePricingAmount
    output?: VenicePricingAmount
    cache_input?: VenicePricingAmount
    cache_write?: VenicePricingAmount
  }
}

export type ModelTrait =
  | 'default'
  | 'most_intelligent'
  | 'most_uncensored'
  | 'function_calling_default'
  | 'default_reasoning'
  | 'default_code'
  | 'default_vision'

export interface VeniceModel {
  id: string
  object: string
  created: number
  owned_by: string
  /** Upstream ModelResponse modality. Optional only for persisted legacy
   * records created before the field was normalized by Venice Forge. */
  type?: ModelType
  /** Fractional reseller discount (Swagger `ModelResponse.discount_to_user`,
   *  e.g. 0.2 = 20% off). Omitted by the provider for every caller without a
   *  reseller agreement and for models no agreement covers — an absent field
   *  means no discount. Prices in model_spec.pricing are the undiscounted
   *  base rate. Added in upstream Swagger `20260814.194349` (P3-001). */
  discount_to_user?: number
  /** Lifecycle state for fallback-provider models (active, deprecated, retiring,
   *  unavailable, unknown). Used to surface picker warnings and avoid routing
   *  new requests to retired models. */
  lifecycle?: ProviderModelLifecycle
  retirementDate?: string
  /** Provenance marker for models merged from fallback-provider catalogs. */
  source?: "live" | "fallback" | string
  /** True when the model comes from a bundled/static fallback catalog. */
  isFallback?: boolean
  model_spec?: {
    availableContextTokens?: number
    maxCompletionTokens?: number
    capabilities?: ModelCapabilities
    traits?: ModelTrait[]
    offline?: boolean
    name?: string
    description?: string
    /** Deprecation schedule — Swagger `model_spec.deprecation`, only
     *  present for models scheduled to be retired. Normalized for UI use by
     *  `resolveModelDeprecation()` in `src/shared/modelCapabilities.ts`. */
    deprecation?: ModelDeprecation
    constraints?: VideoConstraints | ImageConstraints
    model_sets?: string[]
    voices?: string[]
    pricing?: VeniceModelPricing
    supports_lyrics?: boolean
    lyrics_required?: boolean
    supports_force_instrumental?: boolean
    duration_options?: number[]
    min_duration?: number
    max_duration?: number
    default_duration?: number
    prompt_character_limit?: number
    /** Whether this image model accepts `style_references` on POST
     *  /image/generate (Swagger `model_spec.supportsStyleReferences`, only
     *  present for image models). Absent means unsupported — fail closed. */
    supportsStyleReferences?: boolean
    /** Legacy / hoisted top-level E2EE flag. Swagger canonical location is
     *  `capabilities.supportsE2EE`, but some legacy normalized records
     *  hoist the boolean to the top of `model_spec`. The
     *  `supportsE2EE()` capability gate in `src/shared/modelCapabilities.ts`
     *  honors both shapes; this declaration is mirrored here so the
     *  TypeScript type stays aligned with the runtime helper. */
    supportsE2EE?: boolean
    /** Venice classification for the `uncensored` model set. Present and `true`
     *  when Venice tags the model as applying minimal content-based filtering;
     *  absent for every other model. Authoritative — overrides legacy
     *  `traits.includes('most_uncensored')` heuristics. Resolved through
     *  `resolveModelUncensored()` in `modelClassification.ts`. */
    uncensored?: boolean
    /** Per-model TTS / music output audio formats. Swagger
     *  `model_spec.supported_formats`. An explicit format outside this list
     *  is rejected by the upstream generation endpoint, so the canonical
     *  TTS builder resolves the requested format against this allowlist
     *  and falls back to `default_format` (or `'mp3'`) when absent. */
    supported_formats?: string[]
    /** Per-model default output audio format. Swagger
     *  `model_spec.default_format`. Used when the request omits a format
     *  and as the fallback when the requested format is not in
     *  `supported_formats`. */
    default_format?: string
  }
}

export interface ModelsResponse {
  object: string
  data: VeniceModel[]
}

/** Audio input block — same shape as the existing OpenAI-compatible
 *  `input_audio` content type. Used by models that advertise audio support. */
export interface InputAudioContentPart {
  type?: 'input_audio'
  /** Base64-encoded audio data. Format is set on the parent ContentPart. */
  data: string
  /** MIME-style audio format (wav, mp3, etc.). Matches the upstream
   *  `InputAudio.format` enum. */
  format: string
}

/** File input block (Phase 6 — Phase 6). The `file_data` field carries a
 *  data URL (`data:application/pdf;base64,...`) or a publicly accessible
 *  URL — NEVER a raw filesystem path. Filename is optional metadata. */
export interface FileContentPart {
  type: 'file'
  file: {
    file_data: string
    filename?: string
  }
}

/** Video URL input block (Phase 6). URL can be a direct URL (YouTube is
 *  accepted for some providers), or a base64 data URL. At most 3 video_url
 *  parts per request (Swagger limit). */
export interface VideoUrlContentPart {
  type: 'video_url'
  video_url: { url: string }
}

/** Cache control hint carried by some content parts (file / video_url).
 *  Mirrors the OpenAI-compatible `cache_control` object with a single
 *  `type: 'ephemeral'` value. Beta feature — requires a special header. */
export interface CacheControlHint {
  type: 'ephemeral'
  ttl?: string
}

export interface FileContentPartWithCache extends FileContentPart {
  cache_control?: CacheControlHint
}

export interface VideoUrlContentPartWithCache extends VideoUrlContentPart {
  cache_control?: CacheControlHint
}

/** OpenAI-compatible content part union. Discriminated by `type` so
 *  unknown runtime values fail closed at the type level. Adding a new
 *  type requires updating the `isContentPartType` guard and any
 *  serializer/validator consumers. */
export interface ContentPart {
  type: 'text' | 'image_url' | 'input_audio' | 'file' | 'video_url'
  text?: string
  image_url?: { url: string }
  input_audio?: InputAudioContentPart
  file?: { file_data: string; filename?: string }
  video_url?: { url: string }
  /** Optional cache control on file / video_url parts only. */
  cache_control?: CacheControlHint
}

export interface AssistantToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | ContentPart[]
  reasoning_content?: string
  tool_calls?: AssistantToolCall[]
  tool_call_id?: string
  name?: string
  metadata?: {
    injectedContext?: string
    injectedContextSource?: "memory" | "prior_context" | "approved_context" | "mixed"
    sceneGeneration?: CharacterSceneGenerationResult
    /** Durable references to provider-native content parts (`file` /
     *  `video_url`). Expanded from the renderer runtime registry at compile
     *  time; payloads are never persisted on the message. */
    nativeParts?: import("./chatAttachment").NativeContentPartRef[]
    [key: string]: unknown
  }
}

/** User-facing privacy override for the per-request E2EE control. Distinct
 *  from the upstream `enable_e2ee` field because the renderer must store an
 *  explicit tri-state — Venice does not differentiate "user opted out" from
 *  "user never set a preference" once the field is included on the wire.
 *  Resolved to a boolean only at the canonical payload boundary by
 *  `resolveE2eeParam()`, which respects `supportsE2EE` capability gating. */
export type E2eeOverride = 'provider-default' | 'on' | 'off'

export interface VeniceParameters {
  include_venice_system_prompt?: boolean
  character_slug?: string
  strip_thinking_response?: boolean
  disable_thinking?: boolean
  enable_web_search?: 'off' | 'on' | 'auto'
  enable_document_tools?: boolean
  enable_web_scraping?: boolean
  enable_x_search?: boolean
  enable_web_citations?: boolean
  include_search_results_in_stream?: boolean
  return_search_results_as_documents?: boolean
  /** Enable end-to-end encryption for E2EE-capable models. Defaults upstream
   *  to `true` when E2EE headers are present; explicit `false` forces
   *  TEE-only mode. Only applicable when the model advertises
   *  `supportsE2EE === true`; otherwise the canonical payload builder omits
   *  the field. See Swagger `ChatCompletionRequest.venice_parameters.enable_e2ee`
   *  and `TextModelCapabilities.supportsE2EE`. */
  enable_e2ee?: boolean
}

/** OpenAI-compatible prompt-cache retention selector (Phase 7). Mirrors
 *  the Swagger `ChatCompletionRequest.prompt_cache_retention` enum. `'24h'`
 *  and `'extended'` extend retention to 24 hours for supported models; the
 *  canonical payload builder is responsible for capability gating and for
 *  stripping this field when the request is dispatched to a non-Venice
 *  fallback provider — the field is Venice-only and has no meaning on
 *  OpenAI/Google/etc. See `resolvePromptCacheRetention()` in
 *  `payloadBuilders.ts` and `chat-stream-manager.ts` provider fallback. */
export type PromptCacheRetention = 'default' | 'extended' | '24h';

export interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  temperature?: number
  max_completion_tokens?: number
  max_tokens?: number
  top_p?: number
  frequency_penalty?: number
  presence_penalty?: number
  /** Top-level per Swagger ChatCompletionRequest; NOT a venice_parameters member. */
  prompt_cache_key?: string
  /** Top-level per Swagger ChatCompletionRequest. Capability-gated and
   *  stripped on non-Venice providers. See `PromptCacheRetention`. */
  prompt_cache_retention?: PromptCacheRetention
  venice_parameters?: VeniceParameters
  safe_mode?: boolean
}

export interface ChatCompletionChunk {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    delta: {
      role?: string;
      content?: string;
      reasoning_content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    }
    finish_reason: string | null
  }>
}

/** Optional caller-specific cost returned with the chat completion response.
 *  When present, this represents the actual amount billed to the *current*
 *  caller for the response — it overrides any cost derived from the public
 *  list pricing in `VeniceModel.model_spec.pricing`. `diem` is the
 *  platform-internal credit unit; `usd` is the cash equivalent when the
 *  provider exposes it. Use `extractChatResponseCost()` rather than computing
 *  cost from list pricing whenever the response carries this block. */
export interface ChatCompletionCost {
  usd?: number
  diem?: number
}

export interface ChatCompletionUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  /** Caller-specific actual cost for this completion. Authoritative over
   *  any cost computed from `model_spec.pricing`. */
  cost?: ChatCompletionCost
}

export interface ChatCompletionResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: { role: string; content: string }
    finish_reason: string
  }>
  usage?: ChatCompletionUsage
}

/** Documented Venice rate-limit reason categories surfaced to the UI.
 *  Unknown upstream values flow through `VeniceRateLimitInfo.rawReason` so
 *  analytics can track new reasons before they are typed here. */
export type VeniceRateLimitReason =
  | 'unspecified'
  | 'requests_per_minute'
  | 'requests_per_day'
  | 'tokens_per_minute'
  | 'tokens_per_day'
  | 'concurrent_requests'

/** Time-window category for the rate limit that fired. Mirrors the
 *  `rateLimitType` enum from upstream `/api_keys/rate_limits`. */
export type VeniceRateLimitType = 'RPM' | 'RPD' | 'TPM' | 'TPD' | 'CONCURRENT'

/** Typed rate-limit payload extracted from a 429 response. `Retry-After`
 *  semantics remain unchanged; existing `computeRateLimitWait()` callers keep
 *  working with the `retryAfterSeconds` field below. */
export interface VeniceRateLimitInfo {
  /** Typed reason classification. Always present (defaults to `unspecified`).
   *  Drives UX message selection and metrics tagging. */
  reason: VeniceRateLimitReason
  /** Raw upstream reason string, preserved when upstream emits a value that
   *  does not yet map to a typed `VeniceRateLimitReason`. */
  rawReason?: string
  /** Time-window category for the exceeded limit, when upstream reports it. */
  limitType?: VeniceRateLimitType
  /** Resolved retry-after in seconds. Source priority is identical to
   *  `computeRateLimitWait`: `Retry-After` header > `x-ratelimit-reset-*`. */
  retryAfterSeconds?: number
}

// Image types
export interface ImageGenerateRequest {
  prompt: string
  negative_prompt?: string
  model: string
  width?: number
  height?: number
  cfg_scale?: number
  steps?: number
  style_preset?: string
  seed?: number
  format?: 'jpeg' | 'png' | 'webp'
  variants?: number
  safe_mode?: boolean
  hide_watermark?: boolean
  aspect_ratio?: string
  resolution?: string
  lora_strength?: number
  enable_web_search?: boolean
}

export interface ImageGenerateResponse {
  images: Array<string | { b64_json: string }>
  id: string
  model: string
  /** True when generation was accepted as a durable background task (Replicate). */
  queued?: boolean
  taskId?: string
}

export interface ImageEditRequest {
  image: string
  prompt: string
  model: string
  aspect_ratio?: string
  resolution?: string
  output_format?: 'jpeg' | 'png' | 'webp'
  safe_mode?: boolean
}

export interface ImageUpscaleRequest {
  image: string
  scale?: 2 | 4
  creativity?: number
}

export interface StylesResponse {
  data: string[]
}

// Audio types
export interface TTSRequest {
  model: string
  input: string
  voice: string
  response_format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'
  speed?: number
}

// Music types
export interface MusicQueueRequest {
  model: string
  prompt: string
  lyrics_prompt?: string
  duration_seconds?: number
  force_instrumental?: boolean
  voice?: string
  language_code?: string
  speed?: number
}

export interface MusicQueueResponse {
  model: string
  queue_id: string
  id?: string
  status: string
}

export interface MusicRetrieveResponse {
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'queued' | 'processing' | 'completed' | 'failed'
  audio_url?: string
  error?: string
}

export interface MusicRetrieveRequest {
  model: string
  queue_id: string
  delete_media_on_completion?: boolean
}

// Video types
export interface VideoQueueRequest {
  model: string
  prompt: string
  negative_prompt?: string
  duration?: string
  aspect_ratio?: string
  resolution?: string
  image_url?: string
  end_image_url?: string
  audio?: boolean
  audio_url?: string
  video_url?: string
  reference_image_urls?: string[]
  scene_image_urls?: string[]
  /** Seedance 2.0/2.5 only, queue-only. "standard" is the upstream default
   *  and is omitted; only "high" is sent. */
  bitrate_mode?: "standard" | "high"
}

export interface VideoQueueResponse {
  model: string
  queue_id: string
  id?: string
  download_url?: string
}

export interface VideoRetrieveRequest {
  model: string
  queue_id: string
  delete_media_on_completion?: boolean
}

export interface VideoRetrieveResponse {
  id?: string
  status: 'PROCESSING' | 'COMPLETED' | 'queued' | 'processing' | 'completed' | 'failed'
  video_url?: string
  error?: string
  progress?: number
  average_execution_time?: number
  execution_duration?: number
}

// Embedding types
export interface EmbeddingRequest {
  model: string
  input: string | string[]
  encoding_format?: 'float' | 'base64'
}

export interface EmbeddingResponse {
  object: string
  data: Array<{ object: string; index: number; embedding: number[] }>
  model: string
  usage: { prompt_tokens: number; total_tokens: number }
}

// Character types
export interface Character {
  slug: string
  name: string
  description: string
  avatar_url?: string
  system_prompt?: string
  tags?: string[]
}

export interface CharactersResponse {
  data: Character[]
}

// Error types
export interface VeniceError {
  error: {
    message: string
    type: string
    code?: string
    suggested_prompt?: string
  }
}

// Conversation
export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  model: string
  createdAt: number
}

export interface NormalizedModelPrivacy {
  mode: 'private' | 'anonymous' | 'standard' | 'unknown'
  privateInference: boolean | null
  anonymousInference: boolean | null
  source: 'provider' | 'fallback' | 'derived'
  disclosure?: string
}

export interface ModelInfo {
  id: string;
  name?: string;
  model_spec?: VeniceModel['model_spec'];
  /** Fractional reseller discount from `VeniceModel.discount_to_user`;
   *  absent means no discount (P3-001). */
  discount_to_user?: number;
  type?: string;
  traits?: unknown;
  isFallback?: boolean;
  source?: "live" | "fallback" | string;
  created?: number;
  object?: string;
  owned_by?: string;
  model?: string;
  display_name?: string;
  model_type?: string;
  modelType?: string;
  capabilities?: ModelCapabilities;
  features?: unknown;
  contextLength?: number | null;
  maxOutputTokens?: number | null;
  privacy?: NormalizedModelPrivacy;
  fidelity?: 'high' | 'standard';
}

export interface DiagnosticsEntry {
  id: string;
  timestamp: number;
  type: "info" | "warn" | "error" | "success";
  endpoint: string;
  status: number | string | null;
  latencyMs: number | null;
  reqSize?: number;
  resSize?: number;
  error?: string;
  data?: unknown;
  method?: string;
  ok?: boolean;
  headers?: Record<string, string>;
  model?: string | null;
  message?: string;
  startedAt?: string;
  endedAt?: string;
}
