// @vitest-environment jsdom
// VERIFY-110 regression guard: destructive storage copy matches the IndexedDB-only action scope.
// VERIFY-123 regression guard: Replace All is desktop-only and routes through durable recovery orchestration.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const isElectron = vi.hoisted(() => vi.fn(() => false));
const importJsonString = vi.hoisted(() => vi.fn());
const previewBackup = vi.hoisted(() => vi.fn());
const parseAndImportBackup = vi.hoisted(() => vi.fn());
const replaceBackupWithRecovery = vi.hoisted(() => vi.fn());
const getLatestReplaceImportRecovery = vi.hoisted(() => vi.fn());
const restoreReplaceImportRecovery = vi.hoisted(() => vi.fn());

vi.mock("../../services/desktopBridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/desktopBridge")>();
  return {
    ...actual,
    isElectron,
    desktopFiles: { ...actual.desktopFiles, importJsonString },
  };
});
vi.mock("../../services/backupImportService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/backupImportService")>();
  return { ...actual, previewBackup, parseAndImportBackup };
});
vi.mock("../../services/replaceImportService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/replaceImportService")>();
  return {
    ...actual,
    replaceBackupWithRecovery,
    getLatestReplaceImportRecovery,
    restoreReplaceImportRecovery,
  };
});
vi.mock("../../services/chatStorage", () => ({ listConversations: vi.fn(async () => []) }));

import { DataStoragePanel } from "./DataStoragePanel";

const manifest = {
  version: 2,
  exportedAt: "2026-07-15T00:00:00.000Z",
  salt: "salt",
  iv: "iv",
  ciphertext: "ciphertext",
};
const plan = { totalRecords: 1, stores: [{ storeName: "conversations", records: 1, newRecords: 1, modifiedRecords: 0, conflicts: 0, identical: 0 }] };

describe("DataStoragePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isElectron.mockReturnValue(false);
    importJsonString.mockResolvedValue(JSON.stringify(manifest));
    previewBackup.mockResolvedValue(plan);
    parseAndImportBackup.mockResolvedValue({ recordsImported: 1, recordsSkipped: 0, tombstonesApplied: 0 });
    replaceBackupWithRecovery.mockResolvedValue({
      recordsImported: 1,
      recordsSkipped: 0,
      tombstonesApplied: 0,
      recovery: { id: "11111111-1111-4111-8111-111111111111", createdAt: "2026-07-15T00:01:00.000Z" },
    });
    getLatestReplaceImportRecovery.mockResolvedValue(null);
  });

  function renderPanel() {
    const clearAllHistory = vi.fn();
    render(
      <DataStoragePanel
        exportData={vi.fn()}
        clearLocalSettings={vi.fn()}
        clearAllHistory={clearAllHistory}
      />,
    );
    return { clearAllHistory };
  }

  it("labels the destructive history action as IndexedDB-only", () => {
    const { clearAllHistory } = renderPanel();

    expect(screen.queryByRole("button", { name: /clear all local history/i })).toBeNull();
    const button = screen.getByRole("button", { name: /clear indexeddb data/i });
    fireEvent.click(button);
    expect(clearAllHistory).toHaveBeenCalledTimes(1);
  });

  it("disables Replace All in web mode", async () => {
    renderPanel();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Backup Password"), "password");
    await user.click(screen.getByRole("button", { name: "Import Backup" }));
    await screen.findByText("Review Import Plan");
    await user.click(screen.getByRole("button", { name: /Replace All/ }));

    expect(screen.getByText("Replace Unavailable in Web Mode")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Confirm Import" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("routes desktop Replace All through verified recovery orchestration", async () => {
    isElectron.mockReturnValue(true);
    renderPanel();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Backup Password"), "password");
    await user.click(screen.getByRole("button", { name: "Import Backup" }));
    await screen.findByText("Review Import Plan");
    await user.click(screen.getByRole("button", { name: /Replace All/ }));
    expect(screen.getByText("Automatic Recovery Enabled")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Confirm Import" }));

    await waitFor(() => expect(replaceBackupWithRecovery).toHaveBeenCalledWith(manifest, "password"));
    expect(parseAndImportBackup).not.toHaveBeenCalled();
    expect(await screen.findByText("Pre-Replace Recovery")).toBeTruthy();
  });

  it("renders authenticated manifest metadata and structured warnings", async () => {
    previewBackup.mockResolvedValueOnce({
      ...plan,
      manifest: {
        version: 3,
        metadataVerified: true,
        appVersion: "2.1.2",
        exportedAt: "2026-07-15T01:00:00.000Z",
        sourceRuntime: "electron",
        sourceDeviceRef: "device-1",
        sourceProfileRef: "profile-abcd",
        algorithm: "XChaCha20-Poly1305",
        kdf: "Argon2id",
        keyVersion: 1,
        tombstoneCount: 2,
        embeddedBlobCount: 3,
        includesMedia: true,
        exclusions: ["credentials", "diagnostics"],
        payloadSha256: "a".repeat(64),
      },
      warnings: [{ code: "media-included", severity: "info", message: "This backup includes media records." }],
    });
    renderPanel();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Backup Password"), "password");
    await user.click(screen.getByRole("button", { name: "Import Backup" }));

    expect(await screen.findByText("Authenticated Backup Metadata")).toBeTruthy();
    expect(screen.getByText(/XChaCha20-Poly1305.*Argon2id/)).toBeTruthy();
    expect(screen.getByText(/2 tombstones.*3 embedded blobs/)).toBeTruthy();
    expect(screen.getByText("This backup includes media records.")).toBeTruthy();
  });
});
