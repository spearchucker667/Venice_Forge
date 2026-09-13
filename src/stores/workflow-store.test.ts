import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_PERSISTED_WORKFLOWS,
  WORKFLOW_PERSIST_LIMIT_ERROR,
  useWorkflowStore,
  type Workflow,
} from './workflow-store'

vi.mock('./toast-store', () => ({
  toast: {
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}))

import { toast } from './toast-store'

function filledWorkflows(count: number): Workflow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `wf-${index}`,
    name: `Workflow ${index}`,
    nodes: [],
    edges: [],
    createdAt: index,
  }))
}

describe('workflow-store persist cap', () => {
  beforeEach(() => {
    vi.mocked(toast.warn).mockClear()
    useWorkflowStore.setState({
      workflows: [],
      activeWorkflowId: null,
      runResults: {},
      isRunning: false,
      currentRunId: null,
      currentRunStartedAt: null,
      runHistory: [],
    })
  })

  it('creates a workflow under the persist cap', () => {
    const id = useWorkflowStore.getState().createWorkflow('First')
    expect(id).toBeTruthy()
    expect(useWorkflowStore.getState().workflows).toHaveLength(1)
    expect(toast.warn).not.toHaveBeenCalled()
  })

  it('warns and refuses a 21st persisted visual workflow', () => {
    useWorkflowStore.setState({ workflows: filledWorkflows(MAX_PERSISTED_WORKFLOWS) })
    expect(() => useWorkflowStore.getState().createWorkflow('Overflow')).toThrow(
      WORKFLOW_PERSIST_LIMIT_ERROR,
    )
    expect(useWorkflowStore.getState().workflows).toHaveLength(MAX_PERSISTED_WORKFLOWS)
    expect(toast.warn).toHaveBeenCalled()
  })
})
