// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { purgeProfileData } from "./profilePurge";

vi.mock("./desktopBridge", () => ({
  desktopApiKey: { delete: vi.fn(() => Promise.resolve({ ok: true })) },
  desktopJinaApiKey: { delete: vi.fn(() => Promise.resolve({ ok: true })) },
  desktopProfilePassword: { clear: vi.fn(() => Promise.resolve({ ok: true })) },
}));

vi.mock("./storageService", () => ({
  default: {
    deleteRecordsForProfile: vi.fn(() => Promise.resolve(1)),
  },
}));

import { desktopApiKey, desktopJinaApiKey, desktopProfilePassword } from "./desktopBridge";
import StorageService from "./storageService";

describe("purgeProfileData", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("does not purge the default profile", async () => {
    const result = await purgeProfileData("default");
    expect(result.localStorageKeysRemoved).toBe(0);
    expect(result.indexedDBStoresScanned).toBe(0);
    expect(desktopApiKey.delete).not.toHaveBeenCalled();
  });

  it("removes secure credentials, localStorage keys, and IndexedDB records for a profile", async () => {
    localStorage.setItem("venice-settings_work", "{}")
    localStorage.setItem("other_work", "x");
    localStorage.setItem("venice-active-profile-id", "default");

    const result = await purgeProfileData("work");

    expect(desktopApiKey.delete).toHaveBeenCalledWith("work");
    expect(desktopJinaApiKey.delete).toHaveBeenCalledWith("work");
    expect(desktopProfilePassword.clear).toHaveBeenCalledWith("work");
    expect(StorageService.deleteRecordsForProfile).toHaveBeenCalledWith("work");

    expect(localStorage.getItem("venice-settings_work")).toBeNull();
    expect(localStorage.getItem("other_work")).toBeNull();
    expect(localStorage.getItem("venice-active-profile-id")).toBe("default");
    expect(result.localStorageKeysRemoved).toBeGreaterThanOrEqual(2);
    expect(result.indexedDBStoresScanned).toBe(1);
  });
});
