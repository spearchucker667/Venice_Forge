import type { Node, Edge } from '@xyflow/react'
import type { VeniceNodeData } from '../stores/workflow-store'
import { NODE_SCHEMAS, isInputCompatible, isIdealMatch, type ParamSchema } from './workflow-schema'
import type { WorkflowPatch } from './workflow-mutations'

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

/**
 * Validates a single patch against the schema before it is applied.
 * Catches the param-type errors (e.g. prompt as number) that applyPatch()
 * does not. Returns a list of human-readable issues; an empty list means OK.
 */
export function validatePatch(patch: WorkflowPatch): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  switch (patch.op) {
    case 'add_node': {
      const schema = NODE_SCHEMAS[patch.nodeType]
      if (!schema) {
        issues.push({ severity: 'error', message: `Unknown node type: ${patch.nodeType}` })
        return issues
      }
      checkParams(issues, schema, patch.params)
      break
    }
    case 'set_params': {
      // Need the node to know its schema; for set_params we can't look it
      // up without the current graph. The caller should pass it via the
      // graph, or the param mismatch is caught later by validateWorkflow.
      // Here we do a best-effort shape check: each value must be string,
      // number, or boolean.
      if (patch.params) {
        for (const [k, v] of Object.entries(patch.params)) {
          const ok =
            typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
          if (!ok) {
            issues.push({
              severity: 'error',
              nodeId: patch.id,
              message: `set_params: "${k}" must be string|number|boolean, got ${typeof v}.`,
            })
          }
        }
      }
      break
    }
    case 'remove_node':
    case 'move_node':
    case 'connect':
    case 'disconnect':
    case 'clear':
      // No payload to validate.
      break
  }

  return issues
}

function checkParams(
  issues: ValidationIssue[],
  schema: { params: readonly ParamSchema[]; label?: string },
  params: Record<string, unknown> | undefined
): void {
  const label = schema.label ?? 'node'
  if (!params) return
  for (const [k, v] of Object.entries(params)) {
    const spec = schema.params.find((p) => p.name === k)
    if (!spec) {
      issues.push({
        severity: 'warning',
        message: `add_node: unknown param "${k}" for ${label}.`,
      })
      continue
    }
    if (spec.enumValues && typeof v === 'string' && !spec.enumValues.includes(v)) {
      issues.push({
        severity: 'error',
        message: `${label}: param "${k}" must be one of [${spec.enumValues.filter(Boolean).join(', ')}], got "${v}".`,
      })
      continue
    }
    const t = spec.type
    const ok =
      (t === 'string' && typeof v === 'string') ||
      (t === 'text' && typeof v === 'string') ||
      (t === 'number' && typeof v === 'number') ||
      (t === 'boolean' && typeof v === 'boolean') ||
      (t === 'enum' && typeof v === 'string')
    if (!ok) {
      issues.push({
        severity: 'error',
        message: `${label}: param "${k}" must be ${t}, got ${typeof v}.`,
      })
      continue
    }
    if (t === 'number' && typeof v === 'number') {
      if (spec.min !== undefined && v < spec.min) {
        issues.push({
          severity: 'error',
          message: `${label}: param "${k}" must be >= ${spec.min}, got ${v}.`,
        })
      }
      if (spec.max !== undefined && v > spec.max) {
        issues.push({
          severity: 'error',
          message: `${label}: param "${k}" must be <= ${spec.max}, got ${v}.`,
        })
      }
    }
  }
}
