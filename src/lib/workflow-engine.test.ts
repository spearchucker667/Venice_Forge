import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeWorkflow, WorkflowExecutionError } from './workflow-engine'
import { venice } from './venice-client'
import type { Node, Edge } from '@xyflow/react'
import type { VeniceNodeData } from '../stores/workflow-store'

vi.mock('./venice-client', () => ({
  venice: vi.fn(),
  veniceBlob: vi.fn(),
}))

describe('workflow-engine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should execute a simple workflow with textInput and output nodes', async () => {
    const nodes: Node<VeniceNodeData>[] = [
      { id: 'n1', type: 'venice', position: { x: 0, y: 0 }, data: { label: 'In', nodeType: 'textInput', inputText: 'hello world', model: '', prompt: '' } },
      { id: 'n2', type: 'venice', position: { x: 0, y: 0 }, data: { label: 'Out', nodeType: 'output', model: '', prompt: '' } }
    ]
    const edges: Edge[] = [
      { id: 'e1', source: 'n1', target: 'n2' }
    ]

    const updates: Record<string, any>[] = []
    const onUpdate = (nodeId: string, result: any) => {
      updates.push({ nodeId, ...result })
    }

    await executeWorkflow(nodes, edges, onUpdate)

    expect(updates).toContainEqual(expect.objectContaining({ nodeId: 'n1', status: 'done', output: 'hello world' }))
    expect(updates).toContainEqual(expect.objectContaining({ nodeId: 'n2', status: 'done', output: 'hello world' }))
  })

  it('should fail on cycle in workflow', async () => {
    const nodes: Node<VeniceNodeData>[] = [
      { id: 'n1', type: 'venice', position: { x: 0, y: 0 }, data: { label: 'In', nodeType: 'textInput', inputText: 'hello world', model: '', prompt: '' } },
      { id: 'n2', type: 'venice', position: { x: 0, y: 0 }, data: { label: 'Out', nodeType: 'output', model: '', prompt: '' } }
    ]
    const edges: Edge[] = [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n1' } // cycle
    ]

    const onUpdate = vi.fn()
    await expect(executeWorkflow(nodes, edges, onUpdate)).rejects.toThrow(WorkflowExecutionError)
  })

  it('should run chat completion node and resolve prompt template', async () => {
    vi.mocked(venice).mockResolvedValue({
      choices: [{ message: { content: 'AI Response' } }]
    })

    const nodes: Node<VeniceNodeData>[] = [
      { id: 'n1', type: 'venice', position: { x: 0, y: 0 }, data: { label: 'In', nodeType: 'textInput', inputText: 'user message', model: '', prompt: '' } },
      { id: 'n2', type: 'venice', position: { x: 0, y: 0 }, data: { label: 'LLM', nodeType: 'chat', model: 'llama-3.3-70b', prompt: 'Instruction: {{input}}' } }
    ]
    const edges: Edge[] = [
      { id: 'e1', source: 'n1', target: 'n2' }
    ]

    const updates: Record<string, any>[] = []
    await executeWorkflow(nodes, edges, (nodeId, res) => {
      updates.push({ nodeId, ...res })
    })

    expect(venice).toHaveBeenCalledWith('/chat/completions', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('Instruction: user message')
    }))
    expect(updates).toContainEqual(expect.objectContaining({ nodeId: 'n2', status: 'done', output: 'AI Response' }))
  })

  it('should fail-closed and report errors if a node fails', async () => {
    vi.mocked(venice).mockRejectedValue(new Error('Venice rate limit exceeded'))

    const nodes: Node<VeniceNodeData>[] = [
      { id: 'n1', type: 'venice', position: { x: 0, y: 0 }, data: { label: 'In', nodeType: 'textInput', inputText: 'prompt', model: '', prompt: '' } },
      { id: 'n2', type: 'venice', position: { x: 0, y: 0 }, data: { label: 'LLM', nodeType: 'chat', model: 'llama-3.3-70b', prompt: 'Instruction' } }
    ]
    const edges: Edge[] = [
      { id: 'e1', source: 'n1', target: 'n2' }
    ]

    const updates: Record<string, any>[] = []
    await expect(executeWorkflow(nodes, edges, (nodeId, res) => {
      updates.push({ nodeId, ...res })
    })).rejects.toThrow(WorkflowExecutionError)

    expect(updates).toContainEqual(expect.objectContaining({ nodeId: 'n2', status: 'error', error: 'Venice rate limit exceeded' }))
  })
})
