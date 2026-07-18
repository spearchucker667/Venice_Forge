/** Dedicated bounded retrieval transport for Venice video queue results. */
import { app } from 'electron'
import https from 'https'
import type { IncomingMessage } from 'http'
import { VENICE_API_BASE_PATH, VENICE_API_HOST, VENICE_API_TIMEOUT_MS } from '../../src/shared/apiConfig'
import { normalizeVideoRetrieveResult } from '../../src/services/video-retrieve-normalizer'
import { buildVideoRetrieveRequest } from '../../src/services/media-request-adapter'
import type { DurableGeneratedMedia } from './generatedMediaStore'
import { persistGeneratedMp4Stream } from './generatedMediaStream'
import { downloadGeneratedVideo } from './generatedVideoDownload'
import { getApiKey } from './secureStore'

const MAX_VIDEO_RETRIEVE_JSON_BYTES = 1024 * 1024

export type VideoRetrieveStage = 'generating' | 'retrieving' | 'saving'

export type VideoRetrieveResult =
  | { kind: 'processing'; progressRatio?: number }
  | { kind: 'failed'; error: string; retryable: false }
  | { kind: 'completed'; media: DurableGeneratedMedia }

export class VideoRetrieveError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly status?: number) {
    super(message)
  }
}

function classifyMediaFailure(error: unknown): VideoRetrieveError {
  if (error instanceof VideoRetrieveError) return error
  const code = error !== null && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : ''
  const retryable = ['ECONNABORTED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT'].includes(code)
  return new VideoRetrieveError(retryable ? 'Video media transfer was interrupted.' : 'Video media could not be persisted.', retryable)
}

function readBoundedJson(response: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let byteCount = 0
    response.on('data', (value: Buffer | Uint8Array) => {
      const chunk = Buffer.from(value)
      byteCount += chunk.length
      if (byteCount > MAX_VIDEO_RETRIEVE_JSON_BYTES) {
        response.destroy(new VideoRetrieveError('Video status response exceeded the safety limit.', false))
        return
      }
      chunks.push(chunk)
    })
    response.once('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks, byteCount).toString('utf8') || '{}'))
      } catch {
        reject(new VideoRetrieveError('Video status response was malformed.', false))
      }
    })
    response.once('error', reject)
  })
}

export async function retrieveVideoQueueResult(input: {
  queueId: string
  model: string
  profileId: string
  queueDownloadUrl?: string
  onStage?: (stage: VideoRetrieveStage) => void | Promise<void>
}): Promise<VideoRetrieveResult> {
  const apiKey = getApiKey(input.profileId)
  if (!apiKey) throw new VideoRetrieveError('Venice API key is not configured.', false, 401)
  const body = JSON.stringify(buildVideoRetrieveRequest(input.model, input.queueId))

  return await new Promise<VideoRetrieveResult>((resolve, reject) => {
    const request = https.request({
      hostname: VENICE_API_HOST,
      path: `${VENICE_API_BASE_PATH}/video/retrieve`,
      method: 'POST',
      timeout: VENICE_API_TIMEOUT_MS,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json, video/mp4',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': `VeniceForge/${app.getVersion()}`,
      },
    }, (response) => {
      const status = response.statusCode ?? 0
      const contentType = String(response.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
      if (status < 200 || status >= 300) {
        void readBoundedJson(response).then((payload) => {
          const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
          const message = typeof record.error === 'string' ? record.error : `Video retrieval failed (HTTP ${status}).`
          reject(new VideoRetrieveError(message, status === 408 || status === 429 || status >= 500, status))
        }, reject)
        return
      }
      if (contentType === 'video/mp4') {
        void input.onStage?.('retrieving')
        void persistGeneratedMp4Stream(response, { onSaving: () => input.onStage?.('saving') }).then(
          (media) => resolve({ kind: 'completed', media }),
          (error) => reject(classifyMediaFailure(error)),
        )
        return
      }
      if (contentType !== 'application/json') {
        response.resume()
        reject(new VideoRetrieveError('Video retrieval returned an unsupported content type.', false, status))
        return
      }
      void readBoundedJson(response).then(async (payload) => {
        const headers = Object.fromEntries(Object.entries(response.headers).flatMap(([key, value]) =>
          typeof value === 'string' ? [[key, value]] : []))
        const normalized = normalizeVideoRetrieveResult(payload, headers, input.queueDownloadUrl)
        if (normalized.kind === 'processing') return resolve({ kind: 'processing', progressRatio: normalized.progressRatio })
        if (normalized.kind === 'failed') return resolve({ kind: 'failed', error: normalized.error, retryable: false })
        if (normalized.kind === 'download') {
          await input.onStage?.('retrieving')
          const media = await downloadGeneratedVideo(normalized.downloadUrl, { onSaving: () => input.onStage?.('saving') })
            .catch((error: unknown) => { throw classifyMediaFailure(error) })
          return resolve({ kind: 'completed', media })
        }
        if (normalized.kind === 'completed' && normalized.mediaUrl.startsWith('https://')) {
          await input.onStage?.('retrieving')
          const media = await downloadGeneratedVideo(normalized.mediaUrl, { onSaving: () => input.onStage?.('saving') })
            .catch((error: unknown) => { throw classifyMediaFailure(error) })
          return resolve({ kind: 'completed', media })
        }
        reject(new VideoRetrieveError('Video retrieval returned inline media instead of a stream.', false))
      }, reject).catch(reject)
    })
    request.once('timeout', () => request.destroy(new VideoRetrieveError('Video retrieval timed out.', true)))
    request.once('error', (error) => reject(error instanceof VideoRetrieveError ? error : new VideoRetrieveError('Failed to reach Venice API.', true)))
    request.end(body)
  })
}
