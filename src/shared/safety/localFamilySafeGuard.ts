/** Central conditional pipeline for Venice Forge's optional local family filter. */
import type { SafetyGuardDecision, SafetyGuardInput } from "./childExploitationGuard";
import { recordDecision } from "./guardAudit";
import { runLocalFamilyGuard } from "./localFamilyGuardRules";
export { runLocalFamilyGuard } from "./localFamilyGuardRules";

export const FAMILY_SAFE_MODE_BLOCK_MESSAGE =
  "Blocked by Family Safe Mode. You can disable Family Safe Mode in Settings if you want to use Adult Mode.";

export type LocalGuardDecision =
  | {
      allowed: true;
      skipped?: boolean;
      reason?: string;
      guardDecision?: SafetyGuardDecision;
    }
  | {
      allowed: false;
      skipped?: false;
      reason: string;
      ruleId?: string;
      userMessage: string;
      guardDecision: SafetyGuardDecision;
    };

/** Skips rule evaluation entirely when Family Safe Mode is disabled. */
export function maybeRunLocalFamilyGuard(
  input: SafetyGuardInput,
  localFamilySafeModeEnabled: boolean,
): LocalGuardDecision {
  if (!localFamilySafeModeEnabled) {
    return {
      allowed: true,
      skipped: true,
      reason: "local-family-safe-mode-disabled",
    };
  }

  const guardDecision = runLocalFamilyGuard(input);
  recordDecision(guardDecision);
  if (!guardDecision.allow || guardDecision.action === "block") {
    return {
      allowed: false,
      reason: guardDecision.reasonCode,
      ruleId: guardDecision.reasonCode,
      userMessage: FAMILY_SAFE_MODE_BLOCK_MESSAGE,
      guardDecision,
    };
  }

  return { allowed: true, guardDecision };
}

/**
 * Non-mutating preview of the local Family Safe Mode decision. Evaluates the
 * rule engine the same way `maybeRunLocalFamilyGuard` does, but NEVER calls
 * `recordDecision`. Use this for inspector / telemetry previews so the
 * authoritative main-process IPC enforcement path is the sole producer of
 * audit counters.
 *
 * Returning a `skipped: true` decision for Adult Mode is intentional — the
 * inspector can show the operator that the local filter is disabled without
 * the renderer pretending to enforce it.
 */
export function previewLocalFamilyGuard(
  input: SafetyGuardInput,
  localFamilySafeModeEnabled: boolean,
): LocalGuardDecision {
  if (!localFamilySafeModeEnabled) {
    return {
      allowed: true,
      skipped: true,
      reason: "local-family-safe-mode-disabled",
    };
  }

  const guardDecision = runLocalFamilyGuard(input);
  if (!guardDecision.allow || guardDecision.action === "block") {
    return {
      allowed: false,
      reason: guardDecision.reasonCode,
      ruleId: guardDecision.reasonCode,
      userMessage: FAMILY_SAFE_MODE_BLOCK_MESSAGE,
      guardDecision,
    };
  }

  return { allowed: true, guardDecision };
}

export type ResponseBodyScreenResult =
  | { allowed: true; skipped: boolean; reason?: string }
  | { allowed: false; reason: string; ruleId?: string; userMessage: string };

/**
 * Screens a string returned by a web-proxy or scrape boundary. The guard is
 * gated by the same `localFamilySafeModeEnabled` flag used elsewhere — when
 * Family Safe Mode is OFF (Adult Mode) the body is allowed through unchanged
 * and `skipped` is set so callers can record that no rule evaluation happened.
 *
 * Callers MUST treat blocked results as a 451 with the supplied `userMessage`
 * (do not echo raw body content back to the user). When the input is shorter
 * than the guard's prompt-hash budget we screen verbatim; for very large
 * bodies we sample a window to keep evaluation O(1) on payload size.
 */
export function screenResponseBody(
  body: string,
  context: SafetyGuardInput,
  localFamilySafeModeEnabled: boolean,
  sampleWindow = 8000,
): ResponseBodyScreenResult {
  if (!localFamilySafeModeEnabled) {
    return { allowed: true, skipped: true, reason: "local-family-safe-mode-disabled" };
  }
  const sample = body.length > sampleWindow ? body.slice(0, sampleWindow) : body;
  const input: SafetyGuardInput = { ...context, text: sample };
  const decision = maybeRunLocalFamilyGuard(input, true);
  if (!decision.allowed) {
    return {
      allowed: false,
      reason: decision.reason,
      ruleId: decision.ruleId,
      userMessage: decision.userMessage,
    };
  }
  return { allowed: true, skipped: false };
}
