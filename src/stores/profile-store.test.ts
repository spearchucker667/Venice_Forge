// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { activateRestoredProfileSession, useProfileStore } from "./profile-store";

vi.mock("../services/desktopBridge", () => ({
  isElectron: vi.fn(() => false),
  desktopMasterPassword: {
    isSet: vi.fn(() => Promise.resolve(false)),
  },
  desktopProfilePassword: {
    activate: vi.fn(),
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
    mainProcessPurgeOk: true,
  })),
}));

import { isElectron, desktopMasterPassword, desktopProfilePassword } from "../services/desktopBridge";
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
    vi.mocked(isElectron).mockReturnValue(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects invalid profile ids when adding a profile", () => {
    // VF-AUD-20260912-N7: addProfile now returns a Result for non-validation
    // failures (limit-reached). Programmer-error path (invalid id) still throws.
    expect(() => useProfileStore.getState().addProfile("Work", "bad_id")).toThrow(/Invalid profile id/);
    expect(() => useProfileStore.getState().addProfile("Default", "default")).toThrow(/reserved/);
  });

  it("generates a valid id when adding a profile without an explicit id", () => {
    const result = useProfileStore.getState().addProfile("Work");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const profile = result.profile;
    expect(profile.id).toMatch(/^[a-z0-9-]+$/);
    expect(profile.id).not.toContain("_");
    expect(profile.id).not.toContain(":");
    expect(useProfileStore.getState().profiles).toContainEqual(profile);
  });

  it("enforces maximum profile limit (VF-AUD-20260912-P3-004 / VF-AUD-20260912-N7)", () => {
    const maxProfiles = Array.from({ length: 20 }, (_, i) => ({
      id: i === 0 ? "default" : `prof-${i}`,
      name: `Profile ${i}`,
      onboardingCompleted: false,
    }));
    useProfileStore.setState({ profiles: maxProfiles });

    const result = useProfileStore.getState().addProfile("Overflow");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("limit-reached");
    expect(result.limit).toBe(20);
    expect(result.message).toMatch(/Maximum profile limit \(20\) reached/);
  });

  it("returns an empty-name Result instead of throwing (VF-AUD-20260912-N7)", () => {
    const result = useProfileStore.getState().addProfile("   ");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("empty-name");
    expect(result.message).toMatch(/empty/i);
  });

  it("switches to an unprotected profile without a password", async () => {
    vi.mocked(isElectron).mockReturnValue(true);
    vi.mocked(desktopProfilePassword.activate).mockResolvedValue({ ok: true, verified: true, profileId: "work" });
    useProfileStore.setState({
      profiles: [
        { id: "default", name: "Default", onboardingCompleted: false },
        { id: "work", name: "Work", onboardingCompleted: false },
      ],
    });
    const result = await useProfileStore.getState().requestSwitchProfile("work");
    expect(result.ok).toBe(true);
    expect(desktopProfilePassword.activate).toHaveBeenCalledWith("work", undefined);
    expect(reloadFn).toHaveBeenCalled();
  });

  it("reactivates an already-selected Electron profile in the main process", async () => {
    vi.mocked(isElectron).mockReturnValue(true);
    vi.mocked(desktopProfilePassword.activate).mockResolvedValue({ ok: true, verified: true, profileId: "work" });
    useProfileStore.setState({
      profiles: [
        { id: "default", name: "Default", onboardingCompleted: false },
        { id: "work", name: "Work", onboardingCompleted: false },
      ],
      activeProfileId: "work",
    });

    const result = await useProfileStore.getState().requestSwitchProfile("work");

    expect(result.ok).toBe(true);
    expect(desktopProfilePassword.activate).toHaveBeenCalledWith("work", undefined);
    expect(reloadFn).not.toHaveBeenCalled();
  });

  it("activates the restored profile before credential hydration can proceed", async () => {
    vi.mocked(isElectron).mockReturnValue(true);
    vi.mocked(desktopProfilePassword.activate).mockResolvedValue({ ok: true, verified: true, profileId: "work" });
    vi.mocked(desktopMasterPassword.isSet).mockResolvedValue(true);
    useProfileStore.setState({
      profiles: [
        { id: "default", name: "Default", onboardingCompleted: true },
        { id: "work", name: "Work", onboardingCompleted: true },
      ],
      activeProfileId: "work",
    });

    await activateRestoredProfileSession();

    expect(desktopProfilePassword.activate).toHaveBeenCalledWith("work");
    expect(desktopMasterPassword.isSet).toHaveBeenCalledTimes(1);
    expect(useProfileStore.getState().masterPasswordSet).toBe(true);
  });

  it("falls back to the default profile instead of auto-unlocking a protected restored profile", async () => {
    vi.mocked(isElectron).mockReturnValue(true);
    vi.mocked(desktopProfilePassword.activate).mockResolvedValue({ ok: true, verified: true, profileId: "default" });
    vi.mocked(desktopMasterPassword.isSet).mockResolvedValue(false);
    useProfileStore.setState({
      profiles: [
        { id: "default", name: "Default", onboardingCompleted: true },
        { id: "work", name: "Work", onboardingCompleted: true, hasPassword: true },
      ],
      activeProfileId: "work",
    });

    await activateRestoredProfileSession();

    expect(desktopProfilePassword.activate).toHaveBeenCalledWith("default");
    expect(desktopProfilePassword.activate).not.toHaveBeenCalledWith("work");
    expect(useProfileStore.getState().activeProfileId).toBe("default");
  });

  it("does not switch to a password-protected profile without verification", async () => {
    vi.mocked(isElectron).mockReturnValue(true);
    vi.mocked(desktopProfilePassword.activate).mockResolvedValue({ ok: true, verified: false, lockedOutSeconds: 0 });

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
    vi.mocked(desktopProfilePassword.activate).mockResolvedValue({ ok: true, verified: true, profileId: "work", lockedOutSeconds: 0 });

    useProfileStore.setState({
      profiles: [
        { id: "default", name: "Default", onboardingCompleted: false },
        { id: "work", name: "Work", onboardingCompleted: false, hasPassword: true },
      ],
    });

    const result = await useProfileStore.getState().requestSwitchProfile("work", "correct");
    expect(result.ok).toBe(true);
    expect(desktopProfilePassword.activate).toHaveBeenCalledWith("work", "correct");
    expect(reloadFn).toHaveBeenCalled();
  });

  it("purges data and removes metadata when deleting a profile", async () => {
    useProfileStore.setState({
      profiles: [
        { id: "default", name: "Default", onboardingCompleted: false },
        { id: "work", name: "Work", onboardingCompleted: false },
      ],
      activeProfileId: "work",
    });

    await useProfileStore.getState().deleteProfile("work");

    expect(purgeProfileData).toHaveBeenCalledWith("work");
    expect(useProfileStore.getState().profiles).toHaveLength(1);
    expect(useProfileStore.getState().profiles[0].id).toBe("default");
  });

  it("refuses to delete an inactive Electron profile before it is activated", async () => {
    vi.mocked(isElectron).mockReturnValue(true);
    useProfileStore.setState({
      profiles: [
        { id: "default", name: "Default", onboardingCompleted: false },
        { id: "work", name: "Work", onboardingCompleted: false },
      ],
      activeProfileId: "default",
    });

    await useProfileStore.getState().deleteProfile("work");

    expect(purgeProfileData).not.toHaveBeenCalled();
    expect(useProfileStore.getState().profiles.some((profile) => profile.id === "work")).toBe(true);
  });

  it("retains profile metadata when the main-process purge is partial", async () => {
    vi.mocked(isElectron).mockReturnValue(true);
    vi.mocked(purgeProfileData).mockResolvedValueOnce({ mainProcessPurgeOk: false } as never);
    useProfileStore.setState({
      profiles: [
        { id: "default", name: "Default", onboardingCompleted: false },
        { id: "work", name: "Work", onboardingCompleted: false },
      ],
      activeProfileId: "work",
    });

    const result = await useProfileStore.getState().deleteProfile("work");
    expect(result.ok).toBe(false);
    expect(useProfileStore.getState().profiles.some((profile) => profile.id === "work")).toBe(true);
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

// ------------------------------------------------------------------
// Persisted-hydration sanitization (P1-001 regression coverage).
// The store's `merge` option must reject malformed persisted state before
// it can become authoritative. These tests seed `venice-profiles` with
// hand-crafted JSON and drive the real persist rehydration path so the
// sanitizer is exercised end-to-end, not just via direct setState.
// ------------------------------------------------------------------
describe("useProfileStore hydration sanitization", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  function seedPersisted(payload: unknown): void {
    window.localStorage.setItem(
      "venice-profiles",
      JSON.stringify({ state: payload, version: 0 }),
    );
  }

  // Re-importing the store module re-evaluates `persist()` and runs the
  // `merge` callback against the value the test just seeded.
  async function rehydrateWithFreshStore(): Promise<void> {
    vi.resetModules();
    const mod = await import("./profile-store");
    // Force hydration to run by reading the initial state.
    void mod.useProfileStore.getState();
    // The merge callback runs synchronously during storage read, so the
    // sanitized state is already in the store by the time getState()
    // returns. Return the freshly imported bindings.
    mod.useProfileStore.setState({
      profiles: mod.useProfileStore.getState().profiles,
      activeProfileId: mod.useProfileStore.getState().activeProfileId,
    });
  }

  it("falls back to default when persisted state is not an object", async () => {
    seedPersisted("not-an-object");
    await rehydrateWithFreshStore();
    const { useProfileStore: store } = await import("./profile-store");
    expect(store.getState().activeProfileId).toBe("default");
    expect(store.getState().profiles.map((p) => p.id)).toEqual(["default"]);
  });

  it("preserves a valid multi-profile payload", async () => {
    seedPersisted({
      profiles: [
        { id: "default", name: "Default", onboardingCompleted: true },
        { id: "work", name: "Work" },
        { id: "play", name: "Play", hasPassword: true },
      ],
      activeProfileId: "play",
      globalOnboardingCompleted: true,
    });
    await rehydrateWithFreshStore();
    const { useProfileStore: store } = await import("./profile-store");
    expect(store.getState().activeProfileId).toBe("play");
    expect(store.getState().profiles).toHaveLength(3);
    expect(store.getState().globalOnboardingCompleted).toBe(true);
    const play = store.getState().profiles.find((p) => p.id === "play");
    expect(play?.hasPassword).toBe(true);
  });

  it("drops invalid profile ids and falls back activeProfileId to default", async () => {
    seedPersisted({
      profiles: [
        { id: "default", name: "Default" },
        { id: "bad_id", name: "Bad" },
        { id: "../etc", name: "Path" },
      ],
      activeProfileId: "bad_id",
    });
    await rehydrateWithFreshStore();
    const { useProfileStore: store } = await import("./profile-store");
    expect(store.getState().activeProfileId).toBe("default");
    expect(store.getState().profiles.map((p) => p.id)).toEqual(["default"]);
  });

  it("does not restore a non-boolean onboarding-completion value", async () => {
    seedPersisted({
      profiles: [{ id: "default", name: "Default" }],
      activeProfileId: "default",
      globalOnboardingCompleted: "true",
    });
    await rehydrateWithFreshStore();
    const { useProfileStore: store } = await import("./profile-store");
    expect(store.getState().globalOnboardingCompleted).toBe(false);
  });

  it("deduplicates duplicate profile ids and keeps the first occurrence", async () => {
    seedPersisted({
      profiles: [
        { id: "default", name: "Default" },
        { id: "work", name: "First" },
        { id: "work", name: "Second" },
        { id: "work", name: "Third" },
      ],
      activeProfileId: "work",
    });
    await rehydrateWithFreshStore();
    const { useProfileStore: store } = await import("./profile-store");
    const work = store.getState().profiles.find((p) => p.id === "work");
    expect(work?.name).toBe("First");
    expect(store.getState().activeProfileId).toBe("work");
  });

  it("re-adds the default profile when it is missing from a multi-profile payload", async () => {
    seedPersisted({
      profiles: [{ id: "work", name: "Work" }],
      activeProfileId: "work",
    });
    await rehydrateWithFreshStore();
    const { useProfileStore: store } = await import("./profile-store");
    expect(store.getState().profiles.map((p) => p.id)).toEqual([
      "default",
      "work",
    ]);
    expect(store.getState().activeProfileId).toBe("work");
  });

  it("rejects a forged activeProfileId that points to a non-existent profile", async () => {
    seedPersisted({
      profiles: [
        { id: "default", name: "Default" },
        { id: "work", name: "Work" },
      ],
      activeProfileId: "ghost",
    });
    await rehydrateWithFreshStore();
    const { useProfileStore: store } = await import("./profile-store");
    expect(store.getState().activeProfileId).toBe("default");
  });

  it("does not replace store methods with attacker-supplied functions", async () => {
    seedPersisted({
      profiles: [{ id: "default", name: "Default" }],
      activeProfileId: "default",
      addProfile: () => "forged",
      deleteProfile: () => "forged",
      requestSwitchProfile: () => "forged",
    });
    await rehydrateWithFreshStore();
    const { useProfileStore: store } = await import("./profile-store");
    expect(typeof store.getState().addProfile).toBe("function");
    // VF-AUD-20260912-N7: empty name returns an empty-name Result (no throw).
    const emptyResult = store.getState().addProfile("");
    expect(emptyResult.ok).toBe(false);
    if (!emptyResult.ok) expect(emptyResult.reason).toBe("empty-name");
  });

  it("never persists the active profile as a profile that is missing from the sanitized list", async () => {
    seedPersisted({
      profiles: [{ id: "default", name: "Default" }],
      activeProfileId: "missing-totally",
    });
    await rehydrateWithFreshStore();
    const { useProfileStore: store } = await import("./profile-store");
    const state = store.getState();
    expect(state.profiles.map((p) => p.id)).toContain(state.activeProfileId);
  });

  it("treats a corrupt JSON document as no persistence (default profile only)", async () => {
    window.localStorage.setItem("venice-profiles", "{not valid json");
    await rehydrateWithFreshStore();
    const { useProfileStore: store } = await import("./profile-store");
    expect(store.getState().activeProfileId).toBe("default");
    expect(store.getState().profiles.map((p) => p.id)).toEqual(["default"]);
  });
});
