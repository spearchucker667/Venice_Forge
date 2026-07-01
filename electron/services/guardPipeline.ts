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
 *  These helpers are main-process only. The renderer-side
 *  `src/shared/safety/localFamilySafeGuard.ts` is the primitive that
 *  actually evaluates a prompt; this file orchestrates it. */

import { maybeRunLocalFamilyGuard, SafetyGuardBlockedError } from "../../src/shared/safety";
import type { SafetyGuardInput } from "../../src/shared/safety";
import { performVeniceRequest } from "./veniceClient";
import { getRuntimeLocalFamilySafeModeEnabled } from "./runtimeSafetySettings";
import type { VeniceIpcResponse } from "./veniceClient";

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
  const enabled = getRuntimeLocalFamilySafeModeEnabled();
  const decision = maybeRunLocalFamilyGuard(input, enabled);
  if (isGuardBlock(decision)) {
    return buildGuardedBlock(decision);
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

/** Run the local family-safe guard then forward to `performVeniceRequest`.
 *  This is the single entry point that every Venice-touching IPC handler
 *  must use, so that the guard always evaluates against the runtime
 *  snapshot and produces a consistent 451 shape.
 *
 *  The `onDelta` callback is forwarded as-is for streaming. */
export async function performGuardedVeniceRequest(
  rawRequest: unknown,
  options: { onDelta?: (chunk: { content: string; reasoning: string; providerRequestId?: string }) => void } = {},
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
    const response = await performVeniceRequest(rawRequest, options);
    return { kind: "response", response };
  } catch (err) {
    if (err instanceof SafetyGuardBlockedError) {
      // Re-wrap any inline guard from performVeniceRequest.
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
