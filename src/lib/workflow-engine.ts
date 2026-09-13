import { isElectron } from '../services/desktopBridge';
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_MUSIC_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_VIDEO_MODEL,
  DEFAULT_WORKFLOW_MODEL,
} from '../constants/venice'
import type { Node, Edge } from '@xyflow/react'
import type { VeniceNodeData, NodeResult } from '../stores/workflow-store'
import { NODE_SCHEMAS, type IOKind } from './workflow-schema'
import { validateWorkflow } from './workflow-validator'
import { venice, veniceBlob } from './venice-client'
import type { ChatCompletionResponse, ImageConstraints, ImageGenerateRequest, ImageGenerateResponse, MusicQueueResponse, VideoQueueResponse } from '../types/venice'
import {
  generateReplicateImage,
  replicateModelIdFromCatalog,
} from '../services/replicateImageClient'
import { veniceFetch } from '../services/veniceClient/fetch'
import {
  getCanonicalModelById,
  hasCanonicalModelCatalog,
} from '../services/modelCatalogCache'
import {
  buildDimensionOptions,
  getImageModelCapabilities,
} from '../config/image-model-capabilities'
import {
  buildCanonicalImageGeneratePayload,
  buildCanonicalAudioSpeechPayload,
  buildCanonicalAudioQueuePayload,
  buildCanonicalAudioRetrievePayload,
  buildCanonicalVideoQueuePayload,
} from '../shared/venice-media-contract'
import { normalizeAudioRetrieveResponse } from '../services/audio-retrieve-normalizer'
import { awaitWorkflowVideoTask } from '../services/workflow-background-task'
import { toUserFacingVideoError } from '../services/task-errors'
import { WorkflowExecutionError } from './workflow-errors'

export { WorkflowExecutionError }

const POLL_INTERVAL_MS = 3000
const POLL_MAX_ATTEMPTS = 200 // ~10 minutes per node

/** Returns a safe, generic error message for a failed node. Never exposes raw
 *  exception text, upstream error payloads, paths, or secrets to the UI. */
function safeNodeErrorMessage(node: Node<VeniceNodeData>): string {
  const kind = NODE_SCHEMAS[node.data.nodeType]?.label ?? 'Node'
  return `${kind} failed. Check your connection and try again.`
}

// Group nodes into topological "levels" — nodes within a level have no dependency
// on each other and can run in parallel. Returns null on cycle.
function topoLevels(nodes: Node<VeniceNodeData>[], edges: Edge[]): string[][] | null {
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const n of nodes) {
    inDegree.set(n.id, 0)
    adj.set(n.id, [])
  }
  for (const e of edges) {
    if (!inDegree.has(e.source) || !inDegree.has(e.target)) continue
    adj.get(e.source)!.push(e.target)
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
  }
  const levels: string[][] = []
  let frontier = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id)
  let visited = 0
  while (frontier.length > 0) {
    levels.push(frontier)
    visited += frontier.length
    const next: string[] = []
    for (const id of frontier) {
      for (const child of adj.get(id) ?? []) {
        const d = (inDegree.get(child) ?? 1) - 1
        inDegree.set(child, d)
        if (d === 0) next.push(child)
      }
    }
    frontier = next
  }
  return visited === nodes.length ? levels : null
}

function getInputs(nodeId: string, edges: Edge[], outputs: Map<string, string>): string {
  const parentEdges = edges.filter((e) => e.target === nodeId)
  const inputs = parentEdges.map((e) => outputs.get(e.source) ?? '').filter(Boolean)
  return inputs.join('\n\n')
}

function resolvePrompt(template: string, input: string): string {
  if (!template) return input
  if (template.includes('{{input}}')) return template.replace(/\{\{input\}\}/g, input)
  return input ? `${template}\n\n${input}` : template
}

function asImageConstraints(value: unknown): ImageConstraints | undefined {
  if (!value || typeof value !== 'object') return undefined
  if ('model_type' in (value as Record<string, unknown>)) return undefined
  return value as ImageConstraints
}

