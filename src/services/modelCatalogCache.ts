import type { ModelInfo } from "../types/venice";

const canonicalModels = new Map<string, ModelInfo>();

export function replaceCanonicalModels(models: readonly ModelInfo[]): void {
  canonicalModels.clear();
  for (const model of models) canonicalModels.set(model.id, model);
}

export function getCanonicalModelById(modelId: string): ModelInfo | undefined {
  return canonicalModels.get(modelId);
}

