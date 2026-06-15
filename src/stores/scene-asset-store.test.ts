/** @fileoverview T-188 regression guard — scene-asset persistence errors must not leak raw exception text into state, toast, or logs. T-199 guard — generateAssetId prefers crypto.randomUUID. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RpAssetV1 } from "../types/rp";

const mocks = vi.hoisted(() => ({
  listAssets: vi.fn(),
  saveAsset: vi.fn(),
  deleteAsset: vi.fn(),
  normalizeAsset: vi.fn((asset: unknown) => asset as RpAssetV1),
  toastError: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("../services/rp/assetService", async () => {
  const actual = await vi.importActual<typeof import("../services/rp/assetService")>(
    "../services/rp/assetService"
  );
  return {
    ...actual,
    listAssets: mocks.listAssets,
    saveAsset: mocks.saveAsset,
    deleteAsset: mocks.deleteAsset,
    normalizeAsset: mocks.normalizeAsset,
  };
});

vi.mock("./toast-store", () => ({
  toast: { error: mocks.toastError },
}));

vi.mock("../shared/logger", () => ({
  error: mocks.loggerError,
  warn: vi.fn(),
}));

import { useSceneAssetStore, generateAssetId } from "./scene-asset-store";

function baseAsset(overrides: Partial<RpAssetV1> = {}): RpAssetV1 {
  const now = Date.now();
  return {
    schema: "RpAssetV1",
    id: "asset-1",
    chatId: "chat-1",
    characterIds: [],
    model: "fluently-xl",
    prompt: "a scenic vista",
    url: "data:image/png;base64,abc",
    createdAt: now,
    ...overrides,
  };
}

function resetStore(): void {
  useSceneAssetStore.setState({
    assets: [],
    isLoading: false,
    hasLoaded: false,
    error: null,
    searchQuery: "",
    filterChatId: null,
    selectedAssetId: null,
  });
}

describe("T-188 — scene-asset persistence errors are surfaced safely", () => {
  beforeEach(() => {
    mocks.listAssets.mockReset();
    mocks.saveAsset.mockReset();
    mocks.deleteAsset.mockReset();
    mocks.normalizeAsset.mockReset().mockImplementation((asset: unknown) => asset as RpAssetV1);
    mocks.toastError.mockReset();
    mocks.loggerError.mockReset();
    resetStore();
  });

  it("load stores a generic error, toasts safely, and logs a redacted diagnostic when persistence fails", async () => {
    mocks.listAssets.mockRejectedValue(new Error("ENOENT: /Users/super_user/.secret/path"));

    await useSceneAssetStore.getState().load();

    expect(useSceneAssetStore.getState().error).toBe("Could not load assets.");
    expect(useSceneAssetStore.getState().hasLoaded).toBe(false);
    expect(useSceneAssetStore.getState().isLoading).toBe(false);
    expect(mocks.toastError).toHaveBeenCalledWith("Could not load assets", "Please try again.");
    expect(mocks.toastError).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining("ENOENT"));
    expect(mocks.loggerError).toHaveBeenCalledTimes(1);
    const logged = mocks.loggerError.mock.calls[0]?.[1] as string | undefined;
    expect(typeof logged).toBe("string");
    expect(logged).not.toContain("/Users/super_user/.secret/path");
  });

  it("upsert stores a generic error, toasts safely, and logs a redacted diagnostic when persistence fails", async () => {
    mocks.saveAsset.mockRejectedValue(new Error("QuotaExceededError: sk-live-12345"));

    const result = await useSceneAssetStore.getState().upsert(baseAsset());

    expect(result).toBeNull();
    expect(useSceneAssetStore.getState().error).toBe("Could not save asset.");
    expect(mocks.toastError).toHaveBeenCalledWith("Could not save asset", "Please try again.");
    expect(mocks.toastError).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining("QuotaExceeded"));
    expect(mocks.loggerError).toHaveBeenCalledTimes(1);
    const logged = mocks.loggerError.mock.calls[0]?.[1] as string | undefined;
    expect(typeof logged).toBe("string");
    expect(logged).not.toContain("sk-live-12345");
  });

  it("remove stores a generic error, toasts safely, and logs a redacted diagnostic when persistence fails", async () => {
    mocks.deleteAsset.mockRejectedValue(new Error("Internal error"));

    const result = await useSceneAssetStore.getState().remove("asset-1");

    expect(result).toBe(false);
    expect(useSceneAssetStore.getState().error).toBe("Could not delete asset.");
    expect(mocks.toastError).toHaveBeenCalledWith("Could not delete asset", "Please try again.");
    expect(mocks.toastError).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining("Internal"));
    expect(mocks.loggerError).toHaveBeenCalledTimes(1);
  });

  it("still surfaces the storage-rejected toast when delete is rejected by the backend", async () => {
    mocks.deleteAsset.mockResolvedValue(false);

    const result = await useSceneAssetStore.getState().remove("asset-1");

    expect(result).toBe(false);
    expect(mocks.toastError).toHaveBeenCalledWith("Could not delete asset", "Storage rejected the request.");
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it("upsert succeeds and clears any previous error", async () => {
    const saved = baseAsset({ id: "asset-saved", prompt: "Saved prompt" });
    mocks.saveAsset.mockResolvedValue(saved);
    useSceneAssetStore.setState({ error: "previous error" });

    const result = await useSceneAssetStore.getState().upsert(baseAsset());

    expect(result).toEqual(saved);
    expect(useSceneAssetStore.getState().error).toBeNull();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});

describe("T-199 — generateAssetId prefers crypto.randomUUID", () => {
  it("returns crypto.randomUUID when available", () => {
    const uuid = "12345678-1234-1234-1234-123456789abc";
    const randomUUID = vi.fn().mockReturnValue(uuid);
    vi.stubGlobal("crypto", { randomUUID });

    expect(generateAssetId()).toBe(uuid);
    expect(randomUUID).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("falls back to a non-UUID shape when crypto.randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", undefined);

    const id = generateAssetId();
    expect(id).toMatch(/^a_[a-z0-9]+_[a-z0-9]+$/);

    vi.unstubAllGlobals();
  });
});
