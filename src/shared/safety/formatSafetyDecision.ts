/**
 * @fileoverview Serializable safety-block presenter. Works with plain objects
 * that survive IPC serialization, so callers never rely on `instanceof Error`.
 */

import type { SafetyGuardCategory } from "./childExploitationGuard";
import type { SafetyCategory, SafetyLayer } from "./localFamilySafeGuard";

/** Plain-object safety block that can cross the Electron IPC boundary. */
export type SafetyBlockResult = {
  kind: "safety-block";
  layer: SafetyLayer;
  category: SafetyCategory | string;
  reasonCode: string;
  userMessage?: string;
};

export function isSafetyBlockResult(value: unknown): value is SafetyBlockResult {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>).kind === "safety-block" &&
    typeof (value as Record<string, unknown>).layer === "string" &&
    typeof (value as Record<string, unknown>).category === "string" &&
    typeof (value as Record<string, unknown>).reasonCode === "string"
  );
}

/**
 * Maps a guard-specific category to the normalized SafetyCategory vocabulary.
 * Blocked decisions always resolve to a non-allowed category.
 */
export function guardCategoryToSafetyCategory(
  category: SafetyGuardCategory,
): SafetyCategory | string {
  switch (category) {
    case "csam_request":
      return "csam";
    case "unsafe_image_generation":
      return "adult-explicit-image";
    case "minor_sexualization":
    case "fictional_minor_sexualization":
    case "obfuscated_minor_sexualization":
    case "ambiguous_youth_context":
      return "minor-sexualization";
    case "age_evasion":
      return "age-evasion";
    case "grooming_or_exploitation":
    case "unsafe_roleplay":
    case "unsafe_batch_or_automation":
      return "grooming";
    default:
      // Any other blocked category is treated as a child-safety concern.
      return "minor-sexualization";
  }
}

/**
 * Derives the safety stack layer from a guard category. The optional family
 * filter only blocks adult explicit imagery; everything else is mandatory.
 */
export function safetyLayerFromGuardCategory(
  category: SafetyGuardCategory,
): SafetyLayer {
  if (category === "unsafe_image_generation") {
    return "optional-family-policy";
  }
  return "mandatory-child-safety";
}

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

function defaultUserMessageForLayer(t: TranslateFn, layer: SafetyLayer): string {
  const key = `safetyDecision.userMessage.${layer}`;
  const fallback: Record<SafetyLayer, string> = {
    "mandatory-child-safety":
      "Generation blocked: child-safety protection triggered.",
    "optional-family-policy":
      "Generation blocked: optional Family Safe Mode triggered.",
    "disabled-local-family-safe-mode":
      "Local Family Safe Mode is off; local screening was skipped.",
    "provider-policy": "Generation blocked: provider policy violation.",
    "request-validation": "Generation blocked: request validation failed.",
  };
  return t(key, { defaultValue: fallback[layer] });
}

/**
 * Renders a user-facing safety block message from a serializable decision.
 * No raw prompt text, matched terms, or provider payloads are included.
 */
export function formatSafetyDecision(
  t: TranslateFn,
  block: Pick<
    SafetyBlockResult,
    "layer" | "category" | "reasonCode" | "userMessage"
  >,
): string {
  const userMessage =
    block.userMessage && block.userMessage.trim().length > 0
      ? block.userMessage
      : defaultUserMessageForLayer(t, block.layer);

  const layerLabel = t(`safetyDecision.layer.${block.layer}`, {
    defaultValue: block.layer,
  });
  const categoryKey =
    typeof block.category === "string" && block.category.trim().length > 0
      ? block.category
      : "unknown";
  const categoryLabel = t(`safetyDecision.category.${categoryKey}`, {
    defaultValue: categoryKey,
  });

  return [
    userMessage,
    "",
    t("safetyDecision.label.blockingLayer", { layer: layerLabel }),
    t("safetyDecision.label.category", { category: categoryLabel }),
    t("safetyDecision.label.reasonCode", { reasonCode: block.reasonCode }),
  ].join("\n");
}
