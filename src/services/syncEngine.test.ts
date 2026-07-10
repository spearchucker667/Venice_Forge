// VERIFY-089 regression guard: sync engine forwards local saves/deletes to the desktop bridge.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initSyncEngine, stopSyncEngine } from "./syncEngine";
import * as desktopBridge from "./desktopBridge";
import { importDecryptedPacket } from "./backupImportService";

vi.mock("./desktopBridge", () => ({
  isElectron: vi.fn().mockReturnValue(true),
  desktopSync: {
    startSync: vi.fn().mockResolvedValue({ ok: true }),
    stopSync: vi.fn().mockResolvedValue({ ok: true }),
    writePacket: vi.fn().mockResolvedValue({ ok: true }),
    onRemoteChange: vi.fn().mockReturnValue(() => {}),
    setEmissionSuppressed: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

vi.mock("./backupImportService", () => ({
  importDecryptedPacket: vi.fn().mockResolvedValue({ ok: true }),
}));

const mockStartSync = vi.mocked(desktopBridge.desktopSync.startSync);
const mockWritePacket = vi.mocked(desktopBridge.desktopSync.writePacket);
const mockOnRemoteChange = vi.mocked(desktopBridge.desktopSync.onRemoteChange);
const mockImportDecryptedPacket = vi.mocked(importDecryptedPacket);

describe("syncEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as Window & typeof globalThis);
  });

  afterEach(() => {
    stopSyncEngine();
    vi.unstubAllGlobals();
  });

  it("initializes and registers remote-change listener", async () => {
    await initSyncEngine("password");
    expect(mockStartSync).toHaveBeenCalledWith({ password: "password" });
    expect(mockOnRemoteChange).toHaveBeenCalled();
    expect(window.addEventListener).toHaveBeenCalledWith("venice:storage-saved", expect.any(Function));
    expect(window.addEventListener).toHaveBeenCalledWith("venice:storage-deleted", expect.any(Function));
  });

  it("forwards venice:storage-saved events as sync packets", async () => {
    await initSyncEngine("password");
    const savedCalls = (window.addEventListener as ReturnType<typeof vi.fn>).mock.calls as Array<[string, (e: Event) => void]>;
    const savedHandler = savedCalls.find((call) => call[0] === "venice:storage-saved")?.[1];
    if (!savedHandler) throw new Error("venice:storage-saved handler not registered");

    const record = { id: "conv-1", title: "Hello" };
    savedHandler(new CustomEvent("venice:storage-saved", { detail: { store: "conversations", record, id: "conv-1" } }));

    // Wait for microtask
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockWritePacket).toHaveBeenCalledWith({ storeName: "conversations", id: "conv-1", recordJson: expect.any(String) });
  });

  it("forwards venice:storage-deleted events as tombstone packets", async () => {
    await initSyncEngine("password");
    const deletedCalls = (window.addEventListener as ReturnType<typeof vi.fn>).mock.calls as Array<[string, (e: Event) => void]>;
    const deletedHandler = deletedCalls.find((call) => call[0] === "venice:storage-deleted")?.[1];
    if (!deletedHandler) throw new Error("venice:storage-deleted handler not registered");

    deletedHandler(new CustomEvent("venice:storage-deleted", { detail: { store: "conversations", id: "conv-1" } }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockWritePacket).toHaveBeenCalledWith({
      storeName: "tombstones",
      id: "conv-1",
      recordJson: expect.stringContaining("\"storeName\":\"conversations\""),
    });
  });

  it("does not emit when __VENICE_IS_SYNCING is true", async () => {
    (window as unknown as Record<string, boolean>).__VENICE_IS_SYNCING = true;
    await initSyncEngine("password");
    const savedCalls = (window.addEventListener as ReturnType<typeof vi.fn>).mock.calls as Array<[string, (e: Event) => void]>;
    const savedHandler = savedCalls.find((call) => call[0] === "venice:storage-saved")?.[1];
    if (!savedHandler) throw new Error("venice:storage-saved handler not registered");

    savedHandler(new CustomEvent("venice:storage-saved", { detail: { store: "conversations", record: { id: "conv-1" }, id: "conv-1" } }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockWritePacket).not.toHaveBeenCalled();
  });

  it("imports remote changes via importDecryptedPacket", async () => {
    await initSyncEngine("password");
    const remoteCallback = mockOnRemoteChange.mock.calls[0][0];
    await remoteCallback({ storeName: "conversations", id: "conv-1", recordJson: '{"id":"conv-1"}' });
    expect(mockImportDecryptedPacket).toHaveBeenCalledWith("conversations", "conv-1", '{"id":"conv-1"}');
  });
});
