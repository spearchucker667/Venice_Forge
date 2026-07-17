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
import type { ChatCompletionResponse, ImageGenerateResponse, MusicQueueResponse, VideoQueueResponse } from '../types/venice'
import { veniceFetch } from '../services/veniceClient/fetch'
import { buildAudioRetrieveRequest } from '../services/media-request-adapter'
import { normalizeAudioRetrieveResponse } from '../services/audio-retrieve-normalizer'
import { awaitWorkflowVideoTask } from '../services/workflow-background-task'

const POLL_INTERVAL_MS = 3000
const POLL_MAX_ATTEMPTS = 200 // ~10 minutes per node

export class WorkflowExecutionError extends Error {
  nodeId?: string
  constructor(message: string, nodeId?: string) {
    super(message)
    this.name = 'WorkflowExecutionError'
    this.nodeId = nodeId
  }
}

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

async function executeNode(
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
      const body: Record<string, unknown> = {
        model: data.model || DEFAULT_IMAGE_MODEL,
        prompt,
        negative_prompt: data.negativePrompt || undefined,
        steps: data.steps ?? 20,
        style_preset: data.style || undefined,
        width: data.width ?? 1024,
        height: data.height ?? 1024,
        hide_watermark: data.hideWatermark ?? true,
      }
      if (data.aspectRatio) body.aspect_ratio = data.aspectRatio
      const resp = await venice<ImageGenerateResponse>('/image/generate', {
        method: 'POST',
        body: JSON.stringify(body),
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
      const blob = await veniceBlob('/audio/speech', {
        model: data.model || DEFAULT_TTS_MODEL,
        input: text,
        voice: data.voice || 'af_sky',
        speed: data.speed ?? 1,
        response_format: data.responseFormat || 'mp3',
      }, { signal })
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
      const body: Record<string, unknown> = {
        model: data.model || DEFAULT_MUSIC_MODEL,
        prompt,
        duration_seconds: data.duration ?? 30,
        force_instrumental: data.instrumental ?? false,
      }
      if (data.lyrics) body.lyrics_prompt = data.lyrics
      const queueResp = await venice<MusicQueueResponse>('/audio/queue', {
        method: 'POST',
        body: JSON.stringify(body),
        signal,
      })
      for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        const response = await veniceFetch<unknown>('/audio/retrieve', {
          method: 'POST',
          body: buildAudioRetrieveRequest(queueResp.model || String(body.model), queueResp.queue_id),
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
      const body: Record<string, unknown> = {
        model: data.model || DEFAULT_VIDEO_MODEL,
        prompt,
        aspect_ratio: data.videoAspectRatio || '16:9',
      }
      if (data.videoDuration) body.duration = data.videoDuration
      if (data.videoResolution) body.resolution = data.videoResolution
      const queueResp = await venice<VideoQueueResponse>('/video/queue', {
        method: 'POST',
        body: JSON.stringify(body),
        signal,
      })
      const videoId = queueResp.queue_id || queueResp.id || ''
      if (!videoId) throw new WorkflowExecutionError('Video generation did not return a queue ID.')
      const { image_url: _imageUrl, end_image_url: _endImageUrl, audio_url: _audioUrl, video_url: _videoUrl, reference_image_urls: _referenceImages, scene_image_urls: _sceneImages, ...requestSummary } = body
      const url = await awaitWorkflowVideoTask({
        queueId: videoId,
        model: queueResp.model || String(body.model),
        request: requestSummary,
        ...(queueResp.download_url ? { queueDownloadUrl: queueResp.download_url } : {}),
        signal,
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
  onUpdate: (nodeId: string, result: Partial<NodeResult>) => void
}

export async function executeWorkflow(
  nodes: Node<VeniceNodeData>[],
  edges: Edge[],
  arg: ExecuteOptions | ((nodeId: string, result: Partial<NodeResult>) => void),
): Promise<void> {
  // Backwards-compatible: accept either an options bag or a bare onUpdate function.
  const opts: ExecuteOptions = typeof arg === 'function' ? { onUpdate: arg } : arg
  const { signal, isRunning, onUpdate } = opts

  if (isRunning) {
    throw new WorkflowExecutionError('Workflow is already running.')
  }

  const _runId = crypto.randomUUID()
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
          const output = await executeNode(node, input, levelCtrl.signal)
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
