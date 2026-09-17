/** @fileoverview Shared, transport-independent model capability gates.
 *
 *  Gate tool injection and capability-gated request fields ONLY on explicit
 *  runtime metadata (P1-005/P3-001): missing metadata fails closed so an
 *  unsupported model never receives `tools` / tool choice from the canonical
 *  body builder. Never hard-code production model IDs here.
 */

export interface FunctionCallingCapableModel {
  capabilities?: { supportsFunctionCalling?: boolean };
}

/** True only when the model explicitly advertises function calling. */
export function supportsFunctionCalling(
  modelInfo: FunctionCallingCapableModel | undefined,
): boolean {
  return modelInfo?.capabilities?.supportsFunctionCalling === true;
}

/** True only when the model explicitly advertises vision. */
export function supportsVision(modelInfo: FunctionCallingCapableModel & {
  capabilities?: { supportsVision?: boolean };
} | undefined): boolean {
  return modelInfo?.capabilities?.supportsVision === true;
}

/** True only when the model explicitly advertises end-to-end encryption.
 *  Used to capability-gate `venice_parameters.enable_e2ee` so the field is
 *  omitted for models that do not declare `supportsE2EE`. The Swagger field
 *  is documented as nested under `model.model_spec.capabilities`, but
 *  legacy normalized records may carry the boolean at the top of
 *  `model_spec`. Both shapes are honored — absent/unspecified fails closed. */
export function supportsE2EE(
  modelInfo: {
    model_spec?: {
      supportsE2EE?: boolean;
      capabilities?: { supportsE2EE?: boolean };
    };
  } | undefined,
): boolean {
  if (!modelInfo?.model_spec) return false;
  if (typeof modelInfo.model_spec.supportsE2EE === 'boolean') {
    return modelInfo.model_spec.supportsE2EE;
  }
  return modelInfo.model_spec.capabilities?.supportsE2EE === true;
}

/** Canonical `reasoning_effort` enum per Swagger `ChatCompletionRequest`
 *  (docs/reference/Venice_swagger_api.yaml). The nested `reasoning.effort`
 *  form accepts the same values. */
export const REASONING_EFFORT_OPTIONS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type ReasoningEffort = (typeof REASONING_EFFORT_OPTIONS)[number];

const REASONING_EFFORT_OPTION_SET: ReadonlySet<string> = new Set(
  REASONING_EFFORT_OPTIONS,
);

export interface ReasoningEffortCapableModel {
  model_spec?: {
    capabilities?: {
      supportsReasoningEffort?: boolean;
      reasoningEffortOptions?: readonly string[];
      defaultReasoningEffort?: string;
    };
  };
}

/** True only when the model explicitly advertises `supportsReasoningEffort`
 *  (Swagger `TextModelCapabilities.supportsReasoningEffort`). Models that do
 *  not support the parameter error when it is sent (e.g. Grok), so an
 *  absent flag fails closed — same doctrine as the other capability gates. */
export function supportsReasoningEffort(
  modelInfo: ReasoningEffortCapableModel | undefined,
): boolean {
  return (
    modelInfo?.model_spec?.capabilities?.supportsReasoningEffort === true
  );
}

/** Returns the effort options valid for the model, or `null` when the model
 *  explicitly does not support `reasoning_effort` (or advertises no metadata
 *  at all — fail closed). Source: live `model_spec.capabilities` metadata
 *  per Swagger `TextModelCapabilities.reasoningEffortOptions` / upstream
 *  guides/features/reasoning-models.mdx. When the model supports the
 *  parameter but advertises no option restriction, the full documented enum
 *  is offered. Advertised values outside the documented enum are filtered
 *  out; an empty remainder falls back to the full enum. */
export function getReasoningEffortOptions(
  modelInfo: ReasoningEffortCapableModel | undefined,
): ReasoningEffort[] | null {
  const capabilities = modelInfo?.model_spec?.capabilities;
  if (capabilities?.supportsReasoningEffort !== true) return null;
  const advertised = capabilities.reasoningEffortOptions;
  if (!Array.isArray(advertised) || advertised.length === 0) {
    return [...REASONING_EFFORT_OPTIONS];
  }
  const valid = advertised.filter(
    (value): value is ReasoningEffort =>
      typeof value === "string" && REASONING_EFFORT_OPTION_SET.has(value),
  );
  return valid.length > 0 ? valid : [...REASONING_EFFORT_OPTIONS];
}

/** The model's advertised default effort (Swagger
 *  `TextModelCapabilities.defaultReasoningEffort`), validated against the
 *  model's own option list. Undefined when absent or not valid for the
 *  model — callers then fall back to omitting the field (provider default). */
