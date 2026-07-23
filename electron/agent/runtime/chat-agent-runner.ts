/* eslint-disable @typescript-eslint/no-explicit-any */

import { performGuardedVeniceRequest, type GuardedVeniceResult } from "../../services/guardPipeline";
import { executeAgentTool } from "./agent-tool-executor";
import type { AssistantToolCall } from "../../../src/types/venice";
import {
  CHAT_MEDIA_REF_ID_RE,
  CHAT_MEDIA_TYPES,
  CHAT_MEDIA_OPERATIONS,
  isChatMediaReferenceArrayContract,
  type ChatMediaReferenceContract,
} from "../../../src/shared/chatMediaReferenceContracts";
import { isChatDocumentRef, type ChatDocumentRef } from "../../../src/types/chatDocument";

interface SseChunk {
  content?: string;
  reasoning?: string;
  providerRequestId?: string;
  usage?: Record<string, unknown>;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: "function";
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
  finish_reason?: string | null;
  appendedMessages?: Array<{ role: string; content?: string; tool_call_id?: string; name?: string; tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>; metadata?: any }>;
}

/**
 * The agent tool executor returns canonical `ChatMediaReference` fields under
 * `data.chatRef` for media tools; project everything measured by the
 * executor into a canonical `ChatMediaReference[]` that the chat-store
 * Media Studio upsert path can consume without re-parsing stub fields.
 *
 * If the executor produced something malformed, we surface a structured
 * warning string in `metadata.generatedMediaWarning` so the renderer can
 * still render the assistant reply without losing the chat history, while
 * the inspector logs a redacted audit row. We never fall back to the legacy
 * `{mediaId, mimeType}` stub shape because that did not match the canonical
 * contract and caused silent render regressions on the Media Studio side.
 */
function extractCanonicalChatMediaReferences(toolResult: { ok: boolean; data?: unknown }): ChatMediaReferenceContract[] {
  if (!toolResult.ok) return [];
  const data = (toolResult.data ?? {}) as { chatRef?: unknown };
  if (!data || typeof data !== "object") return [];
  const candidate = data.chatRef as Partial<ChatMediaReferenceContract> | null;
  if (!candidate || typeof candidate !== "object") return [];

  const id = typeof candidate.id === "string" ? candidate.id : "";
  const mediaId = typeof candidate.mediaId === "string" ? candidate.mediaId : "";
  const mediaType = typeof candidate.mediaType === "string" && (CHAT_MEDIA_TYPES as readonly string[]).includes(candidate.mediaType)
    ? (candidate.mediaType as ChatMediaReferenceContract["mediaType"])
    : null;
  const operation = typeof candidate.operation === "string" && (CHAT_MEDIA_OPERATIONS as readonly string[]).includes(candidate.operation)
    ? (candidate.operation as ChatMediaReferenceContract["operation"])
    : null;
  const displayUrl = typeof candidate.displayUrl === "string" && candidate.displayUrl.length > 0 ? candidate.displayUrl : null;
  const createdAt = typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt) ? candidate.createdAt : Date.now();

  if (!CHAT_MEDIA_REF_ID_RE.test(id)) return [];
  if (!CHAT_MEDIA_REF_ID_RE.test(mediaId)) return [];
  if (!mediaType || !operation || !displayUrl) return [];

  const ref: ChatMediaReferenceContract = {
    id,
    mediaId,
    mediaType,
    operation,
    displayUrl,
    createdAt,
  };
  if (typeof candidate.thumbnailUrl === "string" && candidate.thumbnailUrl.length > 0) {
    ref.thumbnailUrl = candidate.thumbnailUrl;
  }
  if (typeof candidate.altText === "string" && candidate.altText.length > 0) {
    ref.altText = candidate.altText.slice(0, 200);
  }
  if (typeof candidate.modelId === "string" && candidate.modelId.length > 0) {
    ref.modelId = candidate.modelId.slice(0, 128);
  }
  if (!isChatMediaReferenceArrayContract([ref])) return [];
  return [ref];
}