function resolveWorkflowImageGeneratePayload(
  data: VeniceNodeData,
  prompt: string,
): ReturnType<typeof buildCanonicalImageGeneratePayload> {
  const modelId = data.model || DEFAULT_IMAGE_MODEL
  if (replicateModelIdFromCatalog(modelId)) {
    return buildCanonicalImageGeneratePayload({
      model: modelId,
      prompt,
      negativePrompt: data.negativePrompt || undefined,
      width: data.width,
      height: data.height,
    })
  }
  const live = getCanonicalModelById(modelId)
  if (live?.model_spec?.offline) {
    throw new WorkflowExecutionError(`Image model '${modelId}' is offline.`)
  }
  if (hasCanonicalModelCatalog() && !live) {
    throw new WorkflowExecutionError(`Image model '${modelId}' is not available.`)
  }
  const constraints = asImageConstraints(live?.model_spec?.constraints)
  const caps = getImageModelCapabilities(modelId)
  const dim = buildDimensionOptions(modelId, constraints)
  const maxSteps = constraints?.steps?.max ?? 50
  const defaultSteps = constraints?.steps?.default ?? 20
  const requestedSteps = data.steps ?? defaultSteps
  const steps = Math.min(Math.max(1, requestedSteps), maxSteps)
  const aspectRatio = data.aspectRatio || dim.defaultDimensions.aspectRatio
  const width = aspectRatio ? undefined : (data.width ?? dim.defaultDimensions.width ?? 1024)
  const height = aspectRatio ? undefined : (data.height ?? dim.defaultDimensions.height ?? 1024)
  const payload = buildCanonicalImageGeneratePayload({
    model: modelId,
    prompt,
    negativePrompt: data.negativePrompt || undefined,
    steps: caps.supportsSteps === false ? undefined : steps,
    stylePreset: data.style || undefined,
    aspectRatio: aspectRatio || undefined,
    width,
    height,
    hideWatermark: data.hideWatermark ?? false,
  })
  if (caps.supportsHideWatermark === false) {
    delete (payload as { hide_watermark?: boolean }).hide_watermark
  }
  return payload
}

