/* eslint-disable @typescript-eslint/no-explicit-any */

import { performGuardedVeniceRequest, type GuardedVeniceResult } from "../../services/guardPipeline";
import { executeAgentTool } from "./agent-tool-executor";
import type { AssistantToolCall } from "../../../src/types/venice";

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
      const toolMsg = {
        role: "tool" as const,
        tool_call_id: call.id,
        name: call.function.name,
        content: rawResult.length > 50000 ? rawResult.slice(0, 50000) + "...[truncated]" : rawResult,
        ...(toolResult.ok && toolResult.data && typeof toolResult.data === 'object' && (toolResult.data as any).mediaId ? {
          metadata: {
            generatedMedia: {
              mediaId: (toolResult.data as any).mediaId,
              mimeType: (toolResult.data as any).mimeType,
            }
          }
        } : {})
      };
      appendedMessages.push(toolMsg);
    }

    if (appendedMessages.length > 0) {
      onDelta({ appendedMessages });
    }
  }

  return result;
}
