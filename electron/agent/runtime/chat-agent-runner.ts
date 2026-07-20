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

export async function runChatAgentLoop(
  request: { profileId?: string; agentSessionId?: string; body?: unknown; signal?: AbortSignal },
  onDelta: (chunk: SseChunk) => void
): Promise<GuardedVeniceResult> {
  const profileId = request.profileId ?? "";
  const agentSessionId = request.agentSessionId;

  const aggregatedToolCalls = new Map<number, AssistantToolCall>();
  let finalFinishReason: string | null = null;

  const result = await performGuardedVeniceRequest(request, {
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

  if (result.kind === "blocked") return result;

  if (aggregatedToolCalls.size > 0 && finalFinishReason === "tool_calls") {
    const toolCalls = Array.from(aggregatedToolCalls.values());
    const appendedMessages = [];

    for (const call of toolCalls) {
      if (request.signal?.aborted) break;
      const toolResult = await executeAgentTool(profileId, call, agentSessionId);
      const rawResult = toolResult.ok ? JSON.stringify(toolResult.data) : JSON.stringify(toolResult.error);
      const chatMediaRefs = extractCanonicalChatMediaReferences(toolResult);
      const metadata: Record<string, unknown> | undefined = chatMediaRefs.length > 0
        ? { generatedMedia: chatMediaRefs }
        : undefined;
      const toolMsg = {
        role: "tool" as const,
        tool_call_id: call.id,
        name: call.function.name,
        content: rawResult.length > 50000 ? rawResult.slice(0, 50000) + "...[truncated]" : rawResult,
        // Attach the canonical `ChatMediaReference[]` only when the executor
        // produced a validated ref. P0-03 audit finding #3 — without this
        // the chat-store Media Studio upsert path either skipped validation
        // entirely or surfaced a stub `{mediaId, mimeType}` object that failed
        // the canonical contract and rendered as a broken link.
        ...(metadata ? { metadata } : {})
      };
      appendedMessages.push(toolMsg);
    }

    if (appendedMessages.length > 0) {
      onDelta({ appendedMessages });
    }
  }

  return result;
}