export function getDefaultReasoningEffort(
  modelInfo: ReasoningEffortCapableModel | undefined,
): ReasoningEffort | undefined {
  const options = getReasoningEffortOptions(modelInfo);
  if (!options) return undefined;
  const advertised =
    modelInfo?.model_spec?.capabilities?.defaultReasoningEffort;
  if (
    typeof advertised === "string" &&
    (options as readonly string[]).includes(advertised)
  ) {
    return advertised as ReasoningEffort;
  }
  return undefined;
}

/** Canonical wire resolver for `reasoning_effort` at the payload boundary.
 *
 *  Venice returns 400 for effort values a model does not support and does
 *  NOT auto-map (upstream reasoning-models.mdx), so an invalid value must
 *  never reach the wire:
 *   - unset request → omit (provider default),
 *   - model without advertised support / without metadata → omit (fail closed),
 *   - requested value within the model's options → send it,
 *   - requested value invalid for the model → repair to the model's advertised
 *     `defaultReasoningEffort`, else omit. Repair is also mirrored in the UI
 *     with a non-blocking notice; this resolver is the last line of defense. */
export function resolveReasoningEffort(
  modelInfo: ReasoningEffortCapableModel | undefined,
  requested: string | undefined,
): ReasoningEffort | undefined {
  if (!requested) return undefined;
  const options = getReasoningEffortOptions(modelInfo);
  if (!options) return undefined;
  if ((options as readonly string[]).includes(requested)) {
    return requested as ReasoningEffort;
  }
  return getDefaultReasoningEffort(modelInfo);
}

/** Normalized deprecation record resolved from live model metadata.
 *  Primary source is the documented Swagger
 *  `ModelResponse.model_spec.deprecation` object (only present for models
 *  scheduled for retirement); legacy fallback-provider records that carry
 *  `lifecycle`/`retirementDate` instead are normalized to the same shape. */
export interface ModelDeprecationInfo {
  /** Sunset instant — Swagger `deprecation.removesAt` (or legacy `date` /
   *  `retirementDate`). */
  removesAt?: string;
  /** Optional deprecation-notice start instant (Swagger `startsAt`). */
  startsAt?: string;
  /** Suggested migration target when Venice provides one. */
  replacementModelId?: string;
  /** When true, Venice may transparently remap requests at sunset. */
  autoRemap?: boolean;
  /** Where the record came from — live catalog metadata or a legacy
   *  fallback-provider lifecycle field. */
  source: "model_spec" | "legacy";
}

export interface DeprecationCheckableModel {
  model_spec?: {
    deprecation?: {
      autoRemap?: boolean;
      date?: string;
      removesAt?: string;
      replacementModelId?: string;
      startsAt?: string;
    };
  };
  /** Legacy fallback-provider lifecycle (see `ProviderModelLifecycle`). */
  lifecycle?: string;
  /** Legacy fallback-provider retirement date. */
  retirementDate?: string;
}

/** Resolves deprecation info for a model, or `null` when the model is not
 *  known to be deprecated. Never invents state: only the documented
 *  `model_spec.deprecation` object and the legacy fallback lifecycle fields
 *  are consulted. Models removed from the catalog entirely (no metadata)
 *  return `null` — callers keep the current selection working-or-failing
 *  per existing behavior and only add a warning layer when metadata exists. */
export function resolveModelDeprecation(
  modelInfo: DeprecationCheckableModel | undefined,
): ModelDeprecationInfo | null {
  const deprecation = modelInfo?.model_spec?.deprecation;
  if (deprecation && typeof deprecation === "object") {
    const removesAt =
      typeof deprecation.removesAt === "string" && deprecation.removesAt
        ? deprecation.removesAt
        : typeof deprecation.date === "string" && deprecation.date
          ? deprecation.date
          : undefined;
    return {
      ...(removesAt ? { removesAt } : {}),
      ...(typeof deprecation.startsAt === "string" && deprecation.startsAt
        ? { startsAt: deprecation.startsAt }
        : {}),
      ...(typeof deprecation.replacementModelId === "string" &&
      deprecation.replacementModelId
        ? { replacementModelId: deprecation.replacementModelId }
        : {}),
      ...(typeof deprecation.autoRemap === "boolean"
        ? { autoRemap: deprecation.autoRemap }
        : {}),
      source: "model_spec",
    };
  }
  if (
    modelInfo &&
    (modelInfo.lifecycle === "deprecated" ||
      modelInfo.lifecycle === "retiring" ||
      (typeof modelInfo.retirementDate === "string" &&
        modelInfo.retirementDate.length > 0))
  ) {
    return {
      ...(typeof modelInfo.retirementDate === "string" &&
      modelInfo.retirementDate
        ? { removesAt: modelInfo.retirementDate }
        : {}),
      source: "legacy",
    };
  }
  return null;
}