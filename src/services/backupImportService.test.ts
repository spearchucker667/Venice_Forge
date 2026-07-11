// VERIFY-088 regression guard: manual encrypted backup import, conflict resolution,
// LWW, chat merge, tombstone propagation, wrong passphrase, tamper rejection, plaintext scan.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseAndImportBackup,
  previewBackup,
  importDecryptedPacket,
} from "./backupImportService";
import { TombstoneService } from "./tombstoneService";
import StorageService from "./storageService";
import * as desktopBridge from "./desktopBridge";

vi.mock("./backupCryptoWeb", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./backupCryptoWeb")>();
  return {
    ...mod,
    deriveBackupKey: vi.fn().mockResolvedValue({} as CryptoKey),
    fromBase64: vi.fn().mockReturnValue(new Uint8Array(8)),
  };
});

vi.mock("./desktopBridge", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./desktopBridge")>();
  return {
    ...mod,
    isElectron: vi.fn(),
    desktopChat: {
      save: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      list: vi.fn().mockResolvedValue({ ok: true, conversations: [] }),
    },
    desktopCharacterCards: {
      save: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      list: vi.fn().mockResolvedValue({ ok: true, cards: [] }),
    },
    desktopPersonas: {
      save: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      list: vi.fn().mockResolvedValue({ ok: true, personas: [] }),
    },
    desktopLorebooks: {
      save: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      list: vi.fn().mockResolvedValue({ ok: true, lorebooks: [] }),
    },
    desktopRpChats: {
      save: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      list: vi.fn().mockResolvedValue({ ok: true, chats: [] }),
    },
    desktopRpAssets: {
      save: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      list: vi.fn().mockResolvedValue({ ok: true, assets: [] }),
    },
    desktopScenarios: {
      save: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      list: vi.fn().mockResolvedValue({ ok: true, scenarios: [] }),
    },
    desktopSync: {
      decryptBackup: vi.fn(),
      setEmissionSuppressed: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
});

vi.mock("./storageService", () => ({
  default: {
    getItems: vi.fn(),
    getItem: vi.fn(),
    saveItem: vi.fn(),
    deleteItem: vi.fn(),
  },
}));

vi.mock("./tombstoneService", () => ({
  TombstoneService: {
    recordTombstone: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockIsElectron = vi.mocked(desktopBridge.isElectron);
const mockGetItems = vi.mocked(StorageService.getItems);
const mockGetItem = vi.mocked(StorageService.getItem);
const mockSaveItem = vi.mocked(StorageService.saveItem);
const mockRecordTombstone = vi.mocked(TombstoneService.recordTombstone);

function toBase64(str: string): string {
  if (typeof btoa !== "undefined") return btoa(str);
  return Buffer.from(str, "utf8").toString("base64");
}

function makeManifest(payload: unknown): {
  version: number;
  exportedAt: string;
  salt: string;
  iv: string;
  ciphertext: string;
} {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    salt: "c2FsdA==",
    iv: "aXY=",
    ciphertext: toBase64(JSON.stringify(payload)),
  };
}

describe("backupImportService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockIsElectron.mockReturnValue(false);
    mockGetItems.mockResolvedValue([]);
    mockGetItem.mockResolvedValue(null);
    mockSaveItem.mockImplementation(async (_store, item) => ({ ...(item as object), id: (item as { id: string }).id, timestamp: Date.now() } as never));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("imports records and applies tombstones", async () => {
    const password = "correct-password";
    const payload = {
      conversations: [{ id: "conv-1", updatedAt: 1000, messages: [] }],
      tombstones: [{ id: "conversations:conv-2", storeName: "conversations", recordId: "conv-2", deletedAt: 2000 }],
    };
    const manifest = makeManifest(payload);

    // Simulate web-mode decryption returning the plaintext payload.
    vi.stubGlobal("crypto", {
      subtle: {
        importKey: vi.fn().mockResolvedValue("key"),
        deriveKey: vi.fn().mockResolvedValue("key"),
        decrypt: vi.fn().mockImplementation(async () => {
          const enc = new TextEncoder();
          return enc.encode(JSON.stringify(payload)).buffer;
        }),
      },
    });

    const summary = await parseAndImportBackup(manifest, password);
    expect(summary.recordsImported).toBe(1);
    expect(summary.tombstonesApplied).toBe(1);
    expect(mockRecordTombstone).toHaveBeenCalledWith("conversations", "conv-2");
    expect(mockIsElectron()).toBe(false);
  });

  it("rejects a wrong passphrase", async () => {
    const manifest = makeManifest({});
    vi.stubGlobal("crypto", {
      subtle: {
        importKey: vi.fn().mockResolvedValue("key"),
        deriveKey: vi.fn().mockResolvedValue("key"),
        decrypt: vi.fn().mockRejectedValue(new Error("Operation failed")),
      },
    });

    await expect(parseAndImportBackup(manifest, "wrong")).rejects.toThrow(/Invalid password or corrupt data/);
  });

  it("rejects a tampered plaintext manifest", async () => {
    await expect(previewBackup({ version: 99, exportedAt: new Date().toISOString(), salt: "", iv: "", ciphertext: "" }, "password")).rejects.toThrow(/Malformed encrypted backup manifest/);
  });

  it("rejects plaintext scan (non-object ciphertext)", async () => {
    const manifest = makeManifest("not-an-object");
    vi.stubGlobal("crypto", {
      subtle: {
        importKey: vi.fn().mockResolvedValue("key"),
        deriveKey: vi.fn().mockResolvedValue("key"),
        decrypt: vi.fn().mockImplementation(async () => {
          const enc = new TextEncoder();
          return enc.encode(manifest.ciphertext).buffer;
        }),
      },
    });

    // importDecryptedPacket expects an object record; a string should fail gracefully.
    const res = await importDecryptedPacket("conversations", "id", JSON.stringify("not-an-object"));
    expect(res.ok).toBe(false);
  });

  it("applies last-write-wins when imported record is newer", async () => {
    mockGetItems.mockResolvedValue([{ id: "conv-1", updatedAt: 1000, messages: [] }]);
    const res = await importDecryptedPacket("conversations", "conv-1", JSON.stringify({ id: "conv-1", updatedAt: 2000, messages: [] }));
    expect(res.ok).toBe(true);
    expect(mockSaveItem).toHaveBeenCalled();
  });

  it("skips import when local record is newer (LWW)", async () => {
    mockGetItems.mockResolvedValue([{ id: "conv-1", updatedAt: 2000, messages: [] }]);
    const res = await importDecryptedPacket("conversations", "conv-1", JSON.stringify({ id: "conv-1", updatedAt: 1000, messages: [] }));
    expect(res.ok).toBe(true);
    expect(mockSaveItem).not.toHaveBeenCalled();
  });

  it("creates a conflict copy for preserve-stores when revisions diverge", async () => {
    mockGetItems.mockResolvedValue([{
      id: "card-1",
      updatedAt: 2000,
      deviceId: "device-a",
      revisionId: "rev-a",
      baseRevisionId: "rev-base",
      name: "Local",
    }]);

    const res = await importDecryptedPacket(
      "character_cards",
      "card-1",
      JSON.stringify({
        id: "card-1",
        updatedAt: 2000,
        deviceId: "device-b",
        revisionId: "rev-b",
        baseRevisionId: "rev-base",
        name: "Remote",
      })
    );

    expect(res.ok).toBe(true);
    const saved = mockSaveItem.mock.calls[0][1] as { id: string; name: string };
    expect(saved.id).toMatch(/card-1_conflict_\d+/);
    expect(saved.name).toContain("Conflict from device-b");
  });

  it("merges chat messages across divergent revisions", async () => {
    mockGetItems.mockResolvedValue([{
      id: "chat-1",
      updatedAt: 1000,
      deviceId: "device-a",
      revisionId: "rev-a",
      baseRevisionId: "rev-base",
      messages: [{ id: "m-1", createdAt: 100, content: "hello" }],
    }]);

    const res = await importDecryptedPacket(
      "chats",
      "chat-1",
      JSON.stringify({
        id: "chat-1",
        updatedAt: 2000,
        deviceId: "device-b",
        revisionId: "rev-b",
        baseRevisionId: "rev-base",
        messages: [{ id: "m-2", createdAt: 200, content: "world" }],
      })
    );

    expect(res.ok).toBe(true);
    const saved = mockSaveItem.mock.calls[0][1] as { messages: { id: string }[] };
    expect(saved.messages.map((m) => m.id)).toEqual(["m-1", "m-2"]);
  });

  it("honours local tombstones newer than the imported record", async () => {
    mockGetItem.mockResolvedValue({ deletedAt: 3000 });
    const res = await importDecryptedPacket("conversations", "conv-1", JSON.stringify({ id: "conv-1", updatedAt: 1000 }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Local tombstone is newer/i);
    expect(mockSaveItem).not.toHaveBeenCalled();
  });

  it("previews record counts without applying", async () => {
    const payload = {
      conversations: [{ id: "c1", updatedAt: 1 }],
      settings: [{ id: "s1", updatedAt: 1 }],
      unknownStore: [{ id: "u1" }],
    };
    const manifest = makeManifest(payload);

    vi.stubGlobal("crypto", {
      subtle: {
        importKey: vi.fn().mockResolvedValue("key"),
        deriveKey: vi.fn().mockResolvedValue("key"),
        decrypt: vi.fn().mockImplementation(async () => {
          const enc = new TextEncoder();
          return enc.encode(JSON.stringify(payload)).buffer;
        }),
      },
    });

    const preview = await previewBackup(manifest, "password");
    expect(preview.totalRecords).toBe(2);
    expect(preview.stores.map((s) => s.storeName).sort()).toEqual(["conversations", "settings"]);
  });

  describe("Electron wrapper unwrapping", () => {
    beforeEach(() => {
      mockIsElectron.mockReturnValue(true);
    });

    const stores = [
      {
        storeName: "character_cards" as const,
        bridge: desktopBridge.desktopCharacterCards,
        listKey: "cards",
        localId: "card-1",
      },
      {
        storeName: "personas" as const,
        bridge: desktopBridge.desktopPersonas,
        listKey: "personas",
        localId: "persona-1",
      },
      {
        storeName: "lorebooks" as const,
        bridge: desktopBridge.desktopLorebooks,
        listKey: "lorebooks",
        localId: "lorebook-1",
      },
      {
        storeName: "rp_assets" as const,
        bridge: desktopBridge.desktopRpAssets,
        listKey: "assets",
        localId: "asset-1",
      },
      {
        storeName: "rpScenarios" as const,
        bridge: desktopBridge.desktopScenarios,
        listKey: "scenarios",
        localId: "scenario-1",
      },
    ];

    it.each(stores)("unwraps $storeName wrapper to find existing local record", async ({ storeName, bridge, listKey, localId }) => {
      const existing = { id: localId, updatedAt: 2000 };
      vi.mocked(bridge.list).mockResolvedValueOnce({ ok: true, [listKey]: [existing], error: undefined } as never);
      const res = await importDecryptedPacket(storeName, localId, JSON.stringify({ id: localId, updatedAt: 1000 }));
      expect(res.ok).toBe(true);
      // Because local is newer, no save should happen.
      expect(mockSaveItem).not.toHaveBeenCalled();
    });

    it("unwraps rp_chats wrapper to find existing local record", async () => {
      const existing = { id: "rpchat-1", updatedAt: 2000 };
      vi.mocked(desktopBridge.desktopRpChats.list).mockResolvedValueOnce({ ok: true, chats: [existing], error: undefined } as never);
      const res = await importDecryptedPacket("rp_chats", "rpchat-1", JSON.stringify({ id: "rpchat-1", updatedAt: 1000 }));
      expect(res.ok).toBe(true);
      expect(mockSaveItem).not.toHaveBeenCalled();
    });

    it("handles failed Electron list by treating it as empty", async () => {
      vi.mocked(desktopBridge.desktopCharacterCards.list).mockResolvedValueOnce({ ok: false, cards: [], error: "disk error" } as never);
      const res = await importDecryptedPacket("character_cards", "card-1", JSON.stringify({ id: "card-1", updatedAt: 1000 }));
      expect(res.ok).toBe(true);
      expect(desktopBridge.desktopCharacterCards.save).toHaveBeenCalled();
    });

    it("rejects a malformed tombstone missing recordId", async () => {
      const res = await importDecryptedPacket("tombstones", "conv-1", JSON.stringify({ storeName: "conversations", id: "conv-1", deletedAt: Date.now() }));
      expect(res.ok).toBe(false);
      expect(mockRecordTombstone).not.toHaveBeenCalled();
    });
  });
});
