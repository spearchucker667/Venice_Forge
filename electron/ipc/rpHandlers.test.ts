// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ipcMain } from "electron";
import { registerRpIpcHandlers } from "./rpHandlers";
import * as characterCardStorage from "../services/characterCardStorage";
import { personaStore } from "../services/rpStores";
import * as logger from "../services/logger";
import * as syncBridge from "../services/syncBridge";

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

vi.mock("../services/characterCardStorage");
vi.mock("../services/rpChatStorage");
vi.mock("../services/rpStores", () => ({
  personaStore: { list: vi.fn(), read: vi.fn(), save: vi.fn(), remove: vi.fn() },
  lorebookStore: { list: vi.fn(), read: vi.fn(), save: vi.fn(), remove: vi.fn() },
  rpAssetStore: { list: vi.fn(), read: vi.fn(), save: vi.fn(), remove: vi.fn() },
  scenarioStore: { list: vi.fn(), read: vi.fn(), save: vi.fn(), remove: vi.fn() },
}));
vi.mock("../services/logger");
vi.mock("../services/syncBridge", () => ({
  emitSyncPacket: vi.fn(async () => undefined),
  emitSyncTombstone: vi.fn(async () => undefined),
}));

describe("rpHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should register all expected handlers", () => {
    registerRpIpcHandlers();
    expect(ipcMain.handle).toHaveBeenCalledWith("characterCards:list", expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith("characterCards:get", expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith("characterCards:save", expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith("characterCards:delete", expect.any(Function));

    expect(ipcMain.handle).toHaveBeenCalledWith("personas:list", expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith("lorebooks:list", expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith("rpChats:list", expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith("rpAssets:list", expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith("scenarios:list", expect.any(Function));
  });

  it("handles characterCards:list successfully", async () => {
    registerRpIpcHandlers();
    const handler = vi.mocked(ipcMain.handle).mock.calls.find((call) => call[0] === "characterCards:list")?.[1] as (...args: any[]) => any;
    
    vi.mocked(characterCardStorage.listCharacterCards).mockResolvedValueOnce({ cards: [], truncated: false, totalScanned: 0 });
    const result = await handler({} as any);
    expect(result.ok).toBe(true);
    expect(result.cards).toEqual([]);
  });

  it("handles characterCards:list errors safely", async () => {
    registerRpIpcHandlers();
    const handler = vi.mocked(ipcMain.handle).mock.calls.find((call) => call[0] === "characterCards:list")?.[1] as (...args: any[]) => any;
    
    vi.mocked(characterCardStorage.listCharacterCards).mockRejectedValueOnce(new Error("Disk error"));
    const result = await handler({} as any);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Disk error");
    expect(logger.logError).toHaveBeenCalled();
  });

  it("handles personas:save correctly", async () => {
    registerRpIpcHandlers();
    const handler = vi.mocked(ipcMain.handle).mock.calls.find((call) => call[0] === "personas:save")?.[1] as (...args: any[]) => any;
    
    vi.mocked(personaStore.save).mockResolvedValueOnce({ ok: true });
    vi.mocked(personaStore.read).mockResolvedValueOnce({ id: "123", name: "Test" } as any);
    
    const result = await handler({} as any, { id: "123" });
    expect(result.ok).toBe(true);
    expect(result.persona?.name).toBe("Test");
  });

  it("personas:save read-back preserves the persona image", async () => {
    registerRpIpcHandlers();
    const handler = vi.mocked(ipcMain.handle).mock.calls.find((call) => call[0] === "personas:save")?.[1] as (...args: any[]) => any;

    const image = { mimeType: "image/png", data: "iVBORw0KGgo=", byteLength: 12 };
    const persona = { id: "p-img", name: "WithImage", image };
    vi.mocked(personaStore.save).mockResolvedValueOnce({ ok: true });
    vi.mocked(personaStore.read).mockResolvedValueOnce(persona as any);

    const result = await handler({} as any, persona);
    expect(result.ok).toBe(true);
    expect(result.persona?.image).toEqual(image);
  });

  it("handles invalid IDs in delete operations", async () => {
    registerRpIpcHandlers();
    const handler = vi.mocked(ipcMain.handle).mock.calls.find((call) => call[0] === "rpChats:delete")?.[1] as (...args: any[]) => any;

    const result = await handler({} as any, { id: 123 }); // id is not a string
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Invalid id");
  });

  it("rejects delete payloads that are not objects", async () => {
    registerRpIpcHandlers();
    const handler = vi.mocked(ipcMain.handle).mock.calls.find((call) => call[0] === "rpChats:delete")?.[1] as (...args: any[]) => any;

    const result = await handler({} as any, "legacy-string-id");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Invalid payload");
  });

  it("rejects delete payloads with an invalid mutation origin", async () => {
    registerRpIpcHandlers();
    const handler = vi.mocked(ipcMain.handle).mock.calls.find((call) => call[0] === "rpChats:delete")?.[1] as (...args: any[]) => any;

    const result = await handler({} as any, { id: "valid-id", origin: "bad-origin" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid mutation origin/i);
  });

  it("accepts delete payloads with { id, origin } and forwards only id to storage", async () => {
    registerRpIpcHandlers();
    const handler = vi.mocked(ipcMain.handle).mock.calls.find((call) => call[0] === "personas:delete")?.[1] as (...args: any[]) => any;

    vi.mocked(personaStore.remove).mockResolvedValueOnce({ ok: true });

    const result = await handler({} as any, { id: "persona-1", origin: "local-user" });
    expect(result.ok).toBe(true);
    expect(personaStore.remove).toHaveBeenCalledWith("persona-1");
  });

  describe("origin-aware sync emission", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("personas:save does not call syncBridge for remote-sync origin", async () => {
      registerRpIpcHandlers();
      const handler = vi.mocked(ipcMain.handle).mock.calls.find((call) => call[0] === "personas:save")?.[1] as (...args: any[]) => any;
      vi.mocked(personaStore.save).mockResolvedValueOnce({ ok: true });
      vi.mocked(personaStore.read).mockResolvedValueOnce({ id: "p-1", name: "Test" } as any);

      await handler({} as any, { id: "p-1", name: "Test", origin: "remote-sync" });
      expect(syncBridge.emitSyncPacket).not.toHaveBeenCalled();
    });

    it("personas:save emits a sync packet once for local-user origin", async () => {
      registerRpIpcHandlers();
      const handler = vi.mocked(ipcMain.handle).mock.calls.find((call) => call[0] === "personas:save")?.[1] as (...args: any[]) => any;
      vi.mocked(personaStore.save).mockResolvedValueOnce({ ok: true });
      vi.mocked(personaStore.read).mockResolvedValueOnce({ id: "p-1", name: "Test" } as any);

      await handler({} as any, { id: "p-1", name: "Test", origin: "local-user" });
      expect(syncBridge.emitSyncPacket).toHaveBeenCalledTimes(1);
      expect(syncBridge.emitSyncPacket).toHaveBeenCalledWith("personas", "p-1", { id: "p-1", name: "Test" }, "local-user");
    });

    it("personas:save defaults omitted origin to local-user and emits", async () => {
      registerRpIpcHandlers();
      const handler = vi.mocked(ipcMain.handle).mock.calls.find((call) => call[0] === "personas:save")?.[1] as (...args: any[]) => any;
      vi.mocked(personaStore.save).mockResolvedValueOnce({ ok: true });
      vi.mocked(personaStore.read).mockResolvedValueOnce({ id: "p-1", name: "Test" } as any);

      await handler({} as any, { id: "p-1", name: "Test" });
      expect(syncBridge.emitSyncPacket).toHaveBeenCalledTimes(1);
      expect(syncBridge.emitSyncPacket).toHaveBeenCalledWith("personas", "p-1", { id: "p-1", name: "Test" }, "local-user");
    });

    it("personas:save rejects an invalid mutation origin", async () => {
      registerRpIpcHandlers();
      const handler = vi.mocked(ipcMain.handle).mock.calls.find((call) => call[0] === "personas:save")?.[1] as (...args: any[]) => any;
      vi.mocked(personaStore.save).mockResolvedValueOnce({ ok: true });

      const result = await handler({} as any, { id: "p-1", name: "Test", origin: "bad-origin" });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/invalid mutation origin/i);
      expect(syncBridge.emitSyncPacket).not.toHaveBeenCalled();
    });

    it("personas:delete does not call syncBridge for remote-sync origin", async () => {
      registerRpIpcHandlers();
      const handler = vi.mocked(ipcMain.handle).mock.calls.find((call) => call[0] === "personas:delete")?.[1] as (...args: any[]) => any;
      vi.mocked(personaStore.remove).mockResolvedValueOnce({ ok: true });

      await handler({} as any, { id: "p-1", origin: "remote-sync" });
      expect(syncBridge.emitSyncTombstone).not.toHaveBeenCalled();
    });

    it("personas:delete emits a tombstone once for local-user origin", async () => {
      registerRpIpcHandlers();
      const handler = vi.mocked(ipcMain.handle).mock.calls.find((call) => call[0] === "personas:delete")?.[1] as (...args: any[]) => any;
      vi.mocked(personaStore.remove).mockResolvedValueOnce({ ok: true });

      await handler({} as any, { id: "p-1", origin: "local-user" });
      expect(syncBridge.emitSyncTombstone).toHaveBeenCalledTimes(1);
      expect(syncBridge.emitSyncTombstone).toHaveBeenCalledWith("personas", "p-1", "local-user");
    });
  });
});
