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
      setRendererSessionAttached: vi.fn(),
    },
  };
});

vi.mock("../../services/syncEngine", () => ({
  initSyncEngine: vi.fn(),
  pauseSyncEngine: vi.fn(),
  stopSyncEngine: vi.fn(),
  reattachSyncEngine: vi.fn(),
}));

const mockIsElectron = vi.mocked(desktopBridge.isElectron);
const mockGetSyncFolder = vi.mocked(desktopBridge.desktopSync.getSyncFolder);
const mockChooseSyncFolder = vi.mocked(desktopBridge.desktopSync.chooseSyncFolder);
const mockInitSyncEngine = vi.mocked(syncEngine.initSyncEngine);
const mockPauseSyncEngine = vi.mocked(syncEngine.pauseSyncEngine);
const mockReattachSyncEngine = vi.mocked(syncEngine.reattachSyncEngine);

describe("BackupSyncPanel", () => {
  function runtimeStatus(overrides: Partial<{
    mainWatcher: "stopped" | "paused" | "running" | "error";
    rendererSessionAttached: boolean;
    authenticated: boolean;
    configured: boolean;
    degradedReason?: string;
    includeMedia?: boolean;
  }> = {}) {
    return {
      ok: true as const,
      path: "/sync" as const,
      configured: overrides.configured ?? true,
      mainWatcher: overrides.mainWatcher ?? "stopped",
      rendererSessionAttached: overrides.rendererSessionAttached ?? false,
      authenticated: overrides.authenticated ?? false,
      degradedReason: overrides.degradedReason,
      includeMedia: overrides.includeMedia,
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    mockIsElectron.mockReturnValue(true);
    mockGetSyncFolder.mockResolvedValue(runtimeStatus());
    mockChooseSyncFolder.mockResolvedValue({ ok: true, path: "/new-sync" });
    mockInitSyncEngine.mockResolvedValue({ ok: true, status: "running" });
    mockPauseSyncEngine.mockResolvedValue({ ok: true, status: "paused" });
    mockReattachSyncEngine.mockResolvedValue({ ok: true, status: "running" });
    useSettingsStore.setState({ syncFolderPath: "", syncIncludeMedia: false });
  });

  it("shows active state when main watcher is running and renderer session is attached", async () => {
    mockGetSyncFolder.mockResolvedValue(runtimeStatus({ mainWatcher: "running", rendererSessionAttached: true, authenticated: true }));
    render(<BackupSyncPanel />);
    await waitFor(() => expect(screen.getByText("Active")).toBeTruthy());
  });

  it("shows paused state when folder exists but sync is not running", async () => {
    render(<BackupSyncPanel />);
    await waitFor(() => expect(screen.getByText("Paused")).toBeTruthy());
    expect(screen.getByText(/Argon2id-derived XChaCha20-Poly1305/)).toBeTruthy();
    expect(screen.queryByText(/All data is AES-256-GCM encrypted/)).toBeNull();
  });

  it("shows error state when main watcher reports an error", async () => {
    mockGetSyncFolder.mockResolvedValue(runtimeStatus({ mainWatcher: "error", degradedReason: "disk full" }));
    render(<BackupSyncPanel />);
    await waitFor(() => expect(screen.getByText("Error")).toBeTruthy());
    expect(screen.getByText(/disk full/)).toBeTruthy();
  });

  it("automatically reattaches renderer session when main watcher is running but detached", async () => {
    mockGetSyncFolder.mockResolvedValue(runtimeStatus({ mainWatcher: "running", rendererSessionAttached: false, authenticated: true }));
    render(<BackupSyncPanel />);
    await waitFor(() => expect(mockReattachSyncEngine).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Active")).toBeTruthy());
  });

  it("shows reattach button when automatic reattachment fails", async () => {
    mockGetSyncFolder.mockResolvedValue(runtimeStatus({ mainWatcher: "running", rendererSessionAttached: false, authenticated: true }));
    mockReattachSyncEngine.mockResolvedValue({ ok: false, status: "error", error: "Main process lost the passphrase." });
    render(<BackupSyncPanel />);
    await waitFor(() => expect(mockReattachSyncEngine).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Reattach Session")).toBeTruthy());
  });

  it("persists chosen folder to settings store", async () => {
    mockGetSyncFolder.mockResolvedValue({ ok: true, path: null, configured: false, mainWatcher: "stopped", rendererSessionAttached: false, authenticated: false });
    render(<BackupSyncPanel />);
    await waitFor(() => expect(screen.getByText("Choose Folder")).toBeTruthy());

    const user = userEvent.setup();
    await user.click(screen.getByText("Choose Folder"));

    await waitFor(() => {
      expect(useSettingsStore.getState().syncFolderPath).toBe("/new-sync");
    });
  });

  it("initializes the renderer sync engine when Start Sync is clicked", async () => {
    mockGetSyncFolder.mockResolvedValue(runtimeStatus({ mainWatcher: "stopped" }));
    render(<BackupSyncPanel />);
    await waitFor(() => expect(screen.getByText("Start Sync")).toBeTruthy());

    const input = screen.getByPlaceholderText("Enter Encryption Passphrase");
    const user = userEvent.setup();
    await user.type(input, "secret-passphrase");
    await user.click(screen.getByText("Start Sync"));

    await waitFor(() => {
      expect(mockInitSyncEngine).toHaveBeenCalledWith("secret-passphrase", false);
    });
    await waitFor(() => expect(screen.getByText("Active")).toBeTruthy());
  });

  it("forwards the media opt-in to the renderer sync engine when the user checks the box", async () => {
    mockGetSyncFolder.mockResolvedValue(runtimeStatus({ mainWatcher: "stopped" }));
    useSettingsStore.setState({ syncIncludeMedia: true });
    render(<BackupSyncPanel />);
    await waitFor(() => expect(screen.getByText("Start Sync")).toBeTruthy());

    const input = screen.getByPlaceholderText("Enter Encryption Passphrase");
    const user = userEvent.setup();
    await user.type(input, "secret-passphrase");
    await user.click(screen.getByText("Start Sync"));

    await waitFor(() => {
      expect(mockInitSyncEngine).toHaveBeenCalledWith("secret-passphrase", true);
    });
  });

  it("does not transition to active when sync engine initialization fails", async () => {
    mockGetSyncFolder.mockResolvedValue(runtimeStatus({ mainWatcher: "stopped" }));
    mockInitSyncEngine.mockResolvedValue({ ok: false, status: "error", error: "Main process refused to start." });
    render(<BackupSyncPanel />);
    await waitFor(() => expect(screen.getByText("Start Sync")).toBeTruthy());

    const input = screen.getByPlaceholderText("Enter Encryption Passphrase");
    const user = userEvent.setup();
    await user.type(input, "bad");
    await user.click(screen.getByText("Start Sync"));

    await waitFor(() => {
      expect(mockInitSyncEngine).toHaveBeenCalledWith("bad", false);
    });
    await waitFor(() => expect(screen.getByText("Error")).toBeTruthy());
    expect(screen.getByText(/Main process refused to start/)).toBeTruthy();
  });

  it("pauses via the renderer sync engine when Pause Sync is clicked", async () => {
    mockGetSyncFolder.mockResolvedValue(runtimeStatus({ mainWatcher: "running", rendererSessionAttached: true, authenticated: true }));
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
