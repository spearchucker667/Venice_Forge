import type { Node, Edge } from '@xyflow/react'
import type { VeniceNodeData, VeniceNodeType } from '../stores/workflow-store'
import { NODE_SCHEMAS } from './workflow-schema'
import { generateId } from './utils'

export type WorkflowPatch =
  | { op: 'add_node'; nodeType: VeniceNodeType; id?: string; position?: { x: number; y: number }; params?: Partial<VeniceNodeData> }
  | { op: 'remove_node'; id: string }
  | { op: 'set_params'; id: string; params: Partial<VeniceNodeData> }
  | { op: 'move_node'; id: string; position: { x: number; y: number } }
  | { op: 'connect'; source: string; target: string; id?: string }
  | { op: 'disconnect'; id: string }
  | { op: 'clear' }

export interface PatchResult {
  nodes: Node<VeniceNodeData>[]
  edges: Edge[]
  addedNodeId?: string
  addedEdgeId?: string
}

type WFGraph = { nodes: Node<VeniceNodeData>[]; edges: Edge[] }

const NODE_W = 280
const NODE_H = 180
const COL_GAP = 60
const ROW_GAP = 60

function defaultDataFor(nodeType: VeniceNodeType): VeniceNodeData {
  const schema = NODE_SCHEMAS[nodeType]
  const data: VeniceNodeData = {
    label: schema?.label ?? nodeType,
    nodeType,
    model: '',
    prompt: '',
  }
  for (const p of schema?.params ?? []) {
    if (p.default !== undefined) {
      (data as unknown as Record<string, unknown>)[p.name] = p.default
    }
  }
  return data
}

/**
 * Layered auto-layout. Walks the DAG, places each node at its topological depth,
 * and centers siblings at each level. Falls back to a sensible grid when no edges
 * exist yet.
 */
export function autoLayout(nodes: Node<VeniceNodeData>[], edges: Edge[]): Node<VeniceNodeData>[] {
  if (nodes.length === 0) return nodes

  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const n of nodes) { inDegree.set(n.id, 0); adj.set(n.id, []) }
  for (const e of edges) {
    if (!inDegree.has(e.source) || !inDegree.has(e.target)) continue
    adj.get(e.source)!.push(e.target)
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
  }

  // Assign each node to a level = longest path from any root.
  const level = new Map<string, number>()
  const queue = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id)
  for (const id of queue) level.set(id, 0)
  const remaining = new Map(inDegree)
  while (queue.length > 0) {
    const id = queue.shift()!
    const lvl = level.get(id) ?? 0
    for (const child of adj.get(id) ?? []) {
      level.set(child, Math.max(level.get(child) ?? 0, lvl + 1))
      const d = (remaining.get(child) ?? 1) - 1
      remaining.set(child, d)
      if (d === 0) queue.push(child)
    }
  }
  // Cycle detection fallback — leave any node without an assigned level at 0.
  for (const n of nodes) if (!level.has(n.id)) level.set(n.id, 0)

  const byLevel = new Map<number, string[]>()
  for (const n of nodes) {
    const lvl = level.get(n.id) ?? 0
    if (!byLevel.has(lvl)) byLevel.set(lvl, [])
    byLevel.get(lvl)!.push(n.id)
  }

  const maxRowCount = Math.max(...Array.from(byLevel.values()).map((row) => row.length))
  const layoutWidth = maxRowCount * (NODE_W + COL_GAP)

  const positions = new Map<string, { x: number; y: number }>()
  for (const [lvl, ids] of byLevel) {
    const rowWidth = ids.length * (NODE_W + COL_GAP) - COL_GAP
    const startX = (layoutWidth - rowWidth) / 2
    ids.forEach((id, i) => {
      positions.set(id, {
        x: startX + i * (NODE_W + COL_GAP),
        y: 40 + lvl * (NODE_H + ROW_GAP),
      })
    })
  }

  return nodes.map((n) => ({ ...n, position: positions.get(n.id) ?? n.position }))
}

function autoPositionFallback(existing: Node<VeniceNodeData>[]): { x: number; y: number } {
  return { x: 280, y: 40 + existing.length * (NODE_H + ROW_GAP) }
}

export function applyPatch(graph: WFGraph, patch: WorkflowPatch): PatchResult {
  const { nodes, edges } = graph

  switch (patch.op) {
    case 'add_node': {
      if (!NODE_SCHEMAS[patch.nodeType]) {
        throw new Error(`Unknown node type: ${patch.nodeType}`)
      }
      const id = patch.id ?? generateId()
      if (nodes.some((n) => n.id === id)) throw new Error(`Node id already exists: ${id}`)
      const position = patch.position ?? autoPositionFallback(nodes)
      const data: VeniceNodeData = { ...defaultDataFor(patch.nodeType), ...(patch.params ?? {}) }
      const node: Node<VeniceNodeData> = { id, type: 'venice', position, data }
      return { nodes: [...nodes, node], edges, addedNodeId: id }
    }

    case 'remove_node': {
      if (!nodes.some((n) => n.id === patch.id)) throw new Error(`Node not found: ${patch.id}`)
      return {
        nodes: nodes.filter((n) => n.id !== patch.id),
        edges: edges.filter((e) => e.source !== patch.id && e.target !== patch.id),
      }
    }

    case 'set_params': {
      if (!nodes.some((n) => n.id === patch.id)) throw new Error(`Node not found: ${patch.id}`)
      return {
        nodes: nodes.map((n) => (n.id === patch.id ? { ...n, data: { ...n.data, ...patch.params } } : n)),
        edges,
      }
    }

    case 'move_node': {
      if (!nodes.some((n) => n.id === patch.id)) throw new Error(`Node not found: ${patch.id}`)
      return {
        nodes: nodes.map((n) => (n.id === patch.id ? { ...n, position: patch.position } : n)),
        edges,
      }
    }

    case 'connect': {
      if (!nodes.some((n) => n.id === patch.source)) throw new Error(`Source node not found: ${patch.source}`)
      if (!nodes.some((n) => n.id === patch.target)) throw new Error(`Target node not found: ${patch.target}`)
      if (patch.source === patch.target) throw new Error('Cannot connect a node to itself.')
      const id = patch.id ?? `e-${patch.source}-${patch.target}-${generateId().slice(0, 6)}`
      if (edges.some((e) => e.id === id)) throw new Error(`Edge id already exists: ${id}`)
      const edge: Edge = { id, source: patch.source, target: patch.target, animated: true }
      return { nodes, edges: [...edges, edge], addedEdgeId: id }
    }

    case 'disconnect': {
      if (!edges.some((e) => e.id === patch.id)) throw new Error(`Edge not found: ${patch.id}`)
      return { nodes, edges: edges.filter((e) => e.id !== patch.id) }
    }

    case 'clear': {
      return { nodes: [], edges: [] }
    }
  }
}

export function applyPatches(graph: WFGraph, patches: readonly WorkflowPatch[]): PatchResult {
  let current: WFGraph = graph
  let lastAddedNodeId: string | undefined
  let lastAddedEdgeId: string | undefined
  for (const p of patches) {
    const r = applyPatch(current, p)
    current = { nodes: r.nodes, edges: r.edges }
    if (r.addedNodeId) lastAddedNodeId = r.addedNodeId
    if (r.addedEdgeId) lastAddedEdgeId = r.addedEdgeId
  }
  // Re-layout the result so agent-authored graphs land in tidy positions.
  const laidOut = autoLayout(current.nodes, current.edges)
  return { nodes: laidOut, edges: current.edges, addedNodeId: lastAddedNodeId, addedEdgeId: lastAddedEdgeId }
}
