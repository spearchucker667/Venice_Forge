import { getProviderApiKey } from './secureStore'
import type { StreamDelta } from './veniceClient'

export interface ProviderRoute {
  host: string
  path: string
  headers: Record<string, string>
  transformBody?: (body: Record<string, unknown>, realModel: string) => Record<string, unknown>
  transformResponse?: (responseBody: unknown) => unknown
  extractStreamDelta?: (data: string) => StreamDelta
}

type AdapterFn = (model: string, apiKey: string, originalPath: string, _originalBody: Record<string, unknown>) => ProviderRoute | null

export const providerAdapters: Record<string, AdapterFn> = {
  together: (model, apiKey, originalPath, _originalBody) => {
    if (originalPath !== '/chat/completions' && originalPath !== '/images/generations') return null
    return {
      host: 'api.together.xyz',
      path: '/v1' + originalPath,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      transformBody: (body, realModel) => ({ ...body, model: realModel })
    }
  },
  groq: (model, apiKey, originalPath, _originalBody) => {
    if (originalPath !== '/chat/completions') return null
    return {
      host: 'api.groq.com',
      path: '/openai/v1' + originalPath,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      transformBody: (body, realModel) => ({ ...body, model: realModel })
    }
  },
  anthropic: (model, apiKey, originalPath, _originalBody) => {
    if (originalPath !== '/chat/completions') return null
    return {
      host: 'api.anthropic.com',
      path: '/v1/messages', // Anthropic uses a different endpoint for chat
      headers: {
        'x-api-key': apiKey,
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
          max_tokens: body.max_tokens || 4096,
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
  mistral: (model, apiKey, originalPath, _originalBody) => {
    if (originalPath !== '/chat/completions') return null
    return {
      host: 'api.mistral.ai',
      path: '/v1' + originalPath,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      transformBody: (body, realModel) => ({ ...body, model: realModel })
    }
  },
  cohere: (model, apiKey, originalPath, _originalBody) => {
    if (originalPath !== '/chat/completions') return null
    return {
      host: 'api.cohere.com',
      path: '/v1/chat',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      transformBody: (body, realModel) => {
        const messages = (body.messages as Record<string, unknown>[]) || []
        const chatHistory = messages.slice(0, -1).map(m => ({
          role: m.role === 'assistant' ? 'CHATBOT' : m.role === 'system' ? 'SYSTEM' : 'USER',
          message: m.content
        }))
        const lastMessage = messages.length > 0 ? messages[messages.length - 1].content : ''
        return {
          model: realModel,
          message: lastMessage,
          chat_history: chatHistory.length > 0 ? chatHistory : undefined,
          temperature: body.temperature,
          stream: body.stream
        }
      },
      transformResponse: (responseBody: unknown) => {
        if (responseBody && typeof responseBody === 'object') {
          const body = responseBody as Record<string, unknown>
          if (body.message && !body.text) {
            return { error: { message: body.message } }
          }
          if (body.text) {
            const meta = body.meta as Record<string, unknown> | undefined
            const billed = meta?.billed_units as Record<string, unknown> | undefined
            return {
              id: body.generation_id,
              choices: [{ message: { content: body.text, role: 'assistant' } }],
              usage: {
                prompt_tokens: billed?.input_tokens,
                completion_tokens: billed?.output_tokens,
                total_tokens: (Number(billed?.input_tokens) || 0) + (Number(billed?.output_tokens) || 0)
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
            if (json.event_type === 'text-generation') {
              return { content: json.text || '', reasoning: '', parsed: true, malformed: false }
            }
            if (json.event_type === 'stream-end') {
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
  google_vertex: (model, apiKey, originalPath, originalBody) => {
    if (originalPath !== '/chat/completions') return null
    const isStream = !!originalBody.stream
    return {
      host: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${model}:${isStream ? 'streamGenerateContent' : 'generateContent'}?key=${apiKey}`,
      headers: {
        'Content-Type': 'application/json'
      },
      transformBody: (body, _realModel) => {
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
            maxOutputTokens: body.max_tokens
          }
        }
      },
      transformResponse: (responseBody: unknown) => {
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
      },
      extractStreamDelta: (data: string): StreamDelta => {
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
    }
  },
  fireworks: (model, apiKey, originalPath, _originalBody) => {
    if (originalPath !== '/chat/completions') return null
    return {
      host: 'api.fireworks.ai',
      path: '/inference/v1' + originalPath,
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      transformBody: (body, realModel) => ({ ...body, model: realModel })
    }
  },
  replicate: (model, apiKey, originalPath, _originalBody) => {
    // Basic placeholder, Replicate has a very different API for chat
    if (originalPath !== '/chat/completions') return null
    return {
      host: 'api.replicate.com',
      path: '/v1/predictions',
      headers: { 'Authorization': `Token ${apiKey}`, 'Content-Type': 'application/json' },
      transformBody: (body, realModel) => ({ version: realModel, input: body })
    }
  },
  aws_bedrock: (model, apiKey, originalPath, _originalBody) => {
    if (originalPath !== '/chat/completions') return null
    return {
      host: 'bedrock-runtime.us-east-1.amazonaws.com',
      path: `/model/${model}/invoke`,
      headers: { 'Content-Type': 'application/json' },
      transformBody: (body, realModel) => ({ ...body, model: realModel })
    }
  },
  azure_openai: (model, apiKey, originalPath, _originalBody) => {
    if (originalPath !== '/chat/completions') return null
    return {
      host: 'api.cognitive.microsoft.com', // placeholder
      path: `/openai/deployments/${model}${originalPath}?api-version=2024-02-15-preview`,
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      transformBody: (body, realModel) => ({ ...body, model: realModel })
    }
  },
  huggingface: (model, apiKey, originalPath, _originalBody) => {
    if (originalPath !== '/chat/completions') return null
    return {
      host: 'api-inference.huggingface.co',
      path: `/models/${model}/v1${originalPath}`,
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      transformBody: (body, realModel) => ({ ...body, model: realModel })
    }
  },
  perplexity: (model, apiKey, originalPath, _originalBody) => {
    if (originalPath !== '/chat/completions') return null
    return {
      host: 'api.perplexity.ai',
      path: originalPath,
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      transformBody: (body, realModel) => ({ ...body, model: realModel })
    }
  }
}

/**
 * Checks if the request is destined for a fallback provider by inspecting the `model` parameter.
 * Fallback models are prefixed with `providerId:` (e.g. `together:meta-llama/...`).
 */
export function resolveProviderRoute(request: Record<string, unknown>, profileId?: string): { route?: ProviderRoute; error?: string } | null {
  const body = typeof request.body === 'object' && request.body ? request.body as Record<string, unknown> : null
  if (!body || typeof body.model !== 'string') return null

  const match = body.model.match(/^([^:]+):(.+)$/)
  if (!match) return null

  const providerId = match[1]
  const realModel = match[2]

  const adapter = providerAdapters[providerId]
  if (!adapter) {
    // If it has a colon but no adapter, we might just pass it to Venice and let it fail.
    return null
  }

  // Use the new generic key system `[providerId]_api_key`
  const apiKey = getProviderApiKey(providerId, profileId)
  if (!apiKey) {
    return { error: `API key is not configured for provider: ${providerId}` }
  }

  const route = adapter(realModel, apiKey, request.endpoint as string, body)
  if (!route) {
    return { error: `Provider ${providerId} does not support endpoint ${request.endpoint}` }
  }

  return { route }
}
