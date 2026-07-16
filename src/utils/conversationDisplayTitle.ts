import type { Conversation } from '../types/conversation'
import type { ConversationCharacterMeta } from '../types/conversationVault'

export function getConversationDisplayTitle(
  conversation: { title: string; metadata?: Conversation['metadata']; character?: ConversationCharacterMeta },
): string {
  const title = conversation.title?.trim() || 'Untitled Conversation'
  const characterName = (conversation.character?.name ?? conversation.metadata?.character?.name)?.trim()
  if (!characterName) return title
  const prefix = `${characterName}:`
  return title.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase())
    ? title
    : `${characterName}: ${title}`
}
