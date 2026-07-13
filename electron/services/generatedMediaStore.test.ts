// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const root = path.join(os.tmpdir(), 'vf-generated-media-test')
vi.mock('electron', () => ({ app: { getPath: () => root } }))

import { persistGeneratedMedia, resolveGeneratedMedia } from './generatedMediaStore'

describe('generatedMediaStore', () => {
  beforeEach(async () => { await fs.rm(root, { recursive: true, force: true }) })

  it('atomically persists and resolves an MP4 by content hash', async () => {
    const bytes = Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from('ftypisom'), Buffer.from([0, 0, 0, 0])])
    const saved = await persistGeneratedMedia(bytes, 'video/mp4')
    expect(saved.url).toBe(`venice-media://${saved.sha256}`)
    const resolved = await resolveGeneratedMedia(saved.id)
    expect(resolved?.mimeType).toBe('video/mp4')
    expect(await fs.readFile(resolved!.path)).toEqual(bytes)
  })

  it('rejects empty, unsupported, and signature-mismatched media', async () => {
    await expect(persistGeneratedMedia(Buffer.alloc(0), 'audio/mpeg')).rejects.toThrow(/empty/i)
    await expect(persistGeneratedMedia(Buffer.from('x'), 'text/plain')).rejects.toThrow(/unsupported/i)
    await expect(persistGeneratedMedia(Buffer.from('not-mp4'), 'video/mp4')).rejects.toThrow(/did not match/i)
  })
})
