/** @fileoverview Venice API IPC handlers (venice:request, venice:streamChat,
 *  venice:abort). */

import crypto from "crypto";
import { abortVeniceRequest } from "../../services/veniceClient";
import { performGuardedVeniceRequest, checkLocalFamilyGuard } from "../../services/guardPipeline";
import { logError } from "../../services/logger";
import { getProfileSessionId } from "../../services/profileSession";
import { validateVeniceIpcRequest } from "../validation";
import { redactErrorMessage } from "../../../src/shared/redaction";
import { SafetyGuardBlockedError } from "../../../src/shared/safety";
import { registerPrivilegedIpcChannel, safeSendToRenderer } from "./common";
import { runChatAgentLoop } from "../../agent/runtime/chat-agent-runner";
import { createToolExecutionContext } from "../../agent/runtime/tool-execution-context";
import { getAgentServices, RUNTIME_SESSION_ID } from "../../agent/runtime/agent-services";
import type { AgentPermissionPreset } from "../../../src/agent/contracts/capabilities";
import { getEffectiveAgentPermissionPreset } from "../../agent/runtime/agent-permission-state";
import type { VeniceStreamDeltaEnvelope } from "../../../src/shared/veniceStreamDelta";

function safetyBlockedResponse(err: SafetyGuardBlockedError) {
  return {
    ok: false,
    status: 451,
    statusText: "Blocked by Family Safe Mode",
    headers: {} as Record<string, never>,
    body: {
      error: err.decision.userMessage,
      reasonCode: err.decision.reasonCode,
      category: err.decision.category,
      severity: err.decision.severity,
    },
    contentType: "application/json",
  };
}

function transportErrorResponse(message: string) {
  return {
    ok: false,
    status: 0,
    statusText: "Local transport error",
    headers: {} as Record<string, never>,
    body: { error: message },
    contentType: "application/json",
  };
}

function withSessionProfile(input: unknown, profileId: string): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return input;
  return { ...(input as Record<string, unknown>), profileId };
}

export function registerVeniceHandlers(): void {
  registerPrivilegedIpcChannel("venice:request", async (event, input: unknown) => {
    try {
      // Credential selection is main-process authoritative. Replace any
      // renderer-supplied profile before validation so a forged invalid id
      // cannot select another profile or turn into a request-level denial.
      const request = validateVeniceIpcRequest(
        withSessionProfile(input, getProfileSessionId(event.sender)),
      );
      const result = await performGuardedVeniceRequest(request);
      if (result.kind === "blocked") return result.block;
      return result.response;
    } catch (err) {
      if (err instanceof SafetyGuardBlockedError) {
        return safetyBlockedResponse(err);
      }
      const message = redactErrorMessage(err);
      logError("Venice IPC request failed", message);
      return transportErrorResponse(message);
    }
  });

  registerPrivilegedIpcChannel("venice:streamChat", async (event, input: unknown) => {
    try {
      const request = validateVeniceIpcRequest(
        withSessionProfile(input, getProfileSessionId(event.sender)),
      );
      if (request.endpoint !== "/chat/completions" || request.method !== "POST") {
        throw new Error("Streaming is only available for POST /chat/completions.");
      }

      if (!request.signalId) {
        request.signalId = crypto.randomUUID();
      }

      const guardResult = checkLocalFamilyGuard({ ...request, source: "ipc" });
      if (guardResult?.status === 451) return guardResult;

      const profileId = getProfileSessionId(event.sender);
      const agentSessionId = typeof request.agentSessionId === "string" ? request.agentSessionId : undefined;
      // The legacy renderer field is accepted by validation for wire
      // compatibility but never participates in authorization.
      const preset: AgentPermissionPreset = getEffectiveAgentPermissionPreset(
        event.sender,
        profileId,
        agentSessionId,
      );
      const rendererSessionId = `${RUNTIME_SESSION_ID}:renderer_${event.sender.id}${agentSessionId ? `:agent_${agentSessionId}` : ""}`;
      const workspaceGrant = getAgentServices().workspaceGrants.getBySession(rendererSessionId);

      const toolExecutionContext = createToolExecutionContext({
        profileId,
        runtimeSessionId: RUNTIME_SESSION_ID,
        senderId: event.sender.id,
        agentSessionId,
        preset,
        workspaceGrant,
      });

      const result = await runChatAgentLoop(request, toolExecutionContext, (chunk) => {
        // One shared, serializable envelope (P1-006): every agent-appended
        // message (tool results with generated-media/document metadata) is
        // forwarded explicitly; never reconstruct a subset of fields here.
        const envelope: VeniceStreamDeltaEnvelope = {
          signalId: request.signalId!,
          delta: chunk.content ?? "",
          reasoning: chunk.reasoning,
          providerRequestId: chunk.providerRequestId,
          usage: chunk.usage as VeniceStreamDeltaEnvelope["usage"],
          tool_calls: chunk.tool_calls,
          appendedMessages: chunk.appendedMessages,
          finish_reason: chunk.finish_reason,
        };
        safeSendToRenderer(event.sender, "venice:streamDelta", envelope, event.senderFrame);
      });
      if (result.kind === "blocked") return result.block;
      return result.response;
    } catch (err) {
      if (err instanceof SafetyGuardBlockedError) {
        return safetyBlockedResponse(err);
      }
      const message = redactErrorMessage(err);
      logError("Venice stream request failed", message);
      return transportErrorResponse(message);
    }
  });

  registerPrivilegedIpcChannel("venice:abort", (_event, signalId: unknown) => {
    if (typeof signalId !== "string" || signalId.length > 128) return { ok: false };
    return abortVeniceRequest(signalId);
  });
}
