import { useCallback, useRef } from 'react'
import { venice } from '../lib/venice-client'
import { parseSSEStream } from '../lib/stream'
import { useChatStore } from '../stores/chat-store'
import { useSettingsStore } from '../stores/settings-store'
import type { ChatCompletionRequest, ChatMessage, ContentPart } from '../types/venice'

export function useChat() {
  const abortRef = useRef<AbortController | null>(null)
  const {
    addMessage,
    appendToLastAssistant,
    appendReasoningToLastAssistant,
    deleteMessage,
    setStreaming,
    isStreaming,
    veniceParams,
    systemPrompt,
    temperature,
    topP,
    maxTokens,
    createConversation,
  } = useChatStore()

  const streamResponse = useCallback(
    async (convId: string, model: string, abortController: AbortController) => {
      const conv = useChatStore.getState().conversations.find((c) => c.id === convId)
      if (!conv) return

      const requestMessages: ChatMessage[] = conv.messages
        .filter((m) => m.content !== '')
        .map((m) => {
          let content = m.content;
          if (m.role === 'user' && m.metadata?.injectedContext) {
            content = m.metadata.injectedContext + "\n\n" + content;
          }
          return { role: m.role, content };
        })
      if (systemPrompt.trim()) {
        requestMessages.unshift({ role: 'system', content: systemPrompt.trim() })
      }

      const body: ChatCompletionRequest = {
        model,
        messages: requestMessages,
        stream: true,
        temperature,
        top_p: topP,
        max_tokens: maxTokens,
        venice_parameters: veniceParams,
      }

      // Pass body as object (not JSON.stringify): venice() in
      // src/lib/venice-client.ts:17 will JSON.parse it back, and the
      // IPC layer will re-stringify. Two round-trips is wasteful and
      // can change key ordering.
      const stream = await venice<ReadableStream<Uint8Array>>('/chat/completions', {
        method: 'POST',
        body,
        stream: true,
        signal: abortController.signal,
      })

      for await (const chunk of parseSSEStream(stream, { signal: abortController.signal })) {
        const delta = chunk.choices[0]?.delta
        if (delta?.content) {
          appendToLastAssistant(convId, delta.content)
        }
        if (delta?.reasoning_content) {
          appendReasoningToLastAssistant(convId, delta.reasoning_content)
        }
      }
    },
    [appendToLastAssistant, appendReasoningToLastAssistant, veniceParams, systemPrompt, temperature, topP, maxTokens],
  )

  const send = useCallback(
    async (userMessage: string, model: string, imageAttachments?: string[]) => {
      let convId = useChatStore.getState().activeConversationId
      if (!convId) {
        convId = createConversation(model)
      }

      const { pendingContext, setPendingContext } = useChatStore.getState()
      const { enableMemoryRetrieval, showPulledContextBeforeSending } = useSettingsStore.getState()

      let contextToInject = "";

      if (window.veniceForge?.conversations && enableMemoryRetrieval) {
        if (pendingContext && pendingContext.message === userMessage) {
          contextToInject = pendingContext.injectedText;
          setPendingContext(null);
        } else if (showPulledContextBeforeSending) {
          const res = await window.veniceForge.conversations.pullContext({ message: userMessage });
          if (res.ok && res.context && res.context.injectedText) {
            setPendingContext({
              ...res.context,
              message: userMessage,
            });
            return;
          }
        } else {
          const res = await window.veniceForge.conversations.pullContext({ message: userMessage });
          if (res.ok && res.context && res.context.injectedText) {
            contextToInject = res.context.injectedText;
          }
        }
      }

      // Build user message — plain text or multimodal with images
      let userMsg: ChatMessage
      if (imageAttachments && imageAttachments.length > 0) {
        const parts: ContentPart[] = [
          { type: 'text', text: userMessage },
          ...imageAttachments.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
        ]
        userMsg = {
          role: 'user',
          content: parts,
          metadata: contextToInject ? { injectedContext: contextToInject } : undefined
        }
      } else {
        userMsg = {
          role: 'user',
          content: userMessage,
          metadata: contextToInject ? { injectedContext: contextToInject } : undefined
        }
      }

      addMessage(convId, userMsg)
      addMessage(convId, { role: 'assistant', content: '' })
      setStreaming(true)

      const abortController = new AbortController()
      abortRef.current = abortController

      try {
        await streamResponse(convId, model, abortController)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        const message = err instanceof Error ? err.message : 'Unknown error'
        appendToLastAssistant(convId!, `\n\n[Error: ${message}]`)
      } finally {
        setStreaming(false)
        abortRef.current = null
      }
    },
    [addMessage, appendToLastAssistant, createConversation, setStreaming, streamResponse],
  )

  const regenerate = useCallback(
    async (model: string) => {
      const convId = useChatStore.getState().activeConversationId
      if (!convId) return
      const conv = useChatStore.getState().conversations.find((c) => c.id === convId)
      if (!conv) return

      const lastAssistantIdx = conv.messages.length - 1
      if (conv.messages[lastAssistantIdx]?.role === 'assistant') {
        deleteMessage(convId, lastAssistantIdx)
      }

      addMessage(convId, { role: 'assistant', content: '' })
      setStreaming(true)

      const abortController = new AbortController()
      abortRef.current = abortController

      try {
        await streamResponse(convId, model, abortController)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        const message = err instanceof Error ? err.message : 'Unknown error'
        appendToLastAssistant(convId, `\n\n[Error: ${message}]`)
      } finally {
        setStreaming(false)
        abortRef.current = null
      }
    },
    [addMessage, appendToLastAssistant, deleteMessage, setStreaming, streamResponse],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setStreaming(false)
  }, [setStreaming])

  return { send, stop, regenerate, isStreaming }
}
