// VERIFY-089 regression guard: sync engine forwards local saves to the desktop bridge,
// applies remote tombstones, and is idempotent. Local deletes are coordinated
// synchronously by StorageService before the target record is removed.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initSyncEngine, stopSyncEngine, pauseSyncEngine, reattachSyncEngine } from "./syncEngine";
import * as desktopBridge from "./desktopBridge";
import { importDecryptedPacket } from "./syncPacketImporter";

vi.mock("./desktopBridge", () => ({
  isElectron: vi.fn().mockReturnValue(true),
  desktopSync: {
    startSync: vi.fn().mockResolvedValue({ ok: true }),
    stopSync: vi.fn().mockResolvedValue({ ok: true }),
    pauseSync: vi.fn().mockResolvedValue({ ok: true }),
    getStatus: vi.fn().mockResolvedValue({ ok: true, configured: true, mainWatcher: "running", rendererSessionAttached: false, authenticated: true, profileId: "default" }),
    writePacket: vi.fn().mockResolvedValue({ ok: true }),
    acknowledgeOperation: vi.fn().mockResolvedValue({ ok: true }),
    onRemoteChange: vi.fn().mockReturnValue(() => {}),
    setEmissionSuppressed: vi.fn().mockResolvedValue({ ok: true }),
    setRendererSessionAttached: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

vi.mock("./syncPacketImporter", () => ({
  importDecryptedPacket: vi.fn().mockResolvedValue({ ok: true }),
}));

const mockStartSync = vi.mocked(desktopBridge.desktopSync.startSync);
const mockStopSync = vi.mocked(desktopBridge.desktopSync.stopSync);
const mockPauseSync = vi.mocked(desktopBridge.desktopSync.pauseSync);
const mockGetStatus = vi.mocked(desktopBridge.desktopSync.getStatus);
const mockWritePacket = vi.mocked(desktopBridge.desktopSync.writePacket);
const mockAcknowledgeOperation = vi.mocked(desktopBridge.desktopSync.acknowledgeOperation);
const mockOnRemoteChange = vi.mocked(desktopBridge.desktopSync.onRemoteChange);
const mockSetRendererSessionAttached = vi.mocked(desktopBridge.desktopSync.setRendererSessionAttached);
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
    expect(mockStartSync).toHaveBeenCalledWith({ password: "password", profileId: "default", includeMedia: false });
    expect(mockOnRemoteChange).toHaveBeenCalled();
    expect(window.addEventListener).toHaveBeenCalledWith("venice:storage-saved", expect.any(Function));
    expect(mockSetRendererSessionAttached).toHaveBeenCalledWith({ attached: true });
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
    expect(secondCleanup).not.toHaveBeenCalled();
  });

  it("awaits stop before start so a delayed stop cannot terminate a new watcher", async () => {
    const stopOrder: string[] = [];
    mockStopSync.mockImplementation(async () => {
      stopOrder.push("stop-start");
      return { ok: true };
    });
    mockStartSync.mockImplementation(async () => {
      stopOrder.push("start");
      return { ok: true };
    });

    await initSyncEngine("password");
    expect(stopOrder).toEqual(["stop-start", "start"]);
  });

  it("does not attach listeners when main process start fails", async () => {
    mockStartSync.mockResolvedValueOnce({ ok: false, error: "main start failed" });
    const result = await initSyncEngine("password");
    expect(result).toEqual({ ok: false, status: "error", error: "main start failed" });
    expect(window.addEventListener).not.toHaveBeenCalled();
  });

  it("keeps listeners attached when pause fails", async () => {
    await initSyncEngine("password");
    const removeCallsBeforePause = (window.removeEventListener as ReturnType<typeof vi.fn>).mock.calls.length;
    mockPauseSync.mockResolvedValueOnce({ ok: false, error: "main pause failed" });
    const result = await pauseSyncEngine();
    expect(result).toEqual({ ok: false, status: "error", error: "main pause failed" });
    expect((window.removeEventListener as ReturnType<typeof vi.fn>).mock.calls.length).toBe(removeCallsBeforePause);
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

  it("does not emit for remote-sync origin", async () => {
    await initSyncEngine("password");
    const savedCalls = (window.addEventListener as ReturnType<typeof vi.fn>).mock.calls as Array<[string, (e: Event) => void]>;
    const savedHandler = savedCalls.find((call) => call[0] === "venice:storage-saved")?.[1];
    if (!savedHandler) throw new Error("venice:storage-saved handler not registered");

    savedHandler(new CustomEvent("venice:storage-saved", { detail: { store: "conversations", record: { id: "conv-1" }, id: "conv-1", origin: "remote-sync" } }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockWritePacket).not.toHaveBeenCalled();
  });

  it("imports remote changes via importDecryptedPacket", async () => {
    await initSyncEngine("password");
    const remoteCallback = mockOnRemoteChange.mock.calls[0][0];
    await remoteCallback({ storeName: "conversations", id: "conv-1", operationId: "op-1", recordJson: '{"id":"conv-1"}', remoteApplyToken: "token-1" });
    expect(mockImportDecryptedPacket).toHaveBeenCalledWith("conversations", "conv-1", '{"id":"conv-1"}', "op-1", "token-1");
    expect(mockAcknowledgeOperation).toHaveBeenCalledWith({ operationId: "op-1", ok: true });
  });

  it("rejects malformed tombstones from remote changes", async () => {
    await initSyncEngine("password");
    const remoteCallback = mockOnRemoteChange.mock.calls[0][0];
    await remoteCallback({ storeName: "tombstones", id: "conv-1", operationId: "op-2", recordJson: '{"storeName":"conversations","id":"conv-1","deletedAt":12345}', remoteApplyToken: "token-2" });
    expect(mockImportDecryptedPacket).not.toHaveBeenCalled();
    expect(mockAcknowledgeOperation).toHaveBeenCalledWith({ operationId: "op-2", ok: false });
  });

  it("forwards valid remote tombstones to importDecryptedPacket", async () => {
    await initSyncEngine("password");
    const remoteCallback = mockOnRemoteChange.mock.calls[0][0];
    const recordJson = JSON.stringify({ id: "conversations:conv-1", storeName: "conversations", recordId: "conv-1", deletedAt: Date.now() });
    await remoteCallback({ storeName: "tombstones", id: "conv-1", operationId: "op-3", recordJson, remoteApplyToken: "token-3" });
    expect(mockImportDecryptedPacket).toHaveBeenCalledWith("tombstones", "conv-1", recordJson, "op-3", "token-3");
    expect(mockAcknowledgeOperation).toHaveBeenCalledWith({ operationId: "op-3", ok: true });
  });

  it("returns structured error when main process start fails", async () => {
    mockStartSync.mockResolvedValueOnce({ ok: false, error: "invalid password" });
    const result = await initSyncEngine("password");
    expect(result).toEqual({ ok: false, status: "error", error: "invalid password" });
    expect(window.addEventListener).not.toHaveBeenCalled();
  });

  it("pauses removes listeners and pauses main process", async () => {
    await initSyncEngine("password");
    mockSetRendererSessionAttached.mockClear();
    const result = await pauseSyncEngine();
    expect(result).toEqual({ ok: true, status: "paused" });
    expect(mockPauseSync).toHaveBeenCalled();
    expect(window.removeEventListener).toHaveBeenCalledWith("venice:storage-saved", expect.any(Function));
    expect(mockSetRendererSessionAttached).toHaveBeenCalledWith({ attached: false });
  });

  it("skips sync emission for venice:storage-saved when origin is not local-user", async () => {
    await initSyncEngine("password");
    const savedCalls = (window.addEventListener as ReturnType<typeof vi.fn>).mock.calls as Array<[string, (e: Event) => void]>;
    const savedHandler = savedCalls.find((call) => call[0] === "venice:storage-saved")?.[1];
    if (!savedHandler) throw new Error("venice:storage-saved handler not registered");

    savedHandler(new CustomEvent("venice:storage-saved", { detail: { store: "conversations", record: { id: "conv-1" }, id: "conv-1", origin: "remote-sync" } }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockWritePacket).not.toHaveBeenCalled();
  });

  it("still emits sync packets for local-user origin", async () => {
    await initSyncEngine("password");
    const savedCalls = (window.addEventListener as ReturnType<typeof vi.fn>).mock.calls as Array<[string, (e: Event) => void]>;
    const savedHandler = savedCalls.find((call) => call[0] === "venice:storage-saved")?.[1];
    if (!savedHandler) throw new Error("venice:storage-saved handler not registered");

    savedHandler(new CustomEvent("venice:storage-saved", { detail: { store: "conversations", record: { id: "conv-1" }, id: "conv-1", origin: "local-user" } }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockWritePacket).toHaveBeenCalledWith({ storeName: "conversations", id: "conv-1", recordJson: expect.any(String) });
  });

  it("emits sync packets when origin is omitted for back-compat", async () => {
    await initSyncEngine("password");
    const savedCalls = (window.addEventListener as ReturnType<typeof vi.fn>).mock.calls as Array<[string, (e: Event) => void]>;
    const savedHandler = savedCalls.find((call) => call[0] === "venice:storage-saved")?.[1];
    if (!savedHandler) throw new Error("venice:storage-saved handler not registered");

    savedHandler(new CustomEvent("venice:storage-saved", { detail: { store: "conversations", record: { id: "conv-1" }, id: "conv-1" } }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockWritePacket).toHaveBeenCalledWith({ storeName: "conversations", id: "conv-1", recordJson: expect.any(String) });
  });

  it("reattaches without restarting the main watcher when it is already running", async () => {
    mockGetStatus.mockResolvedValueOnce({ ok: true, configured: true, mainWatcher: "running", rendererSessionAttached: false, authenticated: true, profileId: "default" });
    const result = await reattachSyncEngine();
    expect(result).toEqual({ ok: true, status: "running" });
    expect(mockStopSync).not.toHaveBeenCalled();
    expect(mockStartSync).not.toHaveBeenCalled();
    expect(mockOnRemoteChange).toHaveBeenCalled();
    expect(window.addEventListener).toHaveBeenCalledWith("venice:storage-saved", expect.any(Function));
    expect(mockSetRendererSessionAttached).toHaveBeenCalledWith({ attached: true });
  });

  it("refuses to reattach a sync session owned by another profile", async () => {
    mockGetStatus.mockResolvedValueOnce({ ok: true, configured: true, mainWatcher: "running", rendererSessionAttached: false, authenticated: true, profileId: "work" });
    const result = await reattachSyncEngine();
    expect(result).toMatchObject({ ok: false, status: "error" });
    expect(result.error).toMatch(/another profile/i);
    expect(mockOnRemoteChange).not.toHaveBeenCalled();
  });

  it("refuses to reattach when the main watcher is not running", async () => {
    mockGetStatus.mockResolvedValueOnce({ ok: true, configured: true, mainWatcher: "paused", rendererSessionAttached: false, authenticated: true });
    const result = await reattachSyncEngine();
    expect(result).toEqual({ ok: false, status: "paused", error: expect.stringContaining("not running") });
    expect(mockOnRemoteChange).not.toHaveBeenCalled();
    expect(mockSetRendererSessionAttached).not.toHaveBeenCalledWith({ attached: true });
  });

  it("refuses to reattach when the main process is not authenticated", async () => {
    mockGetStatus.mockResolvedValueOnce({ ok: true, configured: true, mainWatcher: "running", rendererSessionAttached: false, authenticated: false });
    const result = await reattachSyncEngine();
    expect(result).toEqual({ ok: false, status: "error", error: expect.stringContaining("not authenticated") });
    expect(mockOnRemoteChange).not.toHaveBeenCalled();
    expect(mockSetRendererSessionAttached).not.toHaveBeenCalledWith({ attached: true });
  });
});
