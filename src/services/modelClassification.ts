/** @fileoverview Model classification and grouping helpers shared by modelService.
 *  Extracted from the deleted src/state/appReducer.ts so the global
 *  reducer can be removed without losing the model's classification rules. */

import type { ModelInfo } from "../types/venice";

/** Determines the model category from its metadata. */
function classifyModel(model: ModelInfo): "text" | "image" | "audio" | "video" | "embeddings" | "unknown" {
  const id = String(model.id || model.model || "").toLowerCase();
  const type = String(
    model.type || model.model_type || model.modelType || ""
  ).toLowerCase();
  const traits = JSON.stringify(
    model.traits || model.capabilities || model.features || {}
  ).toLowerCase();

  if (["text", "llm", "chat", "code"].includes(type)) return "text";
  if (["image", "inpaint", "upscale"].includes(type)) return "image";
  if (["tts", "asr", "audio", "music"].includes(type)) return "audio";
  if (type === "video" || type === "video-generation") return "video";
  if (["embedding", "embeddings"].includes(type)) return "embeddings";

  if (/embed/.test(id + traits)) return "embeddings";
  if (/image|sdxl|flux|fluently|lustify|pony|stable|diffusion|inpaint|upscale|banana/.test(id + traits))
    return "image";
  if (/audio|voice|speech|tts|asr|transcri|music/.test(id + traits)) return "audio";
  if (/video|wan|motion|animate/.test(id + traits)) return "video";
  if (/llama|qwen|deepseek|mistral|grok|dolphin|chat|text|coder|reason|zai|glm|kimi|gemma|gemini|hermes|openai/.test(id + traits))
    return "text";
  return "unknown";
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
    const m = raw as Record<string, unknown>;
    const rawTraits = m.traits || m.capabilities || m.features || [];
    const traitsArr = Array.isArray(rawTraits) ? rawTraits : [];

    const modelSpec = m.model_spec as Record<string, unknown> | undefined;
    const specPrivacy = modelSpec?.privacy as string | undefined;

    // Determine privacy from model_spec, traits/flags, or default
    const isPrivate = specPrivacy === 'private' || traitsArr.includes('private') || !!m.is_private || !!m.privateInference;
    const isAnonymous = specPrivacy === 'anonymized' || traitsArr.includes('anonymous') || !!m.anonymousInference;

    const privacyMode = isPrivate ? 'private' : isAnonymous ? 'anonymous' : 'standard';

    let fidelity: 'high' | 'standard' | undefined = undefined;
    if (traitsArr.includes('high_fidelity') || traitsArr.includes('high-fidelity')) fidelity = 'high';
    else if (traitsArr.includes('standard_fidelity') || traitsArr.includes('standard-fidelity') || traitsArr.includes('fast')) fidelity = 'standard';
    else if (String(m.id || '').toLowerCase().includes('-fast-')) fidelity = 'standard';
    else if (String(m.id || '').toLowerCase().includes('seedance')) fidelity = 'high';

    const normalized: ModelInfo = {
      ...(m as Record<string, unknown>),
      id: String(m.id || m.model || m.name || "unknown-model"),
      name: String(m.name || m.display_name || m.id || m.model || "unknown model"),
      type: String(m.type || m.model_type || m.modelType || classifyModel(m as unknown as ModelInfo)),
      isFallback: false,
      source: "live",
      contextLength: (modelSpec?.availableContextTokens as number) ?? (m.contextLength as number) ?? null,
      maxOutputTokens: (modelSpec?.maxCompletionTokens as number) ?? (m.maxOutputTokens as number) ?? null,
      privacy: {
        mode: privacyMode,
        privateInference: isPrivate,
        anonymousInference: isAnonymous,
        source: 'derived'
      },
      fidelity
    };
    groups[classifyModel(normalized)].push(normalized);
  });
  return groups;
}
