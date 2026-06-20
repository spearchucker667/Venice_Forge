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
import type { ChatCompletionResponse, ImageGenerateResponse, MusicQueueResponse, MusicRetrieveResponse, VideoQueueResponse, VideoRetrieveResponse } from '../types/venice'

const POLL_INTERVAL_MS = 3000
const POLL_MAX_ATTEMPTS = 200 // ~10 minutes per node

/** Maximum time a job can stay in 'queued' / 'pending' before we abort.
 *  A job that the upstream never picks up within this window is considered
 *  stuck and we surface a clear error rather than burning the full 10
 *  minutes of poll budget. */
const QUEUE_TIMEOUT_MS = 60_000;

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

interface PollOptions<T> {
  path: string
  id: string
  kind: string
  getStatus: (r: T) => string
  getResult: (r: T) => string | undefined
  signal?: AbortSignal
}

async function pollUntilDone<T>({ path, id, kind, getStatus, getResult, signal }: PollOptions<T>): Promise<string> {
  const queueStartedAt = Date.now();
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, POLL_INTERVAL_MS)
      signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
    })
    const result = await venice<T>(path, {
      method: 'POST',
      body: JSON.stringify({ id }),
      signal,
    })
    const status = getStatus(result).toLowerCase()
    if (status === 'completed') {
      const url = getResult(result)
      if (url) return url
      throw new WorkflowExecutionError(`${kind} generation finished but produced no output.`)
    }
    if (status === 'failed') {
      // Never surface the upstream error payload (T-135): it may contain paths,
      // internal identifiers, or provider-specific exception text.
      throw new WorkflowExecutionError(`${kind} generation failed.`)
    }
    // Per-stage queue timeout: if a job is still 'queued' or 'pending' after
    // QUEUE_TIMEOUT_MS, abort with a clear error instead of burning the
    // full POLL_MAX_ATTEMPTS budget.
    if ((status === 'queued' || status === 'pending') && Date.now() - queueStartedAt > QUEUE_TIMEOUT_MS) {
      throw new WorkflowExecutionError(`${kind} generation timed out waiting in queue.`)
    }
  }
  throw new WorkflowExecutionError(`${kind} generation timed out.`)
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
      return `[audio:${URL.createObjectURL(blob)}]`
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
      const url = await pollUntilDone<MusicRetrieveResponse>({
        path: '/audio/retrieve',
        id: queueResp.queue_id,
        kind: 'Audio',
        getStatus: (r) => r.status,
        getResult: (r) => r.audio_url,
        signal,
      })
      return `[audio:${url}]`
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
      const url = await pollUntilDone<VideoRetrieveResponse>({
        path: '/video/retrieve',
        id: videoId,
        kind: 'Video',
        getStatus: (r) => r.status,
        getResult: (r) => r.video_url,
        signal,
      })
      return `[video:${url}]`
    }
  }
}

export interface ExecuteOptions {
  signal?: AbortSignal
  onUpdate: (nodeId: string, result: Partial<NodeResult>) => void
}

export async function executeWorkflow(
  nodes: Node<VeniceNodeData>[],
  edges: Edge[],
  arg: ExecuteOptions | ((nodeId: string, result: Partial<NodeResult>) => void),
): Promise<void> {
  // Backwards-compatible: accept either an options bag or a bare onUpdate function.
  const opts: ExecuteOptions = typeof arg === 'function' ? { onUpdate: arg } : arg
  const { signal, onUpdate } = opts

  const validation = validateWorkflow({ nodes, edges })
  if (!validation.ok) {
    const first = validation.errors[0]
    throw new WorkflowExecutionError(first?.message ?? 'Workflow has validation errors.', first?.nodeId)
  }

  const levels = topoLevels(nodes, edges)
  if (!levels) throw new WorkflowExecutionError('Workflow contains a cycle.')

  const outputs = new Map<string, string>()
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  for (const level of levels) {
    if (signal?.aborted) return
    // Run all nodes at this dependency level in parallel.
    await Promise.all(level.map(async (nodeId) => {
      const node = nodeMap.get(nodeId)
      if (!node) return
      onUpdate(nodeId, { status: 'running', output: undefined, error: undefined })
      try {
        const input = getInputs(nodeId, edges, outputs)
        const output = await executeNode(node, input, signal)
        outputs.set(nodeId, output)
        const kind = NODE_SCHEMAS[node.data.nodeType]?.output as IOKind | undefined
        const outputKind = kind && kind !== 'none' ? (kind as NodeResult['outputKind']) : undefined
        onUpdate(nodeId, { status: 'done', output, outputKind })
      } catch (err) {
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
  }
}
