import type { Conversation } from '../types/conversation'

export function getConversationDisplayTitle(conversation: Conversation): string {
  const title = conversation.title?.trim() || 'Untitled Conversation'
  const characterName = conversation.metadata?.character?.name?.trim()
  if (!characterName) return title
  const prefix = `${characterName}:`
  return title.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase())
    ? title
    : `${characterName}: ${title}`
}
