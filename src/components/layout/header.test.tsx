// Regression guards: VERIFY-066 (accessible New Chat label), VERIFY-073
// (header model selector updates conversation.model and respects persisted model).
import '@testing-library/jest-dom/vitest'
import { act, render, screen } from '@testing-library/react'
import { Profiler } from 'react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Header } from './header'
import { useSettingsStore } from '../../stores/settings-store'
import { useChatStore } from '../../stores/chat-store'
import { useAuthStore } from '../../stores/auth-store'
import { TAB_IDS, resolveTab } from '../../config/tabs'

const modelsData = vi.hoisted(() => ({ value: [] as Array<{ id: string; name?: string; model_spec?: { name?: string } }> }));
const useModelsMock = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/use-models', () => ({
  useModels: useModelsMock,
}));

describe('Header component', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      activeTab: 'chat',
      selectedModels: {},
      setSelectedModel: vi.fn(),
      toggleSidebar: vi.fn(),
    })
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
      setActiveConversation: vi.fn(),
    })
    useAuthStore.setState({
      apiKey: 'test-key',
    })
    modelsData.value = []
    useModelsMock.mockImplementation(() => ({ data: modelsData.value }))
  })

  it('disables header-owned catalog work when the active tab has no header selector', () => {
    useSettingsStore.setState({ activeTab: 'media' })
    render(<Header onOpenApiKey={vi.fn()} />)
    expect(useModelsMock).toHaveBeenLastCalledWith('text', { enabled: false })
  })

  it('renders correctly for every TAB_IDS entry', () => {
    for (const tabId of TAB_IDS) {
      useSettingsStore.setState({ activeTab: tabId })
      const { container, unmount } = render(<Header onOpenApiKey={vi.fn()} />)
      
      const tabDesc = resolveTab(tabId)
      const expectedTitle = tabDesc?.label ?? tabId

      // Header title must be present and not "undefined" or empty string
      const titleElement = container.querySelector('.font-semibold')
      expect(titleElement).not.toBeNull()
      expect(titleElement?.textContent).toBe(expectedTitle)
      expect(titleElement?.textContent).not.toBe('undefined')
      expect(titleElement?.textContent?.trim().length).toBeGreaterThan(0)

      // Subtitle check
      if (tabDesc?.subtitle) {
        const subtitleElement = container.querySelector('.text-text-muted')
        expect(subtitleElement?.textContent).toBe(tabDesc.subtitle)
      }

      // Check model selector presence
      const hasSelector = !!tabDesc?.modelType && tabDesc.modelSelectorOwner !== 'view'
      const selectorElement = screen.queryByLabelText('Selected model')
      
      if (hasSelector) {
        expect(selectorElement).toBeInTheDocument()
      } else {
        expect(selectorElement).not.toBeInTheDocument()
      }

      unmount()
    }
  })

  it('does not rerender for 100 raw assistant-content mutations', () => {
    modelsData.value = Array.from({ length: 500 }, (_, index) => ({ id: `model-${index}`, name: `Model ${index}` }))
    const id = useChatStore.getState().createConversation('model-a')
    useChatStore.getState().addMessage(id, { role: 'assistant', content: '' })
    let commits = 0
    render(
      <Profiler id="header" onRender={() => { commits += 1 }}>
        <Header onOpenApiKey={vi.fn()} />
      </Profiler>,
    )
    const baseline = commits
    act(() => {
      for (let index = 0; index < 100; index += 1) {
        useChatStore.getState().appendAssistantStreamDelta(id, { content: 'x' })
      }
    })
    expect(commits).toBe(baseline)
  })

  it('verifies that model selector is present only for chat, image, audio, music, and embeddings', () => {
    const selectorTabs = ['chat', 'image', 'audio', 'music', 'embeddings']
    for (const tabId of selectorTabs) {
      useSettingsStore.setState({ activeTab: tabId as any })
      const { unmount } = render(<Header onOpenApiKey={vi.fn()} />)
      expect(screen.getByLabelText('Selected model')).toBeInTheDocument()
      unmount()
    }

    const nonSelectorTabs = [
      'media', 'prompts', 'scenes', 'privacy', 'settings',
      'status', 'search', 'characters', 'rp-studio', 'workflows',
      'playground', 'video'
    ]
    for (const tabId of nonSelectorTabs) {
      useSettingsStore.setState({ activeTab: tabId as any })
      const { unmount } = render(<Header onOpenApiKey={vi.fn()} />)
      expect(screen.queryByLabelText('Selected model')).not.toBeInTheDocument()
      unmount()
    }
  })

  // VERIFY-066 regression guard: icon-only header actions carry accessible labels.
  it('exposes an accessible label for the New Chat button', () => {
    useChatStore.setState({ activeConversationId: 'conv-1' })
    render(<Header onOpenApiKey={vi.fn()} />)
    expect(screen.getByLabelText('New chat')).toBeInTheDocument()
  })

  // VERIFY-073 regression guard: changing the header model selector writes
  // the new model back to the active conversation.
  it('updates the active conversation model when the header selector changes', async () => {
    useChatStore.setState({
      conversations: [{
        id: 'conv-1',
        title: 'Test Chat',
        model: 'model-a',
        createdAt: 1,
        updatedAt: 1,
        messages: [],
        metadata: { tags: [], pinned: false, archived: false, source: 'chat', messageCount: 0 },
      }],
      activeConversationId: 'conv-1',
    })
    modelsData.value = [
      { id: 'model-a', name: 'Model A' },
      { id: 'model-b', name: 'Model B' },
    ]

    render(<Header onOpenApiKey={vi.fn()} />)
    await userEvent.click(screen.getByLabelText('Selected model'))
    await userEvent.click(screen.getByRole('option', { name: 'Model B' }))

    const conv = useChatStore.getState().conversations.find((c) => c.id === 'conv-1')!
    expect(conv.model).toBe('model-b')
  })

  // VERIFY-073 regression guard: a persisted conversation model takes
  // precedence over the global selected model in the header selector.
  it('shows the persisted conversation model instead of the global selection', () => {
    useSettingsStore.setState({ selectedModels: { chat: 'global-model' } })
    useChatStore.setState({
      conversations: [{
        id: 'conv-1',
        title: 'Test Chat',
        model: 'persisted-model',
        createdAt: 1,
        updatedAt: 1,
        messages: [],
        metadata: { tags: [], pinned: false, archived: false, source: 'chat', messageCount: 0 },
      }],
      activeConversationId: 'conv-1',
    })
    modelsData.value = [
      { id: 'persisted-model', name: 'Persisted Model' },
      { id: 'global-model', name: 'Global Model' },
    ]

    render(<Header onOpenApiKey={vi.fn()} />)
    expect(screen.getByLabelText('Selected model')).toHaveTextContent('Persisted Model')
  })
})
