/** Dedicated bounded retrieval transport for Venice video queue results. */
import { app } from 'electron'
import https from 'https'
import type { IncomingMessage } from 'http'
import { VENICE_API_BASE_PATH, VENICE_API_HOST, VENICE_API_TIMEOUT_MS } from '../../src/shared/apiConfig'
import { normalizeVideoRetrieveResult } from '../../src/services/video-retrieve-normalizer'
import { buildVideoRetrieveRequest } from '../../src/services/media-request-adapter'
import type { DurableGeneratedMedia } from './generatedMediaStore'
import { persistGeneratedMedia, resolveGeneratedMedia } from './generatedMediaStore'
import { persistGeneratedMp4Stream } from './generatedMediaStream'
import { downloadGeneratedVideo } from './generatedVideoDownload'
import { getApiKey } from './secureStore'
import { identifyAndValidateGeneratedMedia } from '../../src/shared/safety/mediaScreener'
import { getRuntimeLocalFamilySafeModeEnabled } from './runtimeSafetySettings'
import {
  publishInspectorRequest,
  publishInspectorCompletion,
} from './inspectorTelemetry'

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

/** Screen video bytes through Family Safe Mode before the result is returned.
 *  Reads only the header (first 64 KB) for magic-byte validation + classifier
 *  sampling, rather than buffering the entire video in RAM.
 *  Returns `null` when screening passes or FSM is disabled; otherwise a terminal
 *  `VideoRetrieveError` describing the block. */
