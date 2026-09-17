/** @fileoverview Streaming Responses API helper for the Venice API (alpha).
 *
 *  Phase 8 experimental transport (see `src/shared/veniceResponses.ts`).
 *  This mirrors `stream.ts` (veniceStreamChat) so the opt-in /responses
 *  path preserves the same guarantees as the default /chat/completions
 *  path:
 *
 *    - one inspector telemetry row per call, with safety-decision preview;
 *    - the mandatory safety guard runs in the renderer for the web
 *      transport (Electron skips it because the IPC handler is
 *      authoritative — same rule as chat);
 *    - shared `SseDecoder` framing so both transports emit identical
 *      events/errors for identical byte streams;
 *    - incomplete-stream contract: a 2xx stream that ends without the
 *      Responses terminal event (`response.completed` / `[DONE]`) is an
 *      error, mirroring the chat "[DONE]" lifecycle;
 *    - a single absolute 5-minute deadline covering fetch + SSE read loop.
 *
 *  The default chat path is untouched: this function is only invoked when
 *  the experimental toggle is on AND the selected model is confirmed
 *  non-E2EE (see chat-stream-manager). */

import { PROXY_BASE_PATH, VENICE_API_STREAM_TIMEOUT_MS } from "../../shared/apiConfig";
import { redactSecrets } from "../../shared/redaction";
import {
  SseDecodeError,
  SseDecoder,
  type SseEvent,
} from "../../shared/sseStreamDecoder";
import {
  applyResponsesSseEvent,
  type ResponsesSseEventOutcome,
} from "../../shared/veniceResponses";
import { desktopVenice, isElectron } from "../desktopBridge";
import type { VeniceStreamDelta } from "../../shared/veniceStreamDelta";
import type { AppDispatch } from "../../types/app";
import { maybeRunLocalFamilyGuard, SafetyGuardBlockedError } from "../../shared/safety";
import {
  buildInspectorTelemetryPatch,
  deriveGuardOutcome,
  sanitizeInspectorPayload,
} from "../inspectorTelemetry";
import { useInspectorStore } from "../../stores/inspector-store";
import { useSettingsStore } from "../../stores/settings-store";
import { VeniceApiError, normalizeError, readDesktopErrorBody, readWebErrorBody, extractRateLimitInfo } from "./errors";
import { parseDiagnosticsHeaders, summarizeDiagnostics, nowIso, safeInspectorError } from "./diagnostics";
import { getSafetyDecisionForLog } from "./safety";

/** The Responses API endpoint. POST-only per the upstream contract. */
export const VENICE_RESPONSES_ENDPOINT = "/responses";

/**
 * Streams a Responses API result from Venice, yielding deltas via a callback.
 * Shape-compatible with `veniceStreamChat` so the chat stream manager can
 * swap transports without changing delta handling.
 *
 * @param payload The Responses request payload (`VeniceResponsesRequest`).
 */