async function executeNode(
  runId: string | undefined,
  node: Node<VeniceNodeData>,
  input: string,
  signal?: AbortSignal,
): Promise<string> {
  const data = node.data
  switch (data.nodeType) {
    case 'textInput':
      return data.inputText ?? ''

    case 'output':
      return input

    case 'chat': {
      const prompt = resolvePrompt(data.prompt, input)
      const resp = await venice<ChatCompletionResponse>('/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model: data.model || DEFAULT_WORKFLOW_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: data.temperature ?? 0.7,
          max_tokens: data.maxTokens ?? 4096,
          venice_parameters: { enable_web_search: data.webSearch ?? 'off' },
        }),
        signal,
      })
      return resp.choices[0]?.message?.content ?? ''
    }

    case 'imageGen': {
      const prompt = resolvePrompt(data.prompt, input)
      const wirePayload = resolveWorkflowImageGeneratePayload(data, prompt)
      if (replicateModelIdFromCatalog(wirePayload.model)) {
        const queued = await generateReplicateImage(wirePayload as ImageGenerateRequest)
        const taskId = queued.taskId
        if (!taskId) throw new WorkflowExecutionError('Replicate generation did not return a task.')
        const { useBackgroundTaskStore } = await import('../stores/background-task-store')
        const resultUrl = await new Promise<string>((resolve, reject) => {
          let settled = false
          const finish = (cb: () => void) => {
            if (settled) return
            settled = true
            unsubscribe()
            signal?.removeEventListener('abort', onAbort)
            cb()
          }
          const inspect = () => {
            const task = useBackgroundTaskStore.getState().tasks[taskId]
            if (!task || ['completed', 'failed', 'aborted', 'timeout'].includes(task.status)) {
              if (task?.status === 'completed' && task.resultUrl) {
                finish(() => resolve(task.resultUrl!))
              } else {
                const err = task?.error || 'Replicate image generation failed.'
                finish(() => reject(new WorkflowExecutionError(err)))
              }
            }
          }
          const onAbort = () => finish(() => reject(new DOMException('Aborted', 'AbortError')))
          const unsubscribe = useBackgroundTaskStore.subscribe(inspect)
          signal?.addEventListener('abort', onAbort, { once: true })
          inspect()
        })
        return `[image:${resultUrl}]`
      }
      const resp = await venice<ImageGenerateResponse>('/image/generate', {
        method: 'POST',
        body: JSON.stringify(wirePayload),
        signal,
      })
      const img = resp.images[0]
      const b64 = typeof img === 'string' ? img : img.b64_json
      const mime = b64.startsWith('/9j/') ? 'image/jpeg'
        : b64.startsWith('iVBOR') ? 'image/png'
        : b64.startsWith('UklGR') ? 'image/webp'
        : 'image/png'
      return `[image:data:${mime};base64,${b64}]`
    }

    case 'tts': {
      const text = resolvePrompt(data.prompt, input)
      const wirePayload = buildCanonicalAudioSpeechPayload({
        model: data.model || DEFAULT_TTS_MODEL,
        input: text,
        voice: data.voice || 'af_sky',
        speed: data.speed ?? 1,
        responseFormat: (data.responseFormat as 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm') || 'mp3',
      })
      const blob = await veniceBlob('/audio/speech', wirePayload, { signal })
      const url = URL.createObjectURL(blob)
      // The blob URL's lifetime is owned by the component that renders the
      // `[audio:...]` output (see the Playground workflow renderer). The engine MUST NOT register
      // a global revocation here — the `finally { cleanup() }` block runs at
      // run completion, which is exactly when the preview component is
      // trying to play the audio. Registering now would silently revoke the
      // URL on every successful run.
      return `[audio:${url}]`
    }

    case 'music': {
      const prompt = resolvePrompt(data.prompt, input)
      const wirePayload = buildCanonicalAudioQueuePayload({
        model: data.model || DEFAULT_MUSIC_MODEL,
        prompt,
        durationSeconds: data.duration ?? 30,
        forceInstrumental: data.instrumental ?? false,
        lyricsPrompt: data.lyrics || undefined,
      })
      let queueResp: MusicQueueResponse
      let existingMusicTaskId: string | undefined
      if (isElectron()) {
        // On Electron: use the main-process paid-queue primitive — atomically
        // journals before dispatching, closing the crash window.
        const { desktopBackgroundTask } = await import('../services/desktopBridge')
        const submitRes = await desktopBackgroundTask.submitPaidQueue({
          operation: 'audio',
          wirePayload: wirePayload as unknown as Record<string, unknown>,
          logicalRequestHash: `${runId}-${node.id}`,
        })
        if (!submitRes.ok) {
          throw new WorkflowExecutionError(submitRes.error || 'Music generation failed.')
        }
        if (!submitRes.task?.queueId) {
          throw new WorkflowExecutionError('Music generation did not return a queue ID.')
        }
        existingMusicTaskId = submitRes.task.id
        queueResp = {
          id: submitRes.task.queueId,
          queue_id: submitRes.task.queueId,
          model: submitRes.task.modelId || String(wirePayload.model),
          status: 'queued',
        }
      } else {
        queueResp = await venice<MusicQueueResponse>('/audio/queue', {
          method: 'POST',
          body: JSON.stringify(wirePayload),
          signal,
        })
      }

      if (existingMusicTaskId) {
        // VF-PQ-003-music: On Electron the task was already created and
        // polled by the main process.  Await its completion instead of
        // running a duplicate renderer-side poll loop.
        const { useBackgroundTaskStore } = await import('../stores/background-task-store')
        const result = await new Promise<string>((resolve, reject) => {
          let settled = false
          const finish = (cb: () => void) => {
            if (settled) return
            settled = true
            unsubscribe()
            signal?.removeEventListener('abort', onAbort)
            cb()
          }
          const inspect = () => {
            const task = useBackgroundTaskStore.getState().tasks[existingMusicTaskId]
            if (!task || ['completed', 'failed', 'aborted', 'timeout'].includes(task.status)) {
              if (task?.status === 'completed' && task.resultUrl) {
                finish(() => resolve(task.resultUrl!))
              } else {
                const err = task?.error || 'Music generation failed.'
                finish(() => reject(new WorkflowExecutionError(err)))
              }
            }
          }
          const onAbort = () => finish(() => reject(new DOMException('Aborted', 'AbortError')))
          const unsubscribe = useBackgroundTaskStore.subscribe(inspect)
          signal?.addEventListener('abort', onAbort, { once: true })
          inspect()
        })
        // Main-owned tasks store the result as a venice-media:// URL.
        // The renderer can reference it directly.
        return result
      }

      // Web path: renderer-owned poll loop.
      for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        const retrievePayload = buildCanonicalAudioRetrievePayload({
          model: queueResp.model || String(wirePayload.model),
          queueId: queueResp.queue_id,
        })
        const response = await veniceFetch<unknown>('/audio/retrieve', {
          method: 'POST',
          body: retrievePayload,
          signal,
          retry: false,
        })
        const normalized = normalizeAudioRetrieveResponse(response.data, response.headers)
        if (normalized.kind === 'completed') return `[audio:data:${normalized.mimeType};base64,${normalized.dataBase64}]`
        if (normalized.kind === 'failed') throw new WorkflowExecutionError('Audio generation failed.')
      }
      throw new WorkflowExecutionError('Audio generation timed out.')
    }

    case 'video': {
      const prompt = resolvePrompt(data.prompt, input)
      // QueueVideoRequest requires `duration`; fail locally instead of
      // dispatching a body the provider must reject. The workflow schema
      // already requires a non-empty duration, so this is a fail-closed
      // boundary for malformed or legacy node state.
      const duration = typeof data.videoDuration === 'string' && data.videoDuration.trim()
        ? data.videoDuration.trim()
        : ''
      if (!duration) {
        throw new WorkflowExecutionError('Video generation requires a clip duration. Set the duration in the Video Gen node.')
      }
      const wirePayload = buildCanonicalVideoQueuePayload({
        model: data.model || DEFAULT_VIDEO_MODEL,
        prompt,
        aspectRatio: data.videoAspectRatio || '16:9',
        duration,
        resolution: data.videoResolution || undefined,
      })
      let videoId = ''
      let queueResp: VideoQueueResponse | undefined
      let existingTaskId: string | undefined
      try {
        if (isElectron()) {
          const { desktopBackgroundTask } = await import('../services/desktopBridge')
          const submitRes = await desktopBackgroundTask.submitPaidQueue({
            operation: 'video',
            wirePayload: wirePayload as unknown as Record<string, unknown>,
            logicalRequestHash: `${runId}-${node.id}`,
          })
          if (!submitRes.ok) {
            throw new WorkflowExecutionError(submitRes.error || 'Video generation failed.')
          }
          if (!submitRes.task?.queueId) {
            throw new WorkflowExecutionError('Video generation did not return a queue ID.')
          }
          videoId = submitRes.task.queueId
          existingTaskId = submitRes.task.id
          queueResp = {
            id: videoId,
            queue_id: videoId,
            model: submitRes.task.modelId || String(wirePayload.model),
          }
        } else {
          queueResp = await venice<VideoQueueResponse>('/video/queue', {
            method: 'POST',
            body: JSON.stringify(wirePayload),
            signal,
          })
          videoId = queueResp.queue_id || queueResp.id || ''
          if (!videoId) throw new WorkflowExecutionError('Video generation did not return a queue ID.')
        }
      } catch (err) {
        if (err instanceof WorkflowExecutionError) throw err
        throw new WorkflowExecutionError(toUserFacingVideoError(err, 'Video generation failed.'))
      }
      
      const { image_url: _imageUrl, end_image_url: _endImageUrl, audio_url: _audioUrl, video_url: _videoUrl, reference_image_urls: _referenceImages, scene_image_urls: _sceneImages, ...requestSummary } = wirePayload
      const url = await awaitWorkflowVideoTask({
        queueId: videoId,
        model: queueResp.model || String(wirePayload.model),
        request: requestSummary,
        runId: runId,
        nodeId: node.id,
        ...(queueResp.download_url ? { queueDownloadUrl: queueResp.download_url } : {}),
        signal,
        // On Electron, submitPaidQueue already created & journaled the task.
        // Pass its ID so we monitor it instead of creating a duplicate poller.
        ...(existingTaskId ? { existingTaskId } : {}),
      })
      return `[video:${url}]`
    }
  }
}

