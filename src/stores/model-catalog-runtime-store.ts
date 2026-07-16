import { create } from "zustand";
import { redactErrorMessage } from "../shared/redaction";

export type ModelCatalogLoadStatus = "idle" | "loading" | "ready" | "stale" | "error";
export type ModelCatalogSource = "live" | "cache" | "fallback" | "none";

export interface ModelCatalogRuntimeState {
  status: ModelCatalogLoadStatus;
  totalCount: number;
  countsByType: Record<string, number>;
  source: ModelCatalogSource;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  liveModelIds: readonly string[];

  markLoading(): void;
  markReady(input: {
    totalCount: number;
    countsByType: Record<string, number>;
    source: Exclude<ModelCatalogSource, "none">;
    liveModelIds?: readonly string[];
  }): void;
  markError(error: unknown, hasCachedData: boolean): void;
  reset(): void;
}

const INITIAL_STATE = {
  status: "idle" as const,
  totalCount: 0,
  countsByType: {},
  source: "none" as const,
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastError: null,
  liveModelIds: [] as readonly string[],
};

export const useModelCatalogRuntimeStore = create<ModelCatalogRuntimeState>((set, get) => ({
  ...INITIAL_STATE,
  markLoading: () => {
    const current = get();
    set({
      status: current.totalCount > 0 ? "stale" : "loading",
      source: current.totalCount > 0 ? "cache" : "none",
      lastAttemptAt: new Date().toISOString(),
      lastError: null,
    });
  },
  markReady: ({ totalCount, countsByType, source, liveModelIds = [] }) => set((current) => {
    if (source === "fallback") {
      return {
        status: "error",
        totalCount: 0,
        countsByType: {},
        source,
        lastError: "Venice model catalog could not be loaded; fallback models are available.",
        liveModelIds: [],
      };
    }
    const isCompleteCatalog = Object.hasOwn(countsByType, "all");
    const nextCounts = isCompleteCatalog ? { ...countsByType } : { ...current.countsByType, ...countsByType };
    const nextTotal = isCompleteCatalog
      ? totalCount
      : typeof current.countsByType.all === "number"
        ? current.countsByType.all
        : Object.values(nextCounts).reduce((sum, count) => sum + count, 0);
    return {
      status: source === "cache" ? "stale" : "ready",
      totalCount: nextTotal,
      countsByType: nextCounts,
      source,
      lastSuccessAt: source === "live" ? new Date().toISOString() : current.lastSuccessAt,
      lastError: null,
      liveModelIds: isCompleteCatalog
        ? [...liveModelIds]
        : [...new Set([...current.liveModelIds, ...liveModelIds])],
    };
  }),
  markError: (error, hasCachedData) => set((current) => ({
    status: hasCachedData ? "stale" : "error",
    source: hasCachedData ? "cache" : "none",
    lastError: redactErrorMessage(error),
    totalCount: hasCachedData ? current.totalCount : 0,
    countsByType: hasCachedData ? current.countsByType : {},
    liveModelIds: hasCachedData ? current.liveModelIds : [],
  })),
  reset: () => set(INITIAL_STATE),
}));
