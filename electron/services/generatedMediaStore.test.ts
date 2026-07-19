// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const root = path.join(os.tmpdir(), 'vf-generated-media-test')
vi.mock('electron', () => ({ 
  app: { getPath: () => root },
  net: {
    fetch: async (url: string, init: any) => {
      const filePath = new URL(url).pathname;
      const stat = await fs.stat(filePath);
      const totalSize = stat.size;
      const rangeHeader = init?.headers?.Range || init?.headers?.range;

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

        if (start >= totalSize || end >= totalSize || start > end) {
          return new Response(null, {
            status: 416,
            headers: {
              'Content-Range': `bytes */${totalSize}`,
              'Accept-Ranges': 'bytes'
            }
          });
        }
        
        const chunksize = (end - start) + 1;
        const fileHandle = await fs.open(filePath, 'r');
        const buffer = Buffer.alloc(chunksize);
        await fileHandle.read(buffer, 0, chunksize, start);
        await fileHandle.close();

        return new Response(buffer, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize.toString()
          }
        });
      }

      const data = await fs.readFile(filePath);
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Length': totalSize.toString(),
          'Accept-Ranges': 'bytes'
        }
      });
    }
  }
}))

import { createGeneratedMediaResponse, persistGeneratedMedia, resolveGeneratedMedia } from './generatedMediaStore'

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

  // VERIFY-143: app-owned generated video supports browser media range reads.
  it('serves byte ranges for durable video playback and rejects invalid ranges', async () => {
    const bytes = Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from('ftypisom'), Buffer.from('video-payload')])
    const saved = await persistGeneratedMedia(bytes, 'video/mp4')

    const access = { isDev: true, origin: null, referrer: '', rendererRoot: '' }
    const partial = await createGeneratedMediaResponse(saved.id, { headers: { range: 'bytes=4-11' } } as any, access)
    expect(partial.status).toBe(206)
    expect(partial.headers.get('accept-ranges')).toBe('bytes')
    expect(partial.headers.get('content-range')).toBe(`bytes 4-11/${bytes.length}`)
    expect(Buffer.from(await partial.arrayBuffer())).toEqual(bytes.subarray(4, 12))
    // CORS headers are emitted alongside byte-range metadata. The Vite dev
    // origin is the only `Access-Control-Allow-Origin` value released in dev.
    expect(partial.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    expect(partial.headers.get('vary')).toBe('Origin')

    const invalid = await createGeneratedMediaResponse(saved.id, { headers: { range: `bytes=${bytes.length}-` } } as any, access)
    expect(invalid.status).toBe(416)
    expect(invalid.headers.get('content-range')).toBe(`bytes */${bytes.length}`)
  })

  // VERIFY-155: foreign origins must never reach generated-media bytes.
  it('rejects generated-media requests from forbidden origins', async () => {
    const bytes = Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from('ftypisom'), Buffer.from('video-payload')])
    const saved = await persistGeneratedMedia(bytes, 'video/mp4')

    const blocked = await createGeneratedMediaResponse(
      saved.id,
      { headers: { range: 'bytes=4-11' } } as any,
      { isDev: true, origin: 'https://evil.example', referrer: 'https://evil.example/app', rendererRoot: '' },
    )
    expect(blocked.status).toBe(403)
    expect(blocked.headers.get('access-control-allow-origin')).toBeNull()
  })
})
