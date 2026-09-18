/** The Family Safe Mode rule engine entry point. Kept separate so skip behavior is testable. */
import {
  assessChildExploitationSafety,
  evaluateImageAdultContentPolicy,
  type SafetyGuardDecision,
  type SafetyGuardInput,
} from "./childExploitationGuard";

/**
 * Runs the safety stack for a request.
 *
 * 1. When Family Safe Mode is disabled, local screening is skipped entirely.
 * 2. When enabled, the child-exploitation guard runs first.
 * 3. If it blocks, that decision is returned immediately.
 * 4. If Family Safe Mode is enabled and the request reaches an image endpoint,
 *    the optional adult-content image policy is evaluated.
 * 4. Otherwise the request is allowed.
 */
export function runLocalFamilyGuard(
  input: SafetyGuardInput,
  localFamilySafeModeEnabled: boolean,
): SafetyGuardDecision {
  if (!localFamilySafeModeEnabled) {
    return {
      allow: true,
      action: "allow",
      severity: "none",
      category: "none",
      reasonCode: "LOCAL_FAMILY_SAFE_MODE_DISABLED",
      userMessage: "",
      developerMessage: "Local Family Safe Mode disabled; local safety screening skipped.",
      normalizedChanged: false,
      signals: [],
      audit: {
        decisionId: "local-family-safe-mode-disabled",
        createdAt: new Date().toISOString(),
        promptHash: "",
        promptLength: typeof input.text === "string" ? input.text.length : 0,
        matchedFieldPaths: [],
      },
    };
  }
  const mandatoryDecision = assessChildExploitationSafety(input);
  if (!mandatoryDecision.allow || mandatoryDecision.action === "block") {
    return mandatoryDecision;
  }

  const optionalDecision = evaluateImageAdultContentPolicy(input);
  if (optionalDecision && (!optionalDecision.allow || optionalDecision.action === "block")) {
    return optionalDecision;
  }

  return mandatoryDecision;
}
