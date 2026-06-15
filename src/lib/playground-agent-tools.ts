/**
 * Tool-calling architecture for the playground meta-agent.
 *
 * Why: the legacy "emit one big JSON of patches" design has fragile failure modes
 * (parse failures, invented template syntax, no recourse from errors). By exposing
 * the same operations as tool calls, the agent:
 *   - cannot return prose by accident — Venice enforces tool shape
 *   - sees the result of each call (success, error, generated id) and self-corrects
 *   - streams visible activity to the UI as nodes appear on the canvas
 *
 * The runner loops `chat.completions` calls. Each iteration returns either:
 *   - text content (no tool calls) → final
 *   - tool_calls[] → we apply, return results, continue
 *   - a `done` or `ask_user` tool → terminal
 */

import { venice } from './venice-client'
import { generateId } from './utils'
import { NODE_SCHEMAS } from './workflow-schema'
import type { WorkflowPatch } from './workflow-mutations'
import type { ModelCapabilities } from '../types/venice'
import type { Node, Edge } from '@xyflow/react'
import type { VeniceNodeData, VeniceNodeType } from '../stores/workflow-store'
import type { ModelCatalog } from '../hooks/use-model-catalog'
import type { AgentModel } from '../hooks/use-agent-models'

// ---- Tool schema (OpenAI-compatible) ---------------------------------------

const NODE_TYPES = Object.keys(NODE_SCHEMAS) as VeniceNodeType[]

// Safe identifiers: alphanumeric, underscore, hyphen; capped to avoid injection
// or overflow from model-supplied ids.
const MAX_ID_LEN = 64
const ID_RE = /^[a-zA-Z0-9_-]+$/

function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_ID_LEN && ID_RE.test(value)
}

function safeIdError(field: string): string {
  return `Invalid ${field}. Use up to ${MAX_ID_LEN} alphanumeric characters, hyphens, or underscores.`
}

// Union of all known node params so the tool schemas can declare
// additionalProperties: false rather than allowing arbitrary keys.
const PARAM_SCHEMA_PROPERTIES: Record<string, { type: ('string' | 'number' | 'boolean')[] }> = {}
for (const schema of Object.values(NODE_SCHEMAS)) {
  for (const p of schema.params) {
    PARAM_SCHEMA_PROPERTIES[p.name] = { type: ['string', 'number', 'boolean'] }
  }
}

interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

const TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'clear',
      description: 'Remove all nodes and edges. Use when starting a fresh workflow.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_node',
      description:
        'Add a node to the canvas. Returns the assigned id (use it for connect calls). ' +
        'For "params": include only the fields you want to set; defaults apply otherwise. ' +
        'Use {{input}} inside any prompt field to inject upstream text.',
      parameters: {
        type: 'object',
        properties: {
          node_type: {
            type: 'string',
            enum: NODE_TYPES,
            description: 'The kind of node to add.',
          },
          id: {
            type: 'string',
            pattern: '^[a-zA-Z0-9_-]{1,64}$',
            maxLength: MAX_ID_LEN,
            description: 'Optional explicit id. If omitted, a uuid is generated. Use this id in subsequent connect/set_params calls.',
          },
          params: {
            type: 'object',
            description: 'Node-specific params (model, prompt, temperature, etc). See system prompt for the full schema per node type.',
            properties: PARAM_SCHEMA_PROPERTIES,
            additionalProperties: false,
          },
        },
        required: ['node_type'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'connect',
      description: 'Connect two nodes (data flows from source to target).',
      parameters: {
        type: 'object',
        properties: {
          source: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,64}$', maxLength: MAX_ID_LEN, description: 'Source node id.' },
          target: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,64}$', maxLength: MAX_ID_LEN, description: 'Target node id.' },
        },
        required: ['source', 'target'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_params',
      description: 'Update params on an existing node. Merged with current params.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,64}$', maxLength: MAX_ID_LEN },
          params: { type: 'object', properties: PARAM_SCHEMA_PROPERTIES, additionalProperties: false },
        },
        required: ['id', 'params'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_node',
      description: 'Remove a node and all its connected edges.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,64}$', maxLength: MAX_ID_LEN } },
        required: ['id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pick_model',
      description:
        'Get a recommended model id for a node type, optionally biased by preference. ' +
        'Use this BEFORE add_node if unsure which id to use — you will get back an id you can pass directly.',
      parameters: {
        type: 'object',
        properties: {
          node_type: {
            type: 'string',
            enum: ['chat', 'imageGen', 'tts', 'music', 'video'],
          },
          prefer: {
            type: 'string',
            enum: ['fast', 'best', 'web', 'reasoning', 'uncensored'],
            description:
              "'fast' = cheap & quick (default), 'best' = highest quality, 'web' = native web search, 'reasoning' = chain-of-thought, 'uncensored' = no refusals.",
          },
        },
        required: ['node_type'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description:
        'Pause the build to ask the user a clarifying question (e.g., "Vertical (9:16) or square (1:1)?"). The build will resume on their reply.',
      parameters: {
        type: 'object',
        properties: { question: { type: 'string', maxLength: 500 } },
        required: ['question'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'done',
      description:
        'Signal the workflow is complete. Provide a one-sentence summary of what you built for the user.',
      parameters: {
        type: 'object',
        properties: { summary: { type: 'string', maxLength: 500 } },
        required: ['summary'],
        additionalProperties: false,
      },
    },
  },
]

// ---- System prompt ---------------------------------------------------------

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

const SYSTEM_PROMPT = `You are a workflow designer for Venice Forge. You build visual workflows that chain Venice AI models by calling tools.

Available node types:

${nodeCatalog()}

How you work:
1. Use the provided tools — never reply with prose-only when actions are needed.
2. For a fresh build, call clear() first, then add_node(...) for each step, then connect(source, target) edges, then done(summary).
3. Always assign explicit ids when adding nodes (e.g., id="research", "script", "video"), so you can reference them in connect/set_params calls.
4. **Templates**: Inside any prompt/inputText field, use {{input}} to inject the concatenated text from upstream parents. There is no {{node_id}} syntax — referencing other nodes by name does NOT work. Each node only sees {{input}} = its parents' outputs joined.
5. **No placeholder content**: write inputText fields with realistic example content the user will likely keep, not "Enter the topic here".
6. **Model ids must come from the live Venice catalog** — DO NOT guess names like "suno-v3" or "runway-gen-2". When in doubt, call pick_model({node_type, prefer}) FIRST and use its returned id. add_node will reject unknown model ids and tell you to call pick_model.
7. **Cost & speed**: prefer fast cheap chat models (qwen3-next-80b, mistral-small-3-2-24b-instruct, zai-org-glm-4.7). Only escalate to claude-opus or qwen-thinking when the task explicitly demands top reasoning. Use pick_model with prefer="fast" by default, "best" for premium quality, "web" for native search, "reasoning" for analysis-heavy tasks.
8. **Web search**: only useful on chat nodes whose model has supportsWebSearch. pick_model({node_type:"chat", prefer:"web"}) returns a good one.
9. **For social-video / reel requests**: canonical shape is textInput → chat(research, web) → chat(script) → video (9:16, 1080p, 5-10s) → output. For music: add a SEPARATE branch (textInput → music → output) — DO NOT connect music nodes to video nodes; they can't compose into a single AV file from this engine. Each modality gets its own output.
10. If the request is ambiguous (which platform? which style?), call ask_user with one specific question.
11. End every successful build with done(summary).

Workflows must terminate at an output node (or the user won't see results). Multiple branches with their own outputs are fine and encouraged for multi-modal results.`

// ---- Runner ---------------------------------------------------------------

const MAX_ITERATIONS = 16 // some models batch poorly (one tool call per turn) and need headroom

export interface RunStep {
  tool: string
  args: Record<string, unknown>
  result: ToolResult
}

export interface RunResult {
  say: string
  tool_calls: number
  asked_user: boolean
}

interface ToolResult {
  ok?: boolean
  id?: string
  edge_id?: string
  model?: string
  error?: string
  message?: string
}

export interface RunOptions {
  userMessage: string
  draft: { nodes: Node<VeniceNodeData>[]; edges: Edge[] }
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  catalog?: ModelCatalog
  agentModels?: AgentModel[]
  model: string
  capabilities?: ModelCapabilities
  signal?: AbortSignal
  /** Apply a single patch to the live canvas. Returns the result the agent will see. */
  applyPatch: (patch: WorkflowPatch) => { ok: true; id?: string; edge_id?: string } | { error: string }
  /** Called after each tool execution (for streaming UI). */
  onStep?: (step: RunStep) => void
}

interface AssistantMessage {
  role: 'assistant'
  content: string | null
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
}

interface ToolMessage {
  role: 'tool'
  tool_call_id: string
  content: string
}

interface SystemMessage { role: 'system'; content: string }
interface UserMessage { role: 'user'; content: string }
type ChatMessage = SystemMessage | UserMessage | AssistantMessage | ToolMessage

interface ToolCallResponse {
  choices: Array<{
    message: AssistantMessage
    finish_reason: string
  }>
}

function describeDraft(draft: { nodes: Node<VeniceNodeData>[]; edges: Edge[] }): string {
  if (draft.nodes.length === 0) return 'Current draft is empty.'
  const ns = draft.nodes.map((n) => `  - ${n.id} [${n.data.nodeType}]`).join('\n')
  const es = draft.edges.map((e) => `  - ${e.source} → ${e.target}`).join('\n') || '  (none)'
  return `Current draft:\nNodes:\n${ns}\nEdges:\n${es}`
}

function isModelValid(nodeType: VeniceNodeType, modelId: string, opts: RunOptions): boolean {
  const c = opts.catalog
  if (!c) return true // can't verify — accept rather than block
  if (nodeType === 'chat') return c.text.includes(modelId)
  if (nodeType === 'imageGen') return c.image.includes(modelId)
  if (nodeType === 'tts') return c.tts.includes(modelId)
  if (nodeType === 'music') return c.music.includes(modelId)
  if (nodeType === 'video') return c.video.includes(modelId)
  return true // textInput / output don't have models
}

function pickModel(nodeType: string, prefer: string | undefined, opts: RunOptions): string | undefined {
  const catalog = opts.catalog
  if (!catalog) return undefined

  if (nodeType === 'chat') {
    const agent = opts.agentModels ?? []
    if (agent.length === 0) return catalog.text[0]
    // Score models for the requested preference
    const scored = agent.map((m) => {
      let score = 0
      const c = m.capabilities
      if (prefer === 'web') score += c.supportsWebSearch ? 100 : 0
      if (prefer === 'reasoning') score += c.supportsReasoning ? 100 : 0
      if (prefer === 'uncensored') score += m.uncensored ? 100 : 0
      if (prefer === 'best') {
        if (m.traits.includes('most_intelligent')) score += 80
        if (m.contextTokens && m.contextTokens >= 200_000) score += 20
      }
      if (prefer === 'fast' || !prefer) {
        // Penalize reasoning models (slow at JSON / multi-step)
        if (c.supportsReasoning) score -= 30
        if (m.traits.includes('function_calling_default')) score += 50
        if (m.recommended) score += 30
      }
      // Always: prefer schema-capable so they reliably handle structured prompts
      if (c.supportsResponseSchema) score += 10
      // Tier penalty
      score -= m.tier * 5
      return { id: m.id, score }
    })
    scored.sort((a, b) => b.score - a.score)
    return scored[0]?.id
  }

  // Non-chat: just first available, optionally biased
  const list =
    nodeType === 'imageGen' ? catalog.image
    : nodeType === 'tts' ? catalog.tts
    : nodeType === 'music' ? catalog.music
    : nodeType === 'video' ? catalog.video
    : []
  return list[0]
}

function safeParseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function handleTool(name: string, args: Record<string, unknown>, opts: RunOptions): ToolResult {
  try {
    switch (name) {
      case 'clear': {
        opts.applyPatch({ op: 'clear' })
        return { ok: true }
      }
      case 'add_node': {
        const node_type = args.node_type as VeniceNodeType
        if (!node_type || !(node_type in NODE_SCHEMAS)) return { error: `Unknown node_type: ${String(node_type)}` }
        if (typeof args.id === 'string' && args.id && !isValidId(args.id)) return { error: safeIdError('node id') }
        const id = (typeof args.id === 'string' && args.id) || generateId()
        const rawParams = (typeof args.params === 'object' && args.params !== null ? args.params : {}) as Record<string, unknown>

        // Validate model id against the actual catalog. This is the key win of
        // tool-call mode: hallucinated ids get rejected instantly, the agent
        // sees the error in the same turn, and self-corrects via pick_model.
        const m = rawParams.model
        if (typeof m === 'string' && m.length > 0) {
          const valid = isModelValid(node_type, m, opts)
          if (!valid) {
            return {
              error: `Unknown model '${m}' for ${node_type}. Call pick_model({node_type:'${node_type === 'chat' ? 'chat' : node_type}'}) to get a valid id, then retry add_node with that id.`,
            }
          }
        }

        // Strip junk keys to keep the store clean.
        const schema = NODE_SCHEMAS[node_type]
        const allowed = new Set(['model', 'prompt', ...schema.params.map((p) => p.name)])
        const params: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(rawParams)) if (allowed.has(k)) params[k] = v

        // Validate enum-typed params and coerce common mistakes (boolean true → 'on', etc.).
        for (const p of schema.params) {
          if (p.enumValues && params[p.name] !== undefined) {
            const v = params[p.name]
            if (typeof v === 'boolean') {
              params[p.name] = v ? (p.enumValues.includes('on') ? 'on' : p.enumValues[0]) : (p.enumValues.includes('off') ? 'off' : '')
              continue
            }
            if (typeof v !== 'string' || !p.enumValues.includes(v)) {
              return { error: `Invalid value for ${node_type}.${p.name}: ${JSON.stringify(v)}. Must be one of [${p.enumValues.filter(Boolean).join(', ')}].` }
            }
          }
        }

        const r = opts.applyPatch({ op: 'add_node', nodeType: node_type, id, params: params as Partial<VeniceNodeData> })
        if ('error' in r) return { error: r.error }
        return { ok: true, id: r.id ?? id }
      }
      case 'connect': {
        const source = String(args.source ?? '')
        const target = String(args.target ?? '')
        if (!isValidId(source)) return { error: safeIdError('source id') }
        if (!isValidId(target)) return { error: safeIdError('target id') }
        const r = opts.applyPatch({ op: 'connect', source, target })
        if ('error' in r) return { error: r.error }
        return { ok: true, edge_id: r.edge_id }
      }
      case 'set_params': {
        const id = String(args.id ?? '')
        if (!isValidId(id)) return { error: safeIdError('node id') }
        const params = (typeof args.params === 'object' && args.params !== null ? args.params : {}) as Partial<VeniceNodeData>
        const r = opts.applyPatch({ op: 'set_params', id, params })
        if ('error' in r) return { error: r.error }
        return { ok: true }
      }
      case 'remove_node': {
        const id = String(args.id ?? '')
        if (!isValidId(id)) return { error: safeIdError('node id') }
        const r = opts.applyPatch({ op: 'remove_node', id })
        if ('error' in r) return { error: r.error }
        return { ok: true }
      }
      case 'pick_model': {
        const node_type = String(args.node_type ?? '')
        const prefer = typeof args.prefer === 'string' ? args.prefer : undefined
        const id = pickModel(node_type, prefer, opts)
        if (!id) return { error: `No model available for ${node_type}` }
        return { ok: true, model: id }
      }
      case 'ask_user': {
        return { ok: true, message: String(args.question ?? '') }
      }
      case 'done': {
        return { ok: true, message: String(args.summary ?? 'Done.') }
      }
    }
    return { error: `Unknown tool: ${name}` }
  } catch {
    // Never return raw exception text to the model or UI; it may contain
    // paths, stack traces, or other implementation details.
    return { error: 'Tool execution failed. Please check your arguments and try again.' }
  }
}

export async function runAgentTools(opts: RunOptions): Promise<RunResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...opts.history.map<UserMessage | AssistantMessage>((m) => (
      m.role === 'user' ? { role: 'user', content: m.content } : { role: 'assistant', content: m.content }
    )),
    { role: 'user', content: `${describeDraft(opts.draft)}\n\nUser request: ${opts.userMessage}` },
  ]

  let toolCallCount = 0
  let askedUser = false

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const resp = await venice<ToolCallResponse>('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: opts.model,
        messages,
        temperature: 0.2,
        max_tokens: 4096,
        tools: TOOLS,
        tool_choice: 'auto',
      }),
      signal: opts.signal,
    })

    const message = resp.choices[0]?.message
    if (!message) {
      return { say: 'Empty response from agent.', tool_calls: toolCallCount, asked_user: false }
    }

    messages.push({
      role: 'assistant',
      content: message.content ?? null,
      tool_calls: message.tool_calls,
    })

    const calls = message.tool_calls ?? []
    if (calls.length === 0) {
      // Agent stopped calling tools — treat content as final.
      return {
        say: (message.content || '').trim() || `Made ${toolCallCount} edit${toolCallCount === 1 ? '' : 's'}.`,
        tool_calls: toolCallCount,
        asked_user: false,
      }
    }

    let terminalSay: string | null = null
    let terminalAsked = false

    for (const call of calls) {
      const name = call.function?.name ?? ''
      const args = safeParseArgs(call.function?.arguments)
      const result = handleTool(name, args, opts)
      toolCallCount++
      opts.onStep?.({ tool: name, args, result })

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      })

      if (name === 'done') {
        terminalSay = result.message ?? 'Done.'
      } else if (name === 'ask_user') {
        terminalSay = result.message ?? 'Need clarification.'
        terminalAsked = true
      }
    }

    if (terminalSay !== null) {
      askedUser = terminalAsked
      return { say: terminalSay, tool_calls: toolCallCount, asked_user: askedUser }
    }
  }

  return {
    say: `Stopped after ${MAX_ITERATIONS} iterations and ${toolCallCount} edits — let me know if it needs adjusting.`,
    tool_calls: toolCallCount,
    asked_user: false,
  }
}
