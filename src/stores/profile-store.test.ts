// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useProfileStore } from "./profile-store";

vi.mock("../services/desktopBridge", () => ({
  isElectron: vi.fn(() => false),
  desktopProfilePassword: {
    set: vi.fn(),
    verify: vi.fn(),
    clear: vi.fn(),
    isSet: vi.fn(),
  },
  desktopApiKey: { delete: vi.fn(() => Promise.resolve({ ok: true })) },
  desktopJinaApiKey: { delete: vi.fn(() => Promise.resolve({ ok: true })) },
}));

vi.mock("../services/profilePurge", () => ({
  purgeProfileData: vi.fn(() => Promise.resolve({
    profileId: "",
    veniceApiKeyRemoved: true,
    jinaApiKeyRemoved: true,
    passwordRemoved: true,
    localStorageKeysRemoved: 1,
    indexedDBStoresScanned: 1,
  })),
}));

import { isElectron, desktopProfilePassword } from "../services/desktopBridge";
import { purgeProfileData } from "../services/profilePurge";

describe("useProfileStore", () => {
  let reloadFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reloadFn = vi.fn();
    vi.stubGlobal("location", { reload: reloadFn });
    useProfileStore.setState({
      profiles: [{ id: "default", name: "Default", onboardingCompleted: false }],
      activeProfileId: "default",
      masterPasswordSet: false,
      globalOnboardingCompleted: false,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects invalid profile ids when adding a profile", () => {
    expect(() => useProfileStore.getState().addProfile("Work", "bad_id")).toThrow(/Invalid profile id/);
    expect(() => useProfileStore.getState().addProfile("Default", "default")).toThrow(/reserved/);
  });

  it("generates a valid id when adding a profile without an explicit id", () => {
    const profile = useProfileStore.getState().addProfile("Work");
    expect(profile.id).toMatch(/^[a-z0-9-]+$/);
    expect(profile.id).not.toContain("_");
    expect(profile.id).not.toContain(":");
    expect(useProfileStore.getState().profiles).toContainEqual(profile);
  });

  it("switches to an unprotected profile without a password", async () => {
    useProfileStore.setState({
      profiles: [
        { id: "default", name: "Default", onboardingCompleted: false },
        { id: "work", name: "Work", onboardingCompleted: false },
      ],
    });
    const result = await useProfileStore.getState().requestSwitchProfile("work");
    expect(result.ok).toBe(true);
    expect(reloadFn).toHaveBeenCalled();
  });

  it("does not switch to a password-protected profile without verification", async () => {
    vi.mocked(isElectron).mockReturnValue(true);
    vi.mocked(desktopProfilePassword.verify).mockResolvedValue({ ok: true, verified: false, lockedOutSeconds: 0 });

    useProfileStore.setState({
      profiles: [
        { id: "default", name: "Default", onboardingCompleted: false },
        { id: "work", name: "Work", onboardingCompleted: false, hasPassword: true },
      ],
    });

    const result = await useProfileStore.getState().requestSwitchProfile("work");
    expect(result.ok).toBe(false);
    expect(reloadFn).not.toHaveBeenCalled();
  });

  it("switches to a password-protected profile after successful verification", async () => {
    vi.mocked(isElectron).mockReturnValue(true);
    vi.mocked(desktopProfilePassword.verify).mockResolvedValue({ ok: true, verified: true, lockedOutSeconds: 0 });

    useProfileStore.setState({
      profiles: [
        { id: "default", name: "Default", onboardingCompleted: false },
        { id: "work", name: "Work", onboardingCompleted: false, hasPassword: true },
      ],
    });

    const result = await useProfileStore.getState().requestSwitchProfile("work", "correct");
    expect(result.ok).toBe(true);
    expect(desktopProfilePassword.verify).toHaveBeenCalledWith("work", "correct");
    expect(reloadFn).toHaveBeenCalled();
  });

  it("purges data and removes metadata when deleting a profile", async () => {
    useProfileStore.setState({
      profiles: [
        { id: "default", name: "Default", onboardingCompleted: false },
        { id: "work", name: "Work", onboardingCompleted: false },
      ],
      activeProfileId: "default",
    });

    await useProfileStore.getState().deleteProfile("work");

    expect(purgeProfileData).toHaveBeenCalledWith("work");
    expect(useProfileStore.getState().profiles).toHaveLength(1);
    expect(useProfileStore.getState().profiles[0].id).toBe("default");
  });

  it("switches to default and reloads when deleting the active profile", async () => {
    useProfileStore.setState({
      profiles: [
        { id: "default", name: "Default", onboardingCompleted: false },
        { id: "work", name: "Work", onboardingCompleted: false },
      ],
      activeProfileId: "work",
    });

    await useProfileStore.getState().deleteProfile("work");
    // The reload is scheduled via setTimeout(0); flush the macrotask queue
    // before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useProfileStore.getState().activeProfileId).toBe("default");
    expect(reloadFn).toHaveBeenCalled();
  });

});
