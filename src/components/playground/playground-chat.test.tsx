// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as React from 'react'
import { describe, expect, it, vi, beforeEach, beforeAll } from 'vitest'
import { PlaygroundChat } from './playground-chat'
import { usePlaygroundStore, type PlaygroundMessage } from '../../stores/playground-store'
import { callAgent } from '../../lib/playground-agent'
import { runAgentTools, type RunStep } from '../../lib/playground-agent-tools'
import { useAgentModels } from '../../hooks/use-agent-models'

vi.mock('../../stores/playground-store', () => {

  const state: {
    messages: PlaygroundMessage[]
    draft: { nodes: unknown[]; edges: unknown[] }
    isThinking: boolean
    runResults: Record<string, unknown>
    isRunning: boolean
    linkedWorkflowId: null
    addMessage: (msg: PlaygroundMessage) => void
    updateMessage: (id: string, updates: Partial<PlaygroundMessage>) => void
    setThinking: (v: boolean) => void
    applyAgentPatches: (patches: unknown[]) => { nodes: unknown[]; edges: unknown[] }
  } = {
    messages: [],
    draft: { nodes: [], edges: [] },
    isThinking: false,
    runResults: {},
    isRunning: false,
    linkedWorkflowId: null,
    addMessage: () => undefined,
    updateMessage: () => undefined,
    setThinking: () => undefined,
    applyAgentPatches: () => ({ nodes: [], edges: [] }),
  }


  type State = typeof state

  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((l) => l())
  const set = (updater: Partial<State> | ((s: State) => Partial<State>)) => {
    const next = typeof updater === 'function' ? updater(state) : { ...state, ...updater }
    Object.assign(state, next)
    notify()
  }

  state.addMessage = (msg) => set((s) => ({ messages: [...s.messages, msg] }))
  state.updateMessage = (id, updates) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    }))
  state.setThinking = (v) => set({ isThinking: v })
  state.applyAgentPatches = vi.fn(() => ({ nodes: state.draft.nodes, edges: state.draft.edges }))

  function useStore(selector?: (s: State) => unknown) {
    const [, forceRender] = React.useState({})
    React.useEffect(() => {
      const cb = () => forceRender({})
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    }, [])
    return selector ? selector(state) : state
  }
  useStore.getState = () => state
  useStore.setState = set

  return {
    usePlaygroundStore: useStore,
  }
})

vi.mock('../../stores/auth-store', () => ({
  selectHasVeniceKey: (s: { apiKey?: string; isConfigured?: boolean }) => s.isConfigured || Boolean(s.apiKey),
  useAuthStore: vi.fn((selector: (s: { apiKey: string; isConfigured: boolean }) => unknown) =>
    selector({ apiKey: 'test-key', isConfigured: true }),
  ),
}))

vi.mock('../../stores/settings-store', () => ({
  useSettingsStore: vi.fn((selector: (s: { playgroundAgentModel: string }) => unknown) =>
    selector({ playgroundAgentModel: 'qwen3-next-80b' }),
  ),
}))

vi.mock('../../hooks/use-model-catalog', () => ({
  useModelCatalog: vi.fn(() => ({
    catalog: { text: [], image: [], tts: [], music: [], video: [] },
    isLoading: false,
  })),
}))

vi.mock('../../hooks/use-agent-models', () => ({
  useAgentModels: vi.fn(() => ({
    models: [
      {
        id: 'qwen3-next-80b',
        name: 'Qwen3',
        capabilities: {
          supportsFunctionCalling: true,
          supportsResponseSchema: true,
          supportsWebSearch: false,
          supportsReasoning: false,
        },
        traits: ['function_calling_default'],
        contextTokens: 32000,
        recommended: true,
        tier: 0,
        reasoning: false,
        uncensored: false,
      },
    ],
    isLoading: false,
  })),
}))

vi.mock('../../lib/playground-agent', () => ({
  callAgent: vi.fn(),
  DEFAULT_AGENT_MODEL: 'qwen3-next-80b',
}))

vi.mock('../../lib/playground-agent-tools', () => ({
  runAgentTools: vi.fn(),
}))

const mockRunAgentTools = vi.mocked(runAgentTools)
const mockCallAgent = vi.mocked(callAgent)
const mockUseAgentModels = vi.mocked(useAgentModels)
const mockApplyAgentPatches = vi.fn()

beforeAll(() => {
  Object.defineProperty(HTMLDivElement.prototype, 'scrollTo', {
    value: vi.fn(),
    writable: true,
  })
})

