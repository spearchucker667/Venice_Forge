import { venice } from './venice-client'
import { NODE_SCHEMAS } from './workflow-schema'
import type { WorkflowPatch } from './workflow-mutations'
import type { ChatCompletionResponse, ModelCapabilities } from '../types/venice'
import type { Node, Edge } from '@xyflow/react'
import type { VeniceNodeData, VeniceNodeType } from '../stores/workflow-store'
import type { ModelCatalog } from '../hooks/use-model-catalog'

export interface AgentResponse {
  say: string
  patches: WorkflowPatch[]
  invalidPatches: number
}

const VALID_OPS = new Set(['add_node', 'remove_node', 'set_params', 'move_node', 'connect', 'disconnect', 'clear'])

// Empirically validated default — see scripts/agent-bench results.
// qwen3-next-80b: ~2s, perfect output, supports response_format.
export const DEFAULT_AGENT_MODEL = 'qwen3-next-80b'

function nodeCatalog(): string {
  return Object.values(NODE_SCHEMAS)
    .map((s) => {
      const params = s.params
        .map((p) => {
          const bits = [`${p.name}: ${p.type}${p.required ? ' (required)' : ''}`]
          if (p.default !== undefined && p.default !== '') bits.push(`default=${JSON.stringify(p.default)}`)
          if (p.enumValues) bits.push(`one of [${p.enumValues.filter(Boolean).join(', ')}]`)
          if (p.min !== undefined || p.max !== undefined) bits.push(`range ${p.min ?? '-'}..${p.max ?? '-'}`)
          return `    - ${bits.join(' — ')}`
        })
        .join('\n')
      return `- ${s.type} (${s.label}) | input=${s.input} output=${s.output}\n  ${s.description}${params ? `\n  params:\n${params}` : ''}`
    })
    .join('\n\n')
}

function modelMenu(catalog: ModelCatalog | undefined): string {
  if (!catalog) return ''
  const sections: string[] = []
  if (catalog.text.length) sections.push(`chat: ${catalog.text.join(', ')}`)
  if (catalog.image.length) sections.push(`imageGen: ${catalog.image.join(', ')}`)
  if (catalog.tts.length) sections.push(`tts: ${catalog.tts.join(', ')}`)
  if (catalog.music.length) sections.push(`music: ${catalog.music.join(', ')}`)
  if (catalog.video.length) sections.push(`video: ${catalog.video.join(', ')}`)
  if (sections.length === 0) return ''
  return `\n\nAvailable models per node type (use ONLY these ids; pick the one that best matches the user's intent or use the default if no preference):\n${sections.map((s) => `- ${s}`).join('\n')}`
}

const SYSTEM_PROMPT_BASE = `You are a workflow designer for OpenVenice. You help the user author visual workflows that chain Venice AI models.

You have these node types available:

${nodeCatalog()}

You respond by emitting patches to mutate the current draft workflow. Each patch is one of:
- {"op":"add_node","nodeType":"<type>","id":"optional_id","params":{...}} — add a new node
- {"op":"set_params","id":"<node_id>","params":{...}} — update a node's params
- {"op":"connect","source":"<node_id>","target":"<node_id>"} — connect two nodes
- {"op":"disconnect","id":"<edge_id>"} — remove an edge
- {"op":"remove_node","id":"<node_id>"} — remove a node
- {"op":"clear"} — remove all nodes and edges

RULES:
1. Every response MUST be a single valid JSON object, nothing before or after. Do not wrap in markdown fences.
2. Schema: {"say": string, "patches": Array<Patch>}.
3. "say" is a short (1–3 sentences) narration of what you just did or a question to the user.
4. When building a new workflow from scratch, start with {"op":"clear"} then add nodes top-to-bottom and connect them.
5. Always assign explicit ids when adding multiple nodes in one turn so you can reference them in connect patches.
6. Workflows need at least one textInput (or a generation node with a self-contained prompt) and an output node at the end.
7. Use {{input}} inside a node's prompt to place upstream text precisely, or leave prompt empty to append input after.
8. Keep to the param names and enum values listed above. Omit params to accept defaults.
9. If the user just asks a question, respond with a "say" and an empty "patches" array.
10. Do not narrate patches you aren't emitting. Do not produce commentary outside the JSON.

Example response:
{"say":"I built a pipeline that researches a topic, summarizes it, and narrates the summary.","patches":[{"op":"clear"},{"op":"add_node","nodeType":"textInput","id":"in","params":{"inputText":"Quantum computing progress in 2025"}},{"op":"add_node","nodeType":"chat","id":"research","params":{"prompt":"Research this topic thoroughly.","webSearch":"on"}},{"op":"add_node","nodeType":"chat","id":"summary","params":{"prompt":"Summarize into 5 bullet points.","temperature":0.3}},{"op":"add_node","nodeType":"tts","id":"narrate","params":{"voice":"af_sky"}},{"op":"add_node","nodeType":"output","id":"out"},{"op":"connect","source":"in","target":"research"},{"op":"connect","source":"research","target":"summary"},{"op":"connect","source":"summary","target":"narrate"},{"op":"connect","source":"narrate","target":"out"}]}`

function buildSystemPrompt(catalog?: ModelCatalog): string {
  return SYSTEM_PROMPT_BASE + modelMenu(catalog)
}

