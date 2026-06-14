import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/desktopBridge', () => ({
  isElectron: () => false,
  desktopConfig: { writeSanitized: vi.fn() },
  desktopConversations: { list: () => Promise.resolve({ ok: false, records: [], error: 'mock' }) },
  desktopChat: { list: () => Promise.resolve({ ok: false, conversations: [], truncated: false, totalScanned: 0, error: 'mock' }) },
}))
vi.mock('../../stores/config-store', () => ({ reloadConfig: vi.fn() }))

import { buildConversationSearchText, Sidebar } from './sidebar'
import { useChatStore } from '../../stores/chat-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useProjectStore } from '../../stores/project-store'

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

  it('makes Red-Team Mode visible by opening the Inspector', () => {
    render(<Sidebar />)
    fireEvent.click(screen.getByRole('switch', { name: 'Toggle Red-Team Mode' }))
    expect(useSettingsStore.getState()).toMatchObject({ redTeamMode: true, showInspector: true })
  })

  it('places a working Family Safe Mode switch below Red-Team Mode', () => {
    render(<Sidebar />)
    const switches = screen.getAllByRole('switch')
    expect(switches.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Toggle Red-Team Mode',
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

    expect(screen.getByRole('switch', { name: 'Toggle Red-Team Mode' })).toBeInTheDocument()
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
    const footer = aside?.querySelector('.shrink-0.border-t.border-border.bg-surface\\/95')
    expect(footer).toBeInTheDocument()
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
