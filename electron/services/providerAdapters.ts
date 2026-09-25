import { getApiKey, getProviderCredentialOrFallback } from './secureStore'
import { getProviderSettings } from './providerSettingsStore'
import type { StreamDelta } from './veniceClient'
import { PROVIDER_REGISTRY, type AzureOpenAiConfig, type AwsBedrockConfig, type GenericOpenAiConfig, type GoogleVertexConfig, type ProviderCredential, type ProviderId } from '../../src/types/provider'
import {
  DEFAULT_PRIMARY_API_ROUTE,
  resolvePrimaryApiRoute as resolveSharedPrimaryApiRoute,
  type PrimaryApiRouteId,
} from '../../src/shared/primaryApiRoute'

export interface ProviderRoute {
  host: string
  path: string
  headers: Record<string, string>
  transformBody?: (body: Record<string, unknown>, realModel: string) => Record<string, unknown>
  transformResponse?: (responseBody: unknown) => unknown
  extractStreamDelta?: (data: string) => StreamDelta
}

type AdapterFn = (model: string, credential: ProviderCredential | string, originalPath: string, _originalBody: Record<string, unknown>) => ProviderRoute | null

type ProviderOperationFields = Readonly<
  Partial<Record<ProviderId, Readonly<Record<string, readonly string[]>>>>
>

const TOGETHER_CHAT_FIELDS = [
  'model', 'messages', 'max_tokens', 'max_completion_tokens', 'stop', 'temperature', 'top_p', 'top_k',
  'context_length_exceeded_behavior', 'repetition_penalty', 'stream', 'logprobs',
  'n', 'min_p', 'presence_penalty', 'frequency_penalty', 'logit_bias', 'seed',
  'function_call', 'response_format', 'tools', 'tool_choice', 'compliance',
  'chat_template_kwargs', 'safety_model', 'reasoning_effort', 'reasoning',
] as const

const OPENAI_CHAT_FIELDS = [
  'model', 'messages', 'audio', 'frequency_penalty', 'function_call', 'functions',
  'logit_bias', 'logprobs', 'max_completion_tokens', 'max_tokens', 'metadata',
  'modalities', 'n', 'parallel_tool_calls', 'prediction', 'presence_penalty',
  'reasoning_effort', 'response_format', 'seed', 'service_tier', 'stop', 'store',
  'stream', 'stream_options', 'temperature', 'tool_choice', 'tools', 'top_logprobs',
  'top_p', 'user',
] as const

