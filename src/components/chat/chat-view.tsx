import { useEffect, useRef } from 'react'
import { useChatStore } from '../../stores/chat-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useModels } from '../../hooks/use-models'
import { useChat } from '../../hooks/use-chat'
import { useAuthStore } from '../../stores/auth-store'
import { MessageBubble } from './message-bubble'
import { ChatInput } from './chat-input'
import { VeniceParams } from './venice-params'
import { VeniceLogo } from '../ui/logo'

const STARTER_PROMPTS = [
  'Explain how RSA encryption works using a metaphor a 10-year-old could grasp.',
  'Draft a polite but firm email asking my landlord to fix the heating.',
  'Compare REST and GraphQL — when does each shine?',
  'Brainstorm five novel side-project ideas using LLMs and a Raspberry Pi.',
]

export function ChatView() {
  const deleteMessage = useChatStore((s) => s.deleteMessage)
  const conversation = useChatStore((s) => {
    const id = s.activeConversationId
    return id ? s.conversations.find((c) => c.id === id) : undefined
  })
  const apiKey = useAuthStore((s) => s.apiKey)
  const selectedModel = useSettingsStore((s) => s.selectedModels.chat)
  const { data: models } = useModels('text')
  const model = selectedModel || models?.[0]?.id || 'llama-3.3-70b'
  const { send, stop, regenerate, isStreaming } = useChat()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const messageCount = conversation?.messages.length ?? 0
  const lastContent = conversation?.messages[messageCount - 1]?.content
  const lastLen = typeof lastContent === 'string' ? lastContent.length : 0
  const scrollTrigger = `${messageCount}-${Math.floor(lastLen / 200)}`
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [scrollTrigger])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {!conversation || conversation.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-6">
            <div className="flex flex-col items-center gap-3">
              <VeniceLogo size={32} className="opacity-80" />
              <div className="text-[20px] font-semibold text-text-primary">How can I help today?</div>
              <p className="text-[14px] text-text-secondary max-w-sm">
                {apiKey
                  ? 'Pick a model in the header above, then start a conversation. Streaming, web search, and citations are all built in.'
                  : 'Connect a Venice API key from the header above to get started.'}
              </p>
            </div>
            {apiKey && (
              <div className="w-full max-w-md flex flex-col gap-2">
                <div className="text-[12px] uppercase tracking-[0.08em] text-text-muted font-medium text-left">Try one of these</div>
                <div className="flex flex-col gap-1.5">
                  {STARTER_PROMPTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => send(p, model)}
                      className="text-left px-3 py-2.5 rounded-lg border border-border bg-surface-elevated hover:border-accent/40 text-text-secondary hover:text-text-primary hover:bg-surface transition-all text-[14px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent cursor-pointer"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <VeniceParams />
          </div>
        ) : (
          <>
            <div className="border-b border-border">
              <VeniceParams />
            </div>
            <div className="w-full max-w-[960px] mx-auto py-5 px-4 sm:px-5 flex flex-col gap-5">
              {conversation.messages.map((msg, i) => (
                <MessageBubble
                  key={i}
                  message={msg}
                  index={i}
                  onCopy={() => {}}
                  onDelete={() => { if (conversation) deleteMessage(conversation.id, i) }}
                  onRegenerate={msg.role === 'assistant' && i === conversation.messages.length - 1 ? () => regenerate(model) : undefined}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          </>
        )}
      </div>
      <ChatInput onSend={(msg, images) => send(msg, model, images)} onStop={stop} isStreaming={isStreaming} disabled={!apiKey} />
    </div>
  )
}
