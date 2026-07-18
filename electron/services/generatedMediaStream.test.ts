// @vitest-environment node
// VERIFY-144: completed MP4 responses stream to bounded durable storage without renderer/base64 buffering.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'

const testRoot = fsSync.mkdtempSync(path.join(os.tmpdir(), 'vf-media-stream-'))
vi.mock('electron', () => ({ app: { getPath: () => testRoot } }))

import { persistGeneratedMp4Stream } from './generatedMediaStream'
import { resolveGeneratedMedia } from './generatedMediaStore'

const mp4 = Buffer.from([0, 0, 0, 12, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0, 1, 2, 3, 4])

describe('persistGeneratedMp4Stream', () => {
  beforeEach(async () => {
    await fs.rm(path.join(testRoot, 'media'), { recursive: true, force: true })
  })

  it('hashes, fsyncs, and atomically commits a chunked MP4 stream', async () => {
    const saving = vi.fn()
    const media = await persistGeneratedMp4Stream(Readable.from([mp4.subarray(0, 5), mp4.subarray(5)]), { onSaving: saving })
    expect(media.url).toBe(`venice-media://${media.sha256}`)
    expect(media.byteCount).toBe(mp4.length)
    expect(saving).toHaveBeenCalledOnce()
    const resolved = await resolveGeneratedMedia(media.id)
    expect(resolved).not.toBeNull()
    await expect(fs.readFile(resolved!.path)).resolves.toEqual(mp4)
  })

  it('streams a response larger than the generic 25 MiB buffer without a giant fixture', async () => {
    const oneMiB = Buffer.alloc(1024 * 1024, 0x5a)
    async function* chunks() {
      yield mp4
      for (let index = 0; index < 26; index += 1) yield oneMiB
    }
    const media = await persistGeneratedMp4Stream(Readable.from(chunks()), { maxBytes: 32 * 1024 * 1024 })
    expect(media.byteCount).toBe(mp4.length + (26 * oneMiB.length))
    expect(media.url).toBe(`venice-media://${media.sha256}`)
  })

  it('rejects overflow and removes every temporary file', async () => {
    await expect(persistGeneratedMp4Stream(Readable.from([mp4]), { maxBytes: 8 })).rejects.toThrow(/size limit/i)
    const root = path.join(testRoot, 'media', 'blobs', 'sha256')
    const entries = await fs.readdir(root).catch(() => [])
    expect(entries.filter((entry) => entry.includes('.incoming-'))).toEqual([])
  })

  it('rejects non-MP4 bytes and leaves no durable record', async () => {
    await expect(persistGeneratedMp4Stream(Readable.from([Buffer.alloc(16)]))).rejects.toThrow(/MP4 signature/i)
    const root = path.join(testRoot, 'media', 'blobs', 'sha256')
    const entries = await fs.readdir(root).catch(() => [])
    expect(entries).toEqual([])
  })

  it('removes the temporary file when the incoming stream is interrupted', async () => {
    async function* interrupted() {
      yield mp4.subarray(0, 8)
      throw new Error('connection reset')
    }
    await expect(persistGeneratedMp4Stream(Readable.from(interrupted()))).rejects.toThrow('connection reset')
    const root = path.join(testRoot, 'media', 'blobs', 'sha256')
    const entries = await fs.readdir(root).catch(() => [])
    expect(entries.filter((entry) => entry.includes('.incoming-'))).toEqual([])
  })
})
