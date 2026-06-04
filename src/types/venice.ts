/** @fileoverview Venice API response type definitions. */

/** Metadata for a single model returned by the Venice API. */
export interface ModelInfo {
  id: string;
  name?: string;
  type?: string;
  traits?: unknown;
  isFallback?: boolean;
  source?: "live" | "fallback" | string;
  // Raw API fields
  created?: number;
  object?: string;
  owned_by?: string;
  model?: string;
  display_name?: string;
  model_type?: string;
  modelType?: string;
  capabilities?: ModelCapabilities;
  features?: unknown;
}

export type ModelTrait =
  | 'default'
  | 'most_intelligent'
  | 'most_uncensored'
  | 'function_calling_default'
  | 'default_reasoning'
  | 'default_code'
  | 'default_vision'

export interface ModelCapabilities {
  optimizedForCode?: boolean
  quantization?: string
  supportsAudioInput?: boolean
  supportsFunctionCalling?: boolean
  supportsLogProbs?: boolean
  supportsMultipleImages?: boolean
  supportsReasoning?: boolean
  supportsReasoningEffort?: boolean
  supportsResponseSchema?: boolean
  supportsTeeAttestation?: boolean
  supportsE2EE?: boolean
  supportsVideoInput?: boolean
  supportsVision?: boolean
  supportsWebSearch?: boolean
  supportsXSearch?: boolean
}

export interface ModelsResponse {
  object: string
  data: ModelInfo[]
}

export interface VeniceModel {
  id: string
  object: string
  created: number
  owned_by: string
  model_spec?: {
    availableContextTokens?: number
    maxCompletionTokens?: number
    capabilities?: ModelCapabilities
    traits?: ModelTrait[]
    offline?: boolean
    name?: string
    description?: string
  }
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
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

export interface ImageGenerateResponse {
  images: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
  timingInfo?: unknown
}

export interface MusicQueueResponse {
  model: string
  queue_id?: string
  id?: string
  status: string
}

export interface MusicRetrieveResponse {
  status: string
  audio_url?: string
  error?: string
}

export interface VideoQueueResponse {
  model: string
  queue_id?: string
  id?: string
  status: string
}

export interface VideoRetrieveResponse {
  status: string
  video_url?: string
  error?: string
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
