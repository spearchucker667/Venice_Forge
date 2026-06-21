/** @fileoverview Persistent chat stream lifetime manager.
 *
 *  The active provider stream is owned outside of React so that switching
 *  tabs (which unmounts `ChatView`) does not abort an in-flight assistant
 *  response. Only an explicit `stopStream()` aborts the signal.
 */

import { veniceStreamChat } from "../services/veniceClient";
import { useChatStore } from "./chat-store";
import { useCharacterStore } from "./character-store";
import { useSettingsStore } from "./settings-store";
import { applyVeniceApiSafeMode } from "../shared/veniceSafeMode";
import type { ChatMessage, ContentPart, VeniceParameters } from "../types/venice";
import type { Conversation } from "../types/conversation";
import * as logger from "../shared/logger";

/** Safe, non-disclosing error text appended to assistant messages when a
 *  chat stream fails. Never include raw exception text, paths, or secrets. */
const SAFE_STREAM_ERROR_MESSAGE = "Sorry, something went wrong. Please try again.";

export interface StreamState {
  isStreaming: boolean;
  convId: string | null;
}

/** Resolves the character slug for a conversation, in priority order:
 *  1. The conversation's persisted character metadata (authoritative).
 *  2. The user's currently-selected character slug in the Characters tab
 *     (used only when starting a brand-new conversation that has not yet
 *     been saved with character metadata).
 *
 *  Local RP character conversations never resolve a Venice.ai slug and never
 *  fall back to the global selection. */
export function resolveCharacterSlug(conv: Conversation | undefined): string | null {
  const character = conv?.metadata?.character;
  if (character?.localCharacterId) return null;
  const persisted = character?.slug?.trim();
  if (persisted) return persisted;
  const globalSlug = useCharacterStore.getState().selectedCharacterSlug;
  if (globalSlug) return globalSlug.trim();
  return null;
}

function prependInjectedContext(
  content: string | ContentPart[],
  injectedContext?: string,
): string | ContentPart[] {
  if (!injectedContext?.trim()) return content;

  if (typeof content === "string") {
    return `${injectedContext.trim()}\n\n${content}`;
  }

  const textPartIndex = content.findIndex((part) => part.type === "text");
  if (textPartIndex === -1) {
    return [{ type: "text", text: injectedContext.trim() }, ...content];
  }

  return content.map((part, index) =>
    index === textPartIndex && part.type === "text"
      ? { ...part, text: `${injectedContext.trim()}\n\n${part.text}` }
      : part,
  );
}

function buildStreamBody(convId: string, model: string): Record<string, unknown> {
  const state = useChatStore.getState();
  const conv = state.conversations.find((c) => c.id === convId);
  if (!conv) throw new Error(`Conversation ${convId} not found`);

  const requestMessages: ChatMessage[] = conv.messages
    .filter((m) => m.content !== "")
    .map((m) => {
      const content =
        m.role === "user"
          ? prependInjectedContext(m.content, m.metadata?.injectedContext)
          : m.content;
      return { role: m.role, content };
    });

  const characterSystemPrompt = conv.metadata?.character?.systemPrompt;
  const effectiveSystemPrompt = conv.metadata?.character
    ? (conv.systemPrompt ?? characterSystemPrompt ?? "").trim()
    : (conv.systemPrompt ?? state.systemPrompt).trim();
  if (effectiveSystemPrompt) {
    requestMessages.unshift({ role: "system", content: effectiveSystemPrompt });
  }

  const characterSlug = resolveCharacterSlug(conv);
  const veniceParamsForRequest: VeniceParameters = { ...state.veniceParams };
  if (characterSlug) {
    veniceParamsForRequest.character_slug = characterSlug;
  } else {
    delete veniceParamsForRequest.character_slug;
  }

  const isCharacterConversation = !!conv.metadata?.character;
  if (isCharacterConversation) {
    veniceParamsForRequest.include_venice_system_prompt = false;
    if (
      conv.metadata?.character?.webEnabled &&
      veniceParamsForRequest.enable_web_search === "off"
    ) {
      veniceParamsForRequest.enable_web_search = "auto";
    }
  }

  const baseBody: Record<string, unknown> = {
    model,
    messages: requestMessages,
    stream: true,
    temperature: state.temperature,
    top_p: state.topP,
    max_tokens: state.maxTokens,
    venice_parameters: veniceParamsForRequest,
  };

  return applyVeniceApiSafeMode(
    "/chat/completions",
    baseBody,
    useSettingsStore.getState().veniceApiSafeMode,
  );
}

let activeController: AbortController | null = null;
let activeConvId: string | null = null;
let activeGeneration = 0;
const listeners = new Set<(state: StreamState) => void>();

function notifyListeners(): void {
  const snapshot: StreamState = {
    isStreaming: activeController != null,
    convId: activeConvId,
  };
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (err) {
      logger.error("chat-stream-manager listener failed", err);
    }
  });
}

/** Returns true when a provider stream is currently active. */
export function isStreaming(): boolean {
  return activeController != null;
}

/** Returns the conversation id of the active stream, if any. */
export function getActiveConvId(): string | null {
  return activeConvId;
}

/** Subscribe to stream lifetime changes. The listener is called immediately
 *  with the current state and again whenever a stream starts or stops.
 *  Returns an unsubscribe function. */
export function subscribeToStreamState(
  listener: (state: StreamState) => void,
): () => void {
  listeners.add(listener);
  listener({
    isStreaming: activeController != null,
    convId: activeConvId,
  });
  return () => {
    listeners.delete(listener);
  };
}

/** Abort the active stream, if any. The stream promise resolves as aborted. */
export function stopStream(): void {
  activeController?.abort();
}

/** Start a chat stream for the given conversation and model.
 *
 *  Builds the request body from the current conversation state, owns the
 *  `AbortController`, and appends deltas to the last assistant message via
 *  the chat store. Returns `{ aborted: true }` when the stream was stopped
 *  by the user, otherwise `{ aborted: false }`. */
export async function startStream(
  convId: string,
  model: string,
): Promise<{ aborted: boolean }> {
  const generation = ++activeGeneration;

  // Abort any previous stream before starting a new one. The previous
  // generation's finally block will see a mismatched generation and will
  // not clear the new controller.
  activeController?.abort();

  const controller = new AbortController();
  activeController = controller;
  activeConvId = convId;
  notifyListeners();
  useChatStore.getState().setStreaming(true);

  try {
    const body = buildStreamBody(convId, model);
    await veniceStreamChat(body, {
      signal: controller.signal,
      onDelta: (chunk: { content: string; reasoning: string }) => {
        if (chunk.content) {
          useChatStore.getState().appendToLastAssistant(convId, chunk.content);
        }
        if (chunk.reasoning) {
          useChatStore.getState().appendReasoningToLastAssistant(convId, chunk.reasoning);
        }
      },
    });
    return { aborted: false };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { aborted: true };
    }
    logger.error("chat stream manager failed", err);
    useChatStore.getState().appendToLastAssistant(convId, `\n\n[Error: ${SAFE_STREAM_ERROR_MESSAGE}]`);
    return { aborted: false };
  } finally {
    if (activeGeneration === generation) {
      activeController = null;
      activeConvId = null;
      useChatStore.getState().setStreaming(false);
      notifyListeners();
    }
  }
}
