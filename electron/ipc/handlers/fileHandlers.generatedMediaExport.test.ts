// @vitest-environment node
// VERIFY-144: generated-media export is main-frame-only and accepts no renderer path.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  fromWebContents: vi.fn(),
  saveGeneratedMediaAs: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp') },
  BrowserWindow: { fromWebContents: mocks.fromWebContents },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn() },
}))
vi.mock('./common', () => ({
  registerIpcChannel: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => mocks.handlers.set(channel, handler),
}))
vi.mock('../../services/generatedMediaExport', () => ({ saveGeneratedMediaAs: mocks.saveGeneratedMediaAs }))
vi.mock('../../services/mediaService', () => ({
  exportMedia: vi.fn(), generateMediaThumb: vi.fn(), importMediaFromPath: vi.fn(), readMediaMeta: vi.fn(), revealMediaInFolder: vi.fn(),
}))
vi.mock('../../services/characterImageCache', () => ({
  clearCharacterImageCache: vi.fn(), getCachedCharacterImage: vi.fn(), getCharacterImageCacheInventory: vi.fn(),
}))

import { registerFileHandlers } from './fileHandlers'

describe('app:media:save-generated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handlers.clear()
    registerFileHandlers()
    mocks.saveGeneratedMediaAs.mockResolvedValue({ ok: true, canceled: false, filename: 'video.mp4', bytes: 12 })
  })

  it('rejects a subframe sender before opening the native export boundary', async () => {
    const sender = { mainFrame: { id: 1 } }
    mocks.fromWebContents.mockReturnValue({})
    const handler = mocks.handlers.get('app:media:save-generated')!
    await expect(handler({ sender, senderFrame: { id: 2 } }, { mediaId: 'a'.repeat(64) })).resolves.toMatchObject({ ok: false })
    expect(mocks.saveGeneratedMediaAs).not.toHaveBeenCalled()
  })

  it('forwards only a media ID and sanitized optional name from the main frame', async () => {
    const mainFrame = { id: 1 }
    const sender = { mainFrame }
    mocks.fromWebContents.mockReturnValue({})
    const handler = mocks.handlers.get('app:media:save-generated')!
    await handler({ sender, senderFrame: mainFrame }, { mediaId: 'a'.repeat(64), suggestedName: 'clip', sourcePath: '/secret/video.mp4' })
    expect(mocks.saveGeneratedMediaAs).toHaveBeenCalledWith({ mediaId: 'a'.repeat(64), suggestedName: 'clip' })
  })
})
