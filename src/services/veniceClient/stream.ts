/** @fileoverview Streaming chat completion helper for the Venice API. */

import { PROXY_BASE_PATH } from "../../shared/apiConfig";
import { desktopVenice, isElectron } from "../desktopBridge";
import type { AppDispatch } from "../../types/app";
import { maybeRunLocalFamilyGuard, SafetyGuardBlockedError } from "../../shared/safety";
import {
  buildInspectorTelemetryPatch,
  deriveGuardOutcome,
  sanitizeInspectorPayload,
} from "../inspectorTelemetry";
import { useInspectorStore } from "../../stores/inspector-store";
import { useSettingsStore } from "../../stores/settings-store";
import { VeniceApiError, normalizeError, readDesktopErrorBody, readWebErrorBody } from "./errors";
import { parseDiagnosticsHeaders, summarizeDiagnostics, nowIso, safeInspectorError } from "./diagnostics";
import { getSafetyDecisionForLog } from "./safety";

/**
 * Streams a chat completion from the Venice API, yielding deltas via a callback.
 * @param payload The chat completion request payload.
 */
export async function veniceStreamChat(
  payload: unknown,
  {
    signal,
    dispatch,
    onDelta,
  }: { signal?: AbortSignal; dispatch?: AppDispatch; onDelta: (chunk: { content: string; reasoning: string }) => void }
) {
  const startedAtTime = Date.now();
  const requestHeaders = { "Content-Type": "application/json" };
  const { decision: safetyDecision, previewDurationMs } = getSafetyDecisionForLog(
    "/chat/completions",
    "POST",
    payload,
  );
  const guardOutcome = deriveGuardOutcome(safetyDecision);
  const logId = useInspectorStore.getState().addLog({
    endpoint: "/chat/completions",
    method: "POST",
    transport: "venice",
    requestHeaders,
    requestBody: sanitizeInspectorPayload(payload),
    safetyDecision,
    previewDurationMs,
    guardOutcome,
    callOutcome: "pending",
  });

  let accumulatedContent = "";
  let accumulatedReasoning = "";

  const wrappedOnDelta = (chunk: { content: string; reasoning: string }) => {
    accumulatedContent += chunk.content;
    accumulatedReasoning += chunk.reasoning;
    onDelta(chunk);
  };

  const startedAt = nowIso();
  const payloadRecord = payload as Record<string, unknown> | null | undefined;

  try {
    // Child exploitation safety guard — enforcement at transport boundary.
    // In desktop mode the IPC handler also runs the guard, so we skip the renderer check.
    if (!isElectron()) {
      const decision = maybeRunLocalFamilyGuard(
        { endpoint: "/chat/completions", method: "POST", payload, source: "venice-client" },
        useSettingsStore.getState().localFamilySafeModeEnabled,
      );
      if (!decision.allowed) {
        useInspectorStore.getState().updateLog(
          logId,
          buildInspectorTelemetryPatch({
            status: 451,
            durationMs: Date.now() - startedAtTime,
            previewDurationMs,
            guardOutcome: "block",
            error: decision.userMessage,
          }),
        );
        useInspectorStore.getState().updateLog(logId, {
          safetyDecision: decision.guardDecision,
        });
        throw new SafetyGuardBlockedError({ ...decision.guardDecision, userMessage: decision.userMessage });
      }
    }

    if (isElectron()) {
      const response = await desktopVenice.streamChat(
        {
          endpoint: "/chat/completions",
          method: "POST",
          body: payload,
          headers: { "Content-Type": "application/json" },
        },
        wrappedOnDelta,
        signal
      );
      dispatch?.({
        type: "SET_DIAGNOSTICS",
        diagnostics: summarizeDiagnostics({
          endpoint: "/chat/completions",
          method: "POST",
          status: response.status,
          ok: response.ok,
          headers: response.headers || {},
          error: response.ok
            ? ""
            : normalizeError(response.status, readDesktopErrorBody(response.body)),
          startedAt,
          endedAt: nowIso(),
          model: typeof payloadRecord?.model === "string" ? payloadRecord.model : null,
        }),
      });
      if (!response.ok) {
        const errorMsg = normalizeError(response.status, readDesktopErrorBody(response.body));
        const error: VeniceApiError = new Error(errorMsg);
        error.status = response.status;
        throw error;
      }
      useInspectorStore.getState().updateLog(
        logId,
        buildInspectorTelemetryPatch({
          status: 200,
          durationMs: Date.now() - startedAtTime,
          previewDurationMs,
          guardOutcome,
          responseBody: {
            choices: [
              {
                message: {
                  role: "assistant",
                  content: accumulatedContent,
                  reasoning_content: accumulatedReasoning,
                },
              },
            ],
          },
        }),
      );
      return;
    }

    const requestHeadersWeb: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Venice-Forge-Family-Safe-Mode": String(useSettingsStore.getState().localFamilySafeModeEnabled),
    };

    // REL-001: enforce a single absolute 5-minute deadline covering both the
    // initial fetch and the SSE read loop. The same AbortSignal is used for
    // fetch and is wired to cancel the reader if the deadline expires (or if
    // the caller aborts), so total stream lifetime cannot exceed ~300s.
    const STREAM_TIMEOUT_MS = 300_000;
    const timeoutError = new Error(
      "Stream timed out after 5 minutes. The server may be overloaded — please try again."
    );

    const deadlineController = new AbortController();
    let deadlineExpired = false;
    const deadlineId = setTimeout(() => {
      deadlineExpired = true;
      deadlineController.abort();
    }, STREAM_TIMEOUT_MS);

    const onParentAbort = () => deadlineController.abort();
    if (signal) {
      signal.addEventListener("abort", onParentAbort, { once: true });
      if (signal.aborted) deadlineController.abort();
    }

    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const cancelReader = () => {
      reader?.cancel().catch(() => {});
    };
    deadlineController.signal.addEventListener("abort", cancelReader);

    try {
      let response: Response;
      try {
        response = await fetch(`${PROXY_BASE_PATH}/chat/completions`, {
          method: "POST",
          headers: requestHeadersWeb,
          body: JSON.stringify(payload),
          signal: deadlineController.signal,
        });
      } catch (err: unknown) {
        if (deadlineExpired) throw timeoutError;
        if (signal?.aborted) throw new Error("Aborted");
        throw err;
      }

      const headers = parseDiagnosticsHeaders(response);
      let streamError = "";
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        let parsed: unknown = null;
        try { parsed = JSON.parse(text); } catch { /* non-JSON error body — use raw text */ }
        streamError = normalizeError(response.status, readWebErrorBody(parsed, text, response.statusText));
      }

      dispatch?.({
        type: "SET_DIAGNOSTICS",
        diagnostics: summarizeDiagnostics({
          endpoint: "/chat/completions",
          method: "POST",
          status: response.status,
          ok: response.ok,
          headers,
          error: streamError,
          startedAt,
          endedAt: nowIso(),
          model: typeof payloadRecord?.model === "string" ? payloadRecord.model : null,
        }),
      });

      if (!response.ok) {
        const error: VeniceApiError = new Error(streamError);
        error.status = response.status;
        throw error;
      }

      if (!response.body || typeof response.body.getReader !== "function")
        throw new Error("Streaming is unavailable in this browser sandbox.");

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        if (deadlineExpired) throw timeoutError;
        if (signal?.aborted) throw new Error("Aborted");

        let result: ReadableStreamReadResult<Uint8Array>;
        try {
          result = await reader.read();
        } catch (err: unknown) {
          if (deadlineExpired) throw timeoutError;
          if (signal?.aborted) throw new Error("Aborted");
          throw err;
        }

        if (result.done) {
          if (deadlineExpired) throw timeoutError;
          if (signal?.aborted) throw new Error("Aborted");
          break;
        }

        buffer += decoder.decode(result.value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.replace(/^data:\s*/, "");
          if (data === "[DONE]") {
            useInspectorStore.getState().updateLog(
              logId,
              buildInspectorTelemetryPatch({
                status: 200,
                durationMs: Date.now() - startedAtTime,
                previewDurationMs,
                guardOutcome,
                responseBody: {
                  choices: [
                    {
                      message: {
                        role: "assistant",
                        content: accumulatedContent,
                        reasoning_content: accumulatedReasoning,
                      },
                    },
                  ],
                },
              }),
            );
            return;
          }

          try {
            const json = JSON.parse(data);
            const content =
              json?.choices?.[0]?.delta?.content ||
              json?.choices?.[0]?.message?.content ||
              json?.choices?.[0]?.text ||
              "";
            const reasoning =
              json?.choices?.[0]?.delta?.reasoning_content ||
              json?.choices?.[0]?.message?.reasoning_content ||
              "";
            if (content || reasoning) wrappedOnDelta({ content, reasoning });
          } catch { /* malformed SSE JSON chunk — skip */ }
        }
      }

      useInspectorStore.getState().updateLog(
        logId,
        buildInspectorTelemetryPatch({
          status: 200,
          durationMs: Date.now() - startedAtTime,
          previewDurationMs,
          guardOutcome,
          responseBody: {
            choices: [
              {
                message: {
                  role: "assistant",
                  content: accumulatedContent,
                  reasoning_content: accumulatedReasoning,
                },
              },
            ],
          },
        }),
      );
    } finally {
      clearTimeout(deadlineId);
      deadlineController.signal.removeEventListener("abort", cancelReader);
      if (signal) signal.removeEventListener("abort", onParentAbort);
      reader?.releaseLock();
    }
  } catch (err: unknown) {
    const errAny = err as { status?: number };
    useInspectorStore.getState().updateLog(
      logId,
      buildInspectorTelemetryPatch({
        status: errAny.status || 500,
        durationMs: Date.now() - startedAtTime,
        previewDurationMs,
        guardOutcome,
        error: safeInspectorError(err),
      }),
    );
    throw err;
  }
}
