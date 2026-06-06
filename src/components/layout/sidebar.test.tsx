import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/desktopBridge', () => ({
  isElectron: () => false,
  desktopConfig: { writeSanitized: vi.fn() },
}))
vi.mock('../../stores/config-store', () => ({ reloadConfig: vi.fn() }))

import { buildConversationSearchText, Sidebar } from './sidebar'
import { useChatStore } from '../../stores/chat-store'
import { useSettingsStore } from '../../stores/settings-store'

describe('Sidebar controls', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      sidebarOpen: true,
      activeTab: 'chat',
      redTeamMode: false,
      showInspector: false,
      localFamilySafeModeEnabled: true,
    })
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
      _hasLoadedHistory: true,
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
})
