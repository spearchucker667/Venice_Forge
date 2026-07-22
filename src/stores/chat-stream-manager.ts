/** @fileoverview Persistent chat stream lifetime manager.
 *
 *  The active provider stream is owned outside of React so that switching
 *  tabs (which unmounts `ChatView`) does not abort an in-flight assistant
 *  response. Only an explicit `stopStream()` aborts the signal.
 */

import { veniceStreamChat } from "../services/veniceClient";
import { compileChatPrompt } from "../services/chatPromptCompiler";
import { flushConversationSaveNow, useChatStore, type AssistantStreamDelta } from "./chat-store";
import { useSettingsStore } from "./settings-store";
import { getConversationPersonaBinding } from "../utils/conversationKind";
import { applyVeniceApiSafeMode } from "../shared/veniceSafeMode";
import type { AssistantToolCall, ChatMessage, VeniceParameters } from "../types/venice";
import type { Conversation } from "../types/conversation";
import { createCanonicalToolDefinitions, type ProviderToolSchema } from "../agent/registry/tool-registry";
import { useDocumentAgentStore } from "./document-agent-store";
import * as logger from "../shared/logger";
import { getModelById } from "../services/modelService";

/** Safe, non-disclosing error text appended to assistant messages when a
 *  chat stream fails. Never include raw exception text, paths, or secrets. */
const SAFE_STREAM_ERROR_MESSAGE = "Sorry, something went wrong. Please try again.";

export interface StreamState {
  isStreaming: boolean;
  convId: string | null;
}

interface StreamChunk {
  content: string;
  reasoning: string;
  providerRequestId?: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  tool_calls?: Array<{ index: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }>;
  appendedMessages?: Array<{ role: string; content?: string; tool_call_id?: string; name?: string; tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }> }>;
}

const MAX_STREAM_RETRIES = 2;
const RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];

function isRetryableError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return false;
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as Record<string, unknown>).status;
    if (typeof status === "number" && RETRYABLE_STATUSES.includes(status)) return true;
  }
  // Catch typical network drop messages.
  if (err instanceof TypeError && err.message.toLowerCase().includes("fetch")) return true;
  if (err instanceof Error && (
      err.message.toLowerCase().includes("network") ||
      err.message.toLowerCase().includes("socket") ||
      err.message.toLowerCase().includes("econnreset")
  )) return true;
  return false;
}

/** Resolves the hosted character slug for a conversation from its persisted
 *  metadata only. Character identity is conversation-authoritative: global
 *  UI selection state (`useCharacterStore.selectedCharacterSlug`) must never
 *  leak into a provider request. Standard and local-character conversations
 *  always resolve to `null`. */
export function resolveCharacterSlug(conv: Conversation | undefined): string | null {
  const binding = getConversationPersonaBinding(conv);
  return binding.kind === "hosted-character" ? binding.slug : null;
}

