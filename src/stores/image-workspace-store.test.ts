import { beforeEach, describe, expect, it } from 'vitest'
import { useImageWorkspaceStore } from './image-workspace-store'

describe('image workspace handoff store', () => {
  beforeEach(() => useImageWorkspaceStore.getState().reset())

  it('queues and consumes a production-safe generate handoff', () => {
    const id = useImageWorkspaceStore.getState().enqueueGenerate({
      draft: { prompt: 'remixed prompt', seed: -7 },
      autoGenerate: true,
      parentId: 'parent-1',
      operation: 'regenerate',
    })
    expect(useImageWorkspaceStore.getState().pending).toMatchObject({
      id,
      target: 'generate',
      autoGenerate: true,
      parentId: 'parent-1',
      operation: 'regenerate',
    })
    useImageWorkspaceStore.getState().consume(id)
    expect(useImageWorkspaceStore.getState().pending).toBeNull()
  })

  it('queues an image-tools handoff with source lineage', () => {
    useImageWorkspaceStore.getState().enqueueTools({
      tool: 'upscale',
      parentId: 'parent-1',
      image: 'data:image/png;base64,abc',
      prompt: 'source prompt',
      filename: 'parent-1.png',
    })
    expect(useImageWorkspaceStore.getState().pending).toMatchObject({
      target: 'tools',
      tool: 'upscale',
      parentId: 'parent-1',
    })
  })
})
