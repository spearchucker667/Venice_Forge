/** @fileoverview Centralized wrappers that combine the local family-safe
 *  guard with the downstream request dispatcher. Every IPC entry point
 *  that touches Venice, Jina, or scraped content must route through
 *  these helpers so that:
 *    - the runtime config snapshot (`runtimeSafetySettings`) is the
 *      single source of truth for the toggle state (P0);
 *    - the 451 block response shape is consistent across endpoints
 *      (P1 centralization);
 *    - downstream code never reads the renderer-supplied
 *      `localFamilySafeModeEnabled` flag (defence-in-depth).
 *
 *  IMPORTANT: the provider-side `safe_mode` parameter and the local
 *  Family Safe Mode filter are INDEPENDENT. Local family-safe filtering
 *  runs before dispatch and on responses; it never forces
 *  `safe_mode: true` on the outbound Venice request. Only
 *  `getRuntimeVeniceApiSafeMode()` drives the provider parameter.
 *
 *  These helpers are main-process only. The renderer-side
 *  `src/shared/safety/localFamilySafeGuard.ts` is the primitive that
 *  actually evaluates a prompt; this file orchestrates it. */

import {
  maybeRunLocalFamilyGuard,
  SafetyGuardBlockedError,
  safetyBlockBodyFromResponseScreen,
  screenResponseBody,
  identifyAndValidateGeneratedMedia,
} from "../../src/shared/safety";
import type { SafetyGuardInput } from "../../src/shared/safety";
import { performVeniceRequest } from "./veniceClient";
import {
  getRuntimeLocalFamilySafeModeEnabled,
  getRuntimeVeniceApiSafeMode,
} from "./runtimeSafetySettings";
import {
  publishInspectorRequest,
  publishInspectorCompletion,
} from "./inspectorTelemetry";
import type { VeniceIpcResponse } from "./veniceClient";
import { applyVeniceApiSafeMode } from "../../src/shared/veniceSafeMode";
import { composeTrustedRequest } from "../agent/runtime/trusted-agent-request";

/** Shape of a Family Safe Mode block response. Matches the 451 body
 *  emitted by every IPC entry point so the renderer can recognise
 *  blocks without per-endpoint branching. */
export interface GuardedBlock {
  ok: false;
  status: 451;
  statusText: "Blocked by Family Safe Mode";
  headers: Record<string, never>;
  body: {
    error: string;
    reasonCode?: string;
    category?: string;
    severity?: string;
  };
  contentType: "application/json";
}

/** True when the given input was blocked by the guard, false otherwise. */
function isGuardBlock(
  decision: ReturnType<typeof maybeRunLocalFamilyGuard>,
): decision is Extract<ReturnType<typeof maybeRunLocalFamilyGuard>, { allowed: false }> {
  return decision.allowed === false;
}

/** Returns the canonical 451 block response for a denied guard decision. */
export function buildGuardedBlock(decision: Extract<ReturnType<typeof maybeRunLocalFamilyGuard>, { allowed: false }>): GuardedBlock {
  return {
    ok: false,
    status: 451,
    statusText: "Blocked by Family Safe Mode",
    headers: {} as Record<string, never>,
    body: {
      error: decision.userMessage,
      reasonCode: decision.guardDecision.reasonCode,
      category: decision.guardDecision.category,
      severity: decision.guardDecision.severity,
    },
    contentType: "application/json",
  };
}

/** Run the local family-safe guard against an input, returning either a
 *  block response (when the guard denies) or `null` when execution may
 *  continue. Uses the main-process runtime snapshot — never the
 *  renderer-supplied flag. */
export function checkLocalFamilyGuard(input: SafetyGuardInput): GuardedBlock | null {
  const endpoint = typeof input.endpoint === "string" ? input.endpoint : "/unknown";
  const method = typeof input.method === "string" ? input.method : "POST";
  const startedAt = Date.now();
  let eventId = "";
  try {
    eventId = publishInspectorRequest({
      source: "main-guard",
      transport: "local",
      endpoint,
      method,
    });
  } catch {
    // Inspector telemetry must never break guard evaluation.
  }
  const enabled = getRuntimeLocalFamilySafeModeEnabled();
  const decision = maybeRunLocalFamilyGuard(input, enabled);
  try {
    if (isGuardBlock(decision)) {
      publishInspectorCompletion({
        source: "main-guard",
        transport: "local",
        endpoint,
        method,
        guardOutcome: "block",
        summaries: { durationMs: Date.now() - startedAt },
        eventId,
        status: 451,
        error: `blocked:${decision.guardDecision.reasonCode}:${decision.guardDecision.category}`,
      });
      return buildGuardedBlock(decision);
    }
    publishInspectorCompletion({
      source: "main-guard",
      transport: "local",
      endpoint,
      method,
      guardOutcome: decision.skipped ? "skipped" : "allow",
      summaries: { durationMs: Date.now() - startedAt },
      eventId,
      status: 200,
    });
  } catch {
    // Telemetry failures must not affect guard evaluation outcome.
  }
  return null;
}