export interface ExecuteOptions {
  signal?: AbortSignal
  /** When true, the engine will refuse to start — the caller must guard
   *  against concurrent runs.  This is an engine-level invariant, not a
   *  UI-only check. */
  isRunning?: boolean
  runId?: string
  onUpdate?: (nodeId: string, result: Partial<NodeResult>) => void
}

export async function executeWorkflow(
  nodes: Node<VeniceNodeData>[],
  edges: Edge[],
  arg?: ExecuteOptions | ((nodeId: string, result: Partial<NodeResult>) => void),
): Promise<void> {
  // Backwards-compatible: accept either an options bag or a bare onUpdate function.
  const opts: ExecuteOptions = typeof arg === 'function' ? { onUpdate: arg } : (arg ?? {})
  const { signal, isRunning } = opts
  const onUpdate = opts.onUpdate ?? (() => {})

  if (isRunning) {
    throw new WorkflowExecutionError('Workflow is already running.')
  }

  const _runId = opts.runId || crypto.randomUUID()
  const validation = validateWorkflow({ nodes, edges })
  if (!validation.ok) {
    const first = validation.errors[0]
    throw new WorkflowExecutionError(first?.message ?? 'Workflow has validation errors.', first?.nodeId)
  }

  const levels = topoLevels(nodes, edges)
  if (!levels) throw new WorkflowExecutionError('Workflow contains a cycle.')

  const outputs = new Map<string, string>()
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  // Per-node media output lifecycle is owned by the render layer (see
  // the Playground workflow renderer). The engine MUST NOT revoke media URLs in a
  // run-completion `finally` — previews try to play the audio as soon as the
  // run completes. The engine remains cancellation-safe: an AbortSignal
  // surfaces DOMException aborts that the renderer's <audio src=...> element
  // can react to via React unmount when the user-led "Stop" path runs.
  for (const level of levels) {
    if (signal?.aborted) return
    const levelCtrl = new AbortController()
    const onParentAbort = () => levelCtrl.abort()
    if (signal) signal.addEventListener('abort', onParentAbort)

    try {
      // Run all nodes at this dependency level in parallel.
      await Promise.all(level.map(async (nodeId) => {
        const node = nodeMap.get(nodeId)
        if (!node) return
        onUpdate(nodeId, { status: 'running', output: undefined, error: undefined })
        try {
          const input = getInputs(nodeId, edges, outputs)
          const output = await executeNode(_runId, node, input, levelCtrl.signal)
          outputs.set(nodeId, output)
          const kind = NODE_SCHEMAS[node.data.nodeType]?.output as IOKind | undefined
          const outputKind = kind && kind !== 'none' ? (kind as NodeResult['outputKind']) : undefined
          onUpdate(nodeId, { status: 'done', output, outputKind })
        } catch (err) {
          levelCtrl.abort() // Immediately abort sibling tasks in this level
          if (err instanceof DOMException && err.name === 'AbortError') {
            onUpdate(nodeId, { status: 'error', error: 'Cancelled' })
            throw err
          }
          // T-134: never surface raw exception text, upstream payloads, paths,
          // or secrets in the UI or thrown error. Use a safe node-level message.
          const message = err instanceof WorkflowExecutionError
            ? err.message
            : safeNodeErrorMessage(node)
          onUpdate(nodeId, { status: 'error', error: message })
          throw new WorkflowExecutionError(message, nodeId)
        }
      }))
    } finally {
      if (signal) signal.removeEventListener('abort', onParentAbort)
    }
  }
}
