// VERIFY-087 regression guard: BackupSyncPanel reads status correctly, writes sync folder to settings store,
// and initializes the renderer sync engine (not only the main-process watcher).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BackupSyncPanel } from "./BackupSyncPanel";
import * as desktopBridge from "../../services/desktopBridge";
import * as syncEngine from "../../services/syncEngine";
import { useSettingsStore } from "../../stores/settings-store";

vi.mock("../../services/desktopBridge", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../services/desktopBridge")>();
  return {
    ...mod,
    isElectron: vi.fn(),
    desktopSync: {
      getSyncFolder: vi.fn(),
      chooseSyncFolder: vi.fn(),
      pauseSync: vi.fn(),
      getStatus: vi.fn(),
    },
  };
});

vi.mock("../../services/syncEngine", () => ({
  initSyncEngine: vi.fn(),
  pauseSyncEngine: vi.fn(),
  stopSyncEngine: vi.fn(),
}));

const mockIsElectron = vi.mocked(desktopBridge.isElectron);
const mockGetSyncFolder = vi.mocked(desktopBridge.desktopSync.getSyncFolder);
const mockChooseSyncFolder = vi.mocked(desktopBridge.desktopSync.chooseSyncFolder);
const mockInitSyncEngine = vi.mocked(syncEngine.initSyncEngine);
const mockPauseSyncEngine = vi.mocked(syncEngine.pauseSyncEngine);

describe("BackupSyncPanel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockIsElectron.mockReturnValue(true);
    mockGetSyncFolder.mockResolvedValue({ ok: true, path: "/sync", status: "stopped", configured: true });
    mockChooseSyncFolder.mockResolvedValue({ ok: true, path: "/new-sync" });
    mockInitSyncEngine.mockResolvedValue({ ok: true, status: "running" });
    mockPauseSyncEngine.mockResolvedValue({ ok: true, status: "paused" });
    useSettingsStore.setState({ syncFolderPath: "" });
  });

  it("shows active state when status is running", async () => {
    mockGetSyncFolder.mockResolvedValue({ ok: true, path: "/sync", status: "running", configured: true });
    render(<BackupSyncPanel />);
    await waitFor(() => expect(screen.getByText("Active")).toBeTruthy());
  });

  it("shows paused state when folder exists but sync is not running", async () => {
    render(<BackupSyncPanel />);
    await waitFor(() => expect(screen.getByText("Paused")).toBeTruthy());
  });

  it("persists chosen folder to settings store", async () => {
    mockGetSyncFolder.mockResolvedValue({ ok: true, path: null, status: "stopped", configured: false });
    render(<BackupSyncPanel />);
    await waitFor(() => expect(screen.getByText("Choose Folder")).toBeTruthy());

    const user = userEvent.setup();
    await user.click(screen.getByText("Choose Folder"));

    await waitFor(() => {
      expect(useSettingsStore.getState().syncFolderPath).toBe("/new-sync");
    });
  });

  it("initializes the renderer sync engine when Start Sync is clicked", async () => {
    mockGetSyncFolder.mockResolvedValue({ ok: true, path: "/sync", status: "stopped", configured: true });
    render(<BackupSyncPanel />);
    await waitFor(() => expect(screen.getByText("Start Sync")).toBeTruthy());

    const input = screen.getByPlaceholderText("Enter Encryption Passphrase");
    const user = userEvent.setup();
    await user.type(input, "secret-passphrase");
    await user.click(screen.getByText("Start Sync"));

    await waitFor(() => {
      expect(mockInitSyncEngine).toHaveBeenCalledWith("secret-passphrase");
    });
    await waitFor(() => expect(screen.getByText("Active")).toBeTruthy());
  });

  it("does not transition to active when sync engine initialization fails", async () => {
    mockGetSyncFolder.mockResolvedValue({ ok: true, path: "/sync", status: "stopped", configured: true });
    mockInitSyncEngine.mockResolvedValue({ ok: false, status: "error", error: "Main process refused to start." });
    render(<BackupSyncPanel />);
    await waitFor(() => expect(screen.getByText("Start Sync")).toBeTruthy());

    const input = screen.getByPlaceholderText("Enter Encryption Passphrase");
    const user = userEvent.setup();
    await user.type(input, "bad");
    await user.click(screen.getByText("Start Sync"));

    await waitFor(() => {
      expect(mockInitSyncEngine).toHaveBeenCalledWith("bad");
    });
    // Status remains Paused because the error path returns before setIsSyncing(true).
    expect(screen.getByText("Paused")).toBeTruthy();
  });

  it("pauses via the renderer sync engine when Pause Sync is clicked", async () => {
    mockGetSyncFolder.mockResolvedValue({ ok: true, path: "/sync", status: "running", configured: true });
    render(<BackupSyncPanel />);
    await waitFor(() => expect(screen.getByText("Active")).toBeTruthy());

    const user = userEvent.setup();
    await user.click(screen.getByText("Pause Sync"));

    await waitFor(() => {
      expect(mockPauseSyncEngine).toHaveBeenCalled();
    });
    await waitFor(() => expect(screen.getByText("Paused")).toBeTruthy());
  });
});