/** Result of `performGuardedVeniceRequest`. Either the upstream Venice
 *  response, or a 451 guard-block response, or an exception-derived
 *  transport error. The wrapper never throws on a guard block — it
 *  returns a 451 response instead, so callers do not need a try/catch
 *  around the guard path. */
export type GuardedVeniceResult =
  | { kind: "response"; response: VeniceIpcResponse }
  | { kind: "blocked"; block: GuardedBlock };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withFamilySafeProviderOverride(rawRequest: unknown, endpoint: string): unknown {
  // Provider-side safe_mode is driven solely by the Venice API Safe Mode
  // runtime setting. Local Family Safe Mode is an independent filter that
  // runs before dispatch and on responses; it must not force safe_mode on.
  const veniceApiSafeMode = getRuntimeVeniceApiSafeMode();

  if (!isRecord(rawRequest)) return rawRequest;
  const body = rawRequest.body;
  if (!isRecord(body)) return rawRequest;
  return {
    ...rawRequest,
    body: applyVeniceApiSafeMode(endpoint, body, veniceApiSafeMode),
  };
}

function stringifyResponseForScreening(body: unknown): string | null {
  if (typeof body === "string") return body;
  if (body == null) return "";
  if (isRecord(body)) {
    const redactedBinary = { ...body };
    for (const key of ["dataBase64", "image", "images", "dataUrl", "audio", "video"]) {
      if (key in redactedBinary) redactedBinary[key] = "[binary-media]";
    }
    try {
      return JSON.stringify(redactedBinary);
    } catch {
      return null;
    }
  }
  try {
    return JSON.stringify(body);
  } catch {
    return null;
  }
}

async function screenUpstreamResponse(endpoint: string, method: string, response: VeniceIpcResponse): Promise<GuardedBlock | null> {
  if (!getRuntimeLocalFamilySafeModeEnabled()) return null;

  // 1. Screen binary media fields semantically if present.
  // Note (VF-AUD-20260912-DR-002): Current Venice endpoints return objects, not bare arrays.
  // If Venice ever introduces top-level array responses for batch generation endpoints,
  // iterate over array items here as well.
  if (isRecord(response.body)) {
    const b = response.body;
    // Iterate over known media fields
    for (const key of ["dataBase64", "image", "images", "dataUrl", "audio", "video"]) {
      const val = b[key];
      if (val === undefined || val === null) continue;
      const items = Array.isArray(val) ? val : [val];
      for (const item of items) {
        let base64String = "";
        if (typeof item === "string" && item.length > 0) {
          base64String = item;
        } else if (typeof item === "object" && item !== null) {
          // Handle b64_json objects
          if ("b64_json" in item && typeof (item as { b64_json: string }).b64_json === "string") {
            base64String = (item as { b64_json: string }).b64_json;
          } else if ("url" in item && typeof (item as { url: string }).url === "string" && (item as { url: string }).url.length > 0) {
            // URL-bearing image items (e.g. {url: "https://..."}).
            // identifyAndValidateGeneratedMedia returns CLASSIFIER_UNAVAILABLE for https:// URLs — fail closed.
            base64String = (item as { url: string }).url;
          }
        }
        
        if (base64String) {
          // Pass the base64 content to the semantic media screener
          const mediaScreen = await identifyAndValidateGeneratedMedia(base64String, "application/octet-stream", true);
          if (!mediaScreen.allowed) {
            return {
              ok: false,
              status: 451,
              statusText: "Blocked by Family Safe Mode",
              headers: {} as Record<string, never>,
              body: { 
                error: mediaScreen.userMessage || "Media blocked by safety filter", 
                reasonCode: mediaScreen.reasonCode, 
                category: mediaScreen.category 
              },
              contentType: "application/json",
            };
          }
        }
      }
    }
  }

  // 2. Screen the textual/JSON structure (with binary data replaced by [binary-media] to save tokens).
  const bodyTextOrNull = stringifyResponseForScreening(response.body);
  if (bodyTextOrNull === null) {
    return {
      ok: false,
      status: 451,
      statusText: "Blocked by Family Safe Mode",
      headers: {} as Record<string, never>,
      body: { error: "Response screening unavailable", reasonCode: "RESPONSE_SCREEN_UNAVAILABLE" },
      contentType: "application/json",
    };
  }
  if (!bodyTextOrNull.trim()) return null;
  const screen = screenResponseBody(
    bodyTextOrNull,
    { endpoint, method, source: "ipc" },
    true,
  );
  if (screen.allowed) return null;
  return {
    ok: false,
    status: 451,
    statusText: "Blocked by Family Safe Mode",
    headers: {} as Record<string, never>,
    body: safetyBlockBodyFromResponseScreen(screen),
    contentType: "application/json",
  };
}