async function screenPersistedVideoMedia(media: DurableGeneratedMedia): Promise<VideoRetrieveError | null> {
  const fsm = getRuntimeLocalFamilySafeModeEnabled()
  if (!fsm) return null

  const resolved = await resolveGeneratedMedia(media.id)
  if (!resolved) {
    return new VideoRetrieveError('Persisted video could not be located for safety screening.', false)
  }

  // P2-FIX: Read only the video header (64 KB) for magic-byte validation
  // and classifier sampling, instead of the entire file.  The classifier
  // operates on initial frames/headers — never the full video bytes.
  const SCREEN_SAMPLE_BYTES = 64 * 1024
  let buffer: Buffer
  try {
    const { open } = await import('fs/promises')
    const handle = await open(resolved.path, 'r')
    try {
      const stat = await handle.stat()
      const readSize = Math.min(stat.size, SCREEN_SAMPLE_BYTES)
      const buf = Buffer.alloc(readSize)
      const { bytesRead } = await handle.read(buf, 0, readSize, 0)
      buffer = buf.subarray(0, bytesRead)
    } finally {
      await handle.close()
    }
  } catch {
    return new VideoRetrieveError('Persisted video could not be read for safety screening.', false)
  }

  const screen = await identifyAndValidateGeneratedMedia(buffer, media.mimeType, fsm)
  if (!screen.allowed) {
    return new VideoRetrieveError(
      screen.userMessage || 'Video generation is not available while Family Safe Mode is enabled.',
      false,
    )
  }
  return null
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

/** Emit a completion event for an active video retrieval cycle. */
function publishVideoCompletion(
  eventId: string,
  input: { queueId: string; model: string },
  result: VideoRetrieveResult,
  startedAt: number,
): void {
  if (result.kind === 'completed') {
    publishInspectorCompletion({
      source: 'main-video',
      transport: 'venice',
      endpoint: '/video/retrieve',
      method: 'POST',
      summaries: {
        taskId: input.queueId,
        model: input.model,
        bytes: result.media.byteCount,
        durationMs: Date.now() - startedAt,
      },
      eventId,
      status: 200,
    });
    return;
  }
  if (result.kind === 'processing') {
    publishInspectorCompletion({
      source: 'main-video',
      transport: 'venice',
      endpoint: '/video/retrieve',
      method: 'POST',
      summaries: {
        taskId: input.queueId,
        model: input.model,
        durationMs: Date.now() - startedAt,
      },
      eventId,
    });
    return;
  }
  publishInspectorCompletion({
    source: 'main-video',
    transport: 'venice',
    endpoint: '/video/retrieve',
    method: 'POST',
    summaries: { taskId: input.queueId, model: input.model },
    eventId,
    error: result.error,
  });
}

/** Emit a failed-completion event when a video retrieval cycle throws. */
function publishVideoFailure(
  eventId: string,
  input: { queueId: string; model: string },
  err: unknown,
  startedAt: number,
): void {
  const message = err instanceof Error ? err.message : String(err);
  publishInspectorCompletion({
    source: 'main-video',
    transport: 'venice',
    endpoint: '/video/retrieve',
    method: 'POST',
    summaries: {
      taskId: input.queueId,
      model: input.model,
      durationMs: Date.now() - startedAt,
    },
    eventId,
    error: message,
  });
}

export async function retrieveVideoQueueResult(input: {
  queueId: string
  model: string
  profileId: string
  queueDownloadUrl?: string
  onStage?: (stage: VideoRetrieveStage) => void | Promise<void>
}): Promise<VideoRetrieveResult> {
  const startedAt = Date.now();
  const eventId = publishInspectorRequest({
    source: 'main-video',
    transport: 'venice',
    endpoint: '/video/retrieve',
    method: 'POST',
    summaries: { taskId: input.queueId, model: input.model },
  });
  try {
    const result = await runVideoQueueResult(input);
    publishVideoCompletion(eventId, input, result, startedAt);
    return result;
  } catch (err) {
    publishVideoFailure(eventId, input, err, startedAt);
    throw err;
  }
}

async function runVideoQueueResult(
  input: {
    queueId: string
    model: string
    profileId: string
    queueDownloadUrl?: string
    onStage?: (stage: VideoRetrieveStage) => void | Promise<void>
  },
  options: { preferBinary?: boolean } = {},
): Promise<VideoRetrieveResult> {

    const apiKey = getApiKey(input.profileId)
    if (!apiKey) throw new VideoRetrieveError('Venice API key is not configured.', false, 401)
    const body = JSON.stringify(buildVideoRetrieveRequest(input.model, input.queueId))

    return await new Promise<VideoRetrieveResult>((resolve, reject) => {
      // nosec:js/file-access-to-http — The outbound body contains only
      // model + queueId (JSON-serialised from buildVideoRetrieveRequest).
      // File-bytes read during screenPersistedVideoMedia are never
      // included in the request payload; they gate whether the request
      // proceeds but do not reach the network.
      const request = https.request({
        hostname: VENICE_API_HOST,
        path: `${VENICE_API_BASE_PATH}/video/retrieve`,
        method: 'POST',
        timeout: VENICE_API_TIMEOUT_MS,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: options.preferBinary ? 'video/mp4' : 'application/json, video/mp4',
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
          // VF-FSM-002: pass a pre-commit screener so blocked bytes never
          // reach the durable store.  The fallback `screenPersistedVideoMedia`
          // post-commit path is kept for code paths that bypass the stream
          // (e.g. completed JSON with a download URL).
          const screenSample = getRuntimeLocalFamilySafeModeEnabled()
            ? async (sample: Buffer, mimeType: string) => {
                const result = await identifyAndValidateGeneratedMedia(sample, mimeType, true)
                return { allowed: result.allowed, userMessage: !result.allowed ? result.userMessage : undefined }
              }
            : undefined
          void persistGeneratedMp4Stream(response, {
            onSaving: () => input.onStage?.('saving'),
            screenSample,
          }).then(
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
          if (normalized.kind === 'needs-binary') {
            if (!options.preferBinary) {
              void runVideoQueueResult(input, { preferBinary: true }).then(resolve, reject)
              return
            }
            reject(new VideoRetrieveError('Video completed without a playable video response.', false))
            return
          }

          /** Screen an in-memory buffer through FSM before it is persisted. */
          const screenVideoBuffer = async (buffer: Buffer, mimeType: string): Promise<VideoRetrieveError | null> => {
            const fsm = getRuntimeLocalFamilySafeModeEnabled()
            if (!fsm) return null
            const screen = await identifyAndValidateGeneratedMedia(buffer, mimeType, fsm)
            if (!screen.allowed) {
              return new VideoRetrieveError(
                screen.userMessage || 'Video generation is not available while Family Safe Mode is enabled.',
                false
              )
            }
            return null
          }

          if (normalized.kind === 'download') {
            await input.onStage?.('retrieving')
            const media = await downloadGeneratedVideo(normalized.downloadUrl, { onSaving: () => input.onStage?.('saving') })
              .catch((error: unknown) => { throw classifyMediaFailure(error) })
            const fsmErr = await screenPersistedVideoMedia(media)
            if (fsmErr) throw fsmErr
            return resolve({ kind: 'completed', media })
          }
          if (normalized.kind === 'completed' && normalized.mediaUrl.startsWith('https://')) {
            await input.onStage?.('retrieving')
            const media = await downloadGeneratedVideo(normalized.mediaUrl, { onSaving: () => input.onStage?.('saving') })
              .catch((error: unknown) => { throw classifyMediaFailure(error) })
            const fsmErr = await screenPersistedVideoMedia(media)
            if (fsmErr) throw fsmErr
            return resolve({ kind: 'completed', media })
          }
          if (normalized.kind === 'completed' && normalized.mediaUrl.startsWith('data:')) {
            await input.onStage?.('retrieving')
            const commaIndex = normalized.mediaUrl.indexOf(',')
            const base64Data = commaIndex >= 0 ? normalized.mediaUrl.slice(commaIndex + 1) : ''
            const buffer = Buffer.from(base64Data, 'base64')
            const fsmErr = await screenVideoBuffer(buffer, normalized.mimeType)
            if (fsmErr) throw fsmErr
            await input.onStage?.('saving')
            const media = await persistGeneratedMedia(buffer, normalized.mimeType)
              .catch((error: unknown) => { throw classifyMediaFailure(error) })
            return resolve({ kind: 'completed', media })
          }
          if (!options.preferBinary) {
            void runVideoQueueResult(input, { preferBinary: true }).then(resolve, reject)
            return
          }
          reject(new VideoRetrieveError('Video retrieval returned inline media instead of a stream.', false))
        }, reject).catch(reject)
      })
      request.once('timeout', () => request.destroy(new VideoRetrieveError('Video retrieval timed out.', true)))
      request.once('error', (error) => reject(error instanceof VideoRetrieveError ? error : new VideoRetrieveError('Failed to reach Venice API.', true)))
      request.end(body)
    })

}

/* INSPECTOR_TELEMETRY_BODY_WIRED */

