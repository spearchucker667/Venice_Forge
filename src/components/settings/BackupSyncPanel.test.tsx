// VERIFY-087 regression guard: BackupSyncPanel reads status correctly and writes sync folder to settings store.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BackupSyncPanel } from "./BackupSyncPanel";
import * as desktopBridge from "../../services/desktopBridge";
import { useSettingsStore } from "../../stores/settings-store";

vi.mock("../../services/desktopBridge", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../services/desktopBridge")>();
  return {
    ...mod,
    isElectron: vi.fn(),
    desktopSync: {
      getSyncFolder: vi.fn(),
      chooseSyncFolder: vi.fn(),
      startSync: vi.fn(),
      pauseSync: vi.fn(),
      getStatus: vi.fn(),
    },
  };
});

const mockIsElectron = vi.mocked(desktopBridge.isElectron);
const mockGetSyncFolder = vi.mocked(desktopBridge.desktopSync.getSyncFolder);
const mockChooseSyncFolder = vi.mocked(desktopBridge.desktopSync.chooseSyncFolder);
const mockStartSync = vi.mocked(desktopBridge.desktopSync.startSync);
const mockPauseSync = vi.mocked(desktopBridge.desktopSync.pauseSync);

describe("BackupSyncPanel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockIsElectron.mockReturnValue(true);
    mockGetSyncFolder.mockResolvedValue({ ok: true, path: "/sync", status: "stopped", configured: true });
    mockChooseSyncFolder.mockResolvedValue({ ok: true, path: "/new-sync" });
    mockStartSync.mockResolvedValue({ ok: true });
    mockPauseSync.mockResolvedValue({ ok: true });
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
});
