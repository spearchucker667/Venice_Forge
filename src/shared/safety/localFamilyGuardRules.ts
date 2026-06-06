/** The Family Safe Mode rule engine entry point. Kept separate so skip behavior is testable. */
import {
  assessChildExploitationSafety,
  type SafetyGuardDecision,
  type SafetyGuardInput,
} from "./childExploitationGuard";

export function runLocalFamilyGuard(input: SafetyGuardInput): SafetyGuardDecision {
  return assessChildExploitationSafety(input);
}
