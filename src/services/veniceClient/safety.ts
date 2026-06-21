/** @fileoverview Renderer-side safety decision helpers for inspector logging. */

import { isElectron } from "../desktopBridge";
import { previewLocalFamilyGuard } from "../../shared/safety";
import { useSettingsStore } from "../../stores/settings-store";
import { type InspectorSafetyDecision } from "../inspectorTelemetry";

export type { InspectorSafetyDecision };

/**
 * Returns a non-mutating preview of the local Family Safe Mode decision for
 * inspector logging. In Electron mode the renderer is NEVER authoritative —
 * the main-process IPC handler is. In web mode the renderer's local
 * classifier is the only enforcement, so we evaluate it via the
 * `previewLocalFamilyGuard` helper (which runs the rule engine but does
 * NOT call `recordDecision`).
 *
 * The shape returned is always one of the three `InspectorSafetyDecision`
 * variants above, so the inspector UI can render every state without
 * resorting to `null`.
 */
export function getSafetyDecisionForLog(
  endpoint: string,
  method: string,
  payload: unknown,
): { decision: InspectorSafetyDecision; previewDurationMs: number } {
  const previewStartedAt = Date.now();
  if (isElectron()) {
    return {
      decision: { layer: "local-family-safe-mode", mode: "electron-main-authoritative", action: "deferred" },
      previewDurationMs: Date.now() - previewStartedAt,
    };
  }
  if (method !== "POST" || payload === undefined) {
    return {
      decision: { layer: "local-family-safe-mode", mode: "electron-main-authoritative", action: "deferred" },
      previewDurationMs: Date.now() - previewStartedAt,
    };
  }
  // Web mode: the renderer is the only enforcement layer. Use the
  // non-mutating preview so we never double-count.
  const decision = previewLocalFamilyGuard(
    { endpoint, method, payload, source: "venice-client" },
    useSettingsStore.getState().localFamilySafeModeEnabled,
  );
  const previewDurationMs = Date.now() - previewStartedAt;
  if (decision.allowed && decision.skipped) {
    return {
      decision: {
        layer: "local-family-safe-mode",
        mode: "adult",
        action: "skipped",
        reasonCode: "LOCAL_FAMILY_SAFE_MODE_DISABLED",
      },
      previewDurationMs,
    };
  }
  if (!decision.allowed) {
    return {
      decision: {
        layer: "local-family-safe-mode",
        mode: "family",
        action: "block",
        reasonCode: decision.reason,
      },
      previewDurationMs,
    };
  }
  return {
    decision: { layer: "local-family-safe-mode", mode: "family", action: "allow" },
    previewDurationMs,
  };
}