type StreamDeltaChunk = {
  content: string;
  reasoning: string;
  providerRequestId?: string;
  usage?: Record<string, unknown>;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: "function";
    function?: { name?: string; arguments?: string };
  }>;
  finish_reason?: string | null;
};

/** Run the local family-safe guard then forward to `performVeniceRequest`.
 *  This is the single entry point that every Venice-touching IPC handler
 *  must use, so that the guard always evaluates against the runtime
 *  snapshot and produces a consistent 451 shape.
 *
 *  When Family Safe Mode is on, streaming `onDelta` chunks are withheld until
 *  `screenUpstreamResponse` allows the aggregated body (VF-AUD-20260912-GSS-P1-001).
 *  A 451 therefore never follows live delivery of blocked assistant text. */
export async function performGuardedVeniceRequest(
  rawRequest: unknown,
  options: { onDelta?: (chunk: StreamDeltaChunk) => void } = {},
): Promise<GuardedVeniceResult> {
  // The IPC request has already been validated by the time we get here,
  // but the guard needs a typed shape. We re-read endpoint/method/payload
  // defensively so the guard sees the same data the dispatcher will send.
  const req = (rawRequest ?? {}) as { endpoint?: unknown; method?: unknown; body?: unknown };
  const endpoint = typeof req.endpoint === "string" ? req.endpoint : "";
  const method = typeof req.method === "string" ? req.method : "";
  try {
    const block = checkLocalFamilyGuard({
      endpoint,
      method,
      payload: req.body,
      source: "ipc",
    });
    if (block) return { kind: "blocked", block };
    let requestForDispatch = withFamilySafeProviderOverride(rawRequest, endpoint);
    requestForDispatch = composeTrustedRequest(requestForDispatch);

    const callerOnDelta = options.onDelta;
    const withholdDeltas = Boolean(callerOnDelta) && getRuntimeLocalFamilySafeModeEnabled();
    const withheldDeltas: StreamDeltaChunk[] = [];
    const requestOptions = withholdDeltas
      ? {
          ...options,
          onDelta: (chunk: StreamDeltaChunk) => {
            withheldDeltas.push(chunk);
          },
        }
      : options;

    const response = await performVeniceRequest(requestForDispatch, requestOptions);
    const responseBlock = await screenUpstreamResponse(endpoint, method, response);
    if (responseBlock) {
      try {
        publishInspectorCompletion({
          source: "main-guard",
          transport: "local",
          endpoint,
          method,
          guardOutcome: "block",
          summaries: { durationMs: 0 },
          status: 451,
          error: `blocked:${responseBlock.body.reasonCode ?? "RESPONSE_BLOCKED"}:${
            responseBlock.body.category ?? "unknown"
          }`,
        });
      } catch {
        // Telemetry failures must not affect guard evaluation.
      }
      return { kind: "blocked", block: responseBlock };
    }
    if (withholdDeltas && callerOnDelta) {
      for (const chunk of withheldDeltas) callerOnDelta(chunk);
    }
    return { kind: "response", response };
  } catch (err) {
    if (err instanceof SafetyGuardBlockedError) {
      // Re-wrap any inline guard from performVeniceRequest.
      try {
        publishInspectorCompletion({
          source: "main-guard",
          transport: "local",
          endpoint,
          method,
          guardOutcome: "block",
          summaries: { durationMs: 0 },
          status: 451,
          error: `blocked:${err.decision.reasonCode}:${err.decision.category}`,
        });
      } catch {
        // ignore
      }
      return {
        kind: "blocked",
        block: {
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
        },
      };
    }
    throw err;
  }
}
