// @vitest-environment node
// VERIFY-144: /video/retrieve uses its dedicated JSON-or-MP4 main-process transport.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  persistStream: vi.fn(),
  download: vi.fn(),
  getApiKey: vi.fn(() => 'secret-key'),
}))
vi.mock('electron', () => ({ app: { getVersion: () => 'test' } }))
vi.mock('https', () => ({ default: { request: mocks.request } }))
vi.mock('./secureStore', () => ({ getApiKey: mocks.getApiKey }))
vi.mock('./generatedMediaStream', () => ({ persistGeneratedMp4Stream: mocks.persistStream }))
vi.mock('./generatedVideoDownload', () => ({ downloadGeneratedVideo: mocks.download }))

import { retrieveVideoQueueResult } from './videoRetrieveService'

const durable = { id: 'a'.repeat(64), url: `venice-media://${'a'.repeat(64)}`, mimeType: 'video/mp4', byteCount: 12, sha256: 'a'.repeat(64) }

function respond(status: number, contentType: string, body: Buffer): void {
  const request = new EventEmitter() as EventEmitter & { end: (body?: string) => void; destroy: (error: Error) => void }
  request.destroy = (error) => request.emit('error', error)
  request.end = () => {
    const response = new PassThrough() as PassThrough & { statusCode: number; headers: Record<string, string> }
    response.statusCode = status
    response.headers = { 'content-type': contentType }
    const callback = mocks.request.mock.calls.at(-1)?.[1] as ((response: PassThrough) => void)
    callback(response)
    response.end(body)
  }
  mocks.request.mockReturnValueOnce(request)
}

describe('retrieveVideoQueueResult', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getApiKey.mockReturnValue('secret-key')
    mocks.persistStream.mockResolvedValue(durable)
    mocks.download.mockResolvedValue(durable)
  })

  it('accepts a direct MP4 stream and reports retrieving/saving stages', async () => {
    respond(200, 'video/mp4', Buffer.from('streamed'))
    const stages: string[] = []
    mocks.persistStream.mockImplementation(async (_stream: PassThrough, options: { onSaving?: () => Promise<void> }) => {
      await options.onSaving?.()
      return durable
    })
    const result = await retrieveVideoQueueResult({ queueId: 'q1', model: 'model', profileId: 'default', onStage: (stage) => { stages.push(stage) } })
    expect(result).toEqual({ kind: 'completed', media: durable })
    expect(stages).toEqual(['retrieving', 'saving'])
  })

  it('parses bounded JSON processing responses without inventing progress', async () => {
    respond(200, 'application/json', Buffer.from(JSON.stringify({ status: 'PROCESSING' })))
    await expect(retrieveVideoQueueResult({ queueId: 'q1', model: 'model', profileId: 'default' }))
      .resolves.toEqual({ kind: 'processing', progressRatio: undefined })
  })

  it('retrieves a provider download URL through the secure streaming downloader', async () => {
    respond(200, 'application/json', Buffer.from(JSON.stringify({ status: 'COMPLETED', download_url: 'https://media.example/video.mp4' })))
    await expect(retrieveVideoQueueResult({ queueId: 'q1', model: 'model', profileId: 'default' }))
      .resolves.toEqual({ kind: 'completed', media: durable })
    expect(mocks.download).toHaveBeenCalledWith('https://media.example/video.mp4', expect.any(Object))
  })

  it('rejects unsupported successful content types as terminal', async () => {
    respond(200, 'text/html', Buffer.from('<html>no</html>'))
    await expect(retrieveVideoQueueResult({ queueId: 'q1', model: 'model', profileId: 'default' }))
      .rejects.toMatchObject({ retryable: false })
  })

  it('classifies invalid media persistence as terminal and a reset stream as retryable', async () => {
    respond(200, 'video/mp4', Buffer.from('invalid'))
    mocks.persistStream.mockRejectedValueOnce(new Error('MP4 signature was invalid'))
    await expect(retrieveVideoQueueResult({ queueId: 'q1', model: 'model', profileId: 'default' }))
      .rejects.toMatchObject({ retryable: false })

    respond(200, 'video/mp4', Buffer.from('interrupted'))
    mocks.persistStream.mockRejectedValueOnce(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))
    await expect(retrieveVideoQueueResult({ queueId: 'q1', model: 'model', profileId: 'default' }))
      .rejects.toMatchObject({ retryable: true })
  })
})
