/** Central pipeline for Venice Forge's local Family Safe Mode guard. */
import type { SafetyGuardDecision, SafetyGuardInput } from "./childExploitationGuard";
import { recordDecision } from "./guardAudit";
import { runLocalFamilyGuard } from "./localFamilyGuardRules";
import {
  incrementEvaluated,
  incrementSkippedDisabled,
} from "./safetyCounters";
import {
  MAX_SCAN_CHARS,
  TAIL_SCAN_CHARS,
  MIDDLE_SCAN_CHARS,
} from "./normalization";
export { runLocalFamilyGuard } from "./localFamilyGuardRules";

export const FAMILY_SAFE_MODE_BLOCK_MESSAGE =
  "Blocked by local Family Safe Mode.";

/** Identifies which layer of the safety stack produced a decision. */
export type SafetyLayer =
  | "mandatory-child-safety"
  | "optional-family-policy"
  | "disabled-local-family-safe-mode"
  | "provider-policy"
  | "request-validation";

/** Normalized safety-category vocabulary for UI/telemetry. */
export type SafetyCategory =
  | "minor-sexualization"
  | "csam"
  | "grooming"
  | "age-evasion"
  | "adult-explicit-image"
  | "graphic-gore"
  | "provider-restriction"
  | "validation-error";

export type SafetyDecisionCategory =
  | "adult-content-approved"
  | "general"
  | "child-safety"
  | "adult-content-blocked"
  | "illegal-content"
  | "provider-policy"
  | "validation-error";

export type SafetyDecision =
  | { allowed: true; category: "adult-content-approved" | "general" }
  | {
      allowed: false;
      category: Exclude<SafetyDecisionCategory, "adult-content-approved" | "general">;
      userMessage: string;
    };

export type LocalGuardDecision =
  | {
      allowed: true;
      skipped?: boolean;
      reason?: string;
      guardDecision?: SafetyGuardDecision;
      category?: Extract<SafetyDecisionCategory, "adult-content-approved" | "general">;
      layer: SafetyLayer;
    }
  | {
      allowed: false;
      skipped?: false;
      reason: string;
      ruleId?: string;
      userMessage: string;
      guardDecision: SafetyGuardDecision;
      category: Exclude<SafetyDecisionCategory, "adult-content-approved" | "general">;
      layer: SafetyLayer;
    };

function uiCategoryFromGuardCategory(
  guardCategory: SafetyGuardDecision["category"],
): SafetyDecision["category"] {
  switch (guardCategory) {
    case "adult_sexual_content":
      return "adult-content-approved";
    case "allowed_child_safety_context":
    case "none":
      return "general";
    case "csam_request":
      return "illegal-content";
    case "unsafe_image_generation":
      return "adult-content-blocked";
    case "minor_sexualization":
    case "fictional_minor_sexualization":
    case "obfuscated_minor_sexualization":
    case "age_evasion":
    case "grooming_or_exploitation":
    case "unsafe_roleplay":
    case "unsafe_batch_or_automation":
    case "ambiguous_youth_context":
      return "child-safety";
    default:
      return "child-safety";
  }
}

function userMessageForSafetyDecision(
  category: Exclude<SafetyDecisionCategory, "adult-content-approved" | "general">,
): string {
  switch (category) {
    case "illegal-content":
      return (
        "This request was blocked by mandatory child-safety protection because it appears to " +
        "involve child sexual abuse material or a CSAM genre label. " +
        "The request was not sent to the API.\n\n" +
        "Adult fictional content is not blocked by this rule."
      );
    case "child-safety":
      return (
        "This request was blocked by mandatory child-safety protection because it appears to " +
        "involve a minor, age-ambiguous subject, or exploitative content. " +
        "The request was not sent to the API.\n\n" +
        "Adult fictional content is not blocked by this rule."
      );
    case "adult-content-blocked":
      return (
        "This request was blocked by optional Family Safe Mode because it requested " +
        "adult explicit imagery or graphic content that is filtered while Family Safe Mode is on. " +
        "The request was not sent to the API."
      );
    case "provider-policy":
      return "Blocked: provider policy violation.\n\nReason:\nThe request violates the selected provider's content policy.";
    case "validation-error":
      return "Blocked: request validation failed.\n\nReason:\nThe request could not be validated for safety.";
  }
}

function deriveSafetyLayer(
  allowed: boolean,
  uiCategory: SafetyDecisionCategory,
  familyModeEnabled: boolean,
): SafetyLayer {
  if (!allowed && uiCategory === "adult-content-blocked") {
    return "optional-family-policy";
  }
  if (uiCategory === "provider-policy") return "provider-policy";
  if (uiCategory === "validation-error") return "request-validation";
  if (allowed && familyModeEnabled) return "optional-family-policy";
  return "mandatory-child-safety";
}

