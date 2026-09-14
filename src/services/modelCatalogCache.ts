import type { ModelInfo } from "../types/venice";
import { normalizeModelInfo } from "./modelClassification";

const canonicalModels = new Map<string, ModelInfo>();
const canonicalModelTypes = new Map<string, Set<string>>();

function removeTypeOwnership(type: string): void {
  for (const [modelId, types] of canonicalModelTypes) {
    types.delete(type);
    if (types.size === 0) {
      canonicalModelTypes.delete(modelId);
      canonicalModels.delete(modelId);
    }
  }
}

export function replaceCanonicalModels(
  models: readonly ModelInfo[],
  modelsByType: Readonly<Record<string, readonly ModelInfo[]>> = {},
): void {
  canonicalModels.clear();
  canonicalModelTypes.clear();
  for (const model of models) {
    const normalized = normalizeModelInfo(model);
    canonicalModels.set(normalized.id, normalized);
  }
  for (const [type, typedModels] of Object.entries(modelsByType)) {
    for (const model of typedModels) {
      const normalized = normalizeModelInfo(model);
      const types = canonicalModelTypes.get(normalized.id) ?? new Set<string>();
      types.add(type);
      canonicalModelTypes.set(normalized.id, types);
    }
  }
}

/** Replace one authoritative typed response without evicting other modalities. */
export function mergeCanonicalModels(type: string, models: readonly ModelInfo[]): void {
  removeTypeOwnership(type);
  for (const model of models) {
    const normalized = normalizeModelInfo(model);
    canonicalModels.set(normalized.id, normalized);
    const types = canonicalModelTypes.get(normalized.id) ?? new Set<string>();
    types.add(type);
    canonicalModelTypes.set(normalized.id, types);
  }
}

export function getCanonicalModelById(modelId: string): ModelInfo | undefined {
  return canonicalModels.get(modelId);
}

export function hasCanonicalModelCatalog(): boolean {
  return canonicalModels.size > 0;
}
