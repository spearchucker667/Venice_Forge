/** @fileoverview Workflow node accessibility (Wave 2). */

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Position } from '@xyflow/react'
import { WorkflowNode } from './workflow-node'

const setNodesMock = vi.fn()

vi.mock('@xyflow/react', () => ({
  Handle: ({ type, position, className }: { type: string; position: string; className?: string }) => (
    <div data-testid={`handle-${type}-${position}`} className={className} />
  ),
  Position: { Top: 'top', Bottom: 'bottom' },
  useReactFlow: () => ({ setNodes: setNodesMock }),
}))

vi.mock('../../hooks/use-models', () => ({
  useModels: () => ({ data: [] }),
}))

const useWorkflowStoreMock = vi.fn()
vi.mock('../../stores/workflow-store', () => ({
  useWorkflowStore: (selector: (state: { runResults: Record<string, unknown> }) => unknown) =>
    useWorkflowStoreMock(selector),
}))

function renderNode(nodeType: 'chat' | 'output' | 'textInput' = 'chat', result?: { status: 'done' | 'error' | 'running'; output?: string; error?: string }) {
  useWorkflowStoreMock.mockImplementation((selector: (state: { runResults: Record<string, unknown> }) => unknown) =>
    selector({ runResults: result ? { 'node-1': result } : {} }),
  )

  return render(
    <WorkflowNode
      id="node-1"
      type="default"
      data={{
        label: 'Test',
        nodeType,
        model: '',
        prompt: '',
      }}
      draggable={false}
      selectable={false}
      deletable={false}
      selected={false}
      dragging={false}
      zIndex={0}
      isConnectable={false}
      positionAbsoluteX={0}
      positionAbsoluteY={0}
      targetPosition={Position.Top}
      sourcePosition={Position.Bottom}
    />,
  )
}

function renderOutputNode(id: string) {
  const baseData = {
    label: 'Test',
    nodeType: 'output',
    model: '',
    prompt: '',
  } as const

  return (
    <WorkflowNode
      id={id}
      type="default"
      data={baseData}
      draggable={false}
      selectable={false}
      deletable={false}
      selected={false}
      dragging={false}
      zIndex={0}
      isConnectable={false}
      positionAbsoluteX={0}
      positionAbsoluteY={0}
      targetPosition={Position.Top}
      sourcePosition={Position.Bottom}
    />
  )
}

describe('WorkflowNode — accessibility', () => {
  beforeEach(() => {
    setNodesMock.mockReset()
    useWorkflowStoreMock.mockReset()
  })

  it('delete button has accessible name and type button', () => {
    renderNode('chat')
    const deleteBtn = screen.getByRole('button', { name: 'Delete workflow node' })
    expect(deleteBtn).toBeInTheDocument()
    expect(deleteBtn).toHaveAttribute('type', 'button')
  })

  it('output node text toggle is a button with aria-expanded', () => {
    renderNode('output', { status: 'done', output: 'Hello world' })
    const toggle = screen.getByRole('button', { name: 'Expand output' })
    expect(toggle).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('type', 'button')
  })

  it('output node toggle expands and updates aria-expanded on click', async () => {
    renderNode('output', { status: 'done', output: 'Hello world' })
    const toggle = screen.getByRole('button', { name: 'Expand output' })
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveAttribute('aria-label', 'Collapse output')
  })

  it('non-output node output preview is a button with aria-expanded', () => {
    renderNode('chat', { status: 'done', output: 'Generated text result' })
    const toggle = screen.getByRole('button', { name: 'Expand output' })
    expect(toggle).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('non-output node toggle can be expanded via keyboard', async () => {
    renderNode('chat', { status: 'done', output: 'Generated text result' })
    const toggle = screen.getByRole('button', { name: 'Expand output' })
    toggle.focus()
    await userEvent.keyboard('{Enter}')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('decorative SVGs are hidden from assistive technology', () => {
    renderNode('chat')
    const svgs = document.querySelectorAll('svg')
    svgs.forEach((svg) => {
      expect(svg).toHaveAttribute('aria-hidden', 'true')
    })
  })

  it('revokes workflow blob audio URLs when the rendered output unmounts', () => {
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, revokeObjectURL })
    try {
      const { unmount } = renderNode('output', { status: 'done', output: '[audio:blob:workflow-tts]' })
      expect(document.querySelector('audio')?.getAttribute('src')).toBe('blob:workflow-tts')
      expect(revokeObjectURL).not.toHaveBeenCalled()

      unmount()

      expect(revokeObjectURL).toHaveBeenCalledWith('blob:workflow-tts')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps a shared workflow blob audio URL alive until the final rendered owner unmounts', () => {
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, revokeObjectURL })
    try {
      useWorkflowStoreMock.mockImplementation((selector: (state: { runResults: Record<string, unknown> }) => unknown) =>
        selector({
          runResults: {
            'node-1': { status: 'done', output: '[audio:blob:workflow-tts]' },
            'node-2': { status: 'done', output: '[audio:blob:workflow-tts]' },
          },
        }),
      )
      const { container, rerender, unmount } = render(
        <>
          {renderOutputNode('node-1')}
          {renderOutputNode('node-2')}
        </>,
      )
      expect(container.querySelectorAll('audio[src="blob:workflow-tts"]')).toHaveLength(2)

      rerender(renderOutputNode('node-2'))
      expect(container.querySelectorAll('audio[src="blob:workflow-tts"]')).toHaveLength(1)
      expect(revokeObjectURL).not.toHaveBeenCalled()

      unmount()
      expect(revokeObjectURL).toHaveBeenCalledTimes(1)
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:workflow-tts')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
