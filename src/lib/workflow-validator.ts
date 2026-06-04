import type { Node, Edge } from '@xyflow/react'
import type { VeniceNodeData } from '../stores/workflow-store'
import { NODE_SCHEMAS, isInputCompatible, isIdealMatch } from './workflow-schema'

export type ValidationSeverity = 'error' | 'warning'

export interface ValidationIssue {
  severity: ValidationSeverity
  message: string
  nodeId?: string
  edgeId?: string
}

export interface ValidationResult {
  ok: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
}

type WFGraph = { nodes: Node<VeniceNodeData>[]; edges: Edge[] }

function hasCycle(nodes: Node<VeniceNodeData>[], edges: Edge[]): boolean {
  const adj = new Map<string, string[]>()
  for (const n of nodes) adj.set(n.id, [])
  for (const e of edges) adj.get(e.source)?.push(e.target)

  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map<string, number>()
  for (const n of nodes) color.set(n.id, WHITE)

  const visit = (id: string): boolean => {
    color.set(id, GRAY)
    for (const next of adj.get(id) ?? []) {
      const c = color.get(next)
      if (c === GRAY) return true
      if (c === WHITE && visit(next)) return true
    }
    color.set(id, BLACK)
    return false
  }

  for (const n of nodes) {
    if (color.get(n.id) === WHITE && visit(n.id)) return true
  }
  return false
}

function isParamMissing(data: VeniceNodeData, name: string): boolean {
  const v = (data as unknown as Record<string, unknown>)[name]
  if (v === undefined || v === null) return true
  if (typeof v === 'string') return v.trim() === ''
  return false
}

export function validateWorkflow({ nodes, edges }: WFGraph): ValidationResult {
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []
  const nodeIds = new Set(nodes.map((n) => n.id))

  if (nodes.length === 0) {
    warnings.push({ severity: 'warning', message: 'Workflow is empty.' })
  }

  for (const n of nodes) {
    const schema = NODE_SCHEMAS[n.data?.nodeType]
    if (!schema) {
      errors.push({ severity: 'error', nodeId: n.id, message: `Unknown node type: ${String(n.data?.nodeType)}` })
      continue
    }

    for (const p of schema.params) {
      if (p.required && isParamMissing(n.data, p.name)) {
        const hasInboundText = schema.input !== 'none' && edges.some((e) => e.target === n.id)
        const fillableFromInput = (p.name === 'prompt' || p.name === 'inputText') && hasInboundText
        if (!fillableFromInput) {
          errors.push({
            severity: 'error',
            nodeId: n.id,
            message: `${schema.label}: missing required "${p.name}".`,
          })
        }
      }
    }

    if (schema.input === 'none') {
      const incoming = edges.filter((e) => e.target === n.id)
      for (const e of incoming) {
        errors.push({ severity: 'error', edgeId: e.id, message: `${schema.label} does not accept inputs.` })
      }
    } else {
      const incoming = edges.filter((e) => e.target === n.id)
      if (incoming.length === 0 && schema.type !== 'output') {
        const needsPrompt = schema.params.some((p) => p.name === 'prompt' && p.required)
        if (!needsPrompt || isParamMissing(n.data, 'prompt')) {
          warnings.push({ severity: 'warning', nodeId: n.id, message: `${schema.label}: no upstream input connected.` })
        }
      }
    }

    if (schema.output === 'none') {
      const outgoing = edges.filter((e) => e.source === n.id)
      for (const e of outgoing) {
        errors.push({ severity: 'error', edgeId: e.id, message: `${schema.label} has no output and cannot feed another node.` })
      }
    }
  }

  for (const e of edges) {
    if (!nodeIds.has(e.source)) {
      errors.push({ severity: 'error', edgeId: e.id, message: `Edge source ${e.source} does not exist.` })
      continue
    }
    if (!nodeIds.has(e.target)) {
      errors.push({ severity: 'error', edgeId: e.id, message: `Edge target ${e.target} does not exist.` })
      continue
    }
    if (e.source === e.target) {
      errors.push({ severity: 'error', edgeId: e.id, message: 'Self-loops are not allowed.' })
      continue
    }
    const src = nodes.find((n) => n.id === e.source)
    const tgt = nodes.find((n) => n.id === e.target)
    if (!src || !tgt) continue
    const srcSchema = NODE_SCHEMAS[src.data.nodeType]
    const tgtSchema = NODE_SCHEMAS[tgt.data.nodeType]
    if (!srcSchema || !tgtSchema) continue
    if (!isInputCompatible(srcSchema.output, tgtSchema.input)) {
      errors.push({
        severity: 'error',
        edgeId: e.id,
        message: `${srcSchema.label} (${srcSchema.output}) cannot connect to ${tgtSchema.label} (${tgtSchema.input}).`,
      })
    } else if (!isIdealMatch(srcSchema.output, tgtSchema.input)) {
      warnings.push({
        severity: 'warning',
        edgeId: e.id,
        message: `${srcSchema.label} outputs ${srcSchema.output}; ${tgtSchema.label} expects ${tgtSchema.input}. Conversion may be lossy.`,
      })
    }
  }

  if (hasCycle(nodes, edges)) {
    errors.push({ severity: 'error', message: 'Workflow contains a cycle.' })
  }

  return { ok: errors.length === 0, errors, warnings }
}
