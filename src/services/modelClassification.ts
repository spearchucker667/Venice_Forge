/** @fileoverview Model classification and grouping helpers shared by modelService.
 *  Extracted from the deleted src/state/appReducer.ts so the global
 *  reducer can be removed without losing the model's classification rules. */

import type { ModelInfo } from "../types/venice";

/** Explicit Venice model type values mapped to canonical categories.
 *  When the live API provides any of these, the classification is authoritative
 *  and regex heuristics are skipped. */
const EXPLICIT_TYPE_MAP: Record<string, "text" | "image" | "audio" | "video" | "embeddings"> = {
  text: "text",
  llm: "text",
  chat: "text",
  code: "text",
  image: "image",
  inpaint: "image",
  upscale: "image",
  tts: "audio",
  asr: "audio",
  audio: "audio",
  music: "audio",
  video: "video",
  "video-generation": "video",
  embedding: "embeddings",
  embeddings: "embeddings",
};

/** Returns the canonical category for an explicit model type, or undefined if unrecognized. */
function classifyExplicitType(type: string): "text" | "image" | "audio" | "video" | "embeddings" | undefined {
  return EXPLICIT_TYPE_MAP[type.trim().toLowerCase()];
}

/** Determines the model category from its metadata.
 *
 *  Resolution order:
 *  1. Explicit `type`/`model_type`/`modelType` value from the live API.
 *  2. Regex heuristics on id/traits/capabilities for legacy/offline records.
 *  3. `"unknown"` when no signal matches.
 */
export function classifyModel(model: ModelInfo): "text" | "image" | "audio" | "video" | "embeddings" | "unknown" {
  const rawExplicitType = model.type || model.model_type || model.modelType;
  const explicitType = classifyExplicitType(String(rawExplicitType || ""));
  if (explicitType) return explicitType;
  // Presence of unrecognized live metadata is authoritative. Guessing from
  // the model id would silently relabel a new provider modality.
  if (typeof rawExplicitType === "string" && rawExplicitType.trim()) return "unknown";

  const id = String(model.id || model.model || "").toLowerCase();
  const traits = JSON.stringify(
    model.traits || model.capabilities || model.features || {}
  ).toLowerCase();

  if (/embed/.test(id + traits)) return "embeddings";
  if (/image|sdxl|flux|fluently|lustify|pony|stable|diffusion|inpaint|upscale|banana/.test(id + traits))
    return "image";
  if (/audio|voice|speech|tts|asr|transcri|music/.test(id + traits)) return "audio";
  if (/video|wan|motion|animate/.test(id + traits)) return "video";
  if (/llama|qwen|deepseek|mistral|grok|dolphin|chat|text|coder|reason|zai|glm|kimi|gemma|gemini|hermes|openai/.test(id + traits))
    return "text";
  return "unknown";
}

/** Canonical one-record normalizer. Every path that ingests Venice model
 *  records (live `/models` responses, fallback catalogs, cache merges) must
 *  route through this so `ModelInfo.contextLength` / `maxOutputTokens` are
 *  always populated from any of the provider's equivalent fields
 *  (`model_spec.availableContextTokens`, `context_length`, camelCase
 *  variants). Without this, consumers like the chat context budget fall back
 *  to a fixed 8,192-token window regardless of the selected model. */
