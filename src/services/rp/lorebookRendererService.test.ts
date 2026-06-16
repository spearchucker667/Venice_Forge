/** @fileoverview Unit tests for the renderer-side lorebook service. */

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  generateId,
  listLorebooks,
  readLorebook,
  saveLorebook,
  deleteLorebook,
} from "./lorebookRendererService";
import type { LorebookV1 } from "../../types/rp";
import * as desktopBridge from "../desktopBridge";
import StorageService from "../storageService";

vi.mock("../desktopBridge", () => ({
  isElectron: vi.fn(),
  desktopLorebooks: {
    list: vi.fn(),
    get: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  },
}));

const baseLorebook = (): LorebookV1 => ({
  schema: "LorebookV1",
  id: "l_test_01",
  name: "Test Lorebook",
  entries: [],
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  scope: "global",
});

describe("lorebookRendererService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(desktopBridge.isElectron).mockReturnValue(false);
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
      vi.spyOn(StorageService, "getItems").mockResolvedValue([baseLorebook()]);
      vi.spyOn(StorageService, "getItem").mockResolvedValue(baseLorebook());
      vi.spyOn(StorageService, "saveItem").mockResolvedValue();
      vi.spyOn(StorageService, "deleteItem").mockResolvedValue(true);
    });

    it("listLorebooks returns items from StorageService", async () => {
      const items = await listLorebooks();
      expect(items.length).toBe(1);
      expect(items[0].id).toBe("l_test_01");
    });

    it("readLorebook returns item from StorageService", async () => {
      const item = await readLorebook("l_test_01");
      expect(item).not.toBeNull();
      expect(item!.id).toBe("l_test_01");
    });

    it("saveLorebook saves via StorageService", async () => {
      const item = await saveLorebook(baseLorebook());
      expect(item.id).toBe("l_test_01");
      expect(StorageService.saveItem).toHaveBeenCalled();
    });

    it("deleteLorebook calls StorageService", async () => {
      const ok = await deleteLorebook("l_test_01");
      expect(ok).toBe(true);
      expect(StorageService.deleteItem).toHaveBeenCalledWith("lorebooks", "l_test_01");
    });
  });

  describe("Storage Operations (Electron mode)", () => {
    beforeEach(() => {
      vi.mocked(desktopBridge.isElectron).mockReturnValue(true);
      vi.mocked(desktopBridge.desktopLorebooks.list).mockResolvedValue({ ok: true, lorebooks: [baseLorebook()] });
      vi.mocked(desktopBridge.desktopLorebooks.get).mockResolvedValue({ ok: true, lorebook: baseLorebook() });
      vi.mocked(desktopBridge.desktopLorebooks.save).mockResolvedValue({ ok: true, lorebook: baseLorebook() });
      vi.mocked(desktopBridge.desktopLorebooks.delete).mockResolvedValue({ ok: true });
    });

    it("listLorebooks calls desktopBridge", async () => {
      const items = await listLorebooks();
      expect(items.length).toBe(1);
      expect(desktopBridge.desktopLorebooks.list).toHaveBeenCalled();
    });

    it("readLorebook calls desktopBridge", async () => {
      const item = await readLorebook("l_test_01");
      expect(item).not.toBeNull();
      expect(desktopBridge.desktopLorebooks.get).toHaveBeenCalledWith("l_test_01");
    });

    it("saveLorebook saves via desktopBridge", async () => {
      const item = await saveLorebook(baseLorebook());
      expect(item.id).toBe("l_test_01");
      expect(desktopBridge.desktopLorebooks.save).toHaveBeenCalled();
    });

    it("deleteLorebook calls desktopBridge", async () => {
      const ok = await deleteLorebook("l_test_01");
      expect(ok).toBe(true);
      expect(desktopBridge.desktopLorebooks.delete).toHaveBeenCalledWith("l_test_01");
    });
  });
});
