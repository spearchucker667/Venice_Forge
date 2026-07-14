// VERIFY-104 regression guard: every conversation resolves to exactly one primary chat workspace.
import { describe, expect, it } from 'vitest'
import type { Conversation } from '../types/conversation'
import { getCharacterConversationSource, getConversationKind } from './conversationKind'

function conversation(metadata?: Conversation['metadata']): Conversation {
  return { id: 'c1', title: 'Chat', messages: [], model: 'model', createdAt: 1, updatedAt: 1, metadata }
}

describe('conversationKind', () => {
  it('classifies ordinary and incomplete records as standard', () => {
    expect(getConversationKind(conversation())).toBe('standard')
    expect(getConversationKind(conversation({ source: 'chat' } as never))).toBe('standard')
  })

  it('recognizes hosted, local, and legacy character records without requiring an avatar or slug', () => {
    expect(getConversationKind(conversation({ source: 'character', character: { name: '' } } as never))).toBe('character')
    const local = conversation({ source: 'chat', character: { name: 'Local', localCharacterId: 'local-1' } } as never)
    expect(getConversationKind(local)).toBe('character')
    expect(getCharacterConversationSource(local)).toBe('local')
    expect(getCharacterConversationSource(conversation({ source: 'character' } as never))).toBe('hosted')
  })
})
