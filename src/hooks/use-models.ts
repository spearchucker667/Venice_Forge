import { useQuery } from '@tanstack/react-query'
import { venice } from '../lib/venice-client'
import type { ModelsResponse, VeniceModel, VideoConstraints } from '../types/venice'
import { getEnabledProviderModels } from '../config/provider-models'

import { useSettingsStore } from '../stores/settings-store'

export function useModels(type?: string) {
  const enabledProviders = useSettingsStore(s => s.enabledProviders)
  const normalizedType = type === 'chat' ? 'text' : type === 'embeddings' ? 'embedding' : type;

  return useQuery({
    queryKey: ['models', type, enabledProviders],
    queryFn: () =>
      venice<ModelsResponse>(
        `/models${normalizedType ? `?type=${normalizedType}` : ''}`,
        { noAuth: true },
      ),
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
