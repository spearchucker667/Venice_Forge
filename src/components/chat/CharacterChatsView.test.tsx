import '@testing-library/jest-dom/vitest'
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

import { useCharacterCardStore } from '../../stores/character-card-store'

describe('CharacterChatsView', () => {
  beforeEach(() => {
    useChatStore.setState({ conversations: [], activeConversationId: null, _hasLoadedHistory: true })
    useSettingsStore.setState({ activeTab: 'character-chats' } as never)
    useCharacterCardStore.setState({ cards: [], hasLoaded: true, load: vi.fn().mockResolvedValue(undefined) })
  })

  it('renders a dedicated empty workspace without generic prompt starters when no local cards exist', () => {
    render(<CharacterChatsView />)
    expect(screen.getByTestId('character-chats-workspace')).toBeTruthy()
    expect(screen.getByText('No character chats yet')).toBeTruthy()
    expect(screen.queryByText(/Try one of these/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Browse characters' }))
    expect(useSettingsStore.getState().activeTab).toBe('characters')
  })

  it('displays local characters in CharacterChatsView when local cards exist', async () => {
    const localCard = {
      schema: 'CharacterCardV1' as const,
      id: 'local-card-99',
      name: 'Sherlock Holmes',
      description: 'Consulting detective',
      systemPrompt: 'You are Sherlock Holmes.',
      tags: ['detective', 'mystery'],
      adult: false,
      exampleDialogues: [],
      createdAt: 1000,
      updatedAt: 1000,
    }
    useCharacterCardStore.setState({ cards: [localCard], hasLoaded: true })

    render(<CharacterChatsView />)

    expect(screen.getByText('Start a Local Character Chat')).toBeInTheDocument()
    expect(screen.getAllByText('Sherlock Holmes').length).toBeGreaterThan(0)
    expect(screen.getByText('Consulting detective')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Start Chat' }))
    await waitFor(() => {
      const convs = useChatStore.getState().conversations
      expect(convs.length).toBe(1)
      expect(convs[0].title).toBe('Chat with Sherlock Holmes')
    })
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
