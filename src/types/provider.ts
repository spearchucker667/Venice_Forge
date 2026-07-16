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

export const PROVIDER_REGISTRY: Record<ProviderId, ProviderDefinition> = {
  venice: {
    id: 'venice',
    label: 'Venice AI',
    description: 'Primary, private, local-first multimodal platform.',
    supportedTypes: ['chat', 'image', 'video', 'audio', 'embeddings'],
  },
  together: {
    id: 'together',
    label: 'Together AI',
    description: 'Fast, open-source model inference.',
    supportedTypes: ['chat', 'image'],
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    description: 'Ultra-fast LPU inference engine.',
    supportedTypes: ['chat', 'audio'],
  },
  fireworks: {
    id: 'fireworks',
    label: 'Fireworks AI',
    description: 'High-performance LLM APIs.',
    supportedTypes: ['chat', 'image'],
  },
  replicate: {
    id: 'replicate',
    label: 'Replicate',
    description: 'Not implemented. No credentials or requests are accepted.',
    supportedTypes: ['chat', 'image', 'video', 'audio'],
    unavailable: true,
  },
  aws_bedrock: {
    id: 'aws_bedrock',
    label: 'AWS Bedrock',
    description: 'Not implemented. No credentials or requests are accepted.',
    supportedTypes: ['chat', 'image', 'embeddings'],
    unavailable: true,
  },
  google_vertex: {
    id: 'google_vertex',
    label: 'Google Vertex AI',
    description: 'Not implemented. No credentials or requests are accepted.',
    supportedTypes: ['chat', 'image', 'video', 'audio', 'embeddings'],
    unavailable: true,
  },
  google_gemini: {
    id: 'google_gemini',
    label: 'Google Gemini (Developer API)',
    description: 'Gemini Developer API (AI Studio).',
    supportedTypes: ['chat', 'image', 'video', 'audio', 'embeddings'],
  },
  azure_openai: {
    id: 'azure_openai',
    label: 'Azure OpenAI',
    description: 'Not implemented. No credentials or requests are accepted.',
    supportedTypes: ['chat', 'image', 'embeddings'],
    unavailable: true,
  },
  huggingface: {
    id: 'huggingface',
    label: 'Hugging Face',
    description: 'Not implemented. No credentials or requests are accepted.',
    supportedTypes: ['chat', 'image'],
    unavailable: true,
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral API',
    description: 'Mistral AI models and endpoints.',
    supportedTypes: ['chat', 'embeddings'],
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic API',
    description: 'Claude and other safe foundation models.',
    supportedTypes: ['chat', 'vision'],
  },
  perplexity: {
    id: 'perplexity',
    label: 'Perplexity API',
    description: 'Search-grounded and fast LLM APIs.',
    supportedTypes: ['chat'],
  },
  cohere: {
    id: 'cohere',
    label: 'Cohere',
    description: 'Not implemented. No credentials or requests are accepted.',
    supportedTypes: ['chat', 'embeddings', 'rerank'],
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
