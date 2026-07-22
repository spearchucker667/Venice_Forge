/**
 * @fileoverview Regression tests for Phase 2 folder backup / lock wiring
 * surfaced by `useChatFolderStore`. Locks the renderer contract that
 * `electron/preload.ts` ↔ `desktopBridge` ↔ `chatFolderHandlers` expose,
 * including the structured retry-after pass-through.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/desktopBridge", () => ({
  desktopChatFolders: {
    list: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    reorder: vi.fn(),
    moveConversation: vi.fn(),
    delete: vi.fn(),
    getBackupPreview: vi.fn(),
    exportBackup: vi.fn(),
    previewImport: vi.fn(),
    importBackup: vi.fn(),
    lock: vi.fn(),
    unlock: vi.fn(),
    getLockState: vi.fn(),
  },
}));

vi.mock("./toast-store", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { desktopChatFolders } from "../services/desktopBridge";
import { toast } from "./toast-store";
import {
  selectCharacterFolders,
  selectStandardFolders,
  useChatFolderStore,
} from "./chat-folder-store";
import type {
  ChatFolder,
  FolderBackupPreview,
  FolderImportPreview,
  FolderLockState,
} from "../shared/chatFolderContracts";

const mockedFolders: ChatFolder[] = [
  {
    id: "folder-1",
    name: "Ops",
    kind: "standard",
    sortOrder: 1,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  } as ChatFolder,
];

const mockedStandardFolders: ChatFolder[] = [
  {
    id: "std-1",
    name: "Ops",
    kind: "standard",
    sortOrder: 1,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  } as ChatFolder,
  {
    id: "std-2",
    name: "Research",
    kind: "standard",
    sortOrder: 2,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  } as ChatFolder,
];

const mockedCharacterFolders: ChatFolder[] = [
  {
    id: "char-1",
    name: "Story arcs",
    kind: "character",
    sortOrder: 1,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  } as ChatFolder,
];

const backupPreview: FolderBackupPreview = {
  folderName: "Ops",
  kind: "standard",
  chatCount: 4,
  messageCount: 27,
  attachmentReferencesCount: 2,
  mediaBlobsCount: 1,
  mediaBlobsTotalBytes: 1024,
  includesMedia: true,
  excludedSecrets: ["apiKey", "bearerToken"],
};

const importPreview: FolderImportPreview = {
  sourceFolderName: "Ops",
  sourceFolderKind: "standard",
  newFolders: 1,
  newConversations: 4,
  changedConversations: 0,
  conflicts: 0,
  tombstones: 0,
  missingBlobs: 0,
  includedBlobs: 1,
  sourceAppVersion: "3.0.0-beta.1",
  sourceProfileId: "default",
  backupCreatedAt: "2026-07-10T12:34:56Z",
};

const lockStateLocked: FolderLockState = {
  folderId: "folder-1",
  locked: true,
  rememberedUnlockAvailable: true,
  failedAttempts: 0,
};

const lockStateWithBackoff: FolderLockState = {
  folderId: "folder-1",
  locked: true,
  rememberedUnlockAvailable: false,
  failedAttempts: 5,
  retryAfter: "2026-07-20T12:34:56Z",
};

describe("useChatFolderStore — Phase 2 backup + lock wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store between tests so the in-memory state cannot leak.
    useChatFolderStore.setState({
      folders: [],
      isLoading: false,
      isLoaded: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("propagates backup preview success payloads and toasts nothing", async () => {
    (desktopChatFolders.getBackupPreview as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      preview: backupPreview,
    });

    const preview = await useChatFolderStore.getState().getBackupPreview("folder-1");

    expect(preview).toEqual(backupPreview);
    expect(desktopChatFolders.getBackupPreview).toHaveBeenCalledWith({ folderId: "folder-1" });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("returns null and toasts on backup preview failure", async () => {
    (desktopChatFolders.getBackupPreview as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: "Folder not found",
    });

    const preview = await useChatFolderStore.getState().getBackupPreview("folder-1");

    expect(preview).toBeNull();
    const calls = (toast.error as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.some(([title, body]) => title === "Failed to read folder backup preview" && String(body) === "Folder not found")).toBe(true);
  });

  it("returns the backup path on a successful folder export", async () => {
    (desktopChatFolders.exportBackup as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      backupPath: "/tmp/chat-folder-standard-ops-123.vfbackup",
    });
    (desktopChatFolders.list as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      folders: mockedFolders,
    });

    const path = await useChatFolderStore.getState().exportFolderBackup({
      folderId: "folder-1",
      includeMedia: true,
      passphrase: "strength-12-chars-min",
    });

    expect(path).toMatch(/chat-folder-standard-ops-.*\.vfbackup$/);
    expect(toast.success).toHaveBeenCalledWith(
      "Folder backup exported",
      expect.stringMatching(/chat-folder-standard-ops-/),
    );
  });

  it("throws and toasts error message when the backup service rejects", async () => {
    (desktopChatFolders.exportBackup as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: "Wrong passphrase",
    });

    await expect(
      useChatFolderStore.getState().exportFolderBackup({
        folderId: "folder-1",
        includeMedia: false,
        passphrase: "hunter2hunter2hunter2hunter2hunter2hunter2",
      }),
    ).rejects.toThrow(/Wrong passphrase/);
    const toastErrorMock = toast.error as unknown as ReturnType<typeof vi.fn>;
    const [title, body] = toastErrorMock.mock.calls[0] ?? [];
    expect(title).toBe("Failed to export folder backup");
    expect(String(body)).toMatch(/Wrong passphrase/);
  });

  it("returns null and toasts when the import preview service rejects", async () => {
    (desktopChatFolders.previewImport as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: "Manifest scope mismatch",
    });

    const preview = await useChatFolderStore
      .getState()
      .previewImport({ backupFilePath: "/tmp/old.vfbackup" });

    expect(preview).toBeNull();
    const calls = (toast.error as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.some(([title, body]) => title === "Failed to preview folder import" && String(body) === "Manifest scope mismatch")).toBe(true);
  });

  it("relays a successful previewImport result back to the caller", async () => {
    (desktopChatFolders.previewImport as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      preview: importPreview,
    });

    const preview = await useChatFolderStore
      .getState()
      .previewImport({ backupFilePath: "/tmp/import.vfbackup" });

    expect(preview).toEqual(importPreview);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("imports the folder backup and reloads the folder list", async () => {
    (desktopChatFolders.importBackup as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      folderId: "folder-restored",
    });
    (desktopChatFolders.list as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      folders: mockedFolders,
    });

    const res = await useChatFolderStore.getState().importFolderBackup({
      backupFilePath: "/tmp/import.vfbackup",
      mode: "merge",
      targetFolderId: "folder-1",
      passphrase: "strength-12-chars-min",
    });

    expect(res).toEqual({ ok: true, folderId: "folder-restored" });
    expect(desktopChatFolders.list).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Folder backup imported");
  });

  it("lockFolder returns structured failures so the UI can render backoff", async () => {
    (desktopChatFolders.lock as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: "Locked destinations must equal source",
    });

    const res = await useChatFolderStore.getState().lockFolder({
      folderId: "folder-1",
      passphrase: "strength-12-chars-min",
    });

    expect(res).toEqual({ ok: false, error: "Locked destinations must equal source" });
    // Lock failures do not toast success.
    expect(toast.success).not.toHaveBeenCalledWith("Folder locked");
  });

  it("lockFolder throws when the IPC layer rejects unexpectedly", async () => {
    (desktopChatFolders.lock as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("IPC channel closed"),
    );

    await expect(
      useChatFolderStore.getState().lockFolder({
        folderId: "folder-1",
        passphrase: "strength-12-chars-min",
      }),
    ).rejects.toThrow(/IPC channel closed/);
    const calls = (toast.error as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.some(([title, body]) => title === "Failed to lock folder" && String(body).includes("IPC channel closed"))).toBe(true);
  });

  it("unlockFolder passes through the structured retryAfter response", async () => {
    (desktopChatFolders.unlock as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: "Too many attempts",
      retryAfter: "2026-07-20T12:34:56Z",
    });
    (desktopChatFolders.getLockState as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      lockState: lockStateWithBackoff,
    });

    const res = await useChatFolderStore.getState().unlockFolder({
      folderId: "folder-1",
      passphrase: "hunter2hunter2hunter2hunter2hunter2hunter2",
    });

    expect(res).toEqual({
      ok: false,
      error: "Too many attempts",
      retryAfter: "2026-07-20T12:34:56Z",
    });
    expect(toast.success).not.toHaveBeenCalledWith("Folder unlocked");
  });

  it("getFolderLockState returns null when the bridge signals failure", async () => {
    (desktopChatFolders.getLockState as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: "Profile mismatch",
    });

    const state = await useChatFolderStore.getState().getFolderLockState("folder-1");

    expect(state).toBeNull();
  });

  it("getFolderLockState returns the lock state on success", async () => {
    (desktopChatFolders.getLockState as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      lockState: lockStateLocked,
    });

    const state = await useChatFolderStore.getState().getFolderLockState("folder-1");

    expect(state).toEqual(lockStateLocked);
  });

  // VERIFY-PHASE-1.6: kind-filtered load and standard/character selectors.
  it("loadFolders('standard') keeps character folders from a prior load in the cache", async () => {
    const mergedFolders = [...mockedCharacterFolders, ...mockedStandardFolders].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    (desktopChatFolders.list as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      folders: mergedFolders,
    });

    // First load: unfiltered -> the cache contains both kinds.
    await useChatFolderStore.getState().loadFolders();
    const stateAfterFirst = useChatFolderStore.getState();
    expect(selectStandardFolders(stateAfterFirst).map((f) => f.id)).toEqual(["std-1", "std-2"]);
    expect(selectCharacterFolders(stateAfterFirst).map((f) => f.id)).toEqual(["char-1"]);

    // Second load filtered to 'standard' must not drop character folders.
    (desktopChatFolders.list as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      folders: mockedStandardFolders,
    });
    await useChatFolderStore.getState().loadFolders("standard");
    const stateAfterSecond = useChatFolderStore.getState();
    expect(selectStandardFolders(stateAfterSecond).map((f) => f.id)).toEqual(["std-1", "std-2"]);
    expect(selectCharacterFolders(stateAfterSecond).map((f) => f.id)).toEqual(["char-1"]);
  });

  it("selectStandardFolders and selectCharacterFolders return empty arrays when no folders match", () => {
    useChatFolderStore.setState({ folders: [], isLoaded: false, isLoading: false });
    const state = useChatFolderStore.getState();
    expect(selectStandardFolders(state)).toEqual([]);
    expect(selectCharacterFolders(state)).toEqual([]);
  });

  it("selectStandardFolders and selectCharacterFolders return sorted results, ignoring the wrong kind", () => {
    useChatFolderStore.setState({
      folders: [
        { ...mockedStandardFolders[1], sortOrder: 3 },
        mockedCharacterFolders[0],
        { ...mockedStandardFolders[0], sortOrder: 1 },
      ],
      isLoaded: true,
      isLoading: false,
    });
    const state = useChatFolderStore.getState();
    expect(selectStandardFolders(state).map((f) => f.sortOrder)).toEqual([1, 3]);
    expect(selectCharacterFolders(state).map((f) => f.sortOrder)).toEqual([1]);
  });

  // VERIFY-FOLDER-LOCK-SHORTCIRCUIT: client-side lock pre-check on moveConversation / moveConversations.
  it("moveConversation short-circuits to a toast when the cached destination folder is locked", async () => {
    useChatFolderStore.setState({
      folders: [
        {
          id: "folder-locked",
          name: "Vault",
          kind: "standard",
          sortOrder: 1,
          createdAt: "2026-07-01T00:00:00Z",
          updatedAt: "2026-07-01T00:00:00Z",
          lockState: "locked",
        },
      ],
    });

    await expect(
      useChatFolderStore.getState().moveConversation("conv-1", "folder-locked"),
    ).rejects.toThrow(/Folder is locked/);

    expect(desktopChatFolders.moveConversation).not.toHaveBeenCalled();
    const errorCalls = (toast.error as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(errorCalls.some(([title]) => title === "Folder is locked")).toBe(true);
  });

  it("moveConversation falls through to IPC when the cached folders[] has no entry for the destination", async () => {
    (desktopChatFolders.moveConversation as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
    });

    await expect(
      useChatFolderStore.getState().moveConversation("conv-1", "folder-cold"),
    ).resolves.toBeUndefined();

    expect(desktopChatFolders.moveConversation).toHaveBeenCalledWith({
      conversationId: "conv-1",
      folderId: "folder-cold",
    });
  });

  it("moveConversation calls IPC when the cached destination folder is unlocked", async () => {
    useChatFolderStore.setState({
      folders: [
        {
          id: "folder-open",
          name: "Open",
          kind: "standard",
          sortOrder: 1,
          createdAt: "2026-07-01T00:00:00Z",
          updatedAt: "2026-07-01T00:00:00Z",
          lockState: "unlocked",
        },
      ],
    });
    (desktopChatFolders.moveConversation as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
    });

    await expect(
      useChatFolderStore.getState().moveConversation("conv-1", "folder-open"),
    ).resolves.toBeUndefined();

    expect(desktopChatFolders.moveConversation).toHaveBeenCalledWith({
      conversationId: "conv-1",
      folderId: "folder-open",
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("moveConversations short-circuits the bulk loop when the destination folder is locked", async () => {
    useChatFolderStore.setState({
      folders: [
        {
          id: "folder-locked",
          name: "Vault",
          kind: "standard",
          sortOrder: 1,
          createdAt: "2026-07-01T00:00:00Z",
          updatedAt: "2026-07-01T00:00:00Z",
          lockState: "locked",
        },
      ],
    });

    await expect(
      useChatFolderStore.getState().moveConversations(["c1", "c2"], "folder-locked"),
    ).rejects.toThrow(/Folder is locked/);

    expect(desktopChatFolders.moveConversation).not.toHaveBeenCalled();
  });
});