export async function veniceStreamResponses(
  payload: unknown,
  {
    signal,
    dispatch,
    onDelta,
    agentSessionId,
  }: { signal?: AbortSignal; dispatch?: AppDispatch; onDelta: (chunk: VeniceStreamDelta) => void; agentSessionId?: string; }
) {
  const startedAtTime = Date.now();
  const requestHeaders = { "Content-Type": "application/json" };
  const { decision: safetyDecision, previewDurationMs } = getSafetyDecisionForLog(
    VENICE_RESPONSES_ENDPOINT,
    "POST",
    payload,
  );
  const payloadRecord = payload as Record<string, unknown> | null | undefined;
  const guardOutcome = deriveGuardOutcome(safetyDecision);
  const logId = useInspectorStore.getState().addLog({
    endpoint: VENICE_RESPONSES_ENDPOINT,
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

  const wrappedOnDelta = (chunk: Parameters<typeof onDelta>[0]) => {
    accumulatedContent += chunk.content;
    accumulatedReasoning += chunk.reasoning ?? "";
    onDelta(chunk);
  };

  const startedAt = nowIso();

  try {
    // Child exploitation safety guard — enforcement at transport boundary.
    // In desktop mode the IPC handler also runs the guard, so we skip the
    // renderer check (identical rule to veniceStreamChat).
    if (!isElectron()) {
      const decision = maybeRunLocalFamilyGuard(
        { endpoint: VENICE_RESPONSES_ENDPOINT, method: "POST", payload, source: "venice-client" },
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
          endpoint: VENICE_RESPONSES_ENDPOINT,
          method: "POST",
          body: payload,
          headers: { "Content-Type": "application/json" },
          agentSessionId,
        },
        wrappedOnDelta,
        signal
      );
      dispatch?.({
        type: "SET_DIAGNOSTICS",
        diagnostics: summarizeDiagnostics({
          endpoint: VENICE_RESPONSES_ENDPOINT,
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
            object: "response",
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: accumulatedContent,
                  },
                ],
              },
            ],
            ...(accumulatedReasoning
              ? {
                  reasoning: accumulatedReasoning,
                }
              : {}),
          },
        }),
      );
      return;
    }

    const requestHeadersWeb: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Venice-Forge-Family-Safe-Mode": String(useSettingsStore.getState().localFamilySafeModeEnabled),
    };

    // REL-001: same single absolute 5-minute deadline as chat (fetch + SSE
    // read loop share one AbortSignal).
    const STREAM_TIMEOUT_MS = VENICE_API_STREAM_TIMEOUT_MS;
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
        response = await fetch(`${PROXY_BASE_PATH}${VENICE_RESPONSES_ENDPOINT}`, {
          method: "POST",
          headers: requestHeadersWeb,
          body: JSON.stringify(payload),
          signal: deadlineController.signal,
        });
      } catch (err: unknown) {
        if (deadlineExpired) throw timeoutError;
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
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
          endpoint: VENICE_RESPONSES_ENDPOINT,
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
        if (response.status === 429) {
          error.rateLimit = extractRateLimitInfo(headers, null);
        }
        throw error;
      }

      if (!response.body || typeof response.body.getReader !== "function")
        throw new Error("Streaming is unavailable in this browser sandbox.");

      reader = response.body.getReader();
      // Shared incremental SSE decoder (same as chat): blank-line framing,
      // multiline data joining, streaming UTF-8, typed decode errors, EOF
      // flush. Event interpretation uses the Responses contract.
      const sseDecoder = new SseDecoder();
      let streamFinished = false;
      let malformedFrameCount = 0;

      /** Applies decoded Responses events; returns true when a terminal
       *  event ([DONE] / response.completed) was seen. Malformed/error
       *  frames are promoted (redacted warn), never silently dropped. */
      const consumeSseEvents = (events: SseEvent[]): boolean => {
        for (const event of events) {
          const outcome: ResponsesSseEventOutcome = applyResponsesSseEvent(event.data);
          if (
            outcome.text ||
            outcome.reasoning ||
            outcome.toolCalls ||
            outcome.usage
          ) {
            wrappedOnDelta({
              content: outcome.text,
              reasoning: outcome.reasoning,
              tool_calls: outcome.toolCalls,
              usage: outcome.usage as VeniceStreamDelta["usage"],
              finish_reason: null,
            });
          }
          if (outcome.done) return true;
          if (outcome.malformed) {
            malformedFrameCount++;
            const detail = redactSecrets(
              outcome.errorMessage || outcome.rawData || "unknown frame",
            );
            console.warn("Malformed SSE frame from Venice Responses upstream", { raw: detail });
            if (outcome.errorMessage) {
              const error: VeniceApiError = new Error(outcome.errorMessage);
              error.status = 502;
              throw error;
            }
          }
        }
        return false;
      };

      while (true) {
        if (deadlineExpired) throw timeoutError;
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

        let result: ReadableStreamReadResult<Uint8Array>;
        try {
          result = await reader.read();
        } catch (err: unknown) {
          if (deadlineExpired) throw timeoutError;
          if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
          throw err;
        }

        if (result.done) {
          if (deadlineExpired) throw timeoutError;
          if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
          break;
        }

        let events: SseEvent[];
        try {
          events = sseDecoder.push(result.value);
        } catch (err: unknown) {
          if (err instanceof SseDecodeError) {
            throw new Error(
              "Venice Responses stream contained data that could not be decoded.",
            );
          }
          throw err;
        }
        if (consumeSseEvents(events)) {
          streamFinished = true;
          break;
        }
      }

      // EOF: dispatch the trailing unterminated event per the SSE contract.
      if (!streamFinished) {
        let tail: SseEvent[] = [];
        try {
          tail = sseDecoder.flush();
        } catch (err: unknown) {
          if (err instanceof SseDecodeError) {
            throw new Error(
              "Venice Responses stream ended with a truncated data sequence.",
            );
          }
          throw err;
        }
        streamFinished = consumeSseEvents(tail);
      }
      if (!streamFinished) {
        // Incomplete-stream contract: a 2xx Responses stream that ends
        // without response.completed/[DONE] is an error, mirroring the chat
        // 2xx-without-[DONE] lifecycle.
        const error = new Error("Venice Responses stream ended before the terminal event.") as VeniceApiError;
        error.status = 502;
        throw error;
      }
      if (malformedFrameCount > 0) {
        console.warn(
          `Venice Responses stream completed with ${malformedFrameCount} malformed SSE frame(s).`,
        );
      }

      useInspectorStore.getState().updateLog(
        logId,
        buildInspectorTelemetryPatch({
          status: 200,
          durationMs: Date.now() - startedAtTime,
          previewDurationMs,
          guardOutcome,
          responseBody: {
            object: "response",
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: accumulatedContent,
                  },
                ],
              },
            ],
            ...(accumulatedReasoning
              ? {
                  reasoning: accumulatedReasoning,
                }
              : {}),
          },
        }),
      );
    } finally {
      clearTimeout(deadlineId);
      deadlineController.signal.removeEventListener("abort", cancelReader);
      if (signal) signal.removeEventListener("abort", onParentAbort);
      cancelReader();
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
