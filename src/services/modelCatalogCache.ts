import type { ModelInfo } from "../types/venice";

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
  for (const model of models) canonicalModels.set(model.id, model);
  for (const [type, typedModels] of Object.entries(modelsByType)) {
    for (const model of typedModels) {
      const types = canonicalModelTypes.get(model.id) ?? new Set<string>();
      types.add(type);
      canonicalModelTypes.set(model.id, types);
    }
  }
}

/** Replace one authoritative typed response without evicting other modalities. */
export function mergeCanonicalModels(type: string, models: readonly ModelInfo[]): void {
  removeTypeOwnership(type);
  for (const model of models) {
    canonicalModels.set(model.id, model);
    const types = canonicalModelTypes.get(model.id) ?? new Set<string>();
    types.add(type);
    canonicalModelTypes.set(model.id, types);
  }
}

export function getCanonicalModelById(modelId: string): ModelInfo | undefined {
  return canonicalModels.get(modelId);
}
