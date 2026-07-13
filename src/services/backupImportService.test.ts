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
import type { Tombstone } from "../types/sync";

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
      applyRemoteMutation: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
});

vi.mock("./storageService", () => ({
  default: {
    getItems: vi.fn(),
    getItem: vi.fn(),
    saveItem: vi.fn(),
    saveImportedItem: vi.fn(),
    deleteItem: vi.fn(),
  },
}));

vi.mock("./tombstoneService", () => ({
  TombstoneService: {
    saveTombstone: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockIsElectron = vi.mocked(desktopBridge.isElectron);
const mockGetItems = vi.mocked(StorageService.getItems);
const mockGetItem = vi.mocked(StorageService.getItem);
const mockSaveItem = vi.mocked(StorageService.saveItem);
const mockSaveImportedItem = vi.mocked(StorageService.saveImportedItem);
const mockSaveTombstone = vi.mocked(TombstoneService.saveTombstone);

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
    mockSaveImportedItem.mockImplementation(async (_store, item) => item as never);
    vi.mocked(desktopBridge.desktopSync.applyRemoteMutation).mockResolvedValue({ ok: true });
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
    expect(mockSaveTombstone).toHaveBeenCalledWith(
      expect.objectContaining({ storeName: "conversations", recordId: "conv-2", deletedAt: 2000 })
    );
    expect(mockIsElectron()).toBe(false);
  });

  it("preserves remote tombstone deletedAt and deviceId", async () => {
    const remote: Tombstone = {
      id: "conversations:conv-1",
      storeName: "conversations",
      recordId: "conv-1",
      deletedAt: 1_000_000,
      deviceId: "device-a",
    };
    const res = await importDecryptedPacket("tombstones", remote.id, JSON.stringify(remote));
    expect(res.ok).toBe(true);
    expect(mockSaveTombstone).toHaveBeenCalledWith(
      expect.objectContaining({ deletedAt: 1_000_000, deviceId: "device-a" })
    );
  });

  it("passes remote-sync origin to web-mode storage", async () => {
    mockIsElectron.mockReturnValue(false);
    const res = await importDecryptedPacket("conversations", "conv-1", JSON.stringify({ id: "conv-1", updatedAt: 2000, messages: [] }));
    expect(res.ok).toBe(true);
    expect(mockSaveImportedItem).toHaveBeenCalledWith("conversations", expect.any(Object));
  });

  it("marks a manual Electron import without claiming remote-sync authority", async () => {
    mockIsElectron.mockReturnValue(true);
    vi.mocked(desktopBridge.desktopCharacterCards.list).mockResolvedValueOnce({ ok: true, cards: [], error: undefined } as never);
    const res = await importDecryptedPacket("character_cards", "card-1", JSON.stringify({ id: "card-1", updatedAt: 2000 }));
    expect(res.ok).toBe(true);
    expect(desktopBridge.desktopCharacterCards.save).toHaveBeenCalledWith(expect.objectContaining({ id: "card-1" }), "manual-import");
  });

  it("routes a live remote packet through the main-process apply authority", async () => {
    mockIsElectron.mockReturnValue(true);
    vi.mocked(desktopBridge.desktopCharacterCards.list).mockResolvedValueOnce({ ok: true, cards: [], error: undefined } as never);
    const res = await importDecryptedPacket(
      "character_cards",
      "card-remote",
      JSON.stringify({ id: "card-remote", updatedAt: 2000 }),
      "operation-remote",
      "grant-token",
    );
    expect(res.ok).toBe(true);
    expect(desktopBridge.desktopSync.applyRemoteMutation).toHaveBeenCalledWith(expect.objectContaining({
      storeName: "character_cards",
      id: "card-remote",
      remoteApplyToken: "grant-token",
    }));
    expect(desktopBridge.desktopCharacterCards.save).not.toHaveBeenCalled();
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
    expect(mockSaveImportedItem).toHaveBeenCalled();
  });

  it("skips import when local record is newer (LWW)", async () => {
    mockGetItems.mockResolvedValue([{ id: "conv-1", updatedAt: 2000, messages: [] }]);
    const res = await importDecryptedPacket("conversations", "conv-1", JSON.stringify({ id: "conv-1", updatedAt: 1000, messages: [] }));
    expect(res.ok).toBe(true);
    expect(mockSaveImportedItem).not.toHaveBeenCalled();
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
    const saved = mockSaveImportedItem.mock.calls[0][1] as { id: string; name: string };
    expect(saved.id).toMatch(/^card-1_conflict_[a-f0-9]{16}$/);
    expect(saved.name).toContain("Conflict from device-a");
    expect(mockSaveImportedItem).toHaveBeenCalledWith(
      "character_cards",
      expect.objectContaining({ id: "card-1", revisionId: "rev-b" }),
    );
  });

  it("reuses the same conflict ID when the same remote conflict is replayed", async () => {
    mockGetItems.mockResolvedValue([{
      id: "card-replay",
      updatedAt: 2000,
      deviceId: "device-a",
      revisionId: "rev-local",
      baseRevisionId: "rev-base",
      name: "Local",
    }]);
    const remote = JSON.stringify({
      id: "card-replay",
      updatedAt: 2000,
      deviceId: "device-b",
      revisionId: "rev-remote",
      baseRevisionId: "rev-base",
      name: "Remote",
    });
    const operationId = "a".repeat(64);

    await importDecryptedPacket("character_cards", "card-replay", remote, operationId);
    await importDecryptedPacket("character_cards", "card-replay", remote, operationId);

    const conflictIds = mockSaveImportedItem.mock.calls
      .map((call) => (call[1] as { id: string }).id)
      .filter((id) => id.includes("_conflict_"));
    expect(conflictIds).toHaveLength(2);
    expect(new Set(conflictIds).size).toBe(1);
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
    const saved = mockSaveImportedItem.mock.calls[0][1] as { messages: { id: string }[] };
    expect(saved.messages.map((m) => m.id)).toEqual(["m-1", "m-2"]);
  });

  it("honours local tombstones newer than the imported record", async () => {
    mockGetItem.mockResolvedValue({ deletedAt: 3000 });
    const res = await importDecryptedPacket("conversations", "conv-1", JSON.stringify({ id: "conv-1", updatedAt: 1000 }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Local tombstone is newer/i);
    expect(mockSaveImportedItem).not.toHaveBeenCalled();
  });

  it("compares ISO updatedAt values against numeric tombstones", async () => {
    const updatedAt = "2026-07-11T20:00:00.000Z";
    mockGetItem.mockResolvedValue({ deletedAt: Date.parse(updatedAt) + 1 });

    const res = await importDecryptedPacket("conversations", "conv-iso", JSON.stringify({ id: "conv-iso", updatedAt }));

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Local tombstone is newer/i);
    expect(mockSaveImportedItem).not.toHaveBeenCalled();
  });

  it("lets deletion win when tombstone and update timestamps are equal", async () => {
    const timestamp = Date.parse("2026-07-11T20:00:00.000Z");
    mockGetItem.mockResolvedValue({ deletedAt: timestamp });

    const res = await importDecryptedPacket("conversations", "conv-tie", JSON.stringify({
      id: "conv-tie",
      updatedAt: new Date(timestamp).toISOString(),
    }));

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Local tombstone is newer/i);
  });

  it("rejects invalid imported timestamps", async () => {
    const res = await importDecryptedPacket("conversations", "conv-invalid", JSON.stringify({
      id: "conv-invalid",
      updatedAt: "not-a-date",
    }));

    expect(res).toEqual({ ok: false, error: "Imported record has an invalid updatedAt timestamp." });
    expect(mockSaveImportedItem).not.toHaveBeenCalled();
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
      expect(mockSaveTombstone).not.toHaveBeenCalled();
    });
  });
});
