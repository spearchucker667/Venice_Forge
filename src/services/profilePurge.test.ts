// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { purgeProfileData } from "./profilePurge";

vi.mock("./desktopBridge", () => ({
  isElectron: vi.fn(() => false),
  desktopProfilePurge: { purge: vi.fn() },
  desktopApiKey: { delete: vi.fn(() => Promise.resolve({ ok: true })) },
  desktopJinaApiKey: { delete: vi.fn(() => Promise.resolve({ ok: true })) },
  desktopProviderApiKey: { delete: vi.fn(() => Promise.resolve({ ok: true })) },
  desktopProfilePassword: { clear: vi.fn(() => Promise.resolve({ ok: true })) },
  }));

vi.mock("./storageService", () => ({
  default: {
    deleteRecordsForProfile: vi.fn(() => Promise.resolve(1)),
  },
}));

import { desktopApiKey, desktopJinaApiKey, desktopProfilePassword, desktopProviderApiKey, desktopProfilePurge, isElectron } from "./desktopBridge";
import { PROVIDER_REGISTRY } from "../types/provider";
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
    expect(desktopProviderApiKey.delete).toHaveBeenCalledTimes(Object.keys(PROVIDER_REGISTRY).length);
    for (const providerId of Object.keys(PROVIDER_REGISTRY)) {
      expect(desktopProviderApiKey.delete).toHaveBeenCalledWith(providerId);
    }
    expect(desktopProfilePassword.clear).toHaveBeenCalledWith("work");
    expect(StorageService.deleteRecordsForProfile).toHaveBeenCalledWith("work");

    // Venice-owned keys are removed.
    expect(localStorage.getItem("venice-settings_work")).toBeNull();
    // Unrelated same-origin keys are NOT removed (security fix: only Venice-owned prefixes).
    expect(localStorage.getItem("other_work")).toBe("x");
    expect(localStorage.getItem("venice-active-profile-id")).toBe("default");
    expect(result.localStorageKeysRemoved).toBeGreaterThanOrEqual(1);
    expect(result.indexedDBStoresScanned).toBe(1);
    expect(result.providerApiKeysRemoved).toBe(Object.keys(PROVIDER_REGISTRY).length);
  });

  it("does not remove unrelated same-origin keys ending in the profile id", async () => {
    localStorage.setItem("thirdparty_work", "sensitive");
    localStorage.setItem("unrelated_work_suffix", "also-unrelated");

    await purgeProfileData("work");

    // These do not start with a Venice-owned prefix and must survive.
    expect(localStorage.getItem("thirdparty_work")).toBe("sensitive");
    expect(localStorage.getItem("unrelated_work_suffix")).toBe("also-unrelated");
  });

  it("uses the main-authoritative transaction in Electron mode", async () => {
    vi.mocked(isElectron).mockReturnValueOnce(true);
    vi.mocked(desktopProfilePurge.purge).mockResolvedValueOnce({
      ok: true,
      profileId: "work",
      steps: {
        conversationVault: { ok: true, removed: true },
        veniceApiKey: { ok: true },
        jinaApiKey: { ok: true },
        providerApiKeys: { ok: true, removed: 2 },
        passwordVerifier: { ok: true },
      },
    });

    const result = await purgeProfileData("work");
    expect(desktopProfilePurge.purge).toHaveBeenCalledWith("work");
    expect(result).toMatchObject({ mainProcessPurgeOk: true, providerApiKeysRemoved: 2 });
    expect(desktopApiKey.delete).not.toHaveBeenCalled();
    expect(desktopProviderApiKey.delete).not.toHaveBeenCalled();
  });
});
