// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveProviderRoute, providerAdapters, sanitizeProviderRequestBody } from './providerAdapters'
import { getProviderCredentialOrFallback } from './secureStore'
import { getProviderSettings } from './providerSettingsStore'

function transformBody(
  result: { route?: { transformBody?: (body: Record<string, unknown>, realModel: string) => Record<string, unknown> } },
  body: Record<string, unknown>,
  realModel: string,
): Record<string, unknown> {
  const route = result?.route;
  if (!route) throw new Error("Expected route to be defined");
  expect(route.transformBody).toBeDefined();
  return route.transformBody!(body, realModel);
}

// Mock credential lookups to return a fake key for testing
vi.mock('./secureStore', () => ({
  getProviderApiKey: vi.fn((providerId, _profileId) => {
    if (providerId === 'together') return 'fake-together-key'
    if (providerId === 'groq') return 'fake-groq-key'
    if (providerId === 'anthropic') return 'fake-anthropic-key'
    if (providerId === 'mistral') return 'fake-mistral-key'
    return null
  }),
  getProviderCredentialOrFallback: vi.fn((providerId, _profileId) => {
    if (providerId === 'together') return 'fake-together-key'
    if (providerId === 'groq') return 'fake-groq-key'
    if (providerId === 'anthropic') return 'fake-anthropic-key'
    if (providerId === 'mistral') return 'fake-mistral-key'
    if (providerId === 'huggingface') return 'fake-huggingface-key'
    if (providerId === 'azure_openai') {
      return {
        providerId: 'azure_openai',
        resourceName: 'venice-forge-test',
        deploymentName: 'gpt-4o',
        apiVersion: '2024-08-01-preview',
        apiKey: 'fake-azure-key'
      }
    }
    if (providerId === 'aws_bedrock') {
      return {
        providerId: 'aws_bedrock',
        region: 'us-east-1',
        apiKey: 'fake-bedrock-key'
      }
    }
    if (providerId === 'google_vertex') {
      return {
        providerId: 'google_vertex',
        authMode: 'express',
        apiKey: 'fake-vertex-key',
      }
    }
    if (providerId === 'generic_openai') {
      return {
        providerId: 'generic_openai',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'fake-generic-openai-key',
      }
    }
    return null
  }),
}))

vi.mock('./providerSettingsStore', () => ({
  getProviderSettings: vi.fn(() => ({
    enabledProviders: {
      together: true,
      groq: true,
      anthropic: true,
      mistral: true,
      google_gemini: true,
      huggingface: true,
      azure_openai: true,
      aws_bedrock: true,
      google_vertex: true,
      replicate: true,
      generic_openai: true,
    },
    autoFallbackEnabled: false,
    fallbackOrdering: [],
    nativeFallbackModels: {},
  })),
}))

