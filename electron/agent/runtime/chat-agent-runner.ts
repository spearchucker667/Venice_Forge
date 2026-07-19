import { performGuardedVeniceRequest, type GuardedVeniceResult } from "../../services/guardPipeline";
import { executeDocumentTool } from "./document-tool-executor";
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
}

export async function runChatAgentLoop(
  request: unknown, // ReturnType<typeof validateVeniceIpcRequest>
  onDelta: (chunk: SseChunk) => void
): Promise<GuardedVeniceResult> {
  const maxIterations = 5;
  let currentRequest = structuredClone(request);
  const profileId = request.profileId;
  const agentSessionId = request.agentSessionId;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const aggregatedToolCalls = new Map<number, AssistantToolCall>();
    let finalFinishReason: string | null = null;

    const result = await performGuardedVeniceRequest(currentRequest, {
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
          // If we receive chunk.tool_calls, we must map it from the incoming API shape
          // to AssistantToolCall shape if it isn't already, or just forward it.
          // Wait, the client expects AssistantToolCall[] on the delta.
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

        // Always forward delta to renderer so UI can display thought/content
        onDelta(chunk);
      },
    });

    if (result.kind === "blocked") return result;

    if (aggregatedToolCalls.size > 0 && finalFinishReason === "tool_calls") {
      const toolCalls = Array.from(aggregatedToolCalls.values());
      const messages = (currentRequest.body as { messages: unknown[] }).messages;
      
      // 1. Add assistant message with tool calls
      messages.push({
        role: "assistant",
        content: "",
        tool_calls: toolCalls,
      });

      const appendedMessages = [];

      // 2. Execute tools and add tool messages
      for (const call of toolCalls) {
        const toolResult = await executeDocumentTool(profileId, call, agentSessionId);
        const toolMsg = {
          role: "tool" as const,
          tool_call_id: call.id,
          name: call.function.name,
          content: toolResult.ok ? JSON.stringify(toolResult.data) : JSON.stringify(toolResult.error),
        };
        messages.push(toolMsg);
        appendedMessages.push(toolMsg);
      }

      // Add the next assistant message for the loop to continue
      const nextAssistantMsg = {
        role: "assistant" as const,
        content: "",
      };
      appendedMessages.push(nextAssistantMsg);

      onDelta({ appendedMessages } as unknown as SseChunk);

      // Update currentRequest with the new messages for the next iteration
      currentRequest = {
        ...currentRequest,
        body: {
          ...(currentRequest.body as Record<string, unknown>),
          messages: [...messages, nextAssistantMsg],
        },
      };

      // Continue loop with new messages
      continue;
    }

    // No tool calls or max iterations reached
    return result;
  }

  // Max iterations reached, return whatever we have
  return await performGuardedVeniceRequest(currentRequest, { onDelta });
}
