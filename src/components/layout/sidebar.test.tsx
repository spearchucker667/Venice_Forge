import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/desktopBridge', () => ({
  isElectron: () => false,
  desktopConfig: { writeSanitized: vi.fn() },
  desktopConversations: {
    list: () => Promise.resolve({ ok: false, records: [], error: 'mock' }),
    save: () => Promise.resolve({ ok: false, id: 'mock', error: 'mock' }),
    delete: () => Promise.resolve({ ok: false, error: 'mock' }),
    pullContext: () => Promise.resolve({ ok: false, context: { injectedText: '', facts: [], summaries: [], tokenEstimate: 0 }, error: 'mock' }),
  },
  desktopChat: {
    list: () => Promise.resolve({ ok: false, conversations: [], truncated: false, totalScanned: 0, error: 'mock' }),
    save: () => Promise.resolve({ ok: false, id: 'mock', error: 'mock' }),
    delete: () => Promise.resolve({ ok: false, error: 'mock' })
  },
}))
vi.mock('../../stores/config-store', () => ({ reloadConfig: vi.fn() }))

import { buildConversationSearchText, Sidebar } from './sidebar'
import { useChatStore } from '../../stores/chat-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useProjectStore } from '../../stores/project-store'
import { ModalRequestHost } from '../ui/modal-requests'
import { DEFAULT_CHAT_MODEL } from '../../constants/venice'

