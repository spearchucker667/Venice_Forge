import { create } from "zustand";
import { redactErrorMessage } from "../shared/redaction";

export type ModelCatalogLoadStatus = "idle" | "loading" | "ready" | "stale" | "error";
export type ModelCatalogSource = "live" | "cache" | "fallback" | "none";
export type ModelCatalogTypeStatus = Exclude<ModelCatalogLoadStatus, "idle">;

export interface ModelCatalogRuntimeState {
  status: ModelCatalogLoadStatus;
  totalCount: number;
  countsByType: Record<string, number>;
  source: ModelCatalogSource;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  liveModelIds: readonly string[];
  modelsByType: Record<string, readonly string[]>;
  loadedTypes: readonly string[];
  statusByType: Record<string, ModelCatalogTypeStatus>;

  markLoading(type?: string): void;
  markReady(input: {
    type?: string;
    totalCount: number;
    countsByType: Record<string, number>;
    source: Exclude<ModelCatalogSource, "none">;
    liveModelIds?: readonly string[];
    modelsByType?: Record<string, readonly string[]>;
  }): void;
  markError(error: unknown, hasCachedData: boolean, type?: string): void;
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
  modelsByType: {} as Record<string, readonly string[]>,
  loadedTypes: [] as readonly string[],
  statusByType: {} as Record<string, ModelCatalogTypeStatus>,
};

export const useModelCatalogRuntimeStore = create<ModelCatalogRuntimeState>((set, get) => ({
  ...INITIAL_STATE,
  markLoading: (type = "all") => {
    const current = get();
    const hasAuthoritativeData = current.loadedTypes.length > 0;
    set({
      status: hasAuthoritativeData ? "ready" : current.totalCount > 0 ? "stale" : "loading",
      source: hasAuthoritativeData ? current.source : current.totalCount > 0 ? "cache" : "none",
      lastAttemptAt: new Date().toISOString(),
      lastError: null,
      statusByType: { ...current.statusByType, [type]: "loading" },
    });
  },
  markReady: ({ type, totalCount, countsByType, source, liveModelIds = [], modelsByType }) => set((current) => {
    const queryType = type ?? (Object.hasOwn(countsByType, "all") ? "all" : Object.keys(countsByType)[0] ?? "all");
    if (source === "fallback") {
      return {
        status: "error",
        totalCount: 0,
        countsByType: {},
        source,
        lastError: "Venice model catalog could not be loaded; fallback models are available.",
        liveModelIds: [],
        statusByType: { ...current.statusByType, [queryType]: "error" as const },
      };
    }
    const isCompleteCatalog = queryType === "all" || Object.hasOwn(countsByType, "all");
    const nextCounts = isCompleteCatalog ? { ...countsByType } : { ...current.countsByType, ...countsByType };
    const nextTotal = isCompleteCatalog
      ? totalCount
      : typeof current.countsByType.all === "number"
        ? current.countsByType.all
        : Object.values(nextCounts).reduce((sum, count) => sum + count, 0);
    const typedIds = modelsByType ?? { [queryType]: liveModelIds };
    const nextModelsByType = isCompleteCatalog ? { ...typedIds } : { ...current.modelsByType, ...typedIds };
    const nextLoadedTypes = source === "live"
      ? isCompleteCatalog
        ? [...new Set(["all", ...Object.keys(typedIds)])]
        : [...new Set([...current.loadedTypes, queryType])]
      : current.loadedTypes;
    return {
      status: source === "cache" ? "stale" : "ready",
      totalCount: nextTotal,
      countsByType: nextCounts,
      source,
      lastSuccessAt: source === "live" ? new Date().toISOString() : current.lastSuccessAt,
      lastError: null,
      liveModelIds: [...new Set(Object.values(nextModelsByType).flat())],
      modelsByType: nextModelsByType,
      loadedTypes: nextLoadedTypes,
      statusByType: {
        ...(isCompleteCatalog ? {} : current.statusByType),
        ...Object.fromEntries(Object.keys(typedIds).map((key) => [key, source === "cache" ? "stale" : "ready"])),
        ...(isCompleteCatalog ? { all: source === "cache" ? "stale" as const : "ready" as const } : {}),
      },
    };
  }),
  markError: (error, hasCachedData, type = "all") => set((current) => ({
    status: hasCachedData ? "stale" : "error",
    source: hasCachedData ? "cache" : "none",
    lastError: redactErrorMessage(error),
    totalCount: hasCachedData ? current.totalCount : 0,
    countsByType: hasCachedData ? current.countsByType : {},
    liveModelIds: hasCachedData ? current.liveModelIds : [],
    modelsByType: hasCachedData ? current.modelsByType : {},
    loadedTypes: hasCachedData ? current.loadedTypes : [],
    statusByType: { ...current.statusByType, [type]: hasCachedData ? "stale" : "error" },
  })),
  reset: () => set(INITIAL_STATE),
}));
