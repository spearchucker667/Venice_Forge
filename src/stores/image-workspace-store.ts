import { create } from 'zustand'
import type { MediaOperation } from '../types/media'

export interface ImageGenerationDraft {
  model?: string
  prompt: string
  negativePrompt?: string
  style?: string
  steps?: number
  cfgScale?: number
  imageCount?: number
  width?: number
  height?: number
  aspectRatio?: string
  resolution?: string
  quality?: string
  seed?: number | null
}

export interface ImageGenerateHandoff {
  id: string
  target: 'generate'
  draft: ImageGenerationDraft
  autoGenerate: boolean
  parentId: string | null
  operation: Extract<MediaOperation, 'generate' | 'regenerate'>
}

export interface ImageToolsHandoff {
  id: string
  target: 'tools'
  tool: 'edit' | 'upscale'
  parentId: string
  image: string
  prompt: string
  filename: string
}

export type ImageWorkspaceHandoff = ImageGenerateHandoff | ImageToolsHandoff

interface ImageWorkspaceState {
  pending: ImageWorkspaceHandoff | null
  enqueueGenerate: (input: Omit<ImageGenerateHandoff, 'id' | 'target'>) => string
  enqueueTools: (input: Omit<ImageToolsHandoff, 'id' | 'target'>) => string
  consume: (id: string) => void
  reset: () => void
}

function handoffId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

export const useImageWorkspaceStore = create<ImageWorkspaceState>((set) => ({
  pending: null,
  enqueueGenerate: (input) => {
    const id = handoffId()
    set({ pending: { ...input, id, target: 'generate' } })
    return id
  },
  enqueueTools: (input) => {
    const id = handoffId()
    set({ pending: { ...input, id, target: 'tools' } })
    return id
  },
  consume: (id) => set((state) => state.pending?.id === id ? { pending: null } : state),
  reset: () => set({ pending: null }),
}))