const PROVIDER_OPERATION_FIELDS: ProviderOperationFields = {
  together: {
    '/chat/completions': TOGETHER_CHAT_FIELDS,
    '/image/generate': [
      'model', 'prompt', 'steps', 'seed', 'variants', 'height', 'width',
      'negative_prompt', 'cfg_scale', 'format',
    ],
    '/images/generations': [
      'model', 'prompt', 'steps', 'image_url', 'seed', 'n', 'height', 'width',
      'negative_prompt', 'response_format', 'guidance_scale', 'output_format',
      'image_loras', 'reference_images', 'disable_safety_checker',
    ],
  },
  groq: {
    '/chat/completions': [
      ...OPENAI_CHAT_FIELDS, 'citation_options', 'compound_custom',
      'disable_tool_validation', 'documents', 'exclude_domains', 'include_domains',
      'include_reasoning', 'reasoning_format', 'search_settings',
    ],
  },
  fireworks: {
    '/chat/completions': [
      ...OPENAI_CHAT_FIELDS, 'top_k', 'prompt_cache_key',
      'prompt_cache_isolation_key', 'raw_output', 'perf_metrics_in_response',
      'min_p', 'typical_p', 'repetition_penalty', 'mirostat_target', 'ignore_eos',
      'context_length_exceeded_behavior', 'speculation',
    ],
  },
  mistral: {
    '/chat/completions': [
      ...OPENAI_CHAT_FIELDS, 'random_seed', 'safe_prompt', 'prompt_mode',
      'guardrails',
    ],
  },
  anthropic: {
    '/chat/completions': [
      'model', 'messages', 'max_tokens', 'stop', 'stream', 'temperature', 'top_p',
      'top_k', 'tools', 'tool_choice', 'metadata', 'service_tier', 'thinking',
    ],
  },
  cohere: {
    '/chat/completions': [
      'model', 'messages', 'stream', 'tools', 'documents', 'citation_options',
      'response_format', 'safety_mode', 'max_tokens', 'stop_sequences',
      'temperature', 'seed', 'frequency_penalty', 'presence_penalty', 'k', 'p',
      'top_p', 'logprobs', 'tool_choice', 'thinking', 'priority', 'strict_tools',
    ],
  },
  google_gemini: {
    '/chat/completions': [
      'model', 'messages', 'stream', 'temperature', 'max_tokens', 'top_p', 'top_k',
      'stop', 'tools', 'tool_choice', 'response_format',
    ],
  },
  google_vertex: {
    '/chat/completions': [
      'model', 'messages', 'stream', 'temperature', 'max_tokens', 'top_p', 'top_k',
      'stop', 'tools', 'tool_choice', 'response_format',
    ],
  },
  azure_openai: { '/chat/completions': OPENAI_CHAT_FIELDS },
  aws_bedrock: { '/chat/completions': OPENAI_CHAT_FIELDS },
  huggingface: { '/chat/completions': OPENAI_CHAT_FIELDS },
  perplexity: {
    '/chat/completions': [
      'model', 'messages', 'max_tokens', 'stream', 'stop', 'temperature', 'top_p',
      'response_format', 'web_search_options', 'search_mode', 'return_images',
      'return_related_questions', 'enable_search_classifier', 'disable_search',
      'search_domain_filter', 'search_language_filter', 'search_recency_filter',
      'search_after_date_filter', 'search_before_date_filter',
      'last_updated_before_filter', 'last_updated_after_filter',
      'image_format_filter', 'image_domain_filter', 'stream_mode',
      'reasoning_effort', 'language_preference',
    ],
  },
  generic_openai: {
    // Generic OpenAI-compatible endpoints (OpenRouter, vLLM, LocalAI, etc.)
    // accept the same chat-completions surface as OpenAI proper.
    '/chat/completions': OPENAI_CHAT_FIELDS,
    '/embeddings': [
      'model', 'input', 'encoding_format', 'user', 'dimensions',
    ],
  },
}

/** Builds a fresh provider request body from the fields documented for the
 * selected provider operation. Unknown operations fail closed. */
export function sanitizeProviderRequestBody(
  providerId: ProviderId,
  endpoint: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const allowedFields = PROVIDER_OPERATION_FIELDS[providerId]?.[endpoint]
  if (!allowedFields) return {}

  const sanitized: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      sanitized[field] = body[field]
    }
  }
  return sanitized
}

/** Extracts a single API key from a simple credential object or string. */
function extractApiKey(credential: ProviderCredential | string): string {
  if (typeof credential === 'string') return credential
  if (credential && typeof credential === 'object' && 'apiKey' in credential && typeof credential.apiKey === 'string') {
    return credential.apiKey
  }
  throw new Error('Credential does not contain a usable API key')
}

/** Extracts and validates the structured Azure OpenAI credential. */
function extractAzureOpenAiConfig(credential: ProviderCredential | string): AzureOpenAiConfig {
  if (typeof credential === 'string' || !credential || typeof credential !== 'object' || credential.providerId !== 'azure_openai') {
    throw new Error('Azure OpenAI credential is not structured correctly')
  }
  const c = credential as AzureOpenAiConfig
  if (!c.resourceName || !c.deploymentName || !c.apiVersion || !c.apiKey) {
    throw new Error('Azure OpenAI credential is missing required fields')
  }
  return c
}