describe('Sidebar controls', () => {
  beforeEach(() => {
    // Reset all stores touched by the rendered Sidebar (Phase 1 workspace + pre-existing controls).
    // Prevents cross-test pollution of projects/activeProjectId (which the new project switcher block
    // reads) and ensures deterministic mount without lingering state that could mask or trigger
    // update-depth loops in serial runs.
    useSettingsStore.setState({
      sidebarOpen: true,
      activeTab: 'chat',
      redTeamMode: false,
      showInspector: false,
      localFamilySafeModeEnabled: true,
      activeProjectId: null,
    })
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
      _hasLoadedHistory: true,
    })
    useProjectStore.setState({
      projects: [],
      loading: false,
      loaded: false,
      lastError: null,
    })
  })

  it('exposes the Media Studio navigation item', () => {
    render(<Sidebar />)
    fireEvent.click(screen.getByRole('button', { name: 'Media Studio' }))
    // The canonical tab id is 'media' (renamed from 'gallery' in the
    // tab-registry refactor). The store normalises legacy 'gallery'
    // clicks to the new id, so the assertion locks the contract.
    expect(useSettingsStore.getState().activeTab).toBe('media')
  })

  it('shows the complete labeled menu on initial desktop render', () => {
    render(<Sidebar />)
    for (const label of ['Chat', 'History', 'Image Studio', 'Media Studio', 'Prompts', 'Research', 'Characters', 'RP Studio', 'Workflows', 'Privacy', 'Config', 'Status']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('forces persisted collapsed state open during hydration while allowing in-session collapse', () => {
    const merge = useSettingsStore.persist.getOptions().merge
    expect(merge).toBeTypeOf('function')
    const merged = merge?.({ sidebarOpen: false }, useSettingsStore.getState()) as { sidebarOpen: boolean }
    expect(merged.sidebarOpen).toBe(true)
    useSettingsStore.getState().setSidebarOpen(false)
    expect(useSettingsStore.getState().sidebarOpen).toBe(false)
  })

  it('places the primary New chat action directly after the project selector', () => {
    render(<Sidebar />)
    const project = screen.getByRole('combobox', { name: 'Active project' })
    const newChat = screen.getByRole('button', { name: '+ New chat' })
    expect(project.nextElementSibling).toBe(newChat)
  })

  it('creates and selects a new chat in the active project context', async () => {
    useSettingsStore.setState({ activeProjectId: 'project-a', activeTab: 'media' })
    render(<Sidebar mobileOpen onMobileClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '+ New chat' }))
    const state = useChatStore.getState()
    expect(state.activeConversationId).not.toBeNull()
    expect(state.conversations[0].memory?.projectRefs).toEqual(['project-a'])
    expect(useSettingsStore.getState().activeTab).toBe('chat')
  })

  it('uses DEFAULT_CHAT_MODEL when no model is selected and New chat is clicked', async () => {
    // Clear selected model to force the DEFAULT_CHAT_MODEL fallback path
    useSettingsStore.setState({ selectedModels: { chat: '' } } as never)
    render(<Sidebar />)
    await userEvent.click(screen.getByRole('button', { name: '+ New chat' }))
    const state = useChatStore.getState()
    expect(state.activeConversationId).not.toBeNull()
    expect(state.conversations[0].model).toBe(DEFAULT_CHAT_MODEL)
  })

  it('provides an accessible Chat options menu that closes on Escape', async () => {
    useChatStore.getState().createConversation('test-model')
    render(<Sidebar />)
    const trigger = screen.getByRole('button', { name: 'Chat options' })
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu', { name: 'Chat options' })).toBeInTheDocument()
    for (const action of ['New chat', 'Search chats', 'Export active chat', 'Delete active chat', 'Clear active chat selection']) {
      expect(screen.getByRole('menuitem', { name: action })).toBeInTheDocument()
    }
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu', { name: 'Chat options' })).not.toBeInTheDocument()
  })

  it('collapses and expands the Chat History section with accessible semantics', async () => {
    useChatStore.setState({
      conversations: [{
        id: 'chat-1',
        title: 'History chat',
        model: 'test-model',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
        metadata: { tags: [], pinned: false, archived: false, source: 'chat', messageCount: 0 },
      }],
      activeConversationId: null,
      _hasLoadedHistory: true,
    })

    render(<Sidebar />)
    const historyToggle = screen.getByRole('button', { name: 'Collapse History' })
    expect(historyToggle).toHaveAttribute('aria-expanded', 'true')
    expect(historyToggle).toHaveAttribute('aria-controls', 'chat-history-list')
    expect(screen.getByRole('textbox', { name: 'Search conversations' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'History chat' })).toBeInTheDocument()

    await userEvent.click(historyToggle)
    expect(historyToggle).toHaveAttribute('aria-expanded', 'false')
    expect(historyToggle).toHaveAttribute('aria-label', 'Expand History')
    expect(screen.queryByRole('textbox', { name: 'Search conversations' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'History chat' })).not.toBeInTheDocument()

    await userEvent.click(historyToggle)
    expect(historyToggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'History chat' })).toBeInTheDocument()
  })

  it('requires confirmation before deleting the active chat from Chat options', async () => {
    useChatStore.getState().createConversation('test-model')
    render(
      <>
        <Sidebar />
        <ModalRequestHost />
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Chat options' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete active chat' }))
    expect(screen.getByRole('dialog', { name: 'Delete chat?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(useChatStore.getState().conversations).toHaveLength(1)
  })

  it('makes Traffic Inspector visible by opening the Inspector', () => {
    render(<Sidebar />)
    fireEvent.click(screen.getByRole('switch', { name: 'Toggle Traffic Inspector' }))
    expect(useSettingsStore.getState()).toMatchObject({ redTeamMode: true, showInspector: true })
  })

  it('places a working Family Safe Mode switch below Traffic Inspector', () => {
    render(<Sidebar />)
    const switches = screen.getAllByRole('switch')
    expect(switches.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Toggle Traffic Inspector',
      'Toggle Family Safe Mode',
    ])

    fireEvent.click(switches[1])
    expect(useSettingsStore.getState().localFamilySafeModeEnabled).toBe(false)
  })

  // VERIFY-042: null is an intentional, selectable All Projects state.
  it('switches between a real project and All Projects', async () => {
    const projects = [
      { id: 'project-a', name: 'Project A', createdAt: 2, updatedAt: 2, archivedAt: null },
      { id: 'project-b', name: 'Project B', createdAt: 1, updatedAt: 1, archivedAt: null },
    ]
    useProjectStore.setState({ projects, loaded: true })
    useSettingsStore.setState({ activeProjectId: 'project-a' } as never)
    render(<Sidebar />)

    const selector = screen.getByRole('combobox', { name: 'Active project' })
    await userEvent.selectOptions(selector, 'project-b')
    expect(useProjectStore.getState().getActiveProjectId()).toBe('project-b')

    await userEvent.selectOptions(selector, '')
    expect(useProjectStore.getState().getActiveProjectId()).toBeNull()
    expect(useProjectStore.getState().projects).toEqual(projects)
  })

  it('lets keyboard users select a conversation from the conversation list', async () => {
    useChatStore.setState({
      conversations: [{
        id: 'chat-1',
        title: 'Keyboard chat',
        model: 'test-model',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
        metadata: { tags: [], pinned: false, archived: false, source: 'chat', messageCount: 0 },
      }],
      activeConversationId: null,
      _hasLoadedHistory: true,
    })

    render(<Sidebar />)
    const conversationButton = screen.getByRole('button', { name: 'Keyboard chat' })
    conversationButton.focus()
    await userEvent.keyboard('{Enter}')

    expect(useChatStore.getState().activeConversationId).toBe('chat-1')
  })

  // VERIFY-027: full-content search uses a deferred, precomputed conversation index.
  it('indexes title, message, and reasoning content for deferred history search', async () => {
    const conversations = Array.from({ length: 6 }, (_, index) => ({
      id: `chat-${index}`,
      title: `Conversation ${index}`,
      model: 'test-model',
      messages: index === 5
        ? [{ id: 'message-1', role: 'assistant' as const, content: 'ordinary answer', reasoning_content: 'hidden copper signal', timestamp: 2 }]
        : [],
      createdAt: 1,
      updatedAt: 1,
      metadata: { tags: [], pinned: false, archived: false, source: 'chat' as const, messageCount: index === 5 ? 1 : 0 },
    }))
    useChatStore.setState({ conversations, activeConversationId: null, _hasLoadedHistory: true })

    render(<Sidebar />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Search conversations' }), 'copper')

    expect(await screen.findByRole('button', { name: 'Conversation 5' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Conversation 0' })).not.toBeInTheDocument()
    expect(buildConversationSearchText(conversations[5])).toContain('hidden copper signal')
  })

  it('clears the delete-confirm timeout when the row unmounts', () => {
    vi.useFakeTimers()
    useChatStore.setState({
      conversations: [{
        id: 'chat-delete',
        title: 'Delete me',
        model: 'test-model',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
        metadata: { tags: [], pinned: false, archived: false, source: 'chat', messageCount: 0 },
      }],
      activeConversationId: null,
      _hasLoadedHistory: true,
    })

    const { unmount } = render(<Sidebar />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Delete me' }))

    // Confirm state is shown; timeout is scheduled.
    expect(screen.getByRole('button', { name: 'Confirm delete' })).toBeInTheDocument()

    unmount()

    // After unmount, the scheduled timeout must not leak.
    vi.runOnlyPendingTimers()
    expect(vi.getTimerCount()).toBe(0)

    vi.useRealTimers()
  })

  it('renders footer controls without overlap indicators and uses semantic layout classes', () => {
    const { container } = render(<Sidebar />)

    expect(screen.getByRole('switch', { name: 'Toggle Traffic Inspector' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Toggle Family Safe Mode' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Show Inspector/i })).toBeInTheDocument()
    expect(screen.getByText('New chat')).toBeInTheDocument()
    expect(screen.getByText('Switch tab')).toBeInTheDocument()

    const aside = container.querySelector('aside')
    expect(aside).toHaveClass('flex', 'flex-col', 'h-full', 'min-h-0')

    // The scrollable middle section must flex and clip, and nav must be scrollable.
    const scrollWrapper = aside?.querySelector('.flex-1.min-h-0.overflow-hidden')
    expect(scrollWrapper).toBeInTheDocument()
    const nav = scrollWrapper?.querySelector('nav')
    expect(nav).toHaveClass('flex-1', 'min-h-0', 'overflow-y-auto')

    // Footer must never shrink.
    const footer = aside?.querySelector('.shrink-0.soft-separator-y')
    expect(footer).toBeInTheDocument()
  })

  it('uses the global mesh utilities for shell, inputs, and menus', async () => {
    const { container } = render(<Sidebar />)
    expect(container.querySelector('aside')).toHaveClass('mesh-sidebar')
    expect(screen.getByRole('combobox', { name: 'Active project' }).nextElementSibling).toHaveClass('mesh-input')
    await userEvent.click(screen.getByRole('button', { name: 'Chat options' }))
    expect(screen.getByRole('menu', { name: 'Chat options' })).toHaveClass('mesh-panel')
  })

  it('does not use hardcoded white/black theme classes in the footer (light-theme regression guard)', () => {
    render(<Sidebar />)
    const switches = screen.getAllByRole('switch')
    for (const sw of switches) {
      expect(sw.className).not.toMatch(/\bbg-white\b/)
      expect(sw.className).not.toMatch(/\bbg-black\b/)
      expect(sw.className).not.toMatch(/\btext-white\b/)
      expect(sw.className).not.toMatch(/\btext-black\b/)
    }
  })
})
