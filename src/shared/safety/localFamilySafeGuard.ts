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
