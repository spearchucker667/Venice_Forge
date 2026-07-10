// VERIFY-074 regression guard: character display title helper behaves
// consistently across history, sidebar, search, export, and fork contexts.

import { describe, expect, it } from 'vitest'
import type { Conversation } from '../types/conversation'
import { getConversationDisplayTitle } from './conversationDisplayTitle'

const base: Conversation = { id: 'c', title: 'Discussion', model: 'm', createdAt: 1, updatedAt: 1, messages: [] }

function characterConversation(title: string, name: string): Conversation {
  return {
    ...base,
    title,
    metadata: {
      tags: [],
      pinned: false,
      archived: false,
      source: 'character',
      messageCount: 0,
      character: { name },
    },
  }
}

describe('getConversationDisplayTitle', () => {
  it('prefixes character conversations without mutating the stored title', () => {
    const conversation = characterConversation('Discussion', 'Alice')
    expect(getConversationDisplayTitle(conversation)).toBe('Alice: Discussion')
    expect(conversation.title).toBe('Discussion')
  })

  it('does not duplicate an existing prefix', () => {
    expect(getConversationDisplayTitle(characterConversation('Alice: Discussion', 'Alice'))).toBe('Alice: Discussion')
  })

  it('leaves normal chats unchanged', () => expect(getConversationDisplayTitle(base)).toBe('Discussion'))

  it('prefixes character titles shown in history and sidebar lists', () => {
    const title = getConversationDisplayTitle(characterConversation('Planets', 'Ada'))
    expect(title).toBe('Ada: Planets')
  })

  it('prefixes character titles used in search results', () => {
    const title = getConversationDisplayTitle(characterConversation('Mars', 'Curiosity'))
    expect(title.toLowerCase()).toContain('curiosity')
    expect(title).toBe('Curiosity: Mars')
  })

  it('prefixes character titles exported as Markdown headings', () => {
    const title = getConversationDisplayTitle(characterConversation('Session 1', 'HAL'))
    const markdown = `# ${title}\n\n_Model: m · Created: 1970-01-01T00:00:00.001Z_`
    expect(markdown).toContain('# HAL: Session 1')
  })

  it('prefixes forked character conversation titles', () => {
    const forked: Conversation = {
      ...characterConversation('Chat with Ada — Fork', 'Ada'),
      parentConversationId: 'original',
    }
    expect(getConversationDisplayTitle(forked)).toBe('Ada: Chat with Ada — Fork')
  })
})