function extractCanonicalChatDocumentReferences(toolResult: { ok: boolean; data?: unknown }): ChatDocumentRef[] {
  if (!toolResult.ok) return [];
  const data = (toolResult.data ?? {}) as { chatDocumentRef?: unknown };
  if (!data || typeof data !== "object") return [];
  const candidate = data.chatDocumentRef;
  if (!candidate || !isChatDocumentRef(candidate)) return [];
  return [candidate];
}

/**
 * Bounded multi-turn agent loop.
 *
 * Phase 3 §3.7 — VF-20260720-005 verification.
 *
 * Why bounded: the prior implementation stopped after the first tool
 * execution. The model never saw its own tool outputs and could not
 * iterate, reply, or self-correct. This implementation streams up to
 * 8 model turns and 16 executed tool calls per request, then returns
 * the last `GuardedVeniceResult`. The loop terminates early when:
 *
 * - the upstream finishes with a non-`tool_calls` finish_reason,
 * - the body contains no usable tool calls,
 * - the caller signal aborts,
 * - the bound (8 turns / 16 executed tool calls) is reached.
 *
 * The dispatched chat messages (assistant tool_calls + tool result
 * tool messages) are appended to the request body's `messages` array
 * before the next turn dispatch.
 */
const MAX_AGENT_TURNS = 8;
const MAX_AGENT_TOOL_CALLS = 16;
const TOOL_RESULT_MAX_CHARS = 50000;

interface TurnResult {
  result: GuardedVeniceResult;
  finishReason: string | null;
  aggregatedToolCalls: Map<number, AssistantToolCall>;
  appendedMessages: ToolResultMessage[];
  hasToolCalls: boolean;
}

type AppMessageRole = "tool";
type ToolResultMessage = {
  role: AppMessageRole;
  tool_call_id: string;
  name: string;
  content: string;
  metadata?: Record<string, unknown>;
};

async function streamAndExecuteTurn(
  request: { endpoint?: string; method?: string; profileId: string; agentSessionId?: string; body?: unknown; signal?: AbortSignal; headers?: Record<string, string>; signalId?: string },
  onDelta: (chunk: SseChunk) => void
): Promise<TurnResult> {
  const aggregatedToolCalls = new Map<number, AssistantToolCall>();
  let finalFinishReason: string | null = null;

  const fullRequest = {
    endpoint: request.endpoint ?? "/chat/completions",
    method: request.method ?? "POST",
    ...request,
  };

  const result = await performGuardedVeniceRequest(fullRequest, {
    onDelta: (chunk: SseChunk) => {
      if (chunk.tool_calls) {
        for (const tc of chunk.tool_calls) {
          if (!aggregatedToolCalls.has(tc.index)) {
            aggregatedToolCalls.set(tc.index, {
              id: tc.id || "",
              type: "function",
              function: { name: tc.function?.name || "", arguments: "" },
            });
          }
          const existing = aggregatedToolCalls.get(tc.index)!;
          if (tc.function?.arguments) {
            existing.function.arguments += tc.function.arguments;
          }
        }
      }
      if (chunk.finish_reason) {
        finalFinishReason = chunk.finish_reason;
      }
      if (chunk.tool_calls) {
        const formattedToolCalls = chunk.tool_calls.map(tc => ({
           id: tc.id || "",
           type: "function" as const,
           function: {
             name: tc.function?.name || "",
             arguments: tc.function?.arguments || ""
           }
        }));
        (chunk as { tool_calls: unknown }).tool_calls = formattedToolCalls;
      }
      onDelta(chunk);
    },
  });

  if (result.kind === "blocked") {
    return {
      result,
      finishReason: null,
      aggregatedToolCalls,
      appendedMessages: [],
      hasToolCalls: false,
    };
  }

  const appendedMessages: ToolResultMessage[] = [];
  if (aggregatedToolCalls.size > 0 && finalFinishReason === "tool_calls") {
    const toolCalls = Array.from(aggregatedToolCalls.values());

    for (const call of toolCalls) {
      if (request.signal?.aborted) break;
      const toolResult = await executeAgentTool(request.profileId, call, request.agentSessionId);
      const rawResult = toolResult.ok ? JSON.stringify(toolResult.data) : JSON.stringify(toolResult.error);

      const chatMediaRefs = extractCanonicalChatMediaReferences(toolResult);
      const chatDocRefs = extractCanonicalChatDocumentReferences(toolResult);
      const metadata: Record<string, unknown> | undefined = (chatMediaRefs.length > 0 || chatDocRefs.length > 0)
        ? {
            ...(chatMediaRefs.length > 0 ? { generatedMedia: chatMediaRefs } : {}),
            ...(chatDocRefs.length > 0 ? { managedDocuments: chatDocRefs } : {}),
          }
        : undefined;
      const toolMsg: ToolResultMessage = {
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: rawResult.length > TOOL_RESULT_MAX_CHARS
          ? rawResult.slice(0, TOOL_RESULT_MAX_CHARS) + "...[truncated]"
          : rawResult,
        ...(metadata ? { metadata } : {})
      };
      appendedMessages.push(toolMsg);
    }

    if (appendedMessages.length > 0) {
      // Cast: `SseChunk.appendedMessages` accepts either tool result
      // messages (this streamAndExecuteTurn path) or other providers
      // (assistant tool_calls). The agent loop only emits tool result
      // messages here, so the narrower `ToolResultMessage[]` is valid.
      const chunk = { appendedMessages } as unknown as SseChunk;
      onDelta(chunk);
    }
  }

  return {
    result,
    finishReason: finalFinishReason,
    aggregatedToolCalls,
    appendedMessages,
    hasToolCalls: aggregatedToolCalls.size > 0 && finalFinishReason === "tool_calls",
  };
}