export function toSafetyDecision(
  guardDecision: SafetyGuardDecision,
): SafetyDecision {
  if (!guardDecision.allow || guardDecision.action === "block") {
    const category = uiCategoryFromGuardCategory(guardDecision.category);
    if (category === "adult-content-approved" || category === "general") {
      return {
        allowed: false,
        category: "child-safety",
        userMessage: userMessageForSafetyDecision("child-safety"),
      };
    }
    return {
      allowed: false,
      category,
      userMessage: userMessageForSafetyDecision(category),
    };
  }
  return {
    allowed: true,
    category: guardDecision.category === "adult_sexual_content" ? "adult-content-approved" : "general",
  };
}

/**
 * Runs local screening only when Family Safe Mode is enabled. Disabled mode
 * returns a synthetic skipped decision without invoking the rule engine.
 */
function buildBlockedLocalDecision(
  guardDecision: SafetyGuardDecision,
  familyModeEnabled: boolean,
): Extract<LocalGuardDecision, { allowed: false }> {
  const decision = toSafetyDecision(guardDecision);
  if (decision.allowed) {
    // Guard reported a block, so toSafetyDecision must also report a block.
    // This fallback is only here to keep the type-checker happy.
    return {
      allowed: false,
      reason: guardDecision.reasonCode,
      ruleId: guardDecision.reasonCode,
      userMessage: "Blocked by safety guard.",
      guardDecision,
      category: "child-safety",
      layer: "mandatory-child-safety",
    };
  }
  const category = decision.category;
  return {
    allowed: false,
    reason: guardDecision.reasonCode,
    ruleId: guardDecision.reasonCode,
    userMessage: decision.userMessage,
    guardDecision,
    category,
    layer: deriveSafetyLayer(false, category, familyModeEnabled),
  };
}

function buildAllowedLocalDecision(
  guardDecision: SafetyGuardDecision,
  familyModeEnabled: boolean,
): Extract<LocalGuardDecision, { allowed: true }> {
  const decision = toSafetyDecision(guardDecision);
  const category = decision.category as Extract<
    SafetyDecisionCategory,
    "adult-content-approved" | "general"
  >;
  const layer = familyModeEnabled
    ? deriveSafetyLayer(true, category, familyModeEnabled)
    : "disabled-local-family-safe-mode";
  return familyModeEnabled
    ? { allowed: true, guardDecision, category, layer }
    : {
        allowed: true,
        skipped: true,
        reason: "LOCAL_FAMILY_SAFE_MODE_DISABLED",
        guardDecision,
        category,
        layer,
      };
}

/**
 * Evaluates the local safety stack when Family Safe Mode is enabled. When
 * disabled, local screening is short-circuited with zero behavioral impact:
 * no rules evaluated, no counters recorded, no blocks emitted.
 */
export function maybeRunLocalFamilyGuard(
  input: SafetyGuardInput,
  localFamilySafeModeEnabled: boolean,
): LocalGuardDecision {
  if (!localFamilySafeModeEnabled) {
    return {
      allowed: true,
      skipped: true,
      reason: "LOCAL_FAMILY_SAFE_MODE_DISABLED",
      category: "general",
      layer: "disabled-local-family-safe-mode",
    };
  }
  const guardDecision = runLocalFamilyGuard(input, true);
  recordDecision(guardDecision);
  if (!guardDecision.allow || guardDecision.action === "block") {
    return buildBlockedLocalDecision(guardDecision, true);
  }
  return buildAllowedLocalDecision(guardDecision, true);
}

/**
 * Non-mutating preview of the local Family Safe Mode decision. Evaluates the
 * rule engine the same way `maybeRunLocalFamilyGuard` does, but NEVER calls
 * `recordDecision`. Use this for inspector / telemetry previews so the
 * authoritative main-process IPC enforcement path is the sole producer of
 * audit counters.
 *
 * Returning a `skipped: true` decision for Adult Mode is intentional — the
 * inspector can show the operator that local screening is disabled.
 */
export function previewLocalFamilyGuard(
  input: SafetyGuardInput,
  localFamilySafeModeEnabled: boolean,
): LocalGuardDecision {
  if (!localFamilySafeModeEnabled) {
    return {
      allowed: true,
      skipped: true,
      reason: "LOCAL_FAMILY_SAFE_MODE_DISABLED",
      category: "general",
      layer: "disabled-local-family-safe-mode",
    };
  }
  const guardDecision = runLocalFamilyGuard(input, true);
  if (!guardDecision.allow || guardDecision.action === "block") {
    return buildBlockedLocalDecision(guardDecision, true);
  }
  return buildAllowedLocalDecision(guardDecision, true);
}

