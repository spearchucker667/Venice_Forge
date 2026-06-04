import { useQueries } from '@tanstack/react-query'
import { venice } from '../lib/venice-client'
import type { ModelsResponse } from '../types/venice'

export type ModelCatalog = {
  text: string[]
  image: string[]
  tts: string[]
  music: string[]
  video: string[]
}

const TYPES: (keyof ModelCatalog)[] = ['text', 'image', 'tts', 'music', 'video']

function extractIds(resp: ModelsResponse | undefined): string[] {
  if (!resp) return []
  return resp.data
    .filter((m) => !m.model_spec?.offline)
    .map((m) => m.id)
    .sort()
}

export function useModelCatalog() {
  const queries = useQueries({
    queries: TYPES.map((type) => ({
      queryKey: ['models', type],
      queryFn: () => venice<ModelsResponse>(`/models?type=${type}`, { noAuth: true }),
      staleTime: 5 * 60 * 1000,
    })),
  })

  const catalog: ModelCatalog = {
    text: extractIds(queries[0].data),
    image: extractIds(queries[1].data),
    tts: extractIds(queries[2].data),
    music: extractIds(queries[3].data),
    video: extractIds(queries[4].data),
  }

  const isLoading = queries.some((q) => q.isLoading)

  return { catalog, isLoading }
}
