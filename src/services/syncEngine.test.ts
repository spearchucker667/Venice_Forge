// VERIFY-089 regression guard: sync engine forwards local saves/deletes to the desktop bridge,
// uses the canonical tombstone schema, and is idempotent.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initSyncEngine, stopSyncEngine, pauseSyncEngine } from "./syncEngine";
import * as desktopBridge from "./desktopBridge";
import { importDecryptedPacket } from "./backupImportService";

vi.mock("./desktopBridge", () => ({
  isElectron: vi.fn().mockReturnValue(true),
  desktopSync: {
    startSync: vi.fn().mockResolvedValue({ ok: true }),
    stopSync: vi.fn().mockResolvedValue({ ok: true }),
    pauseSync: vi.fn().mockResolvedValue({ ok: true }),
    writePacket: vi.fn().mockResolvedValue({ ok: true }),
    onRemoteChange: vi.fn().mockReturnValue(() => {}),
    setEmissionSuppressed: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

vi.mock("./backupImportService", () => ({
  importDecryptedPacket: vi.fn().mockResolvedValue({ ok: true }),
}));

const mockStartSync = vi.mocked(desktopBridge.desktopSync.startSync);
const mockStopSync = vi.mocked(desktopBridge.desktopSync.stopSync);
const mockPauseSync = vi.mocked(desktopBridge.desktopSync.pauseSync);
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
    const result = await initSyncEngine("password");
    expect(result).toEqual({ ok: true, status: "running" });
    expect(mockStartSync).toHaveBeenCalledWith({ password: "password" });
    expect(mockOnRemoteChange).toHaveBeenCalled();
    expect(window.addEventListener).toHaveBeenCalledWith("venice:storage-saved", expect.any(Function));
    expect(window.addEventListener).toHaveBeenCalledWith("venice:storage-deleted", expect.any(Function));
  });

  it("is idempotent and removes previous listeners before re-initializing", async () => {
    const firstCleanup = vi.fn();
    mockOnRemoteChange.mockReturnValueOnce(firstCleanup);
    await initSyncEngine("password");

    const secondCleanup = vi.fn();
    mockOnRemoteChange.mockReturnValueOnce(secondCleanup);
    await initSyncEngine("password");

    expect(firstCleanup).toHaveBeenCalled();
    expect(mockStopSync).toHaveBeenCalled();
    expect(window.removeEventListener).toHaveBeenCalledWith("venice:storage-saved", expect.any(Function));
    expect(window.removeEventListener).toHaveBeenCalledWith("venice:storage-deleted", expect.any(Function));
    expect(secondCleanup).not.toHaveBeenCalled();
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

  it("forwards venice:storage-deleted events as canonical tombstone packets", async () => {
    await initSyncEngine("password");
    const deletedCalls = (window.addEventListener as ReturnType<typeof vi.fn>).mock.calls as Array<[string, (e: Event) => void]>;
    const deletedHandler = deletedCalls.find((call) => call[0] === "venice:storage-deleted")?.[1];
    if (!deletedHandler) throw new Error("venice:storage-deleted handler not registered");

    deletedHandler(new CustomEvent("venice:storage-deleted", { detail: { store: "conversations", id: "conv-1" } }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockWritePacket).toHaveBeenCalledWith({
      storeName: "tombstones",
      id: "conv-1",
      recordJson: expect.stringContaining("\"recordId\":\"conv-1\""),
    });
    const written = mockWritePacket.mock.calls.find((call) => call[0].storeName === "tombstones")?.[0];
    if (!written) throw new Error("tombstone writePacket call not found");
    const parsed = JSON.parse(written.recordJson);
    expect(parsed.id).toBe("conversations:conv-1");
    expect(parsed.storeName).toBe("conversations");
    expect(parsed.recordId).toBe("conv-1");
    expect(typeof parsed.deletedAt).toBe("number");
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

  it("rejects malformed tombstones from remote changes", async () => {
    await initSyncEngine("password");
    const remoteCallback = mockOnRemoteChange.mock.calls[0][0];
    await remoteCallback({ storeName: "tombstones", id: "conv-1", recordJson: '{"storeName":"conversations","id":"conv-1","deletedAt":12345}' });
    expect(mockImportDecryptedPacket).not.toHaveBeenCalled();
  });

  it("forwards valid remote tombstones to importDecryptedPacket", async () => {
    await initSyncEngine("password");
    const remoteCallback = mockOnRemoteChange.mock.calls[0][0];
    const recordJson = JSON.stringify({ id: "conversations:conv-1", storeName: "conversations", recordId: "conv-1", deletedAt: Date.now() });
    await remoteCallback({ storeName: "tombstones", id: "conv-1", recordJson });
    expect(mockImportDecryptedPacket).toHaveBeenCalledWith("tombstones", "conv-1", recordJson);
  });

  it("returns structured error when main process start fails", async () => {
    mockStartSync.mockResolvedValueOnce({ ok: false, error: "invalid password" });
    const result = await initSyncEngine("password");
    expect(result).toEqual({ ok: false, status: "error", error: "invalid password" });
    expect(window.addEventListener).not.toHaveBeenCalled();
  });

  it("pauses removes listeners and pauses main process", async () => {
    await initSyncEngine("password");
    const result = await pauseSyncEngine();
    expect(result).toEqual({ ok: true, status: "paused" });
    expect(mockPauseSync).toHaveBeenCalled();
    expect(window.removeEventListener).toHaveBeenCalledWith("venice:storage-saved", expect.any(Function));
    expect(window.removeEventListener).toHaveBeenCalledWith("venice:storage-deleted", expect.any(Function));
  });
});