describe('providerAdapters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('resolveProviderRoute', () => {
    it.each([
      ['together', 'top_k'],
      ['groq', 'reasoning_effort'],
      ['fireworks', 'prompt_cache_key'],
      ['mistral', 'random_seed'],
      ['anthropic', 'max_tokens'],
      ['perplexity', 'web_search_options'],
      ['huggingface', 'tool_choice'],
      ['aws_bedrock', 'response_format'],
      ['azure_openai', 'parallel_tool_calls'],
      ['google_gemini', 'top_p'],
      ['google_vertex', 'top_p'],
      ['cohere', 'documents'],
      ['generic_openai', 'parallel_tool_calls'],
    ] as const)(
      'keeps documented %s chat fields while rejecting Venice and image-only fields',
      (providerId, documentedField) => {
        const body = sanitizeProviderRequestBody(providerId, '/chat/completions', {
          model: 'venice-model',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true,
          temperature: 0.4,
          [documentedField]: documentedField === 'documents' ? [{ text: 'context' }] :
            documentedField === 'web_search_options' ? { search_context_size: 'low' } :
              documentedField === 'response_format' ? { type: 'json_object' } :
                documentedField === 'tool_choice' ? 'auto' :
                  documentedField === 'parallel_tool_calls' ? true :
                    documentedField === 'prompt_cache_key' ? 'cache-key' :
                      documentedField === 'reasoning_effort' ? 'low' : 7,
          venice_parameters: { enable_web_search: 'on' },
          safe_mode: true,
          return_binary: true,
          enable_web_search: 'on',
          style_references: [{ image: 'data:image/png;base64,AAAA' }],
          negative_prompt: 'noise',
          width: 1024,
          height: 1024,
        })

        expect(body).toMatchObject({
          model: 'venice-model',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true,
          temperature: 0.4,
        })
        expect(body).toHaveProperty(documentedField)
        expect(body).not.toHaveProperty('venice_parameters')
        expect(body).not.toHaveProperty('safe_mode')
        expect(body).not.toHaveProperty('return_binary')
        expect(body).not.toHaveProperty('enable_web_search')
        expect(body).not.toHaveProperty('style_references')
        expect(body).not.toHaveProperty('negative_prompt')
        expect(body).not.toHaveProperty('width')
        expect(body).not.toHaveProperty('height')
      },
    )

    it('keeps Together image fields while rejecting Venice and chat-only fields', () => {
      const body = sanitizeProviderRequestBody('together', '/images/generations', {
        model: 'venice-image-model',
        prompt: 'A copper city',
        steps: 8,
        width: 1024,
        height: 768,
        negative_prompt: 'fog',
        guidance_scale: 4.5,
        response_format: 'base64',
        output_format: 'png',
        reference_images: ['https://example.invalid/reference.png'],
        venice_parameters: { enable_web_search: 'on' },
        safe_mode: true,
        return_binary: true,
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.5,
        tools: [{ type: 'function' }],
      })

      expect(body).toMatchObject({
        model: 'venice-image-model',
        prompt: 'A copper city',
        steps: 8,
        width: 1024,
        height: 768,
        negative_prompt: 'fog',
        guidance_scale: 4.5,
        response_format: 'base64',
        output_format: 'png',
        reference_images: ['https://example.invalid/reference.png'],
      })
      expect(body).not.toHaveProperty('venice_parameters')
      expect(body).not.toHaveProperty('safe_mode')
      expect(body).not.toHaveProperty('return_binary')
      expect(body).not.toHaveProperty('messages')
      expect(body).not.toHaveProperty('temperature')
      expect(body).not.toHaveProperty('tools')
    })

    it('maps the canonical Venice image operation into Together fields without leaking Venice controls', () => {
      const requestBody = {
        model: 'venice-image-model',
        prompt: 'A copper city',
        steps: 8,
        width: 1024,
        height: 768,
        negative_prompt: 'fog',
        cfg_scale: 4.5,
        variants: 2,
        format: 'png',
        safe_mode: true,
        return_binary: true,
        hide_watermark: true,
        style_references: [{ image: 'data:image/png;base64,AAAA' }],
      }
      const result = resolveProviderRoute({
        endpoint: '/image/generate',
        body: requestBody,
      }, 'work-profile', {
        providerId: 'together',
        model: 'black-forest-labs/FLUX.1-schnell',
      })

      expect(result?.error).toBeUndefined()
      expect(result?.route?.path).toBe('/v1/images/generations')
      const transformed = transformBody(
        result ?? {},
        requestBody,
        'black-forest-labs/FLUX.1-schnell',
      )
      expect(transformed).toEqual({
        model: 'black-forest-labs/FLUX.1-schnell',
        prompt: 'A copper city',
        steps: 8,
        width: 1024,
        height: 768,
        negative_prompt: 'fog',
        guidance_scale: 4.5,
        n: 2,
        output_format: 'png',
        response_format: 'base64',
      })
    })

    it('applies the same request boundary to automatic fallback routing', () => {
      const requestBody = {
        model: 'venice-model',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.2,
        venice_parameters: { enable_web_search: 'on' },
        safe_mode: true,
        return_binary: true,
      }
      const result = resolveProviderRoute({
        endpoint: '/chat/completions',
        body: requestBody,
      }, 'work-profile', {
        providerId: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
      })

      const transformed = transformBody(
        result ?? {},
        requestBody,
        'claude-3-5-sonnet-latest',
      )
      expect(transformed).toMatchObject({
        model: 'claude-3-5-sonnet-latest',
        temperature: 0.2,
      })
      expect(transformed).not.toHaveProperty('venice_parameters')
      expect(transformed).not.toHaveProperty('safe_mode')
      expect(transformed).not.toHaveProperty('return_binary')
    })

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
      
      vi.mocked(getProviderCredentialOrFallback).mockReturnValueOnce(null)
      
      const result = resolveProviderRoute(request)
      expect(result?.error).toMatch(/Credentials are not configured/)
    })

    it('rejects a renderer-selected provider that main-process consent has disabled', () => {
      vi.mocked(getProviderSettings).mockReturnValueOnce({
        enabledProviders: {},
        autoFallbackEnabled: false,
        fallbackOrdering: [],
        nativeFallbackModels: { anthropic: 'claude-3-5-sonnet-latest' },
      })

      const result = resolveProviderRoute({
        endpoint: '/chat/completions',
        body: { model: 'anthropic:claude-3-5-sonnet-latest', messages: [] },
      }, 'work-profile')

      expect(result?.error).toMatch(/disabled for this profile/i)
      expect(getProviderCredentialOrFallback).not.toHaveBeenCalled()
    })

    it('routes an automatic fallback with provider and model as separate authority fields', () => {
      const result = resolveProviderRoute({
        endpoint: '/chat/completions',
        body: { model: 'venice-model', messages: [] },
      }, 'work-profile', {
        providerId: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
      })

      expect(result?.error).toBeUndefined()
      expect(result?.route?.host).toBe('api.anthropic.com')
      expect(transformBody(result ?? {}, { model: 'venice-model', messages: [] }, 'claude-3-5-sonnet-latest').model)
        .toBe('claude-3-5-sonnet-latest')
    })

    it('returns an error for unsupported endpoints on a known provider', () => {
      const request = {
        endpoint: '/models', // Together adapter only supports /chat/completions and /images/generations
        body: { model: 'together:meta-llama/Llama-3-70b-chat-hf' }
      }
      const result = resolveProviderRoute(request)
      expect(result?.error).toMatch(/does not support endpoint/)
    })

    it('rejects replicate: prefixed fallback models because Replicate uses a dedicated async lifecycle', () => {
      const result = resolveProviderRoute({
        endpoint: '/chat/completions',
        body: { model: 'replicate:black-forest-labs/flux-schnell', messages: [] }
      })
      expect(result?.error).toMatch(/unsupported provider prefix/i)
    })

    it('uses the requested profile when resolving a provider credential', () => {
      const request = {
        endpoint: '/chat/completions',
        body: { model: 'anthropic:claude-3-5-sonnet-latest', messages: [] }
      }

      resolveProviderRoute(request, 'work-profile')

      expect(getProviderCredentialOrFallback).toHaveBeenCalledWith('anthropic', 'work-profile')
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
      
      const transformedBody = transformBody(result ?? {}, request.body, 'meta-llama/Llama-3-70b-chat-hf')
      expect(transformedBody.model).toBe('meta-llama/Llama-3-70b-chat-hf')
    })

    it('resolves the correct route for Hugging Face Inference Providers', () => {
      const request = {
        endpoint: '/chat/completions',
        body: { model: 'huggingface:deepseek-ai/DeepSeek-R1:fastest', messages: [] }
      }
      const result = resolveProviderRoute(request)
      expect(result?.error).toBeUndefined()
      expect(result?.route?.host).toBe('router.huggingface.co')
      expect(result?.route?.path).toBe('/v1/chat/completions')
      expect(result?.route?.headers['Authorization']).toBe('Bearer fake-huggingface-key')

      const transformedBody = transformBody(result ?? {}, request.body, 'deepseek-ai/DeepSeek-R1:fastest')
      expect(transformedBody.model).toBe('deepseek-ai/DeepSeek-R1:fastest')
    })

    it('resolves the correct route for Azure OpenAI and uses deployment name in path and body', () => {
      const request = {
        endpoint: '/chat/completions',
        body: { model: 'azure_openai:gpt-4o', messages: [] }
      }
      const result = resolveProviderRoute(request)
      expect(result?.error).toBeUndefined()
      expect(result?.route?.host).toBe('venice-forge-test.openai.azure.com')
      expect(result?.route?.path).toBe('/openai/deployments/gpt-4o/chat/completions?api-version=2024-08-01-preview')
      expect(result?.route?.headers['api-key']).toBe('fake-azure-key')
      expect(result?.route?.headers['Authorization']).toBeUndefined()

      const transformedBody = transformBody(result ?? {}, request.body, 'gpt-4o')
      expect(transformedBody.model).toBe('gpt-4o')
    })

    it('resolves the correct route for AWS Bedrock Mantle and uses the region in the host', () => {
      const request = {
        endpoint: '/chat/completions',
        body: { model: 'aws_bedrock:openai.gpt-oss-20b', messages: [] }
      }
      const result = resolveProviderRoute(request)
      expect(result?.error).toBeUndefined()
      expect(result?.route?.host).toBe('bedrock-mantle.us-east-1.api.aws')
      expect(result?.route?.path).toBe('/v1/chat/completions')
      expect(result?.route?.headers['Authorization']).toBe('Bearer fake-bedrock-key')

      const transformedBody = transformBody(result ?? {}, request.body, 'openai.gpt-oss-20b')
      expect(transformedBody.model).toBe('openai.gpt-oss-20b')
    })

    it('rejects AWS Bedrock requests when the credential region is dangerous', () => {
      vi.mocked(getProviderCredentialOrFallback).mockReturnValueOnce({
        providerId: 'aws_bedrock',
        region: 'evil.com/',
        apiKey: 'fake-bedrock-key'
      })

      const result = resolveProviderRoute({
        endpoint: '/chat/completions',
        body: { model: 'aws_bedrock:openai.gpt-oss-20b', messages: [] }
      })

      expect(result?.error).toMatch(/invalid/i)
    })

    it('resolves the correct route for Google Vertex Express Mode and carries the API key in the header, not the URL', () => {
      const request = {
        endpoint: '/chat/completions',
        body: { model: 'google_vertex:gemini-2.5-flash', messages: [] }
      }
      const result = resolveProviderRoute(request)
      expect(result?.error).toBeUndefined()
      expect(result?.route?.host).toBe('aiplatform.googleapis.com')
      expect(result?.route?.path).toBe('/v1/publishers/google/models/gemini-2.5-flash:generateContent')
      // VF-20260916-P2-004: the credential must never travel in the request
      // URL where logs/diagnostics/telemetry can capture it.
      expect(result?.route?.path).not.toContain('fake-vertex-key')
      expect(result?.route?.host).not.toContain('fake-vertex-key')
      expect(result?.route?.headers).toMatchObject({ 'x-goog-api-key': 'fake-vertex-key' })

      const transformedBody = transformBody(result ?? {}, request.body, 'gemini-2.5-flash')
      expect(transformedBody).toHaveProperty('contents')
    })

    it('keeps the Vertex Express streaming URL free of the API key', () => {
      const result = resolveProviderRoute({
        endpoint: '/chat/completions',
        body: { model: 'google_vertex:gemini-2.5-flash', messages: [], stream: true }
      })
      expect(result?.error).toBeUndefined()
      expect(result?.route?.path).toBe('/v1/publishers/google/models/gemini-2.5-flash:streamGenerateContent')
      expect(`${result?.route?.host}${result?.route?.path}`).not.toContain('fake-vertex-key')
      expect(result?.route?.headers).toMatchObject({ 'x-goog-api-key': 'fake-vertex-key' })
    })

    it('uses the configured deployment name as the authoritative routing identity', () => {
      vi.mocked(getProviderCredentialOrFallback).mockReturnValueOnce({
        providerId: 'azure_openai',
        resourceName: 'venice-forge-test',
        deploymentName: 'custom-deployment-42',
        apiVersion: '2024-08-01-preview',
        apiKey: 'fake-azure-key'
      })

      const result = resolveProviderRoute({
        endpoint: '/chat/completions',
        body: { model: 'azure_openai:unused-model-suffix', messages: [] }
      })

      expect(result?.error).toBeUndefined()
      expect(result?.route?.path).toBe('/openai/deployments/custom-deployment-42/chat/completions?api-version=2024-08-01-preview')
      const transformedBody = transformBody(
        result ?? {},
        { model: 'azure_openai:unused-model-suffix', messages: [] },
        'unused-model-suffix',
      )
      expect(transformedBody.model).toBe('custom-deployment-42')
    })

    it('rejects Azure OpenAI requests when the credential resource name is dangerous', () => {
      vi.mocked(getProviderCredentialOrFallback).mockReturnValueOnce({
        providerId: 'azure_openai',
        resourceName: 'evil.com/',
        deploymentName: 'gpt-4o',
        apiVersion: '2024-08-01-preview',
        apiKey: 'fake-azure-key'
      })

      const result = resolveProviderRoute({
        endpoint: '/chat/completions',
        body: { model: 'azure_openai:gpt-4o', messages: [] }
      })

      expect(result?.error).toMatch(/invalid/i)
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
      
      const transformedBody = transformBody(result ?? {}, request.body, 'claude-3-5-sonnet-latest')
      expect(transformedBody.model).toBe('claude-3-5-sonnet-latest')
      expect(transformedBody.system).toBe('You are an AI.')
      expect((transformedBody.messages as unknown[]).length).toBe(1)
      expect((transformedBody.messages as unknown[])[0]).toEqual({ role: 'user', content: 'Hello!' })
    })

    it('keeps the Gemini API key out of the request URL', () => {
      vi.mocked(getProviderCredentialOrFallback).mockReturnValueOnce('gemini-secret-key')
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

describe('cohere adapter', () => {
  it('maps OpenAI messages to Cohere v2 roles', () => {
    const originalBody = {
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' }
      ],
      temperature: 0.5,
      max_tokens: 100,
      top_p: 0.9,
      stream: false
    }
    const route = providerAdapters.cohere('command-r-plus', 'key', '/chat/completions', originalBody)
    expect(route).not.toBeNull()
    const body = route!.transformBody!(originalBody, 'command-r-plus')
    expect(body.model).toBe('command-r-plus')
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' }
    ])
    expect(body.temperature).toBe(0.5)
    expect(body.max_tokens).toBe(100)
    expect(body.p).toBe(0.9)
    expect(body.stream).toBe(false)
  })

  it('normalizes a non-streaming chat response', () => {
    const route = providerAdapters.cohere('command-r-plus', 'key', '/chat/completions', { messages: [] })
    const normalized = route!.transformResponse!({
      id: 'msg-123',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello there!' }]
      },
      usage: {
        billed_units: { input_tokens: 10, output_tokens: 5 },
        tokens: { input_tokens: 10, output_tokens: 5 }
      }
    })
    expect(normalized).toEqual({
      id: 'msg-123',
      choices: [{ message: { role: 'assistant', content: 'Hello there!' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
    })
  })

  it('normalizes a Cohere error response', () => {
    const route = providerAdapters.cohere('command-r-plus', 'key', '/chat/completions', { messages: [] })
    const normalized = route!.transformResponse!({
      message: 'Invalid api key'
    })
    expect(normalized).toEqual({ error: { message: 'Invalid api key' } })
  })

  it('extracts content from Cohere stream events', () => {
    const route = providerAdapters.cohere('command-r-plus', 'key', '/chat/completions', { messages: [], stream: true })
    const delta = route!.extractStreamDelta!(
      JSON.stringify({ type: 'content-delta', delta: { message: { content: { text: 'Hello' } } } })
    )
    expect(delta).toEqual({ content: 'Hello', reasoning: '', parsed: true, malformed: false })
  })

  it('marks malformed JSON in stream deltas', () => {
    const route = providerAdapters.cohere('command-r-plus', 'key', '/chat/completions', { messages: [], stream: true })
    const delta = route!.extractStreamDelta!('{invalid')
    expect(delta.parsed).toBe(false)
    expect(delta.malformed).toBe(true)
  })
})

describe('generic_openai adapter', () => {
  const buildCredential = (overrides: Partial<{ baseUrl: string; apiKey: string }> = {}) => ({
    providerId: 'generic_openai' as const,
    baseUrl: overrides.baseUrl ?? 'https://openrouter.ai/api/v1',
    apiKey: overrides.apiKey ?? 'sk-test',
  })

  it('routes chat completions to the configured base URL with bearer auth', () => {
    const route = providerAdapters.generic_openai(
      'qwen/qwen-2.5-72b-instruct',
      buildCredential(),
      '/chat/completions',
      { model: 'generic_openai:qwen/qwen-2.5-72b-instruct', messages: [] },
    )
    expect(route).not.toBeNull()
    expect(route!.host).toBe('openrouter.ai')
    expect(route!.path).toBe('/api/v1/chat/completions')
    expect(route!.headers.Authorization).toBe('Bearer sk-test')
    expect(route!.headers['Content-Type']).toBe('application/json')
  })

  it('rewrites the body model to the user-supplied model id', () => {
    const route = providerAdapters.generic_openai(
      'qwen/qwen-2.5-72b-instruct',
      buildCredential(),
      '/chat/completions',
      { model: 'generic_openai:qwen/qwen-2.5-72b-instruct', messages: [] },
    )
    const body = route!.transformBody!({ messages: [] }, 'qwen/qwen-2.5-72b-instruct')
    expect(body.model).toBe('qwen/qwen-2.5-72b-instruct')
  })

  it('routes embeddings to the configured base URL', () => {
    const route = providerAdapters.generic_openai(
      'text-embedding-3-small',
      buildCredential(),
      '/embeddings',
      { model: 'generic_openai:text-embedding-3-small', input: 'hello' },
    )
    expect(route).not.toBeNull()
    expect(route!.path).toBe('/api/v1/embeddings')
  })

  it('rejects unknown endpoints (fails closed)', () => {
    const route = providerAdapters.generic_openai(
      'qwen/qwen-2.5-72b-instruct',
      buildCredential(),
      '/audio/speech',
      { model: 'generic_openai:qwen/qwen-2.5-72b-instruct' },
    )
    expect(route).toBeNull()
  })

  it.each([
    ['http://example.com/v1', /https:\/\//],
    ['', /required/],
    ['not-a-url', /not a valid URL/],
    ['https://user:pass@example.com/v1', /must not embed credentials/],
    ['https://example.com/v1?key=secret', /must not contain query strings/],
  ])('rejects unsafe base URL %s', (rawUrl, expectedErrorPattern) => {
    expect(() =>
      providerAdapters.generic_openai(
        'qwen',
        buildCredential({ baseUrl: rawUrl }),
        '/chat/completions',
        { messages: [] },
      ),
    ).toThrow(expectedErrorPattern)
  })

  it('does not silently fall back to a default base URL when credential is missing fields', () => {
    expect(() =>
      providerAdapters.generic_openai(
        'qwen',
        { providerId: 'generic_openai', baseUrl: '', apiKey: 'sk-test' } as never,
        '/chat/completions',
        { messages: [] },
      ),
    ).toThrow(/missing required fields/)
  })

  it('resolves a route through the public dispatch when enabled and credentialed', () => {
    const result = resolveProviderRoute({
      endpoint: '/chat/completions',
      body: { model: 'generic_openai:qwen/qwen-2.5-72b-instruct', messages: [] },
    })
    expect(result?.error).toBeUndefined()
    expect(result?.route?.host).toBe('openrouter.ai')
    expect(result?.route?.path).toBe('/api/v1/chat/completions')
  })

  it('returns an error when the generic_openai prefix is used but the provider is disabled', () => {
    vi.mocked(getProviderSettings).mockReturnValueOnce({
      enabledProviders: { generic_openai: false } as never,
      autoFallbackEnabled: false,
      fallbackOrdering: [],
      nativeFallbackModels: {},
    } as never)
    const result = resolveProviderRoute({
      endpoint: '/chat/completions',
      body: { model: 'generic_openai:qwen', messages: [] },
    })
    expect(result?.error).toMatch(/disabled/i)
  })
})
