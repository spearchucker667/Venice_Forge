// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveProviderRoute } from './providerAdapters'
import { getProviderApiKey } from './secureStore'

// Mock getProviderApiKey to return a fake key for testing
vi.mock('./secureStore', () => ({
  getProviderApiKey: vi.fn((providerId, _profileId) => {
    if (providerId === 'together') return 'fake-together-key'
    if (providerId === 'groq') return 'fake-groq-key'
    if (providerId === 'anthropic') return 'fake-anthropic-key'
    if (providerId === 'mistral') return 'fake-mistral-key'
    return null
  }),
}))

describe('providerAdapters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('resolveProviderRoute', () => {
    it('returns null for non-fallback models', () => {
      const request = {
        endpoint: '/chat/completions',
        body: { model: 'default' }
      }
      expect(resolveProviderRoute(request)).toBeNull()
    })

    it('returns an error if API key is missing', () => {
      const request = {
        endpoint: '/chat/completions',
        body: { model: 'together:meta-llama/Llama-3-70b-chat-hf' }
      }
      
      vi.mocked(getProviderApiKey).mockReturnValueOnce(null)
      
      const result = resolveProviderRoute(request)
      expect(result?.error).toMatch(/API key is not configured/)
    })

    it('returns an error for unsupported endpoints on a known provider', () => {
      const request = {
        endpoint: '/models', // Together adapter only supports /chat/completions and /images/generations
        body: { model: 'together:meta-llama/Llama-3-70b-chat-hf' }
      }
      const result = resolveProviderRoute(request)
      expect(result?.error).toMatch(/does not support endpoint/)
    })

    it('uses the requested profile when resolving a provider credential', () => {
      const request = {
        endpoint: '/chat/completions',
        body: { model: 'anthropic:claude-3-5-sonnet-latest', messages: [] }
      }

      resolveProviderRoute(request, 'work-profile')

      expect(getProviderApiKey).toHaveBeenCalledWith('anthropic', 'work-profile')
    })

    it('rejects providers marked unavailable before reading credentials', () => {
      const request = {
        endpoint: '/chat/completions',
        body: { model: 'aws_bedrock:anthropic.claude-3-sonnet', messages: [] }
      }

      const result = resolveProviderRoute(request, 'work-profile')

      expect(result?.error).toMatch(/not available/i)
      expect(getProviderApiKey).not.toHaveBeenCalled()
    })

    it('resolves the correct route for Together', () => {
      const request = {
        endpoint: '/chat/completions',
        body: { model: 'together:meta-llama/Llama-3-70b-chat-hf', messages: [] }
      }
      const result = resolveProviderRoute(request)
      expect(result?.error).toBeUndefined()
      expect(result?.route?.host).toBe('api.together.xyz')
      expect(result?.route?.path).toBe('/v1/chat/completions')
      expect(result?.route?.headers['Authorization']).toBe('Bearer fake-together-key')
      
      const transformedBody = result?.route?.transformBody!(request.body, 'meta-llama/Llama-3-70b-chat-hf')
      expect(transformedBody.model).toBe('meta-llama/Llama-3-70b-chat-hf')
    })

    it('resolves the correct route for Anthropic and transforms the body', () => {
      const request = {
        endpoint: '/chat/completions',
        body: {
          model: 'anthropic:claude-3-5-sonnet-latest',
          messages: [
            { role: 'system', content: 'You are an AI.' },
            { role: 'user', content: 'Hello!' }
          ]
        }
      }
      const result = resolveProviderRoute(request)
      expect(result?.error).toBeUndefined()
      expect(result?.route?.host).toBe('api.anthropic.com')
      expect(result?.route?.path).toBe('/v1/messages')
      expect(result?.route?.headers['x-api-key']).toBe('fake-anthropic-key')
      
      const transformedBody = result?.route?.transformBody!(request.body, 'claude-3-5-sonnet-latest')
      expect(transformedBody.model).toBe('claude-3-5-sonnet-latest')
      expect(transformedBody.system).toBe('You are an AI.')
      expect(transformedBody.messages.length).toBe(1)
      expect(transformedBody.messages[0]).toEqual({ role: 'user', content: 'Hello!' })
    })

    it('keeps the Gemini API key out of the request URL', () => {
      vi.mocked(getProviderApiKey).mockReturnValueOnce('gemini-secret-key')
      const request = {
        endpoint: '/chat/completions',
        body: { model: 'google_gemini:gemini-2.5-flash', messages: [] }
      }

      const result = resolveProviderRoute(request, 'work-profile')

      expect(result?.route?.path).not.toContain('gemini-secret-key')
      expect(result?.route?.headers['x-goog-api-key']).toBe('gemini-secret-key')
    })
  })
})
