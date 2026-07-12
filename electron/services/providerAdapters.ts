import { getProviderApiKey } from './secureStore'

export interface ProviderRoute {
  host: string
  path: string
  headers: Record<string, string>
  transformBody?: (body: any, realModel: string) => any
}

type AdapterFn = (model: string, apiKey: string, originalPath: string, originalBody: any) => ProviderRoute | null

export const providerAdapters: Record<string, AdapterFn> = {
  together: (model, apiKey, originalPath, originalBody) => {
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
  groq: (model, apiKey, originalPath, originalBody) => {
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
  anthropic: (model, apiKey, originalPath, originalBody) => {
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
        const messages = body.messages || []
        const systemMessage = messages.find((m: any) => m.role === 'system')
        const otherMessages = messages.filter((m: any) => m.role !== 'system').map((m: any) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        }))
        return {
          model: realModel,
          max_tokens: body.max_tokens || 4096,
          messages: otherMessages,
          system: systemMessage ? systemMessage.content : undefined,
          temperature: body.temperature
        }
      }
    }
  },
  mistral: (model, apiKey, originalPath, originalBody) => {
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
  }
}

/**
 * Checks if the request is destined for a fallback provider by inspecting the `model` parameter.
 * Fallback models are prefixed with `providerId:` (e.g. `together:meta-llama/...`).
 */
export function resolveProviderRoute(request: any, profileId?: string): { route?: ProviderRoute; error?: string } | null {
  const body = typeof request.body === 'object' && request.body ? request.body as Record<string, any> : null
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

  const route = adapter(realModel, apiKey, request.endpoint, body)
  if (!route) {
    return { error: `Provider ${providerId} does not support endpoint ${request.endpoint}` }
  }

  return { route }
}
