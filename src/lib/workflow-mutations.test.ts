import { describe, it, expect } from 'vitest'
import { applyPatch, applyPatches, autoLayout } from './workflow-mutations'
import type { Node, Edge } from '@xyflow/react'
import type { VeniceNodeData } from '../stores/workflow-store'

describe('workflow-mutations', () => {
  const emptyGraph = { nodes: [] as Node<VeniceNodeData>[], edges: [] as Edge[] }

  it('should add a node', () => {
    const res = applyPatch(emptyGraph, { op: 'add_node', nodeType: 'textInput', id: 'n1' })
    expect(res.nodes.length).toBe(1)
    expect(res.nodes[0].id).toBe('n1')
    expect(res.nodes[0].data.nodeType).toBe('textInput')
    expect(res.addedNodeId).toBe('n1')
  })

  it('should remove a node and its associated edges', () => {
    const n1: Node<VeniceNodeData> = { id: 'n1', type: 'venice', position: { x: 0, y: 0 }, data: { label: 'In', nodeType: 'textInput', model: '', prompt: '' } }
    const n2: Node<VeniceNodeData> = { id: 'n2', type: 'venice', position: { x: 0, y: 0 }, data: { label: 'Out', nodeType: 'output', model: '', prompt: '' } }
    const e1: Edge = { id: 'e1', source: 'n1', target: 'n2' }
    const graph = { nodes: [n1, n2], edges: [e1] }

    const res = applyPatch(graph, { op: 'remove_node', id: 'n1' })
    expect(res.nodes.length).toBe(1)
    expect(res.nodes[0].id).toBe('n2')
    expect(res.edges.length).toBe(0)
  })

  it('should update parameters of a node', () => {
    const n1: Node<VeniceNodeData> = { id: 'n1', type: 'venice', position: { x: 0, y: 0 }, data: { label: 'In', nodeType: 'textInput', model: '', prompt: '' } }
    const graph = { nodes: [n1], edges: [] }

    const res = applyPatch(graph, { op: 'set_params', id: 'n1', params: { prompt: 'new-prompt' } })
    expect(res.nodes[0].data.prompt).toBe('new-prompt')
  })

  it('should connect two nodes', () => {
    const n1: Node<VeniceNodeData> = { id: 'n1', type: 'venice', position: { x: 0, y: 0 }, data: { label: 'In', nodeType: 'textInput', model: '', prompt: '' } }
    const n2: Node<VeniceNodeData> = { id: 'n2', type: 'venice', position: { x: 0, y: 0 }, data: { label: 'Out', nodeType: 'output', model: '', prompt: '' } }
    const graph = { nodes: [n1, n2], edges: [] }

    const res = applyPatch(graph, { op: 'connect', source: 'n1', target: 'n2', id: 'e1' })
    expect(res.edges.length).toBe(1)
    expect(res.edges[0].id).toBe('e1')
    expect(res.edges[0].source).toBe('n1')
    expect(res.edges[0].target).toBe('n2')
  })

  it('should throw on connecting a node to itself', () => {
    const n1: Node<VeniceNodeData> = { id: 'n1', type: 'venice', position: { x: 0, y: 0 }, data: { label: 'In', nodeType: 'textInput', model: '', prompt: '' } }
    const graph = { nodes: [n1], edges: [] }

    expect(() => applyPatch(graph, { op: 'connect', source: 'n1', target: 'n1' })).toThrow()
  })

  it('should auto-layout nodes based on topological levels', () => {
    const n1: Node<VeniceNodeData> = { id: 'n1', type: 'venice', position: { x: 0, y: 0 }, data: { label: 'In', nodeType: 'textInput', model: '', prompt: '' } }
    const n2: Node<VeniceNodeData> = { id: 'n2', type: 'venice', position: { x: 0, y: 0 }, data: { label: 'Chat', nodeType: 'chat', model: '', prompt: '' } }
    const n3: Node<VeniceNodeData> = { id: 'n3', type: 'venice', position: { x: 0, y: 0 }, data: { label: 'Out', nodeType: 'output', model: '', prompt: '' } }
    const e1: Edge = { id: 'e1', source: 'n1', target: 'n2' }
    const e2: Edge = { id: 'e2', source: 'n2', target: 'n3' }

    const res = autoLayout([n1, n2, n3], [e1, e2])
    expect(res[0].position.y).toBeLessThan(res[1].position.y)
    expect(res[1].position.y).toBeLessThan(res[2].position.y)
  })

  it('should apply multiple patches and auto-layout', () => {
    const patches = [
      { op: 'add_node' as const, nodeType: 'textInput' as const, id: 'n1' },
      { op: 'add_node' as const, nodeType: 'output' as const, id: 'n2' },
      { op: 'connect' as const, source: 'n1', target: 'n2', id: 'e1' }
    ]
    const res = applyPatches(emptyGraph, patches)
    expect(res.nodes.length).toBe(2)
    expect(res.edges.length).toBe(1)
  })
})
