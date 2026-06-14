import { useCallback, useRef, useEffect } from 'react'
import { veniceStreamChat } from '../services/veniceClient'
import { useChatStore } from '../stores/chat-store'
import { useSettingsStore } from '../stores/settings-store'
import { useCharacterStore } from '../stores/character-store'
import { desktopConversations } from '../services/desktopBridge'
import type { ChatMessage, ContentPart, VeniceParameters } from '../types/venice'
import type { Conversation } from '../types/conversation'
import { applyVeniceApiSafeMode } from '../shared/veniceSafeMode'
import { generateCharacterScene } from '../services/characterSceneGenerationService'
import { parseCharacterSceneRequest } from '../services/characterSceneRequestParser'
import { CharacterSceneRateLimiter } from '../services/characterSceneRateLimiter'
import type { CharacterSceneGenerationResult } from '../types/characterSceneGeneration'

/** Resolves the character slug for a conversation, in priority order:
 *  1. The conversation's persisted character metadata (authoritative).
 *  2. The user's currently-selected character slug in the Characters tab
 *     (used only when starting a brand-new conversation that has not yet
 *     been saved with character metadata).
 *
 *  This means a character chat always stays bound to the slug it was
 *  started with, even if the user later switches the global selection. */
function resolveCharacterSlug(conv: Conversation | undefined): string | null {
  const persisted = conv?.metadata?.character?.slug?.trim();
  if (persisted) return persisted;
  const globalSlug = useCharacterStore.getState().selectedCharacterSlug;
  if (globalSlug) return globalSlug.trim();
  return null;
}

/** Module-level rate limiter shared across hook instances and lifetimes. */
const sceneRateLimiter = new CharacterSceneRateLimiter();

function prependInjectedContext(
  content: string | ContentPart[],
  injectedContext?: string,
): string | ContentPart[] {
  if (!injectedContext?.trim()) return content

  if (typeof content === 'string') {
    return `${injectedContext.trim()}\n\n${content}`
  }

  const textPartIndex = content.findIndex((part) => part.type === 'text')
  if (textPartIndex === -1) {
    return [{ type: 'text', text: injectedContext.trim() }, ...content]
  }

  return content.map((part, index) =>
    index === textPartIndex && part.type === 'text'
      ? { ...part, text: `${injectedContext.trim()}\n\n${part.text}` }
      : part,
  )
}

