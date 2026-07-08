import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeWorkflow, WorkflowExecutionError } from './workflow-engine'
import { venice, veniceBlob } from './venice-client'
import type { Node, Edge } from '@xyflow/react'
import type { VeniceNodeData } from '../stores/workflow-store'
import { DEFAULT_TTS_MODEL, DEFAULT_VIDEO_MODEL } from '../constants/venice'

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

  it('should fail-closed and report a safe error when a node fails', async () => {
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

    expect(updates).toContainEqual(expect.objectContaining({ nodeId: 'n2', status: 'error', error: 'LLM failed. Check your connection and try again.' }))
  })

  // T-134 regression guard: workflow node errors must not surface raw exception
  // text, paths, or secrets to the UI or the thrown error.
  it('never surfaces raw node exception text, paths, or secrets (T-134)', async () => {
    vi.mocked(venice).mockRejectedValue(
      new Error('Venice rate limit exceeded for /Users/dev/secret.key and vn-deadbeef1234')
    )

    const nodes: Node<VeniceNodeData>[] = [
      { id: 'n1', type: 'venice', position: { x: 0, y: 0 }, data: { label: 'In', nodeType: 'textInput', inputText: 'prompt', model: '', prompt: '' } },
      { id: 'n2', type: 'venice', position: { x: 0, y: 0 }, data: { label: 'LLM', nodeType: 'chat', model: 'llama-3.3-70b', prompt: 'Instruction' } }
    ]
    const edges: Edge[] = [{ id: 'e1', source: 'n1', target: 'n2' }]

    const updates: Record<string, any>[] = []
    let thrown: WorkflowExecutionError | undefined
    try {
      await executeWorkflow(nodes, edges, (nodeId, res) => {
        updates.push({ nodeId, ...res })
      })
    } catch (err) {
      thrown = err as WorkflowExecutionError
    }

    const updateError = updates.find((u) => u.nodeId === 'n2' && u.status === 'error')?.error ?? ''
    expect(updateError).toBe('LLM failed. Check your connection and try again.')
    expect(updateError).not.toContain('rate limit')
    expect(updateError).not.toContain('/Users/dev/secret.key')
    expect(updateError).not.toContain('vn-deadbeef')

    expect(thrown).toBeInstanceOf(WorkflowExecutionError)
    expect(thrown?.message).toBe('LLM failed. Check your connection and try again.')
    expect(thrown?.message).not.toContain('rate limit')
  })

  // T-135 regression guard: queued media (video/audio) failures must not surface
  // the upstream error payload, which may contain paths or internal details.
  it('never surfaces raw queued-media error payloads (T-135)', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(venice)
        .mockResolvedValueOnce({ queue_id: 'v1' }) // /video/queue
        .mockResolvedValueOnce({ status: 'failed', error: 'Internal error: /secret/path' }) // /video/retrieve

      const nodes: Node<VeniceNodeData>[] = [
        { id: 'n1', type: 'venice', position: { x: 0, y: 0 }, data: { label: 'In', nodeType: 'textInput', inputText: 'prompt', model: '', prompt: '' } },
        { id: 'n2', type: 'venice', position: { x: 0, y: 0 }, data: { label: 'Video', nodeType: 'video', model: DEFAULT_VIDEO_MODEL, prompt: '', videoAspectRatio: '16:9' } }
      ]
      const edges: Edge[] = [{ id: 'e1', source: 'n1', target: 'n2' }]

      const updates: Record<string, any>[] = []
      const assertion = expect(executeWorkflow(nodes, edges, (nodeId, res) => {
        updates.push({ nodeId, ...res })
      })).rejects.toThrow(WorkflowExecutionError)

      await vi.advanceTimersByTimeAsync(3000)

      await assertion

      const updateError = updates.find((u) => u.nodeId === 'n2' && u.status === 'error')?.error ?? ''
      expect(updateError).toBe('Video generation failed.')
      expect(updateError).not.toContain('Internal error')
      expect(updateError).not.toContain('/secret/path')
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps TTS blob URLs alive after workflow completion', async () => {
    const createObjectURL = vi.fn(() => 'blob:workflow-tts')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    try {
      vi.mocked(veniceBlob).mockResolvedValue(new Blob(['audio'], { type: 'audio/mpeg' }))

      const nodes: Node<VeniceNodeData>[] = [
        { id: 'n1', type: 'venice', position: { x: 0, y: 0 }, data: { label: 'In', nodeType: 'textInput', inputText: 'say hello', model: '', prompt: '' } },
        { id: 'n2', type: 'venice', position: { x: 0, y: 0 }, data: { label: 'TTS', nodeType: 'tts', model: DEFAULT_TTS_MODEL, prompt: '{{input}}' } }
      ]
      const edges: Edge[] = [{ id: 'e1', source: 'n1', target: 'n2' }]
      const updates: Record<string, any>[] = []

      await executeWorkflow(nodes, edges, (nodeId, res) => {
        updates.push({ nodeId, ...res })
      })

      expect(createObjectURL).toHaveBeenCalledTimes(1)
      expect(revokeObjectURL).not.toHaveBeenCalled()
      expect(updates).toContainEqual(expect.objectContaining({
        nodeId: 'n2',
        status: 'done',
        output: '[audio:blob:workflow-tts]',
        outputKind: 'audio',
      }))
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
