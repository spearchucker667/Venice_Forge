/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/* eslint-disable @typescript-eslint/no-unused-vars */
/** @fileoverview Unit tests for the renderer-side RP asset service. */

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  generateId,
  isValidAsset,
  normalizeAsset,
  listAssets,
  readAsset,
  saveAsset,
  deleteAsset,
} from "./assetService";
import type { RpAssetV1 } from "../../types/rp";
import * as desktopBridge from "../desktopBridge";
import StorageService from "../storageService";

vi.mock("../desktopBridge", () => ({
  isElectron: vi.fn(),
  desktopRpAssets: {
    list: vi.fn(),
    get: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  },
}));

const baseAsset = (): RpAssetV1 => ({
  schema: "RpAssetV1",
  id: "a_test_01",
  chatId: "r_test_01",
  characterIds: [],
  model: "test-model",
  prompt: "A test prompt",
  url: "data:image/png;base64,AAAA",
  createdAt: 1700000000000,
});

describe("assetService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(desktopBridge.isElectron).mockReturnValue(false);
  });

  describe("isValidAsset / normalizeAsset", () => {
    it("returns a normalized asset for a valid record", () => {
      const out = normalizeAsset(baseAsset());
      expect(out).not.toBeNull();
      expect(out!.id).toBe("a_test_01");
      expect(out!.chatId).toBe("r_test_01");
    });

    it("rejects null / non-object input", () => {
      expect(normalizeAsset(null)).toBeNull();
      expect(normalizeAsset(undefined)).toBeNull();
      expect(normalizeAsset("string")).toBeNull();
      expect(normalizeAsset(42)).toBeNull();
    });

    it("rejects records whose id fails the validator", () => {
      expect(normalizeAsset({ ...baseAsset(), id: "" })).toBeNull();
      expect(normalizeAsset({ ...baseAsset(), id: "../etc/passwd" })).toBeNull();
    });

    it("rejects records with missing required fields", () => {
      const a = baseAsset();
      delete (a as any).chatId;
      expect(normalizeAsset(a)).toBeNull();
    });
  });

  describe("generateId", () => {
    it("returns a non-empty string", () => {
      const id = generateId();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });
  });

  describe("Storage Operations (Web mode)", () => {
    beforeEach(() => {
      vi.mocked(desktopBridge.isElectron).mockReturnValue(false);
      vi.spyOn(StorageService, "getItems").mockResolvedValue([baseAsset()]);
      vi.spyOn(StorageService, "getItem").mockResolvedValue(baseAsset());
      vi.spyOn(StorageService, "saveItem").mockResolvedValue();
      vi.spyOn(StorageService, "deleteItem").mockResolvedValue(true);
    });

    it("listAssets returns items from StorageService", async () => {
      const items = await listAssets();
      expect(items.length).toBe(1);
      expect(items[0].id).toBe("a_test_01");
    });

    it("listAssets filters by chatId", async () => {
      const items = await listAssets({ chatId: "r_test_01" });
      expect(items.length).toBe(1);
      
      const empty = await listAssets({ chatId: "r_other" });
      expect(empty.length).toBe(0);
    });

    it("readAsset returns item from StorageService", async () => {
      const item = await readAsset("a_test_01");
      expect(item).not.toBeNull();
      expect(item!.id).toBe("a_test_01");
    });

    it("saveAsset saves via StorageService", async () => {
      const item = await saveAsset(baseAsset());
      expect(item.id).toBe("a_test_01");
      expect(StorageService.saveItem).toHaveBeenCalled();
    });

    it("deleteAsset calls StorageService", async () => {
      const ok = await deleteAsset("a_test_01");
      expect(ok).toBe(true);
      expect(StorageService.deleteItem).toHaveBeenCalledWith("rp_assets", "a_test_01");
    });
  });

  describe("Storage Operations (Electron mode)", () => {
    beforeEach(() => {
      vi.mocked(desktopBridge.isElectron).mockReturnValue(true);
      vi.mocked(desktopBridge.desktopRpAssets.list).mockResolvedValue({ ok: true, assets: [baseAsset()] });
      vi.mocked(desktopBridge.desktopRpAssets.get).mockResolvedValue({ ok: true, asset: baseAsset() });
      vi.mocked(desktopBridge.desktopRpAssets.save).mockResolvedValue({ ok: true, asset: baseAsset() });
      vi.mocked(desktopBridge.desktopRpAssets.delete).mockResolvedValue({ ok: true });
    });

    it("listAssets calls desktopBridge", async () => {
      const items = await listAssets();
      expect(items.length).toBe(1);
      expect(desktopBridge.desktopRpAssets.list).toHaveBeenCalled();
    });

    it("readAsset calls desktopBridge", async () => {
      const item = await readAsset("a_test_01");
      expect(item).not.toBeNull();
      expect(desktopBridge.desktopRpAssets.get).toHaveBeenCalledWith("a_test_01");
    });

    it("saveAsset saves via desktopBridge", async () => {
      const item = await saveAsset(baseAsset());
      expect(item.id).toBe("a_test_01");
      expect(desktopBridge.desktopRpAssets.save).toHaveBeenCalled();
    });

    it("deleteAsset calls desktopBridge", async () => {
      const ok = await deleteAsset("a_test_01");
      expect(ok).toBe(true);
      expect(desktopBridge.desktopRpAssets.delete).toHaveBeenCalledWith("a_test_01");
    });
  });
});