describe('PlaygroundChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAgentModels.mockReturnValue({
      models: [
        {
          id: 'qwen3-next-80b',
          name: 'Qwen3',
          capabilities: {
            supportsFunctionCalling: true,
            supportsResponseSchema: true,
            supportsWebSearch: false,
            supportsReasoning: false,
          },
          traits: ['function_calling_default'],
          contextTokens: 32000,
          recommended: true,
          tier: 0,
          reasoning: false,
          uncensored: false,
        },
      ],
      isLoading: false,
    })
    usePlaygroundStore.setState({
      messages: [],
      draft: { nodes: [], edges: [] },
      isThinking: false,
      runResults: {},
      isRunning: false,
      linkedWorkflowId: null,
    })
    const store = usePlaygroundStore.getState()
    store.applyAgentPatches = mockApplyAgentPatches.mockImplementation(() => ({
      nodes: store.draft.nodes,
      edges: store.draft.edges,
    })) as unknown as typeof store.applyAgentPatches
  })

  it('does not store or render raw exception text when runAgentTools throws', async () => {
    const user = userEvent.setup()
    mockRunAgentTools.mockRejectedValueOnce(
      new Error('fetch failed for https://api.venice.ai/v1/chat/completions'),
    )

    render(<PlaygroundChat />)
    const input = screen.getByPlaceholderText('Describe a workflow or change…')
    await user.type(input, 'build a workflow{enter}')

    await waitFor(() => {
      expect(screen.getByText('Agent request failed')).toBeInTheDocument()
    })

    expect(screen.queryByText(/api\.venice\.ai/)).not.toBeInTheDocument()
    expect(screen.queryByText(/fetch failed/)).not.toBeInTheDocument()
  })

  it('does not store or render raw exception text when callAgent throws (legacy mode)', async () => {
    const user = userEvent.setup()
    mockUseAgentModels.mockReturnValue({
      models: [
        {
          id: 'qwen3-next-80b',
          name: 'Qwen3',
          capabilities: {
            supportsFunctionCalling: false,
            supportsResponseSchema: true,
            supportsWebSearch: false,
            supportsReasoning: false,
          },
          traits: [],
          contextTokens: 32000,
          recommended: true,
          tier: 0,
          reasoning: false,
          uncensored: false,
        },
      ],
      isLoading: false,
    })
    mockCallAgent.mockRejectedValueOnce(new Error('Internal error: /Users/dev/.venice/secret.key'))

    render(<PlaygroundChat />)
    const input = screen.getByPlaceholderText('Describe a workflow or change…')
    await user.type(input, 'build a workflow{enter}')

    await waitFor(() => {
      expect(screen.getByText('Agent request failed')).toBeInTheDocument()
    })

    expect(screen.queryByText(/secret\.key/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Internal error/)).not.toBeInTheDocument()
  })

  it('does not render raw step result errors in the activity log', async () => {
    const user = userEvent.setup()
    mockRunAgentTools.mockImplementationOnce(async ({ onStep }: { onStep?: (step: RunStep) => void }) => {
      onStep?.({
        tool: 'add_node',
        args: { node_type: 'chat' },
        result: { error: 'raw tool error: /etc/passwd' },
      })
      return { say: 'Done.', tool_calls: 1, asked_user: false }
    })

    render(<PlaygroundChat />)
    const input = screen.getByPlaceholderText('Describe a workflow or change…')
    await user.type(input, 'add a chat node{enter}')

    await waitFor(() => {
      expect(screen.getByText('Failed to add chat')).toBeInTheDocument()
    })

    expect(screen.queryByText(/raw tool error/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\/etc\/passwd/)).not.toBeInTheDocument()
  })

  it('does not store or render raw patch application errors in legacy mode', async () => {
    const user = userEvent.setup()
    mockUseAgentModels.mockReturnValue({
      models: [
        {
          id: 'qwen3-next-80b',
          name: 'Qwen3',
          capabilities: {
            supportsFunctionCalling: false,
            supportsResponseSchema: true,
            supportsWebSearch: false,
            supportsReasoning: false,
          },
          traits: [],
          contextTokens: 32000,
          recommended: true,
          tier: 0,
          reasoning: false,
          uncensored: false,
        },
      ],
      isLoading: false,
    })
    mockCallAgent.mockResolvedValueOnce({
      say: '',
      patches: [{ op: 'clear' }],
      invalidPatches: 0,
    })
    mockApplyAgentPatches.mockImplementationOnce(() => {
      throw new Error('applyAgentPatches failed: /Users/dev/project/src/secret.ts')
    })

    render(<PlaygroundChat />)
    const input = screen.getByPlaceholderText('Describe a workflow or change…')
    await user.type(input, 'clear the canvas{enter}')

    await waitFor(() => {
      expect(screen.getByText('Failed to apply patches')).toBeInTheDocument()
    })

    expect(screen.queryByText(/secret\.ts/)).not.toBeInTheDocument()
    expect(screen.queryByText(/applyAgentPatches failed/)).not.toBeInTheDocument()
  })
})
