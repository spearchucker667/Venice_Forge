import type { VeniceModel } from "../../types/venice";
import type { ModelToolCapabilitySource } from "../registry/tool-registry";

interface CachedCapability {
  supportsFunctionCalling: boolean;
  expiresAt: number;
}

/**
 * Bounded-TTL adapter over the authoritative Venice model catalog. Unknown,
 * offline, and stale entries fail closed.
 */
export class ModelCapabilityService implements ModelToolCapabilitySource {
  private readonly cache = new Map<string, CachedCapability>();

  constructor(private readonly ttlMs = 5 * 60_000, private readonly now: () => number = Date.now) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > 60 * 60_000) throw new Error("Invalid model capability TTL.");
  }

  updateFromCatalog(models: VeniceModel[]): void {
    const expiresAt = this.now() + this.ttlMs;
    const liveIds = new Set<string>();
    for (const model of models) {
      if (!model.id || model.model_spec?.offline) continue;
      liveIds.add(model.id);
      const capabilities = model.model_spec?.capabilities;
      const traits = model.model_spec?.traits ?? [];
      this.cache.set(model.id, {
        supportsFunctionCalling: capabilities?.supportsFunctionCalling === true || traits.includes("function_calling_default"),
        expiresAt,
      });
    }
    for (const id of this.cache.keys()) if (!liveIds.has(id)) this.cache.delete(id);
  }

  supportsFunctionCalling(modelId: string): boolean {
    const cached = this.cache.get(modelId);
    if (!cached || cached.expiresAt <= this.now()) {
      this.cache.delete(modelId);
      return false;
    }
    return cached.supportsFunctionCalling;
  }
}