/** Extracts and validates the structured AWS Bedrock credential. */
function extractAwsBedrockConfig(credential: ProviderCredential | string): AwsBedrockConfig {
  if (typeof credential === 'string' || !credential || typeof credential !== 'object' || credential.providerId !== 'aws_bedrock') {
    throw new Error('AWS Bedrock credential is not structured correctly')
  }
  const c = credential as AwsBedrockConfig
  if (!c.region || !c.apiKey) {
    throw new Error('AWS Bedrock credential is missing required fields')
  }
  // Reject obviously invalid region shapes as defense-in-depth SSRF protection.
  // Credential validation already constrains this; the adapter re-checks so a
  // stale or tampered credential cannot be turned into an arbitrary host.
  if (!/^[a-z0-9-]{2,32}$/.test(c.region) || c.region.startsWith('-') || c.region.endsWith('-')) {
    throw new Error('AWS Bedrock region is invalid')
  }
  return c
}

/** Extracts and validates the structured Google Vertex credential.
 *  VF-AUD-20260831-P2-007: only Express Mode is supported. The previous
 *  "full" OAuth/service-account branch was selectable in the UI but
 *  guaranteed to fail; it has been removed from the public type until a
 *  service-account/OAuth custody path is implemented.
 */
function extractGoogleVertexConfig(credential: ProviderCredential | string): GoogleVertexConfig {
  if (typeof credential === 'string' || !credential || typeof credential !== 'object' || credential.providerId !== 'google_vertex') {
    throw new Error('Google Vertex credential is not structured correctly')
  }
  const c = credential as GoogleVertexConfig
  if (!c.apiKey) {
    throw new Error('Google Vertex Express Mode credential is missing required fields')
  }
  return c
}

/** Builds a Vertex AI Express Mode HTTPS host.
 *  The documented Express endpoint is always aiplatform.googleapis.com.
 */
function buildVertexHost(): string {
  return 'aiplatform.googleapis.com'
}

/** Parses and validates a user-supplied base URL for the generic_openai
 *  provider. The host is locked to HTTPS to avoid silent credential leakage
 *  over plain HTTP, and the URL shape is restricted to a host with an optional
 *  path prefix — anything richer (custom schemes, embedded credentials, query
 *  strings) is rejected. SSRF is bounded by the same allowlist of public
 *  hostnames that credential storage already enforces; if a future change
 *  relaxes that allowlist the runtime guard here is the second line of
 *  defense. */
function parseGenericOpenAiBaseUrl(rawBaseUrl: string): { host: string; pathPrefix: string } {
  if (typeof rawBaseUrl !== "string" || rawBaseUrl.length === 0) {
    throw new Error("Generic OpenAI base URL is required");
  }
  let parsed: URL;
  try {
    parsed = new URL(rawBaseUrl);
  } catch {
    throw new Error("Generic OpenAI base URL is not a valid URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Generic OpenAI base URL must use https://");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Generic OpenAI base URL must not embed credentials");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("Generic OpenAI base URL must not contain query strings or fragments");
  }
  return { host: parsed.host, pathPrefix: parsed.pathname.replace(/\/$/, "") };
}

/** Extracts and validates the structured Generic OpenAI credential. */
function extractGenericOpenAiConfig(credential: ProviderCredential | string): GenericOpenAiConfig {
  if (typeof credential === "string" || !credential || typeof credential !== "object" || credential.providerId !== "generic_openai") {
    throw new Error("Generic OpenAI credential is not structured correctly");
  }
  const c = credential as GenericOpenAiConfig;
  if (!c.baseUrl || !c.apiKey) {
    throw new Error("Generic OpenAI credential is missing required fields");
  }
  return c;
}

/** Shared Gemini request normalization used by both the Gemini Developer API
 *  and Vertex AI Express Mode adapters. */
