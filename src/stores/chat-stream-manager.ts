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
import { resolveAvailableTools, type ProviderToolSchema } from "../agent/registry/tool-registry";
import type { VeniceStreamDelta } from "../shared/veniceStreamDelta";
import { useDocumentAgentStore } from "./document-agent-store";
import * as logger from "../shared/logger";
import { getModelById } from "../services/modelService";
import { resolveReasoningEffort } from "../shared/modelCapabilities";
import {
  resolveE2eeParam,
  resolvePromptCacheRetention,
} from "../utils/payloadBuilders";
import { SAFETY_PROVENANCE_FIELD } from "../shared/safety/promptSegments";
import { translateRuntime } from "../i18n/runtimeTranslator";
import { SafetyGuardBlockedError } from "../shared/safety";
import { resolveNativePartRef } from "../services/nativeContentPartRegistry";

/** Safe, non-disclosing error text appended to assistant messages when a
 *  chat stream fails. Never include raw exception text, paths, or secrets. */
const SAFE_STREAM_ERROR_MESSAGE = "Sorry, something went wrong. Please try again.";

export interface StreamState {
  isStreaming: boolean;
  convId: string | null;
}

// Shared transport envelope (P1-006): the same serializable delta shape the
// Electron agent loop emits (including `appendedMessages` with tool-result
// media/document metadata) is consumed by both transports.
type StreamChunk = VeniceStreamDelta;

const MAX_STREAM_RETRIES = 2;
const RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (typeof err === "object" && err !== null && "name" in err && (err as { name?: string }).name === "AbortError") return true;
  if (err instanceof Error) {
    const message = err.message;
    if (message === "Aborted" || message === "Request aborted" || message === "The operation was aborted.") return true;
  }
  return false;
}

