import { useQuery } from '@tanstack/react-query'
import { venice } from '../lib/venice-client'
import type { ModelsResponse, VeniceModel, VideoConstraints } from '../types/venice'
import type { ProviderModel } from '../types/provider'
import { getEnabledProviderModels } from '../config/provider-models'

import { useSettingsStore } from '../stores/settings-store'
import { useProfileStore } from '../stores/profile-store'
import { useModelCatalogRuntimeStore } from '../stores/model-catalog-runtime-store'
import { mergeCanonicalModels, replaceCanonicalModels } from '../services/modelCatalogCache'
import { flattenModels, normalizeModelInfo } from '../services/modelClassification'
import { desktopHuggingFace } from '../services/desktopBridge'

interface UseModelsOptions {
  enabled?: boolean
}

/** In-memory live HF catalog so the synchronous `select` can surface discovery
 *  results without re-running the Venice query. */
let liveHfModels: VeniceModel[] | null = null

function normalizeHfProviderModel(model: ProviderModel, fetchedAt: number): VeniceModel {
  return {
    id: model.id,
    object: 'model',
    created: fetchedAt,
    owned_by: 'huggingface',
    type: 'text',
    lifecycle: model.lifecycle,
    retirementDate: model.retirementDate,
    source: 'live',
    isFallback: false,
    model_spec: {
      name: `${model.name} · HF Inference Providers`,
      capabilities: {
        supportsVision: model.capabilities.vision ?? false,
        supportsFunctionCalling: false,
      },
    },
  }
}

async function refreshHuggingFaceModelsIfEnabled(enabledProviders: Record<string, boolean>): Promise<void> {
  if (!enabledProviders.huggingface) return
  try {
    const result = await desktopHuggingFace.getModelCatalog()
    if (result.models.length > 0) {
      liveHfModels = result.models.map((m) => normalizeHfProviderModel(m, result.fetchedAt))
    }
  } catch {
    // Discovery is best-effort; static bundled fallbacks remain available.
  }
}

export function useModels(type?: string, options: UseModelsOptions = {}) {
  const enabledProviders = useSettingsStore(s => s.enabledProviders)
  // /models responses are caller-specific/non-cacheable across credential
  // profiles: visibility, pricing, and negotiated rate limits differ per
  // active API key. Including `activeProfileId` in the queryKey forces
  // React Query to drop the cached payload when the user switches profiles,
  // so a result obtained under profile A is never served as authoritative
  // state for profile B. The `modelCatalogCache` itself remains in-memory
  // only — there is no IndexedDB persistence path for live /models data,
  // which keeps the profile boundary clean across restarts too.
  const activeProfileId = useProfileStore((s) => s.activeProfileId)
  const normalizedType = type === 'chat' ? 'text' : type === 'embeddings' ? 'embedding' : type;
  const enabledProviderKey = Object.entries(enabledProviders)
    .filter(([, enabled]) => enabled)
    .map(([id]) => id)
    .sort()
    .join(',')

  return useQuery({
    queryKey: ['models', normalizedType ?? 'all', enabledProviderKey, activeProfileId],
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
        // Refresh HF discovery in the background after Venice models load so the
        // next render or query cache read can replace the static HF catalog.
        await refreshHuggingFaceModelsIfEnabled(enabledProviders)
        return response
      } catch (error) {
        const current = useModelCatalogRuntimeStore.getState()
        current.markError(error, current.totalCount > 0, queryType)
        throw error
      }
    },
    staleTime: 5 * 60 * 1000,
    select: (data) => {
      // normalizeModelInfo is spread-first: every original VeniceModel field is
      // preserved, so the normalized records remain VeniceModel-compatible at
      // runtime while gaining canonical contextLength/maxOutputTokens.
      const liveModels = data.data
        .filter((m) => !m.model_spec?.offline)
        .map((m) => normalizeModelInfo(m) as VeniceModel)

      let fallbackModels = getEnabledProviderModels(normalizedType)
        .map((m) => normalizeModelInfo(m) as VeniceModel)

      // Replace the static Hugging Face catalog with live-discovered models when
      // available. Existing chats and other providers keep their fallback entries.
      const cachedHfModels = liveHfModels
      const hfLiveApplicable =
        enabledProviders.huggingface &&
        cachedHfModels !== null &&
        cachedHfModels.length > 0 &&
        (!normalizedType || normalizedType === 'text')
      if (hfLiveApplicable) {
        fallbackModels = fallbackModels.filter((m) => m.owned_by !== 'huggingface')
        return [...liveModels, ...cachedHfModels, ...fallbackModels]
          .sort((a, b) => a.id.localeCompare(b.id))
      }

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
    for (const raw of query.data) {
      // Normalization preserves every original field (spread-first), so the
      // runtime shape remains VeniceModel-compatible.
      const m = raw as VeniceModel
      const c = (m.model_spec?.constraints as VideoConstraints | undefined) || {
        model_type: 'text-to-video' as const,
        aspect_ratios: ['16:9'],
        resolutions: ['720p'],
        durations: ['5s'],
        audio: false,
        audio_configurable: false,
        audio_input: false,
        video_input: false,
      }
      const name = m.model_spec?.name || m.id
      const key = name.toLowerCase()
      if (!map.has(key)) {
        map.set(key, { name, sets: m.model_spec?.model_sets || [] })
      }
      const group = map.get(key)!
      if (c.model_type === 'text-to-video' || c.model_type === 'video') group.textModel = m
      if (c.model_type === 'image-to-video' || c.model_type === 'video') group.imageModel = m
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