function buildStreamBody(convId: string, model: string): Record<string, unknown> {
  const state = useChatStore.getState();
  const conv = state.conversations.find((c) => c.id === convId);
  if (!conv) throw new Error(`Conversation ${convId} not found`);

  const modelInfo = getModelById(model);
  const compiled = compileChatPrompt(
    conv as unknown as Conversation,
    state.systemPrompt,
    modelInfo,
    state.maxTokens,
    state.veniceParams.include_venice_system_prompt !== false,
  );

  const requestMessages = compiled.messages as ChatMessage[];

  const characterSlug = resolveCharacterSlug(conv as unknown as Conversation);
  const veniceParamsForRequest: VeniceParameters = { ...state.veniceParams };
  if (characterSlug) {
    veniceParamsForRequest.character_slug = characterSlug;
  } else {
    delete veniceParamsForRequest.character_slug;
  }

  // Use characterSlug as the authoritative signal: only suppress Venice's system
  // prompt when the request actually carries a character_slug to Venice. A
  // conversation with stale character metadata but no usable slug must not
  // suppress the Venice system prompt (it would receive neither a local nor a
  // hosted persona, producing a blank-persona response).
  const isHostedCharacterRequest = !!characterSlug;
  if (isHostedCharacterRequest) {
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
    stream_options: { include_usage: true },
    temperature: state.temperature,
    top_p: state.topP,
    max_tokens: compiled.maxTokens,
    venice_parameters: veniceParamsForRequest,
  };

  if (veniceParamsForRequest.enable_document_tools) {
    const definitions = createCanonicalToolDefinitions();
    // Only pass document tools, exclude workspace tools which need a specific grant.
    const tools = definitions.filter(d => d.internalName.startsWith('document.')).map(t => t.schema);
    if (tools.length > 0) {
      baseBody.tools = baseBody.tools ? [...(baseBody.tools as ProviderToolSchema[]), ...tools] : tools;
    }
  }

  // Phase 5: Expose media generation tools via structured tool-calling loop
  const allDefinitions = createCanonicalToolDefinitions();
  const mediaTools = allDefinitions.filter(d => d.internalName.startsWith('media.')).map(t => t.schema);
  if (mediaTools.length > 0) {
    baseBody.tools = baseBody.tools ? [...(baseBody.tools as ProviderToolSchema[]), ...mediaTools] : mediaTools;
  }

  // Include workspace tools when the Document Agent has an active workspace grant.
  // The grant is set by DocumentAgentView when the user explicitly opens a workspace;
  // it is null for ordinary chat and document-only sessions.
  const docAgentState = useDocumentAgentStore.getState();
  if (docAgentState.workspaceGrant) {
    const workspaceTools = allDefinitions
      .filter(d => d.internalName.startsWith('workspace.'))
      .map(t => t.schema);
    if (workspaceTools.length > 0) {
      baseBody.tools = baseBody.tools
        ? [...(baseBody.tools as ProviderToolSchema[]), ...workspaceTools]
        : workspaceTools;
    }
  }

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
const pendingStreamDeltas = new Map<string, AssistantStreamDelta>();
const streamFlushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const STREAM_FLUSH_MS = 40;

function flushStreamDelta(convId: string): void {
  const timer = streamFlushTimers.get(convId);
  if (timer) clearTimeout(timer);
  streamFlushTimers.delete(convId);
  const delta = pendingStreamDeltas.get(convId);
  if (!delta) return;
  pendingStreamDeltas.delete(convId);
  useChatStore.getState().appendAssistantStreamDelta(convId, delta);
}

function bufferStreamDelta(
  convId: string,
  chunk: StreamChunk,
): void {
  const pending = pendingStreamDeltas.get(convId) ?? {};
  pending.content = (pending.content ?? '') + (chunk.content ?? '');
  pending.reasoning = (pending.reasoning ?? '') + (chunk.reasoning ?? '');
  if (chunk.providerRequestId) pending.providerRequestId = chunk.providerRequestId;
  if (chunk.usage) {
    pending.usage = {
      promptTokens: chunk.usage.prompt_tokens,
      completionTokens: chunk.usage.completion_tokens,
      totalTokens: chunk.usage.total_tokens,
    };
  }
  if (chunk.tool_calls) {
    pending.tool_calls = chunk.tool_calls as AssistantToolCall[];
  }
  if (chunk.appendedMessages) {
    pending.appendedMessages = chunk.appendedMessages as ChatMessage[];
  }
  pendingStreamDeltas.set(convId, pending);
  if (!streamFlushTimers.has(convId)) {
    streamFlushTimers.set(convId, setTimeout(() => flushStreamDelta(convId), STREAM_FLUSH_MS));
  }
}

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
  if (activeConvId) flushStreamDelta(activeConvId);
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
    let attempts = 0;
    
    while (attempts <= MAX_STREAM_RETRIES) {
      try {
        const body = buildStreamBody(convId, model);
        await veniceStreamChat(body, {
          signal: controller.signal,
          onDelta: (chunk: StreamChunk) => {
            bufferStreamDelta(convId, chunk);
          },
        });
        flushStreamDelta(convId);
        return { aborted: false };
      } catch (err) {
        flushStreamDelta(convId);
        if (err instanceof DOMException && err.name === "AbortError") {
          return { aborted: true };
        }
        
        const retryable = isRetryableError(err);
        if (retryable && attempts < MAX_STREAM_RETRIES) {
          attempts++;
          logger.warn(`Stream dropped (attempt ${attempts}/${MAX_STREAM_RETRIES}). Retrying from checkpoint...`, err);
          // Exponential backoff before retry (1s, 2s)
          await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempts - 1)));
          continue;
        }
        
        logger.error("chat stream manager failed", err);
        useChatStore.getState().appendAssistantStreamDelta(convId, { content: `\n\n[Error: ${SAFE_STREAM_ERROR_MESSAGE}]` });
        return { aborted: false };
      }
    }
    return { aborted: false };
  } finally {
    flushStreamDelta(convId);
    void flushConversationSaveNow(convId).catch((error) => {
      logger.error("chat stream final persistence failed", error);
    });
    if (activeGeneration === generation) {
      activeController = null;
      activeConvId = null;
      useChatStore.getState().setStreaming(false);
      notifyListeners();
    }
  }
}
