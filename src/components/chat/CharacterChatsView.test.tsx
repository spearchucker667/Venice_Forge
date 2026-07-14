import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatStore } from '../../stores/chat-store'
import { useSettingsStore } from '../../stores/settings-store'
import { CharacterChatsView } from './CharacterChatsView'
import { StandardChatView } from './StandardChatView'

vi.mock('./chat-view', () => ({ ChatView: () => <div data-testid="chat-surface">Chat surface</div> }))
vi.mock('../characters/CharacterAvatar', () => ({ CharacterAvatar: () => <div data-testid="character-avatar" /> }))

const standard = {
  id: 'standard-1', title: 'Ordinary chat', messages: [], model: 'standard-model', createdAt: 1, updatedAt: 1,
  metadata: { source: 'chat', messageCount: 0 },
} as never
const character = {
  id: 'character-1', title: 'Planets', messages: [], model: 'character-model', createdAt: 2, updatedAt: 2,
  metadata: { source: 'character', messageCount: 0, character: { name: 'Ada', slug: 'ada' } },
} as never

describe('CharacterChatsView', () => {
  beforeEach(() => {
    useChatStore.setState({ conversations: [], activeConversationId: null, _hasLoadedHistory: true })
    useSettingsStore.setState({ activeTab: 'character-chats' } as never)
  })

  it('renders a dedicated empty workspace without generic prompt starters', () => {
    render(<CharacterChatsView />)
    expect(screen.getByTestId('character-chats-workspace')).toBeTruthy()
    expect(screen.getByText('No character chats yet')).toBeTruthy()
    expect(screen.queryByText(/Try one of these/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Browse characters' }))
    expect(useSettingsStore.getState().activeTab).toBe('characters')
  })

  it('lists only character conversations and selects the character surface', async () => {
    useChatStore.setState({ conversations: [standard, character], activeConversationId: 'standard-1', _hasLoadedHistory: true })
    render(<CharacterChatsView />)
    expect(screen.getByText('Ada')).toBeTruthy()
    expect(screen.queryByText('Ordinary chat')).toBeNull()
    await waitFor(() => expect(useChatStore.getState().activeConversationId).toBe('character-1'))
    expect(screen.getByTestId('chat-surface')).toBeTruthy()
    expect(screen.getByText('Hosted')).toBeTruthy()
  })

  it('standard Chat clears a character-bound active conversation', async () => {
    useChatStore.setState({ conversations: [standard, character], activeConversationId: 'character-1', _hasLoadedHistory: true })
    await act(async () => { render(<StandardChatView />) })
    await waitFor(() => expect(useChatStore.getState().activeConversationId).toBeNull())
    expect(screen.getByTestId('chat-surface')).toBeTruthy()
  })
})