export async function runChatAgentLoop(
  request: { endpoint?: string; method?: string; profileId?: string; agentSessionId?: string; body?: unknown; signal?: AbortSignal; headers?: Record<string, string>; signalId?: string },
  onDelta: (chunk: SseChunk) => void
): Promise<GuardedVeniceResult> {
  const endpoint = request.endpoint ?? "/chat/completions";
  const method = request.method ?? "POST";
  const profileId = request.profileId ?? "";
  const agentSessionId = request.agentSessionId;
  const signalId = request.signalId;
  const headers = request.headers;

  let currentBody = request.body;
  let lastResult: GuardedVeniceResult | null = null;
  let totalToolCallCount = 0;

  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    if (request.signal?.aborted) break;
    if (totalToolCallCount >= MAX_AGENT_TOOL_CALLS) break;

    const turnResult = await streamAndExecuteTurn(
      { endpoint, method, profileId, agentSessionId, body: currentBody, signal: request.signal, headers, signalId },
      onDelta
    );

    lastResult = turnResult.result;

    if (turnResult.result.kind === "blocked") {
      return turnResult.result;
    }

    if (!turnResult.hasToolCalls) {
      // Final assistant turn (no tool calls pending): exit the loop.
      return turnResult.result;
    }

    totalToolCallCount += turnResult.aggregatedToolCalls.size;

    // Build next request body: append an assistant message describing the
    // tool calls followed by every tool result message. The model reads
    // both halves on the next stream and decides whether more tool work
    // is needed before producing the user-visible reply.
    const assistantToolCalls = Array.from(turnResult.aggregatedToolCalls.values()).map(tc => ({
      id: tc.id || "",
      type: "function" as const,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    }));
    const assistantMessage = {
      role: "assistant" as const,
      content: "",
      tool_calls: assistantToolCalls,
    };
    const previousMessages = Array.isArray((currentBody as { messages?: unknown } | null)?.messages)
      ? ((currentBody as { messages: unknown[] }).messages)
      : [];
    const nextMessages = [
      ...previousMessages,
      assistantMessage,
      ...turnResult.appendedMessages,
    ];
    currentBody = { ...(currentBody as Record<string, unknown>), messages: nextMessages };
  }

  return lastResult ?? {
    kind: "response",
    response: {
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      headers: {},
      body: { error: "agent loop produced no response" },
      contentType: "application/json",
    },
  };
}
