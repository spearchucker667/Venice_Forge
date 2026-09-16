import type {
  ChatCompletionCost,
  ChatCompletionUsage,
  VeniceModel,
  VeniceModelPricing,
  VenicePricingAmount,
} from "../types/venice";

export type PricingProvenance = "live" | "cache" | "fallback" | "catalog" | string;

/** Source of a returned cost value. Distinguishes caller-specific actual
 *  cost (returned by Venice in `usage.cost`) from a pre-request estimate
 *  derived from list pricing. UI must label these distinctly — they are not
 *  interchangeable. */
export type CostSource = "response" | "list-pricing-estimate";

/** Caller-specific actual cost for a completed chat request. `source`
 *  identifies whether the value came from the response (`usage.cost`,
 *  authoritative) or was estimated from `model_spec.pricing` before send. */
export interface ActualChatCost {
  usd?: number;
  diem?: number;
  source: CostSource;
}

/** Shape accepted by model selectors after live/fallback normalization. */
export interface PricingDisplayInput {
  id: string;
  name?: string;
  display_name?: string;
  type?: string;
  source?: PricingProvenance;
  isFallback?: boolean;
  model_spec?: Omit<NonNullable<VeniceModel["model_spec"]>, "pricing"> & {
    pricing?: VeniceModelPricing;
  };
  discount_to_user?: number;
}

function getModelName(model: PricingDisplayInput): string {
  return model.model_spec?.name || model.display_name || model.name || model.id;
}

function inferModelType(model: PricingDisplayInput): string {
  if (model.type) return model.type.toLowerCase();
  const constraints = model.model_spec?.constraints;
  if (constraints && "model_type" in constraints) return "video";
  if (constraints && ("resolutions" in constraints || "aspectRatios" in constraints)) {
    return "image";
  }
  return "unknown";
}

function resolveProvenance(
  model: PricingDisplayInput,
  provenance?: PricingProvenance,
): PricingProvenance | undefined {
  if (provenance) return provenance;
  if (model.source) return model.source;
  if (model.isFallback) return "fallback";
  return undefined;
}

function finiteUsd(amount: VenicePricingAmount | undefined): number | undefined {
  return typeof amount?.usd === "number" && Number.isFinite(amount.usd)
    ? amount.usd
    : undefined;
}

export function formatUsd(value: number): string {
  const abs = Math.abs(value);
  if (abs === 0) return "$0";
  if (abs < 0.0001) return `$${value.toExponential(2)}`;
  if (abs < 0.01) return `$${value.toFixed(4).replace(/\.?0+$/, "")}`;
  return `$${value.toFixed(2)}`;
}

function lowestAmount(
  entries: Array<[string, VenicePricingAmount]>,
): { key: string; usd: number } | undefined {
  return entries
    .map(([key, amount]) => ({ key, usd: finiteUsd(amount) }))
    .filter((entry): entry is { key: string; usd: number } => entry.usd !== undefined)
    .sort((a, b) => a.usd - b.usd)[0];
}

function formatTextPricing(pricing: VeniceModelPricing): string | null {
  const parts: string[] = [];
  const input = finiteUsd(pricing.input);
  const output = finiteUsd(pricing.output);
  if (input !== undefined) parts.push(`Input ${formatUsd(input)} / 1M tokens`);
  if (output !== undefined) parts.push(`Output ${formatUsd(output)} / 1M tokens`);
  return parts.length ? parts.join(" · ") : null;
}

function formatImagePricing(pricing: VeniceModelPricing, type: string): string | null {
  if (type === "inpaint") {
    const inpaint = finiteUsd(pricing.inpaint);
    if (inpaint !== undefined) return `${formatUsd(inpaint)}/edit`;
  }

  if (type === "upscale") {
    const upscale = pricing.upscale
      ? lowestAmount(Object.entries(pricing.upscale))
      : undefined;
    if (upscale) return `from ${formatUsd(upscale.usd)}/${upscale.key} upscale`;
  }

  const generation = finiteUsd(pricing.generation);
  if (generation !== undefined) return `${formatUsd(generation)}/image`;

  const resolution = pricing.resolutions
    ? lowestAmount(Object.entries(pricing.resolutions))
    : undefined;
  if (resolution) return `from ${formatUsd(resolution.usd)}/image (${resolution.key})`;

  if (pricing.quality) {
    const entries = Object.entries(pricing.quality).flatMap(
      ([resolutionKey, qualities]) =>
        Object.entries(qualities).map(
          ([qualityKey, amount]) => [`${resolutionKey} ${qualityKey}`, amount] as [string, VenicePricingAmount],
        ),
    );
    const quality = lowestAmount(entries);
    if (quality) return `from ${formatUsd(quality.usd)}/image (${quality.key})`;
  }
  const inpaint = finiteUsd(pricing.inpaint);
  if (inpaint !== undefined) return `${formatUsd(inpaint)}/edit`;
  const upscale = pricing.upscale
    ? lowestAmount(Object.entries(pricing.upscale))
    : undefined;
  if (upscale) return `from ${formatUsd(upscale.usd)}/${upscale.key} upscale`;
  return null;
}

