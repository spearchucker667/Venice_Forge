import type { Conversation } from '../types/conversation'

export type ConversationKind = 'standard' | 'character'
export type CharacterConversationSource = 'hosted' | 'local'

/** Compatibility classifier for both current and legacy conversation records. */
export function getConversationKind(conversation: Conversation): ConversationKind {
  const metadata = conversation.metadata
  if (metadata?.character) return 'character'
  if (metadata?.source === 'character' || metadata?.source === 'localCharacter') return 'character'
  return 'standard'
}

export function getCharacterConversationSource(conversation: Conversation): CharacterConversationSource | null {
  if (getConversationKind(conversation) !== 'character') return null
  if (conversation.metadata?.character?.localCharacterId || conversation.metadata?.source === 'localCharacter') return 'local'
  return 'hosted'
}