export function useChat() {
  const abortRef = useRef<AbortController | null>(null)
  const sceneAbortRef = useRef<AbortController | null>(null)
  const addMessage = useChatStore((s) => s.addMessage)
  const appendToLastAssistant = useChatStore((s) => s.appendToLastAssistant)
  const appendReasoningToLastAssistant = useChatStore(
    (s) => s.appendReasoningToLastAssistant,
  )
  const deleteMessage = useChatStore((s) => s.deleteMessage)
  const setMessageMetadata = useChatStore((s) => s.setMessageMetadata)
  const setStreaming = useChatStore((s) => s.setStreaming)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const veniceParams = useChatStore((s) => s.veniceParams)
  const systemPrompt = useChatStore((s) => s.systemPrompt)
  const temperature = useChatStore((s) => s.temperature)
  const topP = useChatStore((s) => s.topP)
  const maxTokens = useChatStore((s) => s.maxTokens)
  const createConversation = useChatStore((s) => s.createConversation)
  const characterSceneGenerationEnabled = useSettingsStore((s) => s.characterSceneGenerationEnabled)
  const characterSceneGenerationMode = useSettingsStore((s) => s.characterSceneGenerationMode)

  const streamResponse = useCallback(
    async (convId: string, model: string, abortController: AbortController) => {
      const conv = useChatStore.getState().conversations.find((c) => c.id === convId)
      if (!conv) return

      const requestMessages: ChatMessage[] = conv.messages
        .filter((m) => m.content !== '')
        .map((m) => {
          const content = m.role === 'user'
            ? prependInjectedContext(m.content, m.metadata?.injectedContext)
            : m.content;
          return { role: m.role, content };
        })
      if (systemPrompt.trim()) {
        requestMessages.unshift({ role: 'system', content: systemPrompt.trim() })
      }

      // Character slug is conversation-scoped: the persisted character
      // metadata wins. We deliberately drop any prior global selection
      // so a character chat does not silently swap personas mid-thread.
      const characterSlug = resolveCharacterSlug(conv);
      const veniceParamsForRequest: VeniceParameters = {
        ...veniceParams,
      };
      if (characterSlug) {
        veniceParamsForRequest.character_slug = characterSlug;
      } else {
        delete veniceParamsForRequest.character_slug;
      }

      // Build the base body then route the Venice API Safe Mode flag
      // through the centralised helper so the endpoint matrix stays the
      // single source of truth. (Note: safe_mode is no longer sent to
      // /chat/completions — applyVeniceApiSafeMode is a no-op for this
      // endpoint.)
      const baseBody: Record<string, unknown> = {
        model,
        messages: requestMessages,
        stream: true,
        temperature,
        top_p: topP,
        max_tokens: maxTokens,
        venice_parameters: veniceParamsForRequest,
      };
      const body = applyVeniceApiSafeMode(
        "/chat/completions",
        baseBody,
        useSettingsStore.getState().veniceApiSafeMode,
      );

      await veniceStreamChat(body, {
        signal: abortController.signal,
        onDelta: (chunk: { content: string; reasoning: string }) => {
          if (chunk.content) {
            appendToLastAssistant(convId, chunk.content)
          }
          if (chunk.reasoning) {
            appendReasoningToLastAssistant(convId, chunk.reasoning)
          }
        },
      })
    },
    [appendToLastAssistant, appendReasoningToLastAssistant, veniceParams, systemPrompt, temperature, topP, maxTokens],
  )

  const runSceneGeneration = useCallback(
    async (
      convId: string,
      source: 'on_demand' | 'automatic',
      selectedMessageId?: string,
      assistantMessageId?: string,
    ) => {
      const conv = useChatStore.getState().conversations.find((c) => c.id === convId)
      if (!conv) return
      if (!resolveCharacterSlug(conv)) return

      const messageIndex = conv.messages.findIndex((m) => m.id === (assistantMessageId ?? selectedMessageId))
      if (messageIndex === -1 && source === 'on_demand') return

      const initialResult: CharacterSceneGenerationResult = {
        requestId: 'pending',
        status: 'queued',
        updatedAt: new Date().toISOString(),
      }
      if (messageIndex >= 0) {
        setMessageMetadata(convId, messageIndex, { sceneGeneration: initialResult })
      }

      sceneAbortRef.current?.abort()
      const sceneAbort = new AbortController()
      sceneAbortRef.current = sceneAbort

      const result = await generateCharacterScene({
        conversation: conv,
        source,
        selectedMessageId,
        assistantMessageId,
        limiter: sceneRateLimiter,
        signal: sceneAbort.signal,
      })

      if (sceneAbort.signal.aborted) return

      const enriched: CharacterSceneGenerationResult = { ...result }
      if (messageIndex >= 0) {
        setMessageMetadata(convId, messageIndex, { sceneGeneration: enriched })
      }
    },
    [setMessageMetadata],
  )

  const maybeAutoGenerateScene = useCallback(
    async (convId: string) => {
      if (!characterSceneGenerationEnabled || characterSceneGenerationMode !== 'auto') return
      const conv = useChatStore.getState().conversations.find((c) => c.id === convId)
      if (!conv || !resolveCharacterSlug(conv)) return

      const lastAssistant = [...conv.messages].reverse().find((m) => m.role === 'assistant')
      if (!lastAssistant || !lastAssistant.id) return

      const text = typeof lastAssistant.content === 'string' ? lastAssistant.content : ''
      const { request, displayText } = parseCharacterSceneRequest(text)
      if (!request) return

      const assistantIndex = conv.messages.findIndex((m) => m.id === lastAssistant.id)
      if (assistantIndex >= 0 && displayText !== text) {
        setMessageMetadata(convId, assistantIndex, { sceneGeneration: { requestId: 'pending', status: 'queued', updatedAt: new Date().toISOString() } })
        // Update content to strip marker without mutating the message object shape.
        const msgs = [...conv.messages]
        msgs[assistantIndex] = { ...msgs[assistantIndex], content: displayText }
        useChatStore.setState((s) => ({
          conversations: s.conversations.map((c) => (c.id === convId ? { ...c, messages: msgs } : c)),
        }))
      }

      await runSceneGeneration(convId, 'automatic', undefined, lastAssistant.id)
    },
    [characterSceneGenerationEnabled, characterSceneGenerationMode, runSceneGeneration, setMessageMetadata],
  )

  const createScene = useCallback(
    async (selectedMessageId?: string) => {
      const convId = useChatStore.getState().activeConversationId
      if (!convId) return
      if (!characterSceneGenerationEnabled) return
      await runSceneGeneration(convId, 'on_demand', selectedMessageId)
    },
    [characterSceneGenerationEnabled, runSceneGeneration],
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

      if (enableMemoryRetrieval) {
        if (pendingContext && pendingContext.message === userMessage) {
          contextToInject = pendingContext.injectedText;
          setPendingContext(null);
        } else if (showPulledContextBeforeSending) {
          const res = await desktopConversations.pullContext({ message: userMessage });
          if (res.ok && res.context && res.context.injectedText) {
            setPendingContext({
              ...res.context,
              message: userMessage,
            });
            return;
          }
        } else {
          const res = await desktopConversations.pullContext({ message: userMessage });
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
        if (!abortController.signal.aborted) {
          await maybeAutoGenerateScene(convId)
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        const message = err instanceof Error ? err.message : 'Unknown error'
        appendToLastAssistant(convId!, `\n\n[Error: ${message}]`)
      } finally {
        setStreaming(false)
        abortRef.current = null
      }
    },
    [addMessage, appendToLastAssistant, createConversation, setStreaming, streamResponse, maybeAutoGenerateScene],
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
        if (!abortController.signal.aborted) {
          await maybeAutoGenerateScene(convId)
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        const message = err instanceof Error ? err.message : 'Unknown error'
        appendToLastAssistant(convId, `\n\n[Error: ${message}]`)
      } finally {
        setStreaming(false)
        abortRef.current = null
      }
    },
    [addMessage, appendToLastAssistant, deleteMessage, setStreaming, streamResponse, maybeAutoGenerateScene],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    sceneAbortRef.current?.abort()
    setStreaming(false)
  }, [setStreaming])

  // Abort any in-flight stream when the consuming component unmounts
  // so that callbacks do not fire against detached state.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      sceneAbortRef.current?.abort()
      abortRef.current = null
      sceneAbortRef.current = null
    }
  }, [])

  return { send, stop, regenerate, isStreaming, createScene }
}