function describeDraft(draft: { nodes: Node<VeniceNodeData>[]; edges: Edge[] }): string {
  if (draft.nodes.length === 0) return 'Current draft is empty.'
  const nodeLines = draft.nodes.map((n) => {
    const params: string[] = []
    const data = n.data as unknown as Record<string, unknown>
    for (const p of NODE_SCHEMAS[n.data.nodeType]?.params ?? []) {
      const v = data[p.name]
      if (v !== undefined && v !== '' && v !== null) {
        const s = typeof v === 'string' ? (v.length > 60 ? v.slice(0, 60) + '…' : v) : JSON.stringify(v)
        params.push(`${p.name}=${s}`)
      }
    }
    return `  - ${n.id} [${n.data.nodeType}] ${params.join(' ')}`
  })
  const edgeLines = draft.edges.map((e) => `  - ${e.id}: ${e.source} → ${e.target}`)
  return `Current draft:\nNodes:\n${nodeLines.join('\n')}\nEdges:\n${edgeLines.join('\n') || '  (none)'}`
}

function extractJson(raw: string): string {
  const trimmed = raw.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) return fence[1].trim()
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) return trimmed.slice(first, last + 1)
  return trimmed
}

function isValidPatch(p: unknown): p is WorkflowPatch {
  if (!p || typeof p !== 'object') return false
  const obj = p as Record<string, unknown>
  if (typeof obj.op !== 'string' || !VALID_OPS.has(obj.op)) return false
  switch (obj.op) {
    case 'clear':
      return true
    case 'add_node':
      return typeof obj.nodeType === 'string' && obj.nodeType in NODE_SCHEMAS
    case 'remove_node':
    case 'disconnect':
      return typeof obj.id === 'string' && obj.id.length > 0
    case 'set_params':
      return typeof obj.id === 'string' && obj.id.length > 0 && typeof obj.params === 'object' && obj.params !== null
    case 'move_node':
      return typeof obj.id === 'string' && typeof obj.position === 'object' && obj.position !== null
    case 'connect':
      return typeof obj.source === 'string' && typeof obj.target === 'string' && obj.source !== obj.target
  }
  return false
}

function sanitizeParams(nodeType: VeniceNodeType, params: Record<string, unknown>): Partial<VeniceNodeData> {
  const schema = NODE_SCHEMAS[nodeType]
  if (!schema) return {}
  const allowed = new Set(['model', 'prompt', ...schema.params.map((p) => p.name)])
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params)) {
    if (!allowed.has(k)) continue
    out[k] = v
  }
  return out as Partial<VeniceNodeData>
}

export function parseAgentResponse(raw: string): AgentResponse {
  const json = extractJson(raw)
  let parsed: { say?: unknown; patches?: unknown }
  try {
    parsed = JSON.parse(json) as { say?: unknown; patches?: unknown }
  } catch {
    return { say: '', patches: [], invalidPatches: 0 }
  }
  const say = typeof parsed.say === 'string' ? parsed.say : ''
  const rawPatches = Array.isArray(parsed.patches) ? parsed.patches : []
  const patches: WorkflowPatch[] = []
  let invalidPatches = 0
  for (const raw of rawPatches) {
    if (!isValidPatch(raw)) { invalidPatches++; continue }
    if (raw.op === 'add_node' && raw.params) {
      patches.push({ ...raw, params: sanitizeParams(raw.nodeType, raw.params as Record<string, unknown>) })
    } else if (raw.op === 'set_params') {
      patches.push(raw)
    } else {
      patches.push(raw)
    }
  }
  return { say, patches, invalidPatches }
}

interface CallAgentOptions {
  userMessage: string
  draft: { nodes: Node<VeniceNodeData>[]; edges: Edge[] }
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  catalog?: ModelCatalog
  model?: string
  /** Capabilities of the chosen model. Used to skip response_format on models that 400 on it. */
  capabilities?: ModelCapabilities
  signal?: AbortSignal
}

async function singleCall(opts: {
  model: string
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  temperature: number
  useResponseFormat: boolean
  signal?: AbortSignal
}): Promise<string> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature,
    max_tokens: 4096,
  }
  if (opts.useResponseFormat) body.response_format = { type: 'json_object' }
  const resp = await venice<ChatCompletionResponse>('/chat/completions', {
    method: 'POST',
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  return resp.choices[0]?.message?.content ?? ''
}

export async function callAgent({ userMessage, draft, history, catalog, model, capabilities, signal }: CallAgentOptions): Promise<AgentResponse> {
  const chosenModel = model || DEFAULT_AGENT_MODEL
  // Only request structured output if the model supports it. Sending response_format
  // to llama-3.3-70b returns HTTP 400; sending it to gpt-4o-mini degrades quality.
  const useRF = capabilities?.supportsResponseSchema === true
  const messages = [
    { role: 'system' as const, content: buildSystemPrompt(catalog) },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: `${describeDraft(draft)}\n\nUser: ${userMessage}\n\nReply with a single JSON object: {"say": "...", "patches": [...]}. No prose, no markdown fences.` },
  ]

  const raw = await singleCall({ model: chosenModel, messages, temperature: 0.3, useResponseFormat: useRF, signal })
  const parsed = parseAgentResponse(raw)

  if (parsed.patches.length === 0 && !parsed.say && raw.length > 0) {
    const retryMessages = [
      ...messages,
      { role: 'assistant' as const, content: raw },
      { role: 'user' as const, content: 'That was not valid JSON. Reply again with ONLY a single JSON object matching {"say": string, "patches": Patch[]}. No commentary, no fences.' },
    ]
    try {
      const retryRaw = await singleCall({ model: chosenModel, messages: retryMessages, temperature: 0, useResponseFormat: useRF, signal })
      return parseAgentResponse(retryRaw)
    } catch {
      // fall through with the original (empty) response
    }
  }

  return parsed
}