function isRetryableError(err: unknown): boolean {
  if (isAbortError(err)) return false;
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
    { resolveNativePart: (ref) => resolveNativePartRef(ref) },
  );

  const requestMessages = compiled.messages as ChatMessage[];

  const characterSlug = resolveCharacterSlug(conv as unknown as Conversation);
  const veniceParamsForRequest: VeniceParameters = { ...state.veniceParams };
  if (characterSlug) {
    veniceParamsForRequest.character_slug = characterSlug;
  } else {
    delete veniceParamsForRequest.character_slug;
  }

  const binding = getConversationPersonaBinding(conv as unknown as Conversation);
  const isCharacterRequest = binding.kind !== "standard";
  if (isCharacterRequest) {
    veniceParamsForRequest.include_venice_system_prompt = false;
    if (
      conv.metadata?.character?.webEnabled &&
      veniceParamsForRequest.enable_web_search === "off"
    ) {
      veniceParamsForRequest.enable_web_search = "auto";
    }
  }

  // VF-20260916-P1-001 — the Venice-primary body MUST carry the user's E2EE
  // choice. Resolve the conversation override (falls back to the profile
  // default) against the selected model's `supportsE2EE` capability. Never
  // strip here: non-Venice fallback adapters sanitize their own clone via
  // `cloneSanitizedForFallbackProvider` (shared) and
  // `sanitizeProviderRequestBody` (Electron allowlist).
  const privacy = conv.metadata?.privacy;
  const e2eeParam = resolveE2eeParam(
    modelInfo,
    privacy?.e2eeOverride ?? state.e2eeOverride,
  );
  if (e2eeParam !== undefined) {
    veniceParamsForRequest.enable_e2ee = e2eeParam;
  }

  const baseBody: Record<string, unknown> = {
    model,
    messages: requestMessages,
    stream: true,
    stream_options: { include_usage: true },
    temperature: state.temperature,
    top_p: state.topP,
    max_completion_tokens: compiled.maxTokens,
    venice_parameters: veniceParamsForRequest,
  };

  // VF-20260916-P1-002 — typed safety provenance. The guard consumes these
  // segments directly (no serialized-envelope regex on this path); the
  // transport boundary serializes envelopes and strips this internal field
  // before anything leaves the app.
  if (compiled.safetyProvenance) {
    baseBody[SAFETY_PROVENANCE_FIELD] = compiled.safetyProvenance;
  }

  // VF-FEAT-004 — `prompt_cache_retention` is a TOP-LEVEL Venice-only cache
  // control (not a `venice_parameters` field). Conversation override wins over
  // the profile default; `'default'`/unset omits the field entirely.
  const cacheRetention = resolvePromptCacheRetention(
    privacy?.promptCacheRetention ?? state.promptCacheRetention,
  );
  if (cacheRetention !== undefined) {
    baseBody.prompt_cache_retention = cacheRetention;
  }

  // Reasoning effort (Phase 4C.2) — nested `reasoning.effort` request field
  // (the nested form accepted per upstream reasoning-models.mdx, matching
  // the existing buildChatPayload option shape), validated against the
  // selected model's advertised `reasoningEffortOptions`. The resolver
  // repairs/drops values the model does not support so an unsupported
  // effort never reaches the wire (Venice returns 400 and does not
  // auto-map).
  const reasoningEffort = resolveReasoningEffort(modelInfo, state.reasoningEffort);
  if (reasoningEffort !== undefined) {
    baseBody.reasoning = { effort: reasoningEffort };
  }

  // P1-005: tool injection is gated on explicit runtime metadata only.
  const docAgentState = useDocumentAgentStore.getState();
  const availableTools = resolveAvailableTools(
    modelInfo,
    docAgentState.preset,
  );
  if (availableTools.length > 0) {
    baseBody.tools = baseBody.tools ? [...(baseBody.tools as ProviderToolSchema[]), ...availableTools] : availableTools;
  }
  baseBody.venice_parameters = {
    ...veniceParamsForRequest,
  };
  if (baseBody.venice_parameters && typeof baseBody.venice_parameters === "object") {
    // `enable_document_tools` is handled exclusively through the canonical
    // `tools` array on this path, so the legacy boolean is dropped here
    // (codified contract — see chat-stream-manager tests). NOTE: this is NOT
    // a fallback-compatibility strip; the fallback chain sanitizes its own
    // clone and never sees this body mutated. `enable_e2ee` must NOT be
    // deleted here — that was the VF-20260916-P1-001 defect.
    const veniceParams = baseBody.venice_parameters as {
      enable_document_tools?: boolean;
    };
    delete veniceParams.enable_document_tools;
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

function mergeToolCallFragments(
  existing: AssistantToolCall[] | undefined,
  incoming: NonNullable<StreamChunk["tool_calls"]>,
): AssistantToolCall[] {
  const merged = existing ? [...existing] : [];
  for (const fragment of incoming) {
    const idx = typeof fragment.index === "number" ? fragment.index : merged.length;
    const current = merged[idx] ?? {
      id: "",
      type: "function" as const,
      function: { name: "", arguments: "" },
    };
    merged[idx] = {
      id: fragment.id || current.id,
      type: "function",
      function: {
        name: fragment.function?.name || current.function.name,
        arguments: `${current.function.arguments}${fragment.function?.arguments ?? ""}`,
      },
    };
  }
  return merged;
}

function discardStreamDelta(convId: string): void {
  const timer = streamFlushTimers.get(convId);
  if (timer) clearTimeout(timer);
  streamFlushTimers.delete(convId);
  pendingStreamDeltas.delete(convId);
}

function isSafetyBlockError(err: unknown): boolean {
  if (err instanceof SafetyGuardBlockedError) return true;
  if (typeof err === "object" && err !== null && "status" in err) {
    return (err as { status?: unknown }).status === 451;
  }
  return false;
}

function removeLastAssistantTurn(convId: string): void {
  const conv = useChatStore.getState().conversations.find((c) => c.id === convId);
  if (!conv) return;
  const lastIdx = conv.messages.length - 1;
  if (lastIdx >= 0 && conv.messages[lastIdx]?.role === "assistant") {
    useChatStore.getState().deleteMessage(convId, lastIdx);
  }
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
    const seed =
      pending.tool_calls ??
      (() => {
        const conv = useChatStore.getState().conversations.find((c) => c.id === convId);
        const last = conv?.messages.at(-1);
        return last?.role === "assistant" ? last.tool_calls : undefined;
      })();
    pending.tool_calls = mergeToolCallFragments(seed, chunk.tool_calls);
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

if (typeof window !== "undefined") {
  window.addEventListener("venice-forge:abort-in-flight", () => {
    try {
      stopStream();
    } catch {
      /* ignore */
    }
  });
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
): Promise<{ aborted: boolean; blocked?: boolean }> {
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
    let hasCommittedStreamState = false;
    
    while (attempts <= MAX_STREAM_RETRIES) {
      try {
        const body = buildStreamBody(convId, model);
        const docAgentState = useDocumentAgentStore.getState();
        await veniceStreamChat(body, {
          signal: controller.signal,
          agentSessionId: docAgentState.agentSessionId,
          onDelta: (chunk: StreamChunk) => {
            const hasContent = chunk.content && chunk.content.length > 0;
            const hasReasoning = chunk.reasoning && chunk.reasoning.length > 0;
            const hasToolCalls = chunk.tool_calls && chunk.tool_calls.length > 0;
            const hasAppended = chunk.appendedMessages && chunk.appendedMessages.length > 0;
            if (hasContent || hasReasoning || hasToolCalls || hasAppended || chunk.usage) {
              hasCommittedStreamState = true;
            }
            bufferStreamDelta(convId, chunk);
          },
        });
        flushStreamDelta(convId);
        useChatStore.getState().clearSafetyPendingMessages(convId);
        return { aborted: false };
      } catch (err) {
        if (isAbortError(err)) {
          flushStreamDelta(convId);
          useChatStore.getState().clearSafetyPendingMessages(convId);
          return { aborted: true };
        }

        // VF-AUD-20260912-VCS-P1-004: do not commit buffered deltas on block
        // or hard failure. User abort still keeps the partial turn above.
        discardStreamDelta(convId);

        if (isSafetyBlockError(err)) {
          // VF-CUR-P1-001: discard the entire safety-pending turn so blocked
          // user content never becomes durable (in-memory or on disk).
          useChatStore.getState().discardSafetyPendingTurn(convId);
          // If the turn was already durable (e.g. regenerate), fall back to
          // removing only the assistant placeholder without re-adding an
          // error that would keep a blocked request visible in history.
          const conv = useChatStore
            .getState()
            .conversations.find((c) => c.id === convId);
          const last = conv?.messages.at(-1);
          if (last?.role === "assistant" && !(last.content && String(last.content).length > 0)) {
            removeLastAssistantTurn(convId);
          }
          return { aborted: false, blocked: true };
        }
        
        const retryable = isRetryableError(err);
        if (retryable && attempts < MAX_STREAM_RETRIES && !hasCommittedStreamState) {
          attempts++;
          // Extract status code from a structural cast (preferred over `as any`).
          // The cast is a TypeScript-only fiction; `?.` correctly handles the
          // case where the runtime object lacks these fields. (VF-AUD-20260912-N5)
          const errStatus = err as { status?: number; statusCode?: number };
          const status = errStatus?.status ?? errStatus?.statusCode ?? "unknown";
          logger.warn({
            category: "stream_retry",
            attempt: attempts,
            message: translateRuntime(
              "chat:stream.retryingFromCheckpoint",
              "Stream dropped. Retrying from checkpoint",
            ),
            status,
          });
          // Exponential backoff before retry (1s, 2s)
          await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempts - 1)));
          continue;
        }
        
        logger.error("chat stream manager failed", err);
        useChatStore.getState().clearSafetyPendingMessages(convId);
        removeLastAssistantTurn(convId);
        useChatStore.getState().addMessage(convId, {
          role: "assistant",
          content: `[Error: ${SAFE_STREAM_ERROR_MESSAGE}]`,
        });
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
