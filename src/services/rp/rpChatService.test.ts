/** @fileoverview Unit tests for the renderer-side RP chat service. */

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  generateId,
  isValidChat,
  normalizeChat,
  listRpChats,
  readRpChat,
  saveRpChat,
  deleteRpChat,
  appendMessage,
} from "./rpChatService";
import type { RpChatV1, RpMessageV1 } from "../../types/rp";
import * as desktopBridge from "../desktopBridge";
import * as safetyImport from "../../shared/safety/characterImportSafety";
import * as safetyHydration from "../../safetyHydration";
import { SafetyGuardBlockedError } from "../../shared/safety";
import StorageService from "../storageService";

vi.mock("../desktopBridge", () => ({
  isElectron: vi.fn(),
  desktopRpChats: {
    list: vi.fn(),
    get: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../shared/safety/characterImportSafety", () => ({
  assessRpContext: vi.fn(),
}));

vi.mock("../../safetyHydration", () => ({
  getEffectiveRendererLocalFamilySafeModeEnabled: vi.fn(),
}));

const baseChat = (): RpChatV1 => ({
  schema: "RpChatV1",
  id: "r_test_01",
  title: "Test Chat",
  characterIds: ["c_test_alpha"],
  modelId: "test-model",
  messages: [],
  lorebookIds: [],
  adult: false,
  metadata: {
    pinned: false,
    archived: false,
    tags: ["test"],
  },
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
});

describe("rpChatService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(desktopBridge.isElectron).mockReturnValue(false);
    vi.mocked(safetyHydration.getEffectiveRendererLocalFamilySafeModeEnabled).mockReturnValue(false);
    vi.mocked(safetyImport.assessRpContext).mockReturnValue({
      allow: true,
      action: "skipped",
      reason: "ADULT_MODE_ACTIVE",
      layer: "local-family-safe-mode",
    });
  });

  describe("isValidChat / normalizeChat", () => {
    it("returns a normalized chat for a valid record", () => {
      const out = normalizeChat(baseChat());
      expect(out).not.toBeNull();
      expect(out!.id).toBe("r_test_01");
      expect(out!.title).toBe("Test Chat");
    });

    it("rejects null / non-object input", () => {
      expect(normalizeChat(null)).toBeNull();
      expect(normalizeChat(undefined)).toBeNull();
      expect(normalizeChat("string")).toBeNull();
      expect(normalizeChat(42)).toBeNull();
    });

    it("rejects records whose id fails the validator", () => {
      expect(normalizeChat({ ...baseChat(), id: "" })).toBeNull();
      expect(normalizeChat({ ...baseChat(), id: "../etc/passwd" })).toBeNull();
    });

    it("rejects records with invalid messages", () => {
      expect(normalizeChat({ ...baseChat(), messages: null })).toBeNull();
    });

    it("rejects records with missing required fields", () => {
      const chat = baseChat();
      delete (chat as any).characterIds;
      expect(normalizeChat(chat)).toBeNull();
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
      vi.spyOn(StorageService, "getItems").mockResolvedValue([baseChat()]);
      vi.spyOn(StorageService, "getItem").mockResolvedValue(baseChat());
      vi.spyOn(StorageService, "saveItem").mockResolvedValue();
      vi.spyOn(StorageService, "deleteItem").mockResolvedValue(true);
    });

    it("listRpChats returns items from StorageService", async () => {
      const items = await listRpChats();
      expect(items.length).toBe(1);
      expect(items[0].id).toBe("r_test_01");
    });

    it("readRpChat returns item from StorageService", async () => {
      const item = await readRpChat("r_test_01");
      expect(item).not.toBeNull();
      expect(item!.id).toBe("r_test_01");
    });

    it("saveRpChat validates safety and saves via StorageService", async () => {
      const item = await saveRpChat(baseChat());
      expect(item.id).toBe("r_test_01");
      expect(safetyImport.assessRpContext).toHaveBeenCalled();
      expect(StorageService.saveItem).toHaveBeenCalled();
    });

    it("deleteRpChat calls StorageService", async () => {
      const ok = await deleteRpChat("r_test_01");
      expect(ok).toBe(true);
      expect(StorageService.deleteItem).toHaveBeenCalledWith("rp_chats", "r_test_01");
    });

    it("appendMessage appends and saves", async () => {
      const msg: RpMessageV1 = { role: "user", content: "Hello", id: "m_1", createdAt: 123, updatedAt: 123 };
      const next = await appendMessage(baseChat(), msg);
      expect(next.messages).toHaveLength(1);
      expect(next.messages[0].content).toBe("Hello");
      expect(StorageService.saveItem).toHaveBeenCalled();
      expect(safetyImport.assessRpContext).toHaveBeenCalled();
    });
  });

  describe("Storage Operations (Electron mode)", () => {
    beforeEach(() => {
      vi.mocked(desktopBridge.isElectron).mockReturnValue(true);
      vi.mocked(desktopBridge.desktopRpChats.list).mockResolvedValue({ ok: true, chats: [baseChat()] });
      vi.mocked(desktopBridge.desktopRpChats.get).mockResolvedValue({ ok: true, chat: baseChat() });
      vi.mocked(desktopBridge.desktopRpChats.save).mockResolvedValue({ ok: true, chat: baseChat() });
      vi.mocked(desktopBridge.desktopRpChats.delete).mockResolvedValue({ ok: true });
    });

    it("listRpChats calls desktopBridge", async () => {
      const items = await listRpChats();
      expect(items.length).toBe(1);
      expect(desktopBridge.desktopRpChats.list).toHaveBeenCalled();
    });

    it("readRpChat calls desktopBridge", async () => {
      const item = await readRpChat("r_test_01");
      expect(item).not.toBeNull();
      expect(desktopBridge.desktopRpChats.get).toHaveBeenCalledWith("r_test_01");
    });

    it("saveRpChat validates safety and saves via desktopBridge", async () => {
      const item = await saveRpChat(baseChat());
      expect(item.id).toBe("r_test_01");
      expect(desktopBridge.desktopRpChats.save).toHaveBeenCalled();
    });

    it("deleteRpChat calls desktopBridge", async () => {
      const ok = await deleteRpChat("r_test_01");
      expect(ok).toBe(true);
      expect(desktopBridge.desktopRpChats.delete).toHaveBeenCalledWith("r_test_01");
    });
  });

  describe("Safety Enforcement", () => {
    it("saveRpChat throws SafetyGuardBlockedError when blocked", async () => {
      vi.mocked(safetyImport.assessRpContext).mockReturnValue({
        allow: false,
        action: "block",
        reason: "ADULT_CONTENT",
        layer: "local-family-safe-mode",
      });
      await expect(saveRpChat(baseChat())).rejects.toThrow(SafetyGuardBlockedError);
    });

    it("appendMessage throws SafetyGuardBlockedError when blocked", async () => {
      vi.mocked(safetyImport.assessRpContext).mockReturnValue({
        allow: false,
        action: "block",
        reason: "ADULT_CONTENT",
        layer: "local-family-safe-mode",
      });
      const msg: RpMessageV1 = { role: "user", content: "Blocked", id: "m_1", createdAt: 123, updatedAt: 123 };
      await expect(appendMessage(baseChat(), msg)).rejects.toThrow(SafetyGuardBlockedError);
    });
  });
});