function geminiTransformBody(body: Record<string, unknown>, _realModel: string): Record<string, unknown> {
  const messages = (body.messages as Record<string, unknown>[]) || []
  const systemMessage = messages.find((m) => m.role === 'system')
  const otherMessages = messages.filter((m) => m.role !== 'system').map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }))
  return {
    contents: otherMessages,
    systemInstruction: systemMessage ? { parts: [{ text: systemMessage.content }] } : undefined,
    generationConfig: {
      temperature: body.temperature,
      maxOutputTokens: (body.max_completion_tokens as number | undefined) ?? body.max_tokens
    }
  }
}

/** Shared Gemini non-streaming response normalization. */
function geminiTransformResponse(responseBody: unknown): unknown {
  if (responseBody && typeof responseBody === 'object') {
    const body = responseBody as Record<string, unknown>
    if (body.error) {
      const err = body.error as Record<string, unknown>
      return { error: { message: err.message || 'Google API Error', type: err.status } }
    }
    if (Array.isArray(body.candidates)) {
      const candidate = body.candidates[0] as Record<string, unknown> | undefined
      const content = candidate?.content as Record<string, unknown> | undefined
      const parts = content?.parts as Record<string, unknown>[] | undefined
      const text = parts?.[0]?.text || ''
      const usage = body.usageMetadata as Record<string, unknown> | undefined
      return {
        choices: [{ message: { content: text, role: 'assistant' } }],
        usage: {
          prompt_tokens: usage?.promptTokenCount,
          completion_tokens: usage?.candidatesTokenCount,
          total_tokens: usage?.totalTokenCount
        }
      }
    }
  }
  return responseBody
}

/** Shared Gemini streaming delta extraction. */
function geminiExtractStreamDelta(data: string): StreamDelta {
  if (!data || data === '[DONE]') return { content: '', reasoning: '', parsed: true, malformed: false }
  try {
    const json = JSON.parse(data)
    if (json && typeof json === 'object') {
      if (json.error) {
        return { content: '', reasoning: '', parsed: true, malformed: true, rawData: data }
      }
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text || ''
      return { content: text, reasoning: '', parsed: true, malformed: false }
    }
    return { content: '', reasoning: '', parsed: true, malformed: false }
  } catch {
    return { content: '', reasoning: '', parsed: false, malformed: true, rawData: data }
  }
}

/** Builds an HTTPS Azure OpenAI host and rejects non-Azure or dangerous hosts.
 *  The resource name is validated at credential-storage time; this is a
 *  defense-in-depth runtime guard against SSRF and credential downgrade.
 */
function buildAzureOpenAiHost(resourceName: string): string {
  // Reject the same dangerous shapes that credential validation rejects,
  // so a stale or tampered credential cannot be turned into an arbitrary host.
  if (!/^[a-z0-9-]{2,64}$/.test(resourceName) || resourceName.startsWith('-') || resourceName.endsWith('-')) {
    throw new Error('Azure OpenAI resource name is invalid')
  }
  return `${resourceName}.openai.azure.com`.toLowerCase()
}