export function normalizeModelInfo(raw: unknown): ModelInfo {
  const m = (raw ?? {}) as Record<string, unknown>;
  const modelSpec = m.model_spec as Record<string, unknown> | undefined;
  const rawTraits = m.traits || m.capabilities || m.features || [];
  const traitsArr = Array.isArray(rawTraits) ? rawTraits : [];

  const specPrivacy = modelSpec?.privacy as string | undefined;
  const isPrivate = specPrivacy === 'private' || traitsArr.includes('private') || !!m.is_private || !!m.privateInference;
  const isAnonymous = specPrivacy === 'anonymized' || traitsArr.includes('anonymous') || !!m.anonymousInference;
  const privacyMode = isPrivate ? 'private' : isAnonymous ? 'anonymous' : 'standard';

  let fidelity: 'high' | 'standard' | undefined = undefined;
  if (traitsArr.includes('high_fidelity') || traitsArr.includes('high-fidelity')) fidelity = 'high';
  else if (traitsArr.includes('standard_fidelity') || traitsArr.includes('standard-fidelity') || traitsArr.includes('fast')) fidelity = 'standard';
  else if (String(m.id || '').toLowerCase().includes('-fast-')) fidelity = 'standard';
  else if (String(m.id || '').toLowerCase().includes('seedance')) fidelity = 'high';

  const resolvedType = classifyModel(m as unknown as ModelInfo);

  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

  return {
    ...(m as Record<string, unknown>),
    id: String(m.id || m.model || m.name || "unknown-model"),
    name: String(m.name || m.display_name || m.id || m.model || "unknown model"),
    // Preserve the provider's explicit type when present; only fall back to
    // the classified category. isFallback/source are preserved so fallback
    // catalogs stay truthfully labeled.
    type: (m.type as ModelInfo["type"]) || resolvedType,
    isFallback: typeof m.isFallback === "boolean" ? m.isFallback : false,
    source: (m.source as ModelInfo["source"]) || "live",
    contextLength:
      num(modelSpec?.availableContextTokens) ??
      num(m.context_length) ??
      num(m.contextLength),
    maxOutputTokens:
      num(modelSpec?.maxCompletionTokens) ??
      num(m.max_output_tokens) ??
      num(m.maxOutputTokens),
    privacy: {
      mode: privacyMode,
      privateInference: isPrivate,
      anonymousInference: isAnonymous,
      source: 'derived'
    },
    fidelity,
    // Preserve the canonical Venice `model_spec.uncensored` flag so
    // downstream consumers (agent picker, privacy gates, safety heuristics)
    // can read it without re-running the legacy trait fallback. The boolean
    // is left undefined when Venice did not emit it, instead of coercing to
    // false — see `resolveModelUncensored()` for the canonical precedence.
    uncensored: typeof modelSpec?.uncensored === 'boolean' ? modelSpec.uncensored : undefined
  } as ModelInfo;
}

/** Canonical Venice "uncensored model set" gate. Resolution precedence:
 *
 *  1. `model.model_spec.uncensored` (the explicit upstream flag)
 *  2. Legacy `traits.includes('most_uncensored')` for catalogs that predate
 *     the upstream field
 *  3. `false` when neither signal is present
 *
 *  Do NOT infer "uncensored" from model id keywords, captions, or any source
 *  other than the two signals above. Venice's classification is authoritative
 *  for both safety routing and the agent-model picker (see
 *  `docs/audits/TODO/VENICE_API_2026-09-16_FEATURE_GAP_AGENT_HANDOFF.md`
 *  §6.1 and the `VF-VENICE-API-2026-09-16-FEATURE-GAP-FIRST-SLICE` item in
 *  `docs/ROADMAP.md`).
 */
export function resolveModelUncensored(model: ModelInfo | undefined | null): boolean {
  if (!model) return false;
  if (typeof model.model_spec?.uncensored === 'boolean') {
    return model.model_spec.uncensored;
  }
  const traits = model.model_spec?.traits;
  if (Array.isArray(traits) && traits.includes('most_uncensored')) {
    return true;
  }
  return false;
}

/** Normalizes a raw model list into grouped categories. */
export function flattenModels(payload: unknown): Record<string, ModelInfo[]> {
  let list: unknown[] = [];
  if (Array.isArray(payload)) {
    list = payload;
  } else if (payload && typeof payload === "object" && "data" in payload && Array.isArray((payload as Record<string, unknown>).data)) {
    list = (payload as Record<string, unknown>).data as unknown[];
  }
  const groups: Record<string, ModelInfo[]> = {
    text: [],
    image: [],
    audio: [],
    video: [],
    embeddings: [],
    unknown: [],
  };
  list.forEach((raw) => {
    const normalized = normalizeModelInfo(raw);
    const resolvedType = classifyModel(normalized);
    groups[resolvedType].push(normalized);
  });
  return groups;
}
