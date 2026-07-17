export type ProviderId = 
  | 'venice'
  | 'together'
  | 'groq'
  | 'fireworks'
  | 'replicate'
  | 'aws_bedrock'
  | 'google_vertex'
  | 'google_gemini'
  | 'azure_openai'
  | 'huggingface'
  | 'mistral'
  | 'anthropic'
  | 'perplexity'
  | 'cohere'

export interface ProviderConfig {
  id: ProviderId
  enabled: boolean
  label: string
  description?: string
  // For UI settings, to indicate if the credentials exist in the main process
  hasCredential?: boolean 
}

export interface ProviderDefinition {
  id: ProviderId
  label: string
  description: string
  docsUrl?: string
  supportedTypes: Array<'chat' | 'image' | 'video' | 'audio' | 'embeddings' | 'rerank' | 'vision'>
  unavailable?: boolean
}

export type ProviderFeature = 'chat' | 'image' | 'video' | 'audio' | 'embeddings' | 'rerank' | 'vision'

export interface ProviderCapability {
  feature: ProviderFeature
  route: string
  implemented: boolean
  modelDiscovery: 'live' | 'static' | 'none'
}

/** Canonical endpoint-granular capability contract used by UI, catalogs, routing tests, and diagnostics. */
export const PROVIDER_CAPABILITIES: Record<ProviderId, readonly ProviderCapability[]> = {
  venice: [
    { feature: 'chat', route: '/chat/completions', implemented: true, modelDiscovery: 'live' },
    { feature: 'image', route: '/images/generations', implemented: true, modelDiscovery: 'live' },
    { feature: 'video', route: '/video/queue', implemented: true, modelDiscovery: 'live' },
    { feature: 'audio', route: '/audio/queue', implemented: true, modelDiscovery: 'live' },
    { feature: 'embeddings', route: '/embeddings', implemented: true, modelDiscovery: 'live' },
  ],
  together: [
    { feature: 'chat', route: '/chat/completions', implemented: true, modelDiscovery: 'static' },
    { feature: 'image', route: '/images/generations', implemented: true, modelDiscovery: 'static' },
  ],
  groq: [{ feature: 'chat', route: '/chat/completions', implemented: true, modelDiscovery: 'static' }],
  fireworks: [{ feature: 'chat', route: '/chat/completions', implemented: true, modelDiscovery: 'static' }],
  google_gemini: [{ feature: 'chat', route: '/chat/completions', implemented: true, modelDiscovery: 'static' }],
  mistral: [{ feature: 'chat', route: '/chat/completions', implemented: true, modelDiscovery: 'static' }],
  anthropic: [{ feature: 'chat', route: '/chat/completions', implemented: true, modelDiscovery: 'static' }],
  perplexity: [{ feature: 'chat', route: '/chat/completions', implemented: true, modelDiscovery: 'static' }],
  replicate: [],
  aws_bedrock: [],
  google_vertex: [],
  azure_openai: [],
  huggingface: [],
  cohere: [],
}

function implementedFeatures(providerId: ProviderId): ProviderFeature[] {
  return PROVIDER_CAPABILITIES[providerId]
    .filter((capability) => capability.implemented)
    .map((capability) => capability.feature)
}

export const PROVIDER_REGISTRY: Record<ProviderId, ProviderDefinition> = {
  venice: {
    id: 'venice',
    label: 'Venice AI',
    description: 'Primary, private, local-first multimodal platform.',
    supportedTypes: implementedFeatures('venice'),
  },
  together: {
    id: 'together',
    label: 'Together AI',
    description: 'Fast, open-source model inference.',
    supportedTypes: implementedFeatures('together'),
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    description: 'Ultra-fast LPU inference engine.',
    supportedTypes: implementedFeatures('groq'),
  },
  fireworks: {
    id: 'fireworks',
    label: 'Fireworks AI',
    description: 'High-performance LLM APIs.',
    supportedTypes: implementedFeatures('fireworks'),
  },
  replicate: {
    id: 'replicate',
    label: 'Replicate',
    description: 'Not implemented. No credentials or requests are accepted.',
    supportedTypes: implementedFeatures('replicate'),
    unavailable: true,
  },
  aws_bedrock: {
    id: 'aws_bedrock',
    label: 'AWS Bedrock',
    description: 'Not implemented. No credentials or requests are accepted.',
    supportedTypes: implementedFeatures('aws_bedrock'),
    unavailable: true,
  },
  google_vertex: {
    id: 'google_vertex',
    label: 'Google Vertex AI',
    description: 'Not implemented. No credentials or requests are accepted.',
    supportedTypes: implementedFeatures('google_vertex'),
    unavailable: true,
  },
  google_gemini: {
    id: 'google_gemini',
    label: 'Google Gemini (Developer API)',
    description: 'Gemini Developer API (AI Studio).',
    supportedTypes: implementedFeatures('google_gemini'),
  },
  azure_openai: {
    id: 'azure_openai',
    label: 'Azure OpenAI',
    description: 'Not implemented. No credentials or requests are accepted.',
    supportedTypes: implementedFeatures('azure_openai'),
    unavailable: true,
  },
  huggingface: {
    id: 'huggingface',
    label: 'Hugging Face',
    description: 'Not implemented. No credentials or requests are accepted.',
    supportedTypes: implementedFeatures('huggingface'),
    unavailable: true,
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral API',
    description: 'Mistral AI models and endpoints.',
    supportedTypes: implementedFeatures('mistral'),
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic API',
    description: 'Claude and other safe foundation models.',
    supportedTypes: implementedFeatures('anthropic'),
  },
  perplexity: {
    id: 'perplexity',
    label: 'Perplexity API',
    description: 'Search-grounded and fast LLM APIs.',
    supportedTypes: implementedFeatures('perplexity'),
  },
  cohere: {
    id: 'cohere',
    label: 'Cohere',
    description: 'Not implemented. No credentials or requests are accepted.',
    supportedTypes: implementedFeatures('cohere'),
    unavailable: true,
  },
}

/** Providers intentionally deferred in this release. They accept no keys or traffic. */
export const DEFERRED_PROVIDER_IDS = [
  'replicate',
  'aws_bedrock',
  'google_vertex',
  'azure_openai',
  'huggingface',
  'cohere',
] as const satisfies readonly ProviderId[]

/** Non-primary providers with implemented adapters, catalogs, and secure key custody. */
export const AVAILABLE_FALLBACK_PROVIDER_IDS = Object.values(PROVIDER_REGISTRY)
  .filter((provider) => provider.id !== 'venice' && provider.unavailable !== true)
  .map((provider) => provider.id)
