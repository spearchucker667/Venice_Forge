// @vitest-environment node
// VERIFY-103 regression guard: generated-video downloads are DNS-aware, connection-pinned, and size bounded.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import https from 'node:https'
import { PassThrough } from 'node:stream'

vi.mock('node:dns/promises', () => ({
  default: { lookup: vi.fn() },
}))

import dns from 'node:dns/promises'
import { downloadGeneratedVideo, isPublicDownloadAddress, MAX_GENERATED_VIDEO_BYTES, resolveSafeDownloadTarget } from './generatedVideoDownload'

describe('generatedVideoDownload', () => {
  beforeEach(() => vi.mocked(dns.lookup).mockReset())
  afterEach(() => vi.restoreAllMocks())

  it('rejects loopback, private, link-local, documentation, and mapped-private addresses', () => {
    for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.2', '203.0.113.7', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPublicDownloadAddress(address), address).toBe(false)
    }
    expect(isPublicDownloadAddress('8.8.8.8')).toBe(true)
    expect(isPublicDownloadAddress('2606:4700:4700::1111')).toBe(true)
  })

  it('rejects a hostname if any resolved address is non-public', async () => {
    vi.mocked(dns.lookup).mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ] as never)
    await expect(resolveSafeDownloadTarget('media.example')).rejects.toThrow(/blocked network address/i)
  })

  it('returns one approved address for connection pinning', async () => {
    vi.mocked(dns.lookup).mockResolvedValue([{ address: '8.8.4.4', family: 4 }] as never)
    await expect(resolveSafeDownloadTarget('media.example')).resolves.toEqual({ address: '8.8.4.4', family: 4 })
  })

  it('pins HTTPS lookup to the approved address and accepts a bounded MP4 response', async () => {
    vi.mocked(dns.lookup).mockResolvedValue([{ address: '8.8.4.4', family: 4 }] as never)
    const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: (error: Error) => void }
    let options: https.RequestOptions | undefined
    vi.spyOn(https, 'request').mockImplementation(((_url: URL, requestOptions: https.RequestOptions, callback: (response: PassThrough) => void) => {
      options = requestOptions
      request.end = () => {
        const response = new PassThrough() as PassThrough & { statusCode: number; headers: Record<string, string> }
        response.statusCode = 200
        response.headers = { 'content-type': 'video/mp4', 'content-length': '12' }
        callback(response)
        response.end(Buffer.from([0, 0, 0, 12, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]))
      }
      request.destroy = (error) => request.emit('error', error)
      return request
    }) as never)

    const result = await downloadGeneratedVideo('https://media.example/video.mp4')
    expect(result.bytes).toHaveLength(12)
    const lookup = options?.lookup as Exclude<https.RequestOptions['lookup'], undefined>
    const callback = vi.fn()
    lookup('media.example', {}, callback)
    expect(callback).toHaveBeenCalledWith(null, '8.8.4.4', 4)
  })

  it('rejects a declared body larger than the streaming limit', async () => {
    vi.mocked(dns.lookup).mockResolvedValue([{ address: '8.8.4.4', family: 4 }] as never)
    const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: (error: Error) => void }
    vi.spyOn(https, 'request').mockImplementation(((_url: URL, _options: https.RequestOptions, callback: (response: PassThrough) => void) => {
      request.end = () => {
        const response = new PassThrough() as PassThrough & { statusCode: number; headers: Record<string, string> }
        response.statusCode = 200
        response.headers = { 'content-type': 'video/mp4', 'content-length': String(MAX_GENERATED_VIDEO_BYTES + 1) }
        callback(response)
      }
      request.destroy = (error) => request.emit('error', error)
      return request
    }) as never)

    await expect(downloadGeneratedVideo('https://media.example/video.mp4')).rejects.toThrow(/size limit/i)
  })
})
