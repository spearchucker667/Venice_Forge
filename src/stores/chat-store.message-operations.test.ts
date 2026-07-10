// VERIFY-071 regression guard: message-level operations (truncate, fork,
// delete-from-here) return the removed slice, preserve original immutability,
// and propagate persistence state.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Conversation } from '../types/conversation'

vi.mock('../services/desktopBridge', () => ({
  isElectron: () => false,
  desktopChat: {},
  desktopConversations: {},
}))

import { ensureStableMessageIds, useChatStore, _debugGetDirtyConversationIds } from './chat-store'

describe('stable-ID conversation operations', () => {
  beforeEach(() => useChatStore.setState({ conversations: [], activeConversationId: null, pendingContext: null, _hasLoadedHistory: true }))

  it('migrates missing legacy message IDs deterministically', () => {
    const legacy = { id: 'conv', title: 'Legacy', model: 'm', createdAt: 1, updatedAt: 1, messages: [{ role: 'user', content: 'hello', timestamp: 1 }] } as Conversation
    expect(ensureStableMessageIds(legacy).messages[0].id).toBe(ensureStableMessageIds(legacy).messages[0].id)
  })

  it('edits only the selected message and preserves structured attachments', () => {
    const id = useChatStore.getState().createConversation('m')
    useChatStore.getState().addMessage(id, { role: 'user', content: [{ type: 'text', text: 'old' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,YQ==' } }] })
    useChatStore.getState().addMessage(id, { role: 'assistant', content: 'later' })
    const before = useChatStore.getState().conversations[0].messages
    if (!Array.isArray(before[0].content)) throw new Error('Expected structured content')
    useChatStore.getState().updateMessage(id, before[0].id, { content: [{ type: 'text', text: 'new' }, before[0].content[1]], updatedAt: 10 })
    const after = useChatStore.getState().conversations[0].messages
    expect(after[0].content).toEqual([{ type: 'text', text: 'new' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,YQ==' } }])
    expect(after[1]).toEqual(before[1])
  })

  it('truncates and forks without mutating the original', () => {
    const id = useChatStore.getState().createConversation('m')
    useChatStore.getState().addMessage(id, { role: 'user', content: 'one' })
    useChatStore.getState().addMessage(id, { role: 'assistant', content: 'two' })
    const original = useChatStore.getState().conversations[0]
    const forkId = useChatStore.getState().forkConversation(id, original.messages[0].id)
    expect(forkId).not.toBeNull()
    expect(useChatStore.getState().conversations.find((conversation) => conversation.id === id)?.messages).toHaveLength(2)
    expect(useChatStore.getState().conversations.find((conversation) => conversation.id === forkId)?.messages).toHaveLength(1)
    useChatStore.getState().truncateConversationAfterMessage(id, original.messages[0].id, { includeSelected: false })
    expect(useChatStore.getState().conversations.find((conversation) => conversation.id === id)?.messages).toHaveLength(1)
  })

  it('truncateConversationAfterMessage returns the removed slice and retains earlier messages', () => {
    const id = useChatStore.getState().createConversation('m')
    useChatStore.getState().addMessage(id, { role: 'user', content: 'one' })
    useChatStore.getState().addMessage(id, { role: 'assistant', content: 'two' })
    useChatStore.getState().addMessage(id, { role: 'user', content: 'three' })
    const original = useChatStore.getState().conversations[0]

    const result = useChatStore.getState().truncateConversationAfterMessage(
      id,
      original.messages[1].id,
      { includeSelected: true },
    )

    expect(result).not.toBeNull()
    expect(result!.retained).toHaveLength(1)
    expect(result!.retained[0].content).toBe('one')
    expect(result!.removed).toHaveLength(2)
    expect(result!.removed.map((m) => m.content)).toEqual(['two', 'three'])

    const conv = useChatStore.getState().conversations.find((c) => c.id === id)!
    expect(conv.messages.map((m) => m.content)).toEqual(['one'])
  })

  it('fork preserves model and character binding and marks the fork dirty for persistence', () => {
    const id = useChatStore.getState().createCharacterConversation(
      {
        id: 'char-1',
        slug: 'ada',
        name: 'Ada',
        description: '',
        adult: false,
        modelId: 'venice-uncensored-1-2',
      } as never,
      'fallback-model',
    )
    useChatStore.getState().addMessage(id, { role: 'user', content: 'Hello' })
    useChatStore.getState().addMessage(id, { role: 'assistant', content: 'Hi' })
    const original = useChatStore.getState().conversations[0]

    const forkId = useChatStore.getState().forkConversation(id, original.messages[0].id)
    expect(forkId).not.toBeNull()

    const fork = useChatStore.getState().conversations.find((c) => c.id === forkId)!
    expect(fork.model).toBe('venice-uncensored-1-2')
    expect(fork.metadata?.character?.slug).toBe('ada')
    expect(fork.messages).toHaveLength(1)
    expect(fork.messages[0].content).toBe('Hello')

    expect(original.messages).toHaveLength(2)
    expect(_debugGetDirtyConversationIds()).toContain(forkId)
  })
})
