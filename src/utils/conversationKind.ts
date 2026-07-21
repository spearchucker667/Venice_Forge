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

/** Canonical, conversation-authoritative persona binding.
 *
 *  Provider request construction, prompt compilation, and inspector
 *  metadata must derive character identity exclusively from this helper —
 *  never from global UI selection state such as
 *  `useCharacterStore.selectedCharacterSlug`. */
export type ConversationPersonaBinding =
  | { kind: 'standard' }
  | { kind: 'hosted-character'; slug: string; characterId?: string }
  | { kind: 'local-character'; localCharacterId: string; systemPrompt: string }

/** Derives the persona binding for a conversation from its persisted
 *  metadata only. A conversation without character metadata is always
 *  `standard`, regardless of any globally selected character. */
export function getConversationPersonaBinding(
  conversation: Conversation | undefined,
): ConversationPersonaBinding {
  const character = conversation?.metadata?.character
  if (!character) return { kind: 'standard' }
  const localCharacterId = character.localCharacterId?.trim()
  if (localCharacterId || conversation?.metadata?.source === 'localCharacter') {
    return {
      kind: 'local-character',
      localCharacterId: localCharacterId || character.id?.trim() || '',
      systemPrompt: conversation?.systemPrompt ?? '',
    }
  }
  const slug = character.slug?.trim()
  if (slug) return { kind: 'hosted-character', slug, characterId: character.id }
  // Character metadata exists but carries no usable identity; treat as
  // standard rather than falling back to global selection state.
  return { kind: 'standard' }
}