export const providerAdapters: Record<string, AdapterFn> = {
  together: (model, credential, originalPath, _originalBody) => {
    if (
      originalPath !== '/chat/completions' &&
      originalPath !== '/image/generate' &&
      originalPath !== '/images/generations'
    ) return null
    return {
      host: 'api.together.xyz',
      path: originalPath === '/chat/completions'
        ? '/v1/chat/completions'
        : '/v1/images/generations',
      headers: {
        'Authorization': `Bearer ${extractApiKey(credential)}`,
        'Content-Type': 'application/json'
      },
      transformBody: (body, realModel) => {
        if (originalPath !== '/image/generate') {
          return { ...body, model: realModel }
        }
        const mapped = {
          model: realModel,
          prompt: body.prompt,
          steps: body.steps,
          seed: body.seed,
          n: body.variants,
          height: body.height,
          width: body.width,
          negative_prompt: body.negative_prompt,
          guidance_scale: body.cfg_scale,
          output_format: body.format,
          response_format: 'base64',
        }
        return Object.fromEntries(
          Object.entries(mapped).filter(([, value]) => value !== undefined),
        )
      }
    }
  },
  groq: (model, credential, originalPath, _originalBody) => {
    if (originalPath !== '/chat/completions') return null
    return {
      host: 'api.groq.com',
      path: '/openai/v1' + originalPath,
      headers: {
        'Authorization': `Bearer ${extractApiKey(credential)}`,
        'Content-Type': 'application/json'
      },
      transformBody: (body, realModel) => ({ ...body, model: realModel })
    }
  },
  anthropic: (model, credential, originalPath, _originalBody) => {
    if (originalPath !== '/chat/completions') return null
    return {
      host: 'api.anthropic.com',
      path: '/v1/messages', // Anthropic uses a different endpoint for chat
      headers: {
        'x-api-key': extractApiKey(credential),
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      // Basic adapter for Anthropic: maps OpenAI format to Anthropic format
      transformBody: (body, realModel) => {
        const messages = (body.messages as Record<string, unknown>[]) || []
        const systemMessage = messages.find((m) => m.role === 'system')
        const otherMessages = messages.filter((m) => m.role !== 'system').map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        }))
        return {
          model: realModel,
          max_tokens: ((body.max_completion_tokens as number | undefined) ?? body.max_tokens) || 4096,
          messages: otherMessages,
          system: systemMessage ? systemMessage.content : undefined,
          temperature: body.temperature,
          stream: body.stream
        }
      },
      transformResponse: (responseBody: unknown) => {
        if (responseBody && typeof responseBody === 'object') {
          const body = responseBody as Record<string, unknown>
          if (body.type === 'error' || body.error) {
            const err = (body.error || body) as Record<string, unknown>
            return {
              error: {
                message: err.message || body.message || 'Unknown Anthropic error',
                type: err.type || body.type
              }
            }
          }
          if (Array.isArray(body.content)) {
            const text = body.content.map((c: Record<string, unknown>) => c.text).join('')
            const usage = body.usage as Record<string, unknown> | undefined
            return {
              id: body.id,
              choices: [{
                message: { content: text, role: 'assistant' }
              }],
              usage: {
                prompt_tokens: usage?.input_tokens,
                completion_tokens: usage?.output_tokens,
                total_tokens: (Number(usage?.input_tokens) || 0) + (Number(usage?.output_tokens) || 0)
              }
            }
          }
        }
        return responseBody
      },
      extractStreamDelta: (data: string): StreamDelta => {
        if (!data || data === '[DONE]') return { content: '', reasoning: '', parsed: true, malformed: false }
        try {
          const json = JSON.parse(data)
          if (json && typeof json === 'object') {
            if (json.type === 'error' || json.error) {
              return { content: '', reasoning: '', parsed: true, malformed: true, rawData: data }
            }
            if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
              return { content: json.delta.text || '', reasoning: '', parsed: true, malformed: false }
            }
            return { content: '', reasoning: '', parsed: true, malformed: false }
          }
          return { content: '', reasoning: '', parsed: true, malformed: false }
        } catch {
          return { content: '', reasoning: '', parsed: false, malformed: true, rawData: data }
        }
      }
    }
  },
  mistral: (model, credential, originalPath, _originalBody) => {
    if (originalPath !== '/chat/completions') return null
    return {
      host: 'api.mistral.ai',
      path: '/v1' + originalPath,
      headers: {
        'Authorization': `Bearer ${extractApiKey(credential)}`,
        'Content-Type': 'application/json'
      },
      transformBody: (body, realModel) => ({ ...body, model: realModel })
    }
  },
  cohere: (model, credential, originalPath, _originalBody) => {
    if (originalPath !== '/chat/completions') return null
    return {
      host: 'api.cohere.com',
      path: '/v2/chat',
      headers: {
        'Authorization': `Bearer ${extractApiKey(credential)}`,
        'Content-Type': 'application/json'
      },
      transformBody: (body, realModel) => {
        const messages = (body.messages as Record<string, unknown>[]) || []
        const formattedMessages = messages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
          content: m.content
        }))
        return {
          model: realModel,
          messages: formattedMessages,
          temperature: body.temperature,
          stream: body.stream,
          max_tokens: (body.max_completion_tokens as number | undefined) ?? body.max_tokens,
          p: body.top_p
        }
      },
      transformResponse: (responseBody: unknown) => {
        if (responseBody && typeof responseBody === 'object') {
          const body = responseBody as Record<string, unknown>
          if (body.message && !body.id) {
            return { error: { message: body.message } }
          }
          if (body.message) {
             const message = body.message as Record<string, unknown>
             const content = Array.isArray(message.content)
               ? (message.content as Array<Record<string, unknown>>)
               : []
             const text = content.map((c) => c.text ?? '').join('')
             const usage = body.usage as Record<string, unknown> | undefined
             const billed = usage?.billed_units as Record<string, unknown> | undefined
             const tokenUsage = usage?.tokens as Record<string, unknown> | undefined
             const promptTokens = billed?.input_tokens ?? tokenUsage?.input_tokens
             const completionTokens = billed?.output_tokens ?? tokenUsage?.output_tokens
             const totalTokens = promptTokens !== undefined && completionTokens !== undefined
               ? (Number(promptTokens) || 0) + (Number(completionTokens) || 0)
               : undefined
             return {
               id: body.id,
               choices: [{ message: { content: text, role: 'assistant' } }],
               usage: {
                 prompt_tokens: promptTokens,
                 completion_tokens: completionTokens,
                 total_tokens: totalTokens,
               }
             }
          }
        }
        return responseBody
      },
      extractStreamDelta: (data: string): import('./veniceClient').StreamDelta => {
        if (!data || data === '[DONE]') return { content: '', reasoning: '', parsed: true, malformed: false }
        try {
          const json = JSON.parse(data)
          if (json && typeof json === 'object') {
            if (json.type === 'error' || json.error) {
              return { content: '', reasoning: '', parsed: true, malformed: true, rawData: data }
            }
            if (json.type === 'content-delta' && json.delta?.message?.content?.text) {
              return { content: json.delta.message.content.text, reasoning: '', parsed: true, malformed: false }
            }
            if (json.type === 'message-end') {
              return { content: '', reasoning: '', parsed: true, malformed: false }
            }
            return { content: '', reasoning: '', parsed: true, malformed: false }
          }
          return { content: '', reasoning: '', parsed: true, malformed: false }
        } catch {
          return { content: '', reasoning: '', parsed: false, malformed: true, rawData: data }
        }
      }
    }
  },
  google_gemini: (model, credential, originalPath, originalBody) => {
    if (originalPath !== '/chat/completions') return null
    const isStream = !!originalBody.stream
    return {
      host: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${model}:${isStream ? 'streamGenerateContent' : 'generateContent'}`,
      headers: {
        'x-goog-api-key': extractApiKey(credential),
        'Content-Type': 'application/json'
      },
      transformBody: geminiTransformBody,
      transformResponse: geminiTransformResponse,
      extractStreamDelta: geminiExtractStreamDelta
    }
  },
  google_vertex: (model, credential, originalPath, originalBody) => {
    if (originalPath !== '/chat/completions') return null
    const config = extractGoogleVertexConfig(credential)
    const isStream = !!originalBody.stream
    const host = buildVertexHost()
    const path = `/v1/publishers/google/models/${encodeURIComponent(model)}:${isStream ? 'streamGenerateContent' : 'generateContent'}`
    return {
      host,
      path,
      // Google Cloud REST API-key auth supports the x-goog-api-key header; the
      // ?key= query form would expose the credential in URLs (logs, telemetry).
      headers: {
        'x-goog-api-key': config.apiKey,
        'Content-Type': 'application/json'
      },
      transformBody: geminiTransformBody,
      transformResponse: geminiTransformResponse,
      extractStreamDelta: geminiExtractStreamDelta
    }
  },
  fireworks: (model, credential, originalPath, _originalBody) => {
    if (originalPath !== '/chat/completions') return null
    return {
      host: 'api.fireworks.ai',
      path: '/inference/v1' + originalPath,
      headers: { 'Authorization': `Bearer ${extractApiKey(credential)}`, 'Content-Type': 'application/json' },
      transformBody: (body, realModel) => ({ ...body, model: realModel })
    }
  },
  aws_bedrock: (model, credential, originalPath, _originalBody) => {
    if (originalPath !== '/chat/completions') return null
    const config = extractAwsBedrockConfig(credential)
    return {
      host: `bedrock-mantle.${config.region}.api.aws`,
      path: '/v1/chat/completions',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      transformBody: (body, realModel) => ({ ...body, model: realModel })
    }
  },
  azure_openai: (model, credential, originalPath, _originalBody) => {
    if (originalPath !== '/chat/completions') return null
    const config = extractAzureOpenAiConfig(credential)
    const host = buildAzureOpenAiHost(config.resourceName)
    const deploymentName = encodeURIComponent(config.deploymentName)
    const apiVersion = encodeURIComponent(config.apiVersion)
    return {
      host,
      path: `/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`,
      headers: {
        'api-key': config.apiKey,
        'Content-Type': 'application/json'
      },
      transformBody: (body, _realModel) => ({
        ...body,
        // The deployment name in the URL is authoritative on Azure.
        model: config.deploymentName
      })
    }
  },
  perplexity: (model, credential, originalPath, _originalBody) => {
    if (originalPath !== '/chat/completions') return null
    return {
      host: 'api.perplexity.ai',
      path: originalPath,
      headers: { 'Authorization': `Bearer ${extractApiKey(credential)}`, 'Content-Type': 'application/json' },
      transformBody: (body, realModel) => ({ ...body, model: realModel })
    }
  },
  huggingface: (model, credential, originalPath, _originalBody) => {
    if (originalPath !== '/chat/completions') return null
    return {
      host: 'router.huggingface.co',
      path: '/v1' + originalPath,
      headers: {
        'Authorization': `Bearer ${extractApiKey(credential)}`,
        'Content-Type': 'application/json'
      },
      transformBody: (body, realModel) => ({ ...body, model: realModel })
    }
  },
  generic_openai: (model, credential, originalPath, _originalBody) => {
    if (originalPath !== '/chat/completions' && originalPath !== '/embeddings') return null;
    const config = extractGenericOpenAiConfig(credential);
    const { host, pathPrefix } = parseGenericOpenAiBaseUrl(config.baseUrl);
    return {
      host,
      path: `${pathPrefix}${originalPath}`,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      transformBody: (body, realModel) => ({ ...body, model: realModel }),
    };
  }
}

/**
 * Checks if the request is destined for a fallback provider by inspecting the `model` parameter.
 * Fallback models are prefixed with `providerId:` (e.g. `together:meta-llama/...`).
 */
export interface ProviderRouteSelection {
  providerId: string;
  model: string;
}

export function resolveProviderRoute(
  request: Record<string, unknown>,
  profileId?: string,
  selection?: ProviderRouteSelection,
): { route?: ProviderRoute; error?: string; unsupported?: boolean } | null {
  const body = typeof request.body === 'object' && request.body ? request.body as Record<string, unknown> : null
  if (!body) return null

  const match = !selection && typeof body.model === 'string' ? body.model.match(/^([^:]+):(.+)$/) : null
  if (!selection && !match) return null

  const providerId = selection?.providerId ?? match![1]
  const realModel = selection?.model ?? match![2]
  if (!providerId || !realModel) return { error: "Provider and model are required." }

  const providerDefinition = PROVIDER_REGISTRY[providerId as keyof typeof PROVIDER_REGISTRY]
  if (!providerDefinition) {
    return { error: `Unknown or unsupported provider prefix: ${providerId}` }
  }
  if (providerDefinition.unavailable) {
    return { error: `Provider ${providerId} is not available.` }
  }

  if (getProviderSettings(profileId).enabledProviders[providerId as keyof typeof PROVIDER_REGISTRY] !== true) {
    return { error: `Provider ${providerId} is disabled for this profile.` }
  }

  if (!Object.prototype.hasOwnProperty.call(providerAdapters, providerId)) {
    return { error: `Unknown or unsupported provider prefix: ${providerId}` }
  }
  const adapter = providerAdapters[providerId]

  const credential = getProviderCredentialOrFallback(providerId, profileId)
  if (!credential) {
    return { error: `Credentials are not configured for provider: ${providerId}` }
  }

  let route: ProviderRoute | null
  try {
    route = adapter(realModel, credential as ProviderCredential | string, request.endpoint as string, body)
  } catch (adapterError) {
    const message = adapterError instanceof Error ? adapterError.message : 'Provider adapter failed'
    return { error: message }
  }
  if (!route) {
    return { error: `Provider ${providerId} does not support endpoint ${request.endpoint}`, unsupported: true }
  }

  // Build a fresh provider-and-operation-specific request body before the
  // adapter sees it. A denylist is insufficient because Venice adds new
  // fields independently of third-party provider schemas.
  const sanitizeForRoute = (candidate: Record<string, unknown>) => ({
    ...sanitizeProviderRequestBody(
      providerId as ProviderId,
      request.endpoint as string,
      candidate,
    ),
    model: realModel,
  })
  if (route.transformBody) {
    const originalTransformBody = route.transformBody
    route.transformBody = (b: Record<string, unknown>, m: string) => {
      return originalTransformBody(sanitizeForRoute(b), m)
    }
  } else {
    route.transformBody = (b: Record<string, unknown>, _m: string) => {
      return sanitizeForRoute(b)
    }
  }

  return { route }
}

/**
 * Resolves the user-selected primary API route (Venice or Fraterna) for a
 * request that is NOT explicitly addressed to a fallback provider. Returns
 * `{ route }` when the selected primary route supports the endpoint,
 * `null` when the user is on the default Venice route OR the selected
 * route does not support this endpoint (the caller falls back to the
 * canonical Venice host in either case).
 *
 * FRATERNA primary routing: this helper is the single seam where the
 * `primaryApiRoute` setting is consulted by the transport. Adding new
 * routes must extend this helper AND the shared resolver in
 * `src/shared/primaryApiRoute.ts`.
 */
export function resolvePrimaryApiRouteForRequest(
  request: Record<string, unknown>,
  profileId?: string,
): { route?: ProviderRoute } | null {
  const endpoint = request.endpoint;
  if (typeof endpoint !== "string") return null;
  const endpointPath = endpoint.split("?")[0];

  // `getProviderSettings` is main-process authoritative; it always returns
  // a valid `primaryApiRoute` (defaulting to "venice" for older persisted
  // profiles that pre-date the schema).
  const settings = getProviderSettings(profileId);
  const primaryRoute: PrimaryApiRouteId = settings.primaryApiRoute ?? DEFAULT_PRIMARY_API_ROUTE;
  if (primaryRoute === "venice") return null;

  // The shared resolver handles the per-endpoint capability matrix.
  const resolved = resolveSharedPrimaryApiRoute(primaryRoute, endpointPath);
  if (!resolved) return null;

  // Fraterna (and any future non-default route) reuses the Venice API key.
  // The credential lives in the main-process secure store and is never
  // exposed to the renderer; the transport attaches it here.
  const apiKey = getApiKey(profileId);
  const headers: Record<string, string> = apiKey
    ? { Authorization: `Bearer ${apiKey}` }
    : {};
  const route: ProviderRoute = {
    host: resolved.host,
    path: `${resolved.basePath}${endpoint}`,
    headers,
  };
  return { route };
}