export type ResponseBodyScreenResult =
  | { allowed: true; skipped: boolean; reason?: string; uiCategory?: SafetyDecisionCategory }
  | {
      allowed: false;
      reason: string;
      reasonCode: string;
      category: SafetyGuardDecision["category"];
      uiCategory: SafetyDecisionCategory;
      severity: SafetyGuardDecision["severity"];
      ruleId?: string;
      userMessage: string;
    };

export type SafetyBlockBody = {
  error: string;
  reasonCode: string;
  category: SafetyGuardDecision["category"];
  severity: SafetyGuardDecision["severity"];
};

export function safetyBlockBodyFromResponseScreen(
  screen: Extract<ResponseBodyScreenResult, { allowed: false }>,
): SafetyBlockBody {
  return {
    error: screen.userMessage,
    reasonCode: screen.reasonCode,
    category: screen.category,
    severity: screen.severity,
  };
}

/** Overlap used around window boundaries so a prohibited signal split by a
 *  sampling cut is still captured in at least one contiguous slice. */
const SCREEN_WINDOW_OVERLAP = 256;

/** Maximum number of middle windows used when screening very large bodies. */
const MAX_SCREEN_MIDDLE_WINDOWS = 3;

/**
 * Builds a bounded head + middle + tail sample of a potentially very large
 * response body. Uses the same window constants as the prompt normalizer so
 * screening cost stays O(1) on payload size while still catching signals at
 * the start, end, and middle of the body.
 */
function buildScreeningSample(body: string): string {
  if (body.length <= MAX_SCAN_CHARS) {
    return body;
  }

  const head = body.slice(0, MAX_SCAN_CHARS);
  const tail = body.slice(-TAIL_SCAN_CHARS);
  const headEnd = MAX_SCAN_CHARS;
  const tailStart = body.length - TAIL_SCAN_CHARS;
  const parts: string[] = [head];

  if (tailStart > headEnd) {
    // Boundary overlap slices catch signals that span the head/middle or
    // middle/tail cuts.
    parts.push(body.slice(headEnd - SCREEN_WINDOW_OVERLAP, headEnd + SCREEN_WINDOW_OVERLAP));
    parts.push(body.slice(tailStart - SCREEN_WINDOW_OVERLAP, tailStart + SCREEN_WINDOW_OVERLAP));

    // Evenly-spaced middle windows cover the unscanned gap between head and tail.
    const gap = tailStart - headEnd;
    const windowCount = Math.min(MAX_SCREEN_MIDDLE_WINDOWS, Math.ceil(gap / MIDDLE_SCAN_CHARS));
    for (let i = 0; i < windowCount; i++) {
      const center = headEnd + Math.floor((gap * (i + 1)) / (windowCount + 1));
      const start = Math.max(
        headEnd,
        Math.min(center - Math.floor(MIDDLE_SCAN_CHARS / 2), tailStart - MIDDLE_SCAN_CHARS),
      );
      parts.push(body.slice(start, start + MIDDLE_SCAN_CHARS));
    }
  }

  parts.push(tail);
  return parts.filter(Boolean).join(" ");
}

/**
 * Screens a string returned by a web-proxy or scrape boundary when Local Family
 * Safe Mode is enabled. When disabled (Adult Mode), local screening has zero
 * behavioral impact and returns immediately as skipped.
 *
 * Callers MUST treat blocked results as a 451 with the supplied `userMessage`
 * (do not echo raw body content back to the user). When the input is shorter
 * than the guard's prompt-hash budget we screen verbatim; for very large
 * bodies we sample bounded head + middle + tail windows to keep evaluation
 * O(1) on payload size.
 */
export function screenResponseBody(
  body: string,
  context: SafetyGuardInput,
  localFamilySafeModeEnabled: boolean,
  _sampleWindow = MAX_SCAN_CHARS,
): ResponseBodyScreenResult {
  if (!localFamilySafeModeEnabled) {
    incrementSkippedDisabled("text");
    return {
      allowed: true,
      skipped: true,
      uiCategory: "general",
      reason: "LOCAL_FAMILY_SAFE_MODE_DISABLED",
    };
  }
  const sample = buildScreeningSample(body);
  const input: SafetyGuardInput = { ...context, text: sample };
  const decision = maybeRunLocalFamilyGuard(input, true);
  if (!decision.allowed) {
    incrementEvaluated("text", "blocked");
    return {
      allowed: false,
      reason: decision.reason,
      reasonCode: decision.guardDecision.reasonCode,
      category: decision.guardDecision.category,
      uiCategory: decision.category,
      severity: decision.guardDecision.severity,
      ruleId: decision.ruleId,
      userMessage: decision.userMessage,
    };
  }
  incrementEvaluated("text", "allowed");
  return {
    allowed: true,
    skipped: false,
    uiCategory: decision.category,
  };
}

export * from "./mediaScreener";
