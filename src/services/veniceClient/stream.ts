/** @fileoverview Streaming chat completion helper for the Venice API. */

import { PROXY_BASE_PATH, VENICE_API_STREAM_TIMEOUT_MS } from "../../shared/apiConfig";
import { redactSecrets } from "../../shared/redaction";
import {
  SseDecodeError,
  SseDecoder,
  applyStreamSseEvent,
  type SseEvent,
} from "../../shared/sseStreamDecoder";
import { desktopVenice, isElectron } from "../desktopBridge";
import type { VeniceStreamDelta } from "../../shared/veniceStreamDelta";
import type { PrimaryApiRouteId } from "../../shared/primaryApiRoute";
import type { AppDispatch } from "../../types/app";
import { maybeRunLocalFamilyGuard, SafetyGuardBlockedError } from "../../shared/safety";
import {
  buildInspectorTelemetryPatch,
  deriveGuardOutcome,
  sanitizeInspectorPayload,
  type InspectorRoutingReason,
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
    agentSessionId,
  }: { signal?: AbortSignal; dispatch?: AppDispatch; onDelta: (chunk: VeniceStreamDelta) => void; agentSessionId?: string; }
) {
  const startedAtTime = Date.now();
  const requestHeaders = { "Content-Type": "application/json" };
  const { decision: safetyDecision, previewDurationMs } = getSafetyDecisionForLog(
    "/chat/completions",
    "POST",
    payload,
  );
  const payloadRecord = payload as Record<string, unknown> | null | undefined;
  let requestPayload = payload;
  if (payloadRecord && Array.isArray(payloadRecord.messages)) {
    requestPayload = structuredClone(payload);
    const clonedRecord = requestPayload as Record<string, unknown>;
    clonedRecord.messages = (clonedRecord.messages as Record<string, unknown>[]).map((m: Record<string, unknown>) => {
      const msg = { ...m };
      delete msg.metadata;
      return msg;
    });
  }
  const guardOutcome = deriveGuardOutcome(safetyDecision);
  const logId = useInspectorStore.getState().addLog({
    endpoint: "/chat/completions",
    method: "POST",
    transport: "venice",
    requestHeaders,
    requestBody: sanitizeInspectorPayload(requestPayload),
    safetyDecision,
    previewDurationMs,
    guardOutcome,
    callOutcome: "pending",
  });

  let accumulatedContent = "";
  let accumulatedReasoning = "";

  const wrappedOnDelta = (chunk: Parameters<typeof onDelta>[0]) => {
    accumulatedContent += chunk.content;
    accumulatedReasoning += chunk.reasoning;
    onDelta(chunk);
  };

  const startedAt = nowIso();

  try {
    // Child exploitation safety guard — enforcement at transport boundary.
    // In desktop mode the IPC handler also runs the guard, so we skip the renderer check.
    if (!isElectron()) {
      const decision = maybeRunLocalFamilyGuard(
        { endpoint: "/chat/completions", method: "POST", payload: requestPayload, source: "venice-client" },
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
          body: requestPayload,
          headers: { "Content-Type": "application/json" },
          agentSessionId,
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
      useInspectorStore.getState().updateLog(logId, {
        selectedPrimaryRoute: response.selectedPrimaryRoute,
        effectiveUpstream: response.effectiveUpstream,
        routingReason: response.routingReason,
      });
      if (!response.ok) {
        const errorMsg = normalizeError(response.status, readDesktopErrorBody(response.body));
        const error: VeniceApiError = new Error(errorMsg);
        error.status = response.status;
        error.selectedPrimaryRoute = response.selectedPrimaryRoute;
        error.effectiveUpstream = response.effectiveUpstream;
        error.routingReason = response.routingReason;
        throw error;
      }
      useInspectorStore.getState().updateLog(
        logId,
        buildInspectorTelemetryPatch({
          status: 200,
          durationMs: Date.now() - startedAtTime,
          previewDurationMs,
          guardOutcome,
          selectedPrimaryRoute: response.selectedPrimaryRoute,
          effectiveUpstream: response.effectiveUpstream,
          routingReason: response.routingReason,
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
        response = await fetch(`${PROXY_BASE_PATH}/chat/completions`, {
          method: "POST",
          headers: requestHeadersWeb,
          body: JSON.stringify(requestPayload),
          signal: deadlineController.signal,
        });
      } catch (err: unknown) {
        if (deadlineExpired) throw timeoutError;
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        throw err;
      }

      const headers = parseDiagnosticsHeaders(response);
      const selectedPrimaryRoute = (response.headers.get("x-venice-forge-primary-route") as PrimaryApiRouteId | null) ?? undefined;
      const effectiveUpstream = response.headers.get("x-venice-forge-effective-upstream") ?? undefined;
      const routingReason = (response.headers.get("x-venice-forge-routing-reason") as InspectorRoutingReason | null) ?? undefined;
      useInspectorStore.getState().updateLog(logId, {
        selectedPrimaryRoute,
        effectiveUpstream,
        routingReason,
      });

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
        error.selectedPrimaryRoute = selectedPrimaryRoute;
        error.effectiveUpstream = effectiveUpstream;
        error.routingReason = routingReason;
        throw error;
      }

      if (!response.body || typeof response.body.getReader !== "function")
        throw new Error("Streaming is unavailable in this browser sandbox.");

      reader = response.body.getReader();
      // Shared incremental SSE decoder: blank-line framing, multiline data
      // joining, streaming UTF-8, typed decode errors, explicit [DONE], and
      // EOF flush. The same decoder drives the Electron main process so both
      // transports emit identical events/errors for identical byte streams.
      const sseDecoder = new SseDecoder();
      let streamFinished = false;
      let malformedFrameCount = 0;

      /** Applies decoded events; returns true when the [DONE] terminator was
       *  seen. Malformed/error frames are promoted (redacted warn), never
       *  silently dropped. */
      const consumeSseEvents = (events: SseEvent[]): boolean => {
        for (const event of events) {
          const outcome = applyStreamSseEvent(event, {
            onDelta: (chunk) => {
              // The shared decoder types `usage` loosely (Record<string,
              // unknown>); the public delta callback narrows it to the
              // documented OpenAI usage shape.
              wrappedOnDelta(chunk as Parameters<typeof onDelta>[0]);
            },
          });
          if (outcome.done) return true;
          if (outcome.malformed) {
            if (outcome.errorMessage) {
              const error: VeniceApiError = new Error(outcome.errorMessage);
              error.status = 502;
              throw error;
            }
            malformedFrameCount++;
            const detail = redactSecrets(
              outcome.errorMessage || outcome.rawData || "unknown frame",
            );
            console.warn("Malformed SSE frame from Venice upstream", { raw: detail });
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
              "Venice stream contained data that could not be decoded.",
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
              "Venice stream ended with a truncated data sequence.",
            );
          }
          throw err;
        }
        streamFinished = consumeSseEvents(tail);
      }
      if (!streamFinished) {
        const error = new Error("Venice stream ended before the [DONE] terminator.") as VeniceApiError;
        error.status = 502;
        throw error;
      }
      if (malformedFrameCount > 0) {
        console.warn(
          `Venice stream completed with ${malformedFrameCount} malformed SSE frame(s).`,
        );
      }

      useInspectorStore.getState().updateLog(
        logId,
        buildInspectorTelemetryPatch({
          status: 200,
          durationMs: Date.now() - startedAtTime,
          previewDurationMs,
          guardOutcome,
          selectedPrimaryRoute,
          effectiveUpstream,
          routingReason,
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
      cancelReader();
      reader?.releaseLock();
    }
  } catch (err: unknown) {
    const errAny = err as {
      status?: number;
      selectedPrimaryRoute?: PrimaryApiRouteId;
      effectiveUpstream?: string;
      routingReason?: InspectorRoutingReason;
    };
    useInspectorStore.getState().updateLog(
      logId,
      buildInspectorTelemetryPatch({
        status: errAny.status || 500,
        durationMs: Date.now() - startedAtTime,
        previewDurationMs,
        guardOutcome,
        error: safeInspectorError(err),
        selectedPrimaryRoute: errAny.selectedPrimaryRoute,
        effectiveUpstream: errAny.effectiveUpstream,
        routingReason: errAny.routingReason,
      }),
    );
    throw err;
  }
}
