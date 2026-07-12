export type ProviderId = 
  | 'venice'
  | 'together'
  | 'groq'
  | 'fireworks'
  | 'replicate'
  | 'aws_bedrock'
  | 'google_vertex'
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
    description: 'Run machine learning models with cloud APIs.',
    supportedTypes: ['chat', 'image', 'video', 'audio'],
  },
  aws_bedrock: {
    id: 'aws_bedrock',
    label: 'AWS Bedrock',
    description: 'Managed service for foundation models.',
    supportedTypes: ['chat', 'image', 'embeddings'],
  },
  google_vertex: {
    id: 'google_vertex',
    label: 'Google Vertex AI',
    description: 'Google Cloud\'s generative AI models.',
    supportedTypes: ['chat', 'image', 'video', 'audio', 'embeddings'],
  },
  azure_openai: {
    id: 'azure_openai',
    label: 'Azure OpenAI',
    description: 'Microsoft enterprise-grade OpenAI models.',
    supportedTypes: ['chat', 'image', 'embeddings'],
  },
  huggingface: {
    id: 'huggingface',
    label: 'Hugging Face',
    description: 'Inference endpoints for open-source models.',
    supportedTypes: ['chat', 'image'],
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
    description: 'Enterprise AI and RAG endpoints.',
    supportedTypes: ['chat', 'embeddings', 'rerank'],
  },
}
