import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateReplicateImage, replicateModelIdFromCatalog } from './replicateImageClient'

vi.mock('./desktopBridge', () => ({
  isElectron: vi.fn(() => true),
  desktopReplicate: {
    generateImage: vi.fn(),
  },
}))

vi.mock('../stores/background-task-store', () => ({
  useBackgroundTaskStore: {
    getState: () => ({
      ensureDesktopSubscription: vi.fn(async () => undefined),
    }),
  },
}))

import { desktopReplicate, isElectron } from './desktopBridge'

describe('replicateModelIdFromCatalog', () => {
  it('strips the replicate: catalog prefix', () => {
    expect(replicateModelIdFromCatalog('replicate:black-forest-labs/flux-schnell')).toBe(
      'black-forest-labs/flux-schnell',
    )
  })

  it('ignores non-Replicate catalog ids', () => {
    expect(replicateModelIdFromCatalog('venice-sd35')).toBeNull()
    expect(replicateModelIdFromCatalog('')).toBeNull()
    expect(replicateModelIdFromCatalog(undefined)).toBeNull()
  })
})

describe('generateReplicateImage', () => {
  beforeEach(() => {
    vi.mocked(isElectron).mockReturnValue(true)
    vi.mocked(desktopReplicate.generateImage).mockReset()
  })

  it('submits a Replicate prediction and marks the response as queued', async () => {
    vi.mocked(desktopReplicate.generateImage).mockResolvedValueOnce({
      ok: true,
      task: { id: 'task-rep-1' } as never,
    })
    const result = await generateReplicateImage({
      prompt: 'a lantern',
      model: 'replicate:black-forest-labs/flux-schnell',
      width: 1024,
      height: 1024,
    })
    expect(desktopReplicate.generateImage).toHaveBeenCalledWith({
      model: 'black-forest-labs/flux-schnell',
      input: { prompt: 'a lantern', width: 1024, height: 1024 },
    })
    expect(result).toMatchObject({
      queued: true,
      taskId: 'task-rep-1',
      images: [],
      model: 'replicate:black-forest-labs/flux-schnell',
    })
  })

  it('rejects web-mode Replicate generation', async () => {
    vi.mocked(isElectron).mockReturnValue(false)
    await expect(
      generateReplicateImage({
        prompt: 'a lantern',
        model: 'replicate:black-forest-labs/flux-schnell',
      }),
    ).rejects.toThrow(/desktop app/i)
    expect(desktopReplicate.generateImage).not.toHaveBeenCalled()
  })
})
