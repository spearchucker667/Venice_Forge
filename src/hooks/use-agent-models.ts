import { useMemo } from 'react'
import { useModels } from './use-models'
import type { ModelCapabilities, ModelTrait, VeniceModel } from '../types/venice'

export interface AgentModel {
  id: string
  name: string
  capabilities: ModelCapabilities
  traits: ModelTrait[]
  contextTokens?: number
  recommended: boolean
  /** Sort tier: 0=top recommended, 1=other recommended, 2=capable, 3=other */
  tier: number
  reasoning: boolean
  uncensored: boolean
}

const TOP_TRAITS: ReadonlyArray<ModelTrait> = ['function_calling_default', 'most_intelligent', 'default']
const RECOMMENDED_DEFAULTS = new Set([
  'qwen3-next-80b',                  // empirical winner — fastest, perfect output
  'zai-org-glm-4.7',                 // Venice function_calling_default
  'mistral-small-3-2-24b-instruct',  // fast, clean
])

function tierFor(model: VeniceModel): number {
  const traits = model.model_spec?.traits ?? []
  if (traits.some((t) => TOP_TRAITS.includes(t))) return 0
  if (RECOMMENDED_DEFAULTS.has(model.id)) return 0
  const caps = model.model_spec?.capabilities ?? {}
  if (caps.supportsResponseSchema && caps.supportsFunctionCalling) {
    if (caps.supportsReasoning) return 2 // reasoning models slow at JSON tasks
    return 1
  }
  if (caps.supportsResponseSchema || caps.supportsFunctionCalling) return 2
  return 3
}

/**
 * Returns chat models sorted by suitability as the playground meta-agent.
 * The picker UI can show all OR filter to tier <= 2 (genuinely capable).
 */
export function useAgentModels() {
  const { data, isLoading } = useModels('text')

  const models = useMemo<AgentModel[]>(() => {
    if (!data) return []
    return data
      .filter((m) => !m.model_spec?.offline)
      .map<AgentModel>((m) => {
        const caps = m.model_spec?.capabilities ?? {}
        const traits = m.model_spec?.traits ?? []
        const tier = tierFor(m)
        return {
          id: m.id,
          name: m.model_spec?.name || m.id,
          capabilities: caps,
          traits,
          contextTokens: m.model_spec?.availableContextTokens,
          recommended: tier === 0,
          tier,
          reasoning: caps.supportsReasoning === true,
          uncensored: traits.includes('most_uncensored'),
        }
      })
      .sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier
        // Within tier: name alpha
        return a.name.localeCompare(b.name)
      })
  }, [data])

  return { models, isLoading }
}

/** Returns the AgentModel for an id, falling back to a synthesized record. */
export function findAgentModel(models: AgentModel[], id: string): AgentModel | undefined {
  return models.find((m) => m.id === id)
}
