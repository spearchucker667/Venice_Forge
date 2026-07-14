/** @fileoverview Venice API IPC handlers (venice:request, venice:streamChat,
 *  venice:abort). */

import crypto from "crypto";
import { abortVeniceRequest } from "../../services/veniceClient";
import { performGuardedVeniceRequest } from "../../services/guardPipeline";
import { logError } from "../../services/logger";
import { getProfileSessionId } from "../../services/profileSession";
import { validateVeniceIpcRequest } from "../validation";
import { redactErrorMessage } from "../../../src/shared/redaction";
import { SafetyGuardBlockedError } from "../../../src/shared/safety";
import { registerIpcChannel, safeSendToRenderer } from "./common";

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
  registerIpcChannel("venice:request", async (event, input: unknown) => {
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

  registerIpcChannel("venice:streamChat", async (event, input: unknown) => {
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
      const result = await performGuardedVeniceRequest(request, {
        onDelta: (chunk) => {
          safeSendToRenderer(event.sender, "venice:streamDelta", {
            signalId: request.signalId,
            delta: chunk.content,
            reasoning: chunk.reasoning,
            providerRequestId: chunk.providerRequestId,
          });
        },
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

  registerIpcChannel("venice:abort", (_event, signalId: unknown) => {
    if (typeof signalId !== "string" || signalId.length > 128) return { ok: false };
    return abortVeniceRequest(signalId);
  });
}
