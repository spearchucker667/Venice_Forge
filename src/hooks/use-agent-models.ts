import { useMemo, useContext } from 'react'
import type { ModelCapabilities, ModelTrait, ModelInfo } from '../types/venice'
import { ModelsContext } from './use-models-mock'

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

function tierFor(model: ModelInfo): number {
  const traits = (model as any).model_spec?.traits ?? [] // eslint-disable-line @typescript-eslint/no-explicit-any
  if (traits.some((t: any) => TOP_TRAITS.includes(t))) return 0 // eslint-disable-line @typescript-eslint/no-explicit-any
  if (RECOMMENDED_DEFAULTS.has(model.id)) return 0
  const caps = model.capabilities ?? (model as any).model_spec?.capabilities ?? {} // eslint-disable-line @typescript-eslint/no-explicit-any
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
  const modelsMap = useContext(ModelsContext)
  const data = modelsMap?.text || []
  const models = useMemo<AgentModel[]>(() => {
    if (!data) return []
    return data
      .filter((m) => !(m as any).model_spec?.offline) // eslint-disable-line @typescript-eslint/no-explicit-any
      .map<AgentModel>((m) => {
        const caps = m.capabilities ?? (m as any).model_spec?.capabilities ?? {} // eslint-disable-line @typescript-eslint/no-explicit-any
        const traits = (m as any).model_spec?.traits ?? [] // eslint-disable-line @typescript-eslint/no-explicit-any
        const tier = tierFor(m)
        return {
          id: m.id,
          name: m.name || (m as any).model_spec?.name || m.id, // eslint-disable-line @typescript-eslint/no-explicit-any
          capabilities: caps,
          traits,
          contextTokens: (m as any).model_spec?.availableContextTokens, // eslint-disable-line @typescript-eslint/no-explicit-any
          recommended: tier === 0,
          tier,
          reasoning: !!caps.supportsReasoning,
          uncensored: traits.includes('most_uncensored'),
        }
      })
      .sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier
        return a.name.localeCompare(b.name)
      })
  }, [data])

  return { models }
}

/** Returns the AgentModel for an id, falling back to a synthesized record. */
export function findAgentModel(models: AgentModel[], id: string): AgentModel | undefined {
  return models.find((m) => m.id === id)
}
