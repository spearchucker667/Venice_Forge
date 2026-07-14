import { useEffect } from 'react'
import { useChatStore } from '../../stores/chat-store'
import { getConversationKind } from '../../utils/conversationKind'
import { ChatView } from './chat-view'

export function StandardChatView() {
  const conversations = useChatStore((state) => state.conversations)
  const activeConversationId = useChatStore((state) => state.activeConversationId)
  const setActiveConversation = useChatStore((state) => state.setActiveConversation)
  const activeConversation = conversations.find((item) => item.id === activeConversationId)

  useEffect(() => {
    if (activeConversation && getConversationKind(activeConversation) === 'character') setActiveConversation(null)
  }, [activeConversation, setActiveConversation])

  if (activeConversation && getConversationKind(activeConversation) === 'character') return null
  return <ChatView />
}
