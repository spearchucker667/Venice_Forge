/**
 * @fileoverview Public barrel for the Venice Forge child exploitation safety guard.
 */

export {
  assessChildExploitationSafety,
  assertChildExploitationSafe,
  assessPromptForSafeContext,
  SafetyGuardBlockedError,
  normalizeText,
} from "./childExploitationGuard";

export type {
  SafetyGuardAction,
  SafetyGuardSeverity,
  SafetyGuardCategory,
  SafetyGuardSignal,
  SafetyGuardDecision,
  SafetyGuardInput,
} from "./childExploitationGuard";

export { extractPromptLikeFields } from "./promptPayloadExtractor";
export type { ExtractedField } from "./promptPayloadExtractor";

export { recordDecision, getAuditSnapshot, _resetAuditCounters_TEST_ONLY } from "./guardAudit";
export type { GuardAuditSnapshot } from "./guardAudit";

export {
  FAMILY_SAFE_MODE_BLOCK_MESSAGE,
  maybeRunLocalFamilyGuard,
  runLocalFamilyGuard,
} from "./localFamilySafeGuard";
export type { LocalGuardDecision } from "./localFamilySafeGuard";