function formatTimedPricing(pricing: VeniceModelPricing): string | null {
  const perSecond = finiteUsd(pricing.per_second);
  if (perSecond !== undefined) return `${formatUsd(perSecond)}/second`;

  const perAudioSecond = finiteUsd(pricing.per_audio_second);
  if (perAudioSecond !== undefined) return `${formatUsd(perAudioSecond)}/audio second`;

  if (pricing.durations) {
    const duration = lowestAmount(Object.entries(pricing.durations));
    if (duration) return `from ${formatUsd(duration.usd)}/generation (${duration.key})`;
  }

  const generation = finiteUsd(pricing.generation);
  if (generation !== undefined) return `${formatUsd(generation)}/generation`;

  const perThousandCharacters = finiteUsd(pricing.per_thousand_characters);
  if (perThousandCharacters !== undefined) {
    return `${formatUsd(perThousandCharacters)} / 1K characters`;
  }
  return null;
}

export function formatPricing(type: string, pricing: VeniceModelPricing): string | null {
  if (type === "text" || type === "embedding" || type === "embeddings") {
    return formatTextPricing(pricing);
  }
  if (type === "tts") {
    const input = finiteUsd(pricing.input);
    return input === undefined ? null : `${formatUsd(input)} / 1M characters`;
  }
  if (type === "image" || type === "inpaint" || type === "upscale") {
    return formatImagePricing(pricing, type);
  }
  if (type === "video" || type === "music" || type === "audio" || type === "asr") {
    return formatTimedPricing(pricing);
  }
  return (
    formatTextPricing(pricing) ??
    formatImagePricing(pricing, type) ??
    formatTimedPricing(pricing)
  );
}

/** Formats canonical `/models` pricing without inventing prices or units. */
export function formatModelLabelWithCost(
  model: VeniceModel | PricingDisplayInput,
  options?: { provenance?: PricingProvenance; minimal?: boolean },
): string {
  const displayModel = model as PricingDisplayInput;
  const name = getModelName(displayModel);
  const priceLabel = displayModel.model_spec?.pricing
    ? formatPricing(inferModelType(displayModel), displayModel.model_spec.pricing)
    : null;

  if (!priceLabel) {
    return options?.minimal ? name : `${name} (Price unavailable)`;
  }

  const provenance = resolveProvenance(displayModel, options?.provenance);
  const prefix =
    provenance === "fallback"
      ? "Estimated: "
      : provenance === "cache"
        ? "Cached: "
        : provenance === "catalog"
          ? "Catalog: "
          : "";
  return `${name} (${prefix}${priceLabel})`;
}

/** Returns the caller-specific actual cost for a chat completion when the
 *  response supplied one. Returns `null` when the response does not carry a
 *  `usage.cost` block — callers must NOT silently substitute a list-price
 *  estimate in that case, because that would mislabel a pre-request estimate
 *  as the actual billed amount. Use `estimateChatCostFromListPricing()` only
 *  when an estimate is explicitly acceptable. */
export function extractChatResponseCost(
  usage: ChatCompletionUsage | undefined | null,
): ActualChatCost | null {
  if (!usage) return null;
  const raw = usage.cost as ChatCompletionCost | undefined;
  if (!raw) return null;
  const usd = typeof raw.usd === "number" && Number.isFinite(raw.usd) ? raw.usd : undefined;
  const diem = typeof raw.diem === "number" && Number.isFinite(raw.diem) ? raw.diem : undefined;
  if (usd === undefined && diem === undefined) return null;
  return { usd, diem, source: "response" };
}

/** Pre-request cost estimate derived from list pricing. Marked with
 *  `source: 'list-pricing-estimate'` so the UI labels it as an estimate,
 *  not an actual billed amount. Intentionally not invoked by
 *  `extractChatResponseCost()` to keep the two paths separate. */
export function estimateChatCostFromListPricing(
  model: PricingDisplayInput,
  usage: { prompt_tokens: number; completion_tokens: number },
): ActualChatCost | null {
  const pricing = model.model_spec?.pricing;
  if (!pricing) return null;
  const input = finiteUsd(pricing.input);
  const output = finiteUsd(pricing.output);
  if (input === undefined && output === undefined) return null;
  // Venice list pricing is per 1M tokens; convert to total USD.
  const tokens = usage.prompt_tokens + usage.completion_tokens;
  const usd =
    (input !== undefined ? input * (usage.prompt_tokens / 1_000_000) : 0) +
    (output !== undefined ? output * (usage.completion_tokens / 1_000_000) : 0);
  if (!Number.isFinite(usd) || tokens <= 0) return null;
  return { usd, source: "list-pricing-estimate" };
}
