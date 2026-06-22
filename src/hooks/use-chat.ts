import { useCallback, useRef, useState } from 'react'
import { useChatStore } from '../stores/chat-store'
import { useSettingsStore } from '../stores/settings-store'
import {
  resolveCharacterSlug,
  startStream,
  stopStream,
} from '../stores/chat-stream-manager'
import { toast } from '../stores/toast-store'
import { desktopConversations } from '../services/desktopBridge'
import type { ChatMessage, ContentPart } from '../types/venice'
import { generateCharacterScene } from '../services/characterSceneGenerationService'
import { parseCharacterSceneRequest } from '../services/characterSceneRequestParser'
import { CharacterSceneRateLimiter } from '../services/characterSceneRateLimiter'
import type { CharacterSceneGenerationResult } from '../types/characterSceneGeneration'
import type { IngestedAttachment } from '../types/ingestion'
import { MAX_TOTAL_CONTEXT_BYTES } from '../services/ingestion/ingestionLimits'
import * as logger from '../shared/logger'

/** Safe, non-disclosing error text appended to assistant messages when a
 *  chat stream fails. Never include raw exception text, paths, or secrets. */
const SAFE_STREAM_ERROR_MESSAGE = 'Sorry, something went wrong. Please try again.'
async function pullMemoryContextForSend(userMessage: string) {
  try {
    return await desktopConversations.pullContext({ message: userMessage });
  } catch (err) {
    logger.warn('useChat memory retrieval skipped', err);
    return {
      ok: false as const,
      context: { injectedText: '', facts: [], summaries: [], tokenEstimate: 0 },
      error: 'Memory retrieval unavailable.',
    };
  }
}

/** Module-level rate limiter shared across hook instances and lifetimes. */
const sceneRateLimiter = new CharacterSceneRateLimiter();

function joinInjectedContexts(...contexts: Array<string | undefined>): string {
  return contexts.map((context) => context?.trim()).filter(Boolean).join('\n\n')
}

export type ChatMemoryStatus = 'disabled' | 'idle' | 'loading' | 'injected' | 'failed'
export type ChatMemoryDecision =
  | { mode: 'auto'; source?: 'global' | 'chat_toggle' | 'preview' | 'prior_context' }
  | { mode: 'disabled_for_message'; source?: 'global' | 'chat_toggle' | 'preview' | 'prior_context' }
  | { mode: 'approved_context'; approvedContext?: string; source?: 'global' | 'chat_toggle' | 'preview' | 'prior_context' }
type InjectedContextSource = NonNullable<ChatMessage['metadata']>['injectedContextSource']

