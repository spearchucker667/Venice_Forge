/**
 * @fileoverview Typed contract for the live safety runtime status surfaced on
 * System → Status. The four safety concepts are deliberately modelled as
 * SEPARATE fields so the UI cannot conflate them:
 *
 *  1. `localSafeguards`   — the local Family Safe Mode toggle + its source.
 *  2. `providerSafety`    — the independent Venice API `safe_mode` parameter.
 *  3. `structuralValidation` — always-on structural/protocol checks + counters.
 *  4. `semanticClassifiers`  — optional semantic media backend with explicit
 *     per-modality states (never the ambiguous word "unavailable").
 *
 * All values are booleans, small counters, or fixed-vocabulary strings. No
 * prompt text, media bytes, or credential material may ever be attached.
 */

import type { SafetyCountersSnapshot } from "./safetyCounters";
import {
  getSafetyCountersSnapshot,
  getStructuralCountersSnapshot,
} from "./safetyCounters";

/** Explicit per-modality semantic classifier state. */
export type ClassifierState =
  | "available"
  | "not-configured"
  | "unsupported"
  | "unhealthy";

/** Where the local safeguard toggle value comes from. */
export type SafetyRuntimeStatusSource = "user" | "server" | "policy";

export interface SemanticClassifierStatus {
  backendRegistered: boolean;
  backendName?: string;
  image: ClassifierState;
  audio: ClassifierState;
  video: ClassifierState;
}

export interface SafetyRuntimeStatus {
  localSafeguards: {
    enabled: boolean;
    source: SafetyRuntimeStatusSource;
    lastChangedAt?: string;
  };
  providerSafety: { safeMode: boolean };
  structuralValidation: {
    active: true;
    requestsValidated: number;
    rejectedRequests: number;
  };
  semanticClassifiers: SemanticClassifierStatus;
  counters: SafetyCountersSnapshot;
}

/** Assembles the full status from the caller-supplied authority inputs,
 *  attaching the in-process counter snapshots. Each process (main or
 *  renderer) assembles with its own counter instance. */
export function assembleSafetyRuntimeStatus(input: {
  localSafeguards: SafetyRuntimeStatus["localSafeguards"];
  providerSafety: SafetyRuntimeStatus["providerSafety"];
  semanticClassifiers: SemanticClassifierStatus;
}): SafetyRuntimeStatus {
  return {
    localSafeguards: { ...input.localSafeguards },
    providerSafety: { ...input.providerSafety },
    structuralValidation: { active: true, ...getStructuralCountersSnapshot() },
    semanticClassifiers: { ...input.semanticClassifiers },
    counters: getSafetyCountersSnapshot(),
  };
}
