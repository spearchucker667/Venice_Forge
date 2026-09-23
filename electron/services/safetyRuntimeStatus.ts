/** @fileoverview Main-process builder for the live safety runtime status
 *  surfaced on System → Status (VF-20260923-P1-027). The four safety concepts
 *  (local safeguards, provider safe_mode, structural validation, semantic
 *  classifiers) are assembled from their separate authoritative sources and
 *  must never be conflated here. */

import {
  getRuntimeLocalFamilySafeModeEnabled,
  getRuntimeSafetyLastChangedAt,
  getRuntimeSafetySettingsSource,
  getRuntimeVeniceApiSafeMode,
} from "./runtimeSafetySettings";
import { getSemanticClassifierStatus } from "../../src/shared/safety/mediaScreener";
import {
  assembleSafetyRuntimeStatus,
  type SafetyRuntimeStatus,
} from "../../src/shared/safety/safetyRuntimeStatus";

/** Returns the current live safety runtime status. Contains only booleans,
 *  small counters, and fixed-vocabulary strings — never prompts, media, or
 *  credentials. */
export function buildSafetyRuntimeStatus(): SafetyRuntimeStatus {
  return assembleSafetyRuntimeStatus({
    localSafeguards: {
      enabled: getRuntimeLocalFamilySafeModeEnabled(),
      source: getRuntimeSafetySettingsSource(),
      lastChangedAt: getRuntimeSafetyLastChangedAt(),
    },
    providerSafety: {
      safeMode: getRuntimeVeniceApiSafeMode(),
    },
    semanticClassifiers: getSemanticClassifierStatus(),
  });
}