export function useChat() {
  const sceneAbortRef = useRef<AbortController | null>(null)
  const stopRequestedRef = useRef(false)
  const [memoryStatus, setMemoryStatus] = useState<ChatMemoryStatus>('idle')
  const addMessage = useChatStore((s) => s.addMessage)
  const deleteMessage = useChatStore((s) => s.deleteMessage)
  const setMessageMetadata = useChatStore((s) => s.setMessageMetadata)
  const setStreaming = useChatStore((s) => s.setStreaming)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const createConversation = useChatStore((s) => s.createConversation)
  const characterSceneGenerationEnabled = useSettingsStore((s) => s.characterSceneGenerationEnabled)
  const characterSceneGenerationMode = useSettingsStore((s) => s.characterSceneGenerationMode)

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
    async (
      userMessage: string,
      model: string,
      attachments?: IngestedAttachment[],
      explicitContext?: string,
      memoryDecision: ChatMemoryDecision = { mode: 'auto', source: 'global' },
    ) => {
      let convId = useChatStore.getState().activeConversationId
      if (!convId) {
        convId = createConversation(model)
      }

      const { pendingContext, setPendingContext } = useChatStore.getState()
      const { enableMemoryRetrieval, showPulledContextBeforeSending } = useSettingsStore.getState()
      const conv = useChatStore.getState().conversations.find((c) => c.id === convId)
      const chatMemoryEnabled = conv?.metadata?.memoryRetrievalEnabled === true
      const isCharacterConversation = !!conv?.metadata?.character
      const streamModel = isCharacterConversation && conv?.model ? conv.model : model

      let contextToInject = "";
      let contextSource: InjectedContextSource | undefined;

      if (memoryDecision.mode === 'approved_context') {
        contextToInject = memoryDecision.approvedContext?.trim() ?? ''
        contextSource = 'approved_context'
        setPendingContext(null)
        setMemoryStatus(contextToInject ? 'injected' : 'idle')
      } else if (memoryDecision.mode === 'disabled_for_message') {
        setPendingContext(null)
        setMemoryStatus('disabled')
      } else if (!enableMemoryRetrieval || !chatMemoryEnabled || isCharacterConversation) {
        if (pendingContext?.message === userMessage) setPendingContext(null)
        setMemoryStatus('disabled')
      } else if (pendingContext && pendingContext.message === userMessage) {
        contextToInject = pendingContext.injectedText;
        contextSource = 'memory'
        setPendingContext(null);
        setMemoryStatus('injected')
      } else if (showPulledContextBeforeSending) {
        setMemoryStatus('loading')
        const res = await pullMemoryContextForSend(userMessage);
        if (res.ok && res.context && res.context.injectedText) {
          setPendingContext({
            ...res.context,
            message: userMessage,
          });
          setMemoryStatus('injected')
          return;
        }
        if (!res.ok) {
          setMemoryStatus('failed')
        } else {
          setMemoryStatus('idle')
        }
      } else {
        setMemoryStatus('loading')
        const res = await pullMemoryContextForSend(userMessage);
        if (res.ok && res.context && res.context.injectedText) {
          contextToInject = res.context.injectedText;
          contextSource = 'memory'
          setMemoryStatus('injected')
        } else if (!res.ok) {
          setMemoryStatus('failed')
          // Non-destructive warning: memory failed but the user message still sends.
          toast.warn('Memory retrieval unavailable', 'Sending your message without memory context.')
        } else {
          setMemoryStatus('idle')
        }
      }

      if (explicitContext?.trim() && contextToInject.trim()) {
        contextSource = 'mixed'
      } else if (explicitContext?.trim() && !contextSource) {
        contextSource = 'prior_context'
      }
      contextToInject = joinInjectedContexts(explicitContext, contextToInject)
      const metadata = contextToInject
        ? { injectedContext: contextToInject, injectedContextSource: contextSource || 'mixed' }
        : undefined

      let combinedMessage = userMessage;
      const imageParts: ContentPart[] = [];

      if (attachments && attachments.length > 0) {
        let contextBytesUsed = new TextEncoder().encode(combinedMessage).length;
        let contextTruncated = false;

        for (const att of attachments) {
          if (att.kind === 'image' && att.dataUrl) {
            imageParts.push({ type: 'image_url', image_url: { url: att.dataUrl } });
            continue;
          }

          if (att.text) {
            const attBytes = new TextEncoder().encode(att.text).length;
            if (contextBytesUsed + attBytes > MAX_TOTAL_CONTEXT_BYTES) {
              contextTruncated = true;
              continue;
            }
            combinedMessage += `\n\n${att.text}`;
            contextBytesUsed += attBytes;
          }
        }

        if (contextTruncated) {
          toast.warn(
            'Attachment context truncated',
            `Total attachment text exceeded ${MAX_TOTAL_CONTEXT_BYTES / 1024} KB. Some attachments were omitted from this message.`,
          );
        }
      }

      let userMsg: ChatMessage
      if (imageParts.length > 0) {
        const parts: ContentPart[] = [
          { type: 'text', text: combinedMessage },
          ...imageParts,
        ]
        userMsg = {
          role: 'user',
          content: parts,
          metadata,
        }
      } else {
        userMsg = {
          role: 'user',
          content: combinedMessage,
          metadata,
        }
      }

      addMessage(convId, userMsg)
      addMessage(convId, { role: 'assistant', content: '' })

      stopRequestedRef.current = false
      try {
        const { aborted } = await startStream(convId, streamModel)
        if (!aborted && !stopRequestedRef.current) {
          await maybeAutoGenerateScene(convId)
        }
      } catch (err) {
        // The stream manager already appends a safe error message for non-
        // abort failures. Log any unexpected synchronous throw without
        // leaking raw error text to the UI.
        logger.error('useChat send failed', err)
        useChatStore.getState().appendToLastAssistant(convId, `\n\n[Error: ${SAFE_STREAM_ERROR_MESSAGE}]`)
      }
    },
    [addMessage, createConversation, startStream, maybeAutoGenerateScene],
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

      stopRequestedRef.current = false
      try {
        const { aborted } = await startStream(convId, model)
        if (!aborted && !stopRequestedRef.current) {
          await maybeAutoGenerateScene(convId)
        }
      } catch (err) {
        logger.error('useChat regenerate failed', err)
        useChatStore.getState().appendToLastAssistant(convId, `\n\n[Error: ${SAFE_STREAM_ERROR_MESSAGE}]`)
      }
    },
    [addMessage, deleteMessage, startStream, maybeAutoGenerateScene],
  )

  const stop = useCallback(() => {
    stopRequestedRef.current = true
    stopStream()
    sceneAbortRef.current?.abort()
    setStreaming(false)
  }, [setStreaming])

  return { send, stop, regenerate, isStreaming, createScene, memoryStatus }
}
