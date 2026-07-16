import { beforeEach, describe, expect, it } from "vitest";
import { useModelCatalogRuntimeStore } from "./model-catalog-runtime-store";

describe("model catalog runtime state", () => {
  beforeEach(() => useModelCatalogRuntimeStore.getState().reset());

  it("tracks live attempts and successful counts, including an empty response", () => {
    useModelCatalogRuntimeStore.getState().markLoading();
    expect(useModelCatalogRuntimeStore.getState()).toMatchObject({ status: "loading", source: "none" });
    expect(useModelCatalogRuntimeStore.getState().lastAttemptAt).not.toBeNull();

    useModelCatalogRuntimeStore.getState().markReady({
      totalCount: 0,
      countsByType: { text: 0 },
      source: "live",
      liveModelIds: [],
    });
    expect(useModelCatalogRuntimeStore.getState()).toMatchObject({
      status: "ready",
      source: "live",
      totalCount: 0,
      countsByType: { text: 0 },
      lastError: null,
      loadedTypes: ["text"],
      modelsByType: { text: [] },
    });
    expect(useModelCatalogRuntimeStore.getState().lastSuccessAt).not.toBeNull();
  });

  it("tracks authoritative completeness per type and replaces only that type", () => {
    const runtime = useModelCatalogRuntimeStore.getState();
    runtime.markReady({
      type: "text",
      totalCount: 1,
      countsByType: { text: 1 },
      source: "live",
      liveModelIds: ["text-old"],
      modelsByType: { text: ["text-old"] },
    });
    runtime.markReady({
      type: "image",
      totalCount: 1,
      countsByType: { image: 1 },
      source: "live",
      liveModelIds: ["image-model"],
      modelsByType: { image: ["image-model"] },
    });
    runtime.markReady({
      type: "text",
      totalCount: 1,
      countsByType: { text: 1 },
      source: "live",
      liveModelIds: ["text-new"],
      modelsByType: { text: ["text-new"] },
    });

    expect(useModelCatalogRuntimeStore.getState()).toMatchObject({
      loadedTypes: ["text", "image"],
      modelsByType: { text: ["text-new"], image: ["image-model"] },
      statusByType: { text: "ready", image: "ready" },
    });
  });

  it("treats cached catalog data as stale rather than authoritative", () => {
    useModelCatalogRuntimeStore.getState().markReady({
      type: "text",
      totalCount: 1,
      countsByType: { text: 1 },
      source: "cache",
      liveModelIds: ["cached"],
      modelsByType: { text: ["cached"] },
    });
    expect(useModelCatalogRuntimeStore.getState()).toMatchObject({
      status: "stale",
      loadedTypes: [],
      statusByType: { text: "stale" },
    });
  });

  it("keeps cached data stale on failure and never treats fallbacks as live", () => {
    useModelCatalogRuntimeStore.getState().markReady({
      totalCount: 3,
      countsByType: { text: 3 },
      source: "live",
      liveModelIds: ["a", "b", "c"],
    });
    useModelCatalogRuntimeStore.getState().markError(new Error("Bearer secret at /Users/private"), true);
    const stale = useModelCatalogRuntimeStore.getState();
    expect(stale).toMatchObject({ status: "stale", source: "cache", totalCount: 3 });
    expect(stale.lastError).not.toMatch(/Bearer secret|\/Users\/private/);

    stale.markReady({ totalCount: 2, countsByType: { text: 2 }, source: "fallback", liveModelIds: ["fallback"] });
    expect(useModelCatalogRuntimeStore.getState()).toMatchObject({
      status: "error",
      source: "fallback",
      totalCount: 0,
      liveModelIds: [],
    });
  });

  it("fails without cache and clears catalog proof", () => {
    useModelCatalogRuntimeStore.getState().markError(new Error("offline"), false);
    expect(useModelCatalogRuntimeStore.getState()).toMatchObject({
      status: "error",
      source: "none",
      totalCount: 0,
      liveModelIds: [],
    });
  });
});
