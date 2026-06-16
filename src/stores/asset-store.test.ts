import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { RpAssetV1 } from "../types/rp";

// Hoist mocks
const mocks = vi.hoisted(() => ({
  listAssets: vi.fn(),
  saveAsset: vi.fn(),
  deleteAsset: vi.fn(),
  normalizeAsset: vi.fn((asset: unknown) => asset as RpAssetV1),
  generateId: vi.fn(() => "mock-id-123"),
  toastError: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("../services/rp/assetService", () => ({
  listAssets: mocks.listAssets,
  saveAsset: mocks.saveAsset,
  deleteAsset: mocks.deleteAsset,
  normalizeAsset: mocks.normalizeAsset,
  generateId: mocks.generateId,
}));

vi.mock("./toast-store", () => ({
  toast: { error: mocks.toastError },
}));

vi.mock("../shared/logger", () => ({
  error: mocks.loggerError,
  warn: vi.fn(),
}));

// Now we can safely import the store
import { useSceneAssetStore, useFilteredSceneAssets } from "./scene-asset-store";

function baseAsset(overrides: Partial<RpAssetV1> = {}): RpAssetV1 {
  return {
    schema: "RpAssetV1",
    id: "asset-1",
    chatId: "chat-1",
    characterIds: [],
    model: "fluently-xl",
    prompt: "a scenic vista",
    url: "data:image/png;base64,abc",
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("Asset Store (scene-asset-store.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSceneAssetStore.setState({
      assets: [],
      isLoading: false,
      hasLoaded: false,
      error: null,
      searchQuery: "",
      filterChatId: null,
      selectedAssetId: null,
    });
    mocks.normalizeAsset.mockImplementation((asset: unknown) => asset as RpAssetV1);
  });

  describe("load", () => {
    it("loads assets and sorts them by createdAt descending", async () => {
      const a1 = baseAsset({ id: "1", createdAt: 100 });
      const a2 = baseAsset({ id: "2", createdAt: 200 });
      mocks.listAssets.mockResolvedValue([a1, a2]);

      await useSceneAssetStore.getState().load();

      const state = useSceneAssetStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.hasLoaded).toBe(true);
      expect(state.error).toBeNull();
      // Should be sorted descending
      expect(state.assets).toEqual([a2, a1]);
    });

    it("does not load if already loading", async () => {
      useSceneAssetStore.setState({ isLoading: true });
      await useSceneAssetStore.getState().load();
      expect(mocks.listAssets).not.toHaveBeenCalled();
    });
  });

  describe("setSearchQuery, setFilterChat, setSelected", () => {
    it("updates simple string fields", () => {
      useSceneAssetStore.getState().setSearchQuery("sunset");
      expect(useSceneAssetStore.getState().searchQuery).toBe("sunset");

      useSceneAssetStore.getState().setFilterChat("chat-2");
      expect(useSceneAssetStore.getState().filterChatId).toBe("chat-2");

      useSceneAssetStore.getState().setSelected("asset-2");
      expect(useSceneAssetStore.getState().selectedAssetId).toBe("asset-2");
    });
  });

  describe("upsert", () => {
    it("returns null if normalizeAsset fails", async () => {
      mocks.normalizeAsset.mockReturnValue(null);
      const result = await useSceneAssetStore.getState().upsert(baseAsset());
      
      expect(result).toBeNull();
      expect(useSceneAssetStore.getState().error).toBe("Invalid asset data.");
      expect(mocks.toastError).toHaveBeenCalledWith("Could not save asset", "Invalid asset data.");
    });

    it("adds a new asset and selects it", async () => {
      const a1 = baseAsset({ id: "1", createdAt: 100 });
      mocks.saveAsset.mockResolvedValue(a1);

      const result = await useSceneAssetStore.getState().upsert(a1);

      expect(result).toEqual(a1);
      const state = useSceneAssetStore.getState();
      expect(state.assets).toEqual([a1]);
      expect(state.selectedAssetId).toBe("1");
      expect(state.error).toBeNull();
    });

    it("updates an existing asset and keeps sort order", async () => {
      const a1 = baseAsset({ id: "1", createdAt: 100 });
      const a2 = baseAsset({ id: "2", createdAt: 200 });
      useSceneAssetStore.setState({ assets: [a2, a1] });

      const updatedA1 = { ...a1, prompt: "updated prompt" };
      mocks.saveAsset.mockResolvedValue(updatedA1);

      const result = await useSceneAssetStore.getState().upsert(updatedA1);

      expect(result).toEqual(updatedA1);
      const state = useSceneAssetStore.getState();
      // Keep sorted order by createdAt descending
      expect(state.assets).toEqual([a2, updatedA1]);
      expect(state.selectedAssetId).toBe("1");
    });
  });

  describe("remove", () => {
    it("removes an asset and clears selectedAssetId if it was selected", async () => {
      const a1 = baseAsset({ id: "1" });
      const a2 = baseAsset({ id: "2" });
      useSceneAssetStore.setState({ assets: [a1, a2], selectedAssetId: "1" });

      mocks.deleteAsset.mockResolvedValue(true);

      const result = await useSceneAssetStore.getState().remove("1");

      expect(result).toBe(true);
      const state = useSceneAssetStore.getState();
      expect(state.assets).toEqual([a2]);
      expect(state.selectedAssetId).toBeNull();
    });

    it("keeps selectedAssetId if a different asset is removed", async () => {
      const a1 = baseAsset({ id: "1" });
      const a2 = baseAsset({ id: "2" });
      useSceneAssetStore.setState({ assets: [a1, a2], selectedAssetId: "2" });

      mocks.deleteAsset.mockResolvedValue(true);

      const result = await useSceneAssetStore.getState().remove("1");

      expect(result).toBe(true);
      const state = useSceneAssetStore.getState();
      expect(state.assets).toEqual([a2]);
      expect(state.selectedAssetId).toBe("2");
    });
  });

  describe("getById", () => {
    it("returns undefined if not found", () => {
      expect(useSceneAssetStore.getState().getById("missing")).toBeUndefined();
    });

    it("returns the asset if found", () => {
      const a1 = baseAsset({ id: "1" });
      useSceneAssetStore.setState({ assets: [a1] });
      expect(useSceneAssetStore.getState().getById("1")).toEqual(a1);
    });
  });

  describe("useFilteredSceneAssets", () => {
    it("returns all assets if no filter is applied", () => {
      const a1 = baseAsset({ id: "1", chatId: "chat-1", prompt: "hello" });
      const a2 = baseAsset({ id: "2", chatId: "chat-2", prompt: "world" });
      useSceneAssetStore.setState({ assets: [a1, a2] });

      const { result } = renderHook(() => useFilteredSceneAssets());
      expect(result.current).toEqual([a1, a2]);
    });

    it("filters by chatId", () => {
      const a1 = baseAsset({ id: "1", chatId: "chat-1", prompt: "hello" });
      const a2 = baseAsset({ id: "2", chatId: "chat-2", prompt: "world" });
      useSceneAssetStore.setState({ assets: [a1, a2], filterChatId: "chat-2" });

      const { result } = renderHook(() => useFilteredSceneAssets());
      expect(result.current).toEqual([a2]);
    });

    it("filters by searchQuery (needle in prompt or model)", () => {
      const a1 = baseAsset({ id: "1", prompt: "hello there", model: "model-a" });
      const a2 = baseAsset({ id: "2", prompt: "general", model: "model-hello" });
      const a3 = baseAsset({ id: "3", prompt: "nothing", model: "model-b" });
      
      useSceneAssetStore.setState({ assets: [a1, a2, a3], searchQuery: "  HELLO  " });

      const { result } = renderHook(() => useFilteredSceneAssets());
      expect(result.current).toEqual([a1, a2]);
    });

    it("filters by both chatId and searchQuery", () => {
      const a1 = baseAsset({ id: "1", chatId: "chat-1", prompt: "hello there", model: "model-a" });
      const a2 = baseAsset({ id: "2", chatId: "chat-2", prompt: "general", model: "model-hello" });
      const a3 = baseAsset({ id: "3", chatId: "chat-2", prompt: "nothing", model: "model-b" });
      
      useSceneAssetStore.setState({ assets: [a1, a2, a3], filterChatId: "chat-2", searchQuery: "hello" });

      const { result } = renderHook(() => useFilteredSceneAssets());
      expect(result.current).toEqual([a2]);
    });
  });
});
