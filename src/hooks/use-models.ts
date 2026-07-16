import { useQuery } from '@tanstack/react-query'
import { venice } from '../lib/venice-client'
import type { ModelsResponse, VeniceModel, VideoConstraints } from '../types/venice'
import { getEnabledProviderModels } from '../config/provider-models'

import { useSettingsStore } from '../stores/settings-store'
import { useModelCatalogRuntimeStore } from '../stores/model-catalog-runtime-store'
import { mergeCanonicalModels, replaceCanonicalModels } from '../services/modelCatalogCache'
import { flattenModels } from '../services/modelClassification'

interface UseModelsOptions {
  enabled?: boolean
}

export function useModels(type?: string, options: UseModelsOptions = {}) {
  const enabledProviders = useSettingsStore(s => s.enabledProviders)
  const normalizedType = type === 'chat' ? 'text' : type === 'embeddings' ? 'embedding' : type;
  const enabledProviderKey = Object.entries(enabledProviders)
    .filter(([, enabled]) => enabled)
    .map(([id]) => id)
    .sort()
    .join(',')

  return useQuery({
    queryKey: ['models', normalizedType ?? 'all', enabledProviderKey],
    enabled: options.enabled ?? true,
    queryFn: async () => {
      const runtime = useModelCatalogRuntimeStore.getState()
      const queryType = normalizedType ?? 'all'
      runtime.markLoading(queryType)
      try {
        const response = await venice<ModelsResponse>(
        `/models${normalizedType ? `?type=${normalizedType}` : ''}`,
        { noAuth: true },
        )
        const liveModels = response.data.filter((model) => !model.model_spec?.offline)
        const grouped = normalizedType ? null : flattenModels(liveModels)
        if (normalizedType) mergeCanonicalModels(normalizedType, liveModels)
        else replaceCanonicalModels(liveModels, grouped ?? undefined)
        const countKey = queryType
        useModelCatalogRuntimeStore.getState().markReady({
          type: queryType,
          totalCount: liveModels.length,
          countsByType: grouped
            ? { all: liveModels.length, ...Object.fromEntries(Object.entries(grouped).map(([key, models]) => [key, models.length])) }
            : { [countKey]: liveModels.length },
          source: 'live',
          liveModelIds: liveModels.map((model) => model.id),
          modelsByType: grouped
            ? Object.fromEntries(Object.entries(grouped).map(([key, models]) => [key, models.map((model) => model.id)]))
            : { [queryType]: liveModels.map((model) => model.id) },
        })
        return response
      } catch (error) {
        const current = useModelCatalogRuntimeStore.getState()
        current.markError(error, current.totalCount > 0, queryType)
        throw error
      }
    },
    staleTime: 5 * 60 * 1000,
    select: (data) => {
      const liveModels = data.data
        .filter((m) => !m.model_spec?.offline)

      const fallbackModels = getEnabledProviderModels(normalizedType)
      
      return [...liveModels, ...fallbackModels]
        .sort((a, b) => a.id.localeCompare(b.id))
    },
  })
}

export interface VideoModelGroup {
  name: string
  textModel?: VeniceModel
  imageModel?: VeniceModel
  sets: string[]
}

export function useVideoModels() {
  const query = useModels('video')

  const groups: VideoModelGroup[] = []
  if (query.data) {
    const map = new Map<string, VideoModelGroup>()
    for (const m of query.data) {
      const c = m.model_spec?.constraints as VideoConstraints | undefined
      if (!c) continue
      const name = m.model_spec?.name || m.id
      const key = name.toLowerCase()
      if (!map.has(key)) {
        map.set(key, { name, sets: m.model_spec?.model_sets || [] })
      }
      const group = map.get(key)!
      if (c.model_type === 'text-to-video') group.textModel = m
      else if (c.model_type === 'image-to-video') group.imageModel = m
      // Merge sets
      const newSets = m.model_spec?.model_sets || []
      for (const s of newSets) {
        if (!group.sets.includes(s)) group.sets.push(s)
      }
    }
    groups.push(...map.values())
  }

  return { ...query, groups }
}
