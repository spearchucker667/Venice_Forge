// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { ProfilePanel } from "./ProfilePanel";
import { useProfileStore } from "../../stores/profile-store";
import { desktopProfilePassword, isElectron } from "../../services/desktopBridge";

vi.mock("../../services/desktopBridge", () => ({
  isElectron: vi.fn(() => true),
  desktopProfilePassword: {
    activate: vi.fn(() => Promise.resolve({ ok: true, verified: true, profileId: "default" })),
    set: vi.fn(),
    verify: vi.fn(),
    clear: vi.fn(),
    isSet: vi.fn(),
  },
}));

vi.mock("../ui/modal-requests", () => ({
  askDecision: vi.fn(async () => true),
}));

describe("ProfilePanel profile password lock flow", () => {
  let reloadFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reloadFn = vi.fn();
    vi.stubGlobal("location", { reload: reloadFn });
    vi.clearAllMocks();
    vi.mocked(isElectron).mockReturnValue(true);
    vi.mocked(desktopProfilePassword.set).mockResolvedValue({ ok: true });
    vi.mocked(desktopProfilePassword.activate).mockResolvedValue({ ok: true, verified: true, profileId: "work" });
    vi.mocked(desktopProfilePassword.verify).mockResolvedValue({ ok: true, verified: true });
    vi.mocked(desktopProfilePassword.clear).mockResolvedValue({ ok: true });
    vi.mocked(desktopProfilePassword.isSet).mockImplementation(async (profileId) => profileId === "work");
    // Use the REAL store (no `updateProfile` mock) so the regression guard
    // catches the audit 2026-07-08 #6 bug where a mocked `updateProfile`
    // hid the `default` reserved-id throw from the production store.
    useProfileStore.setState({
      profiles: [
        { id: "default", name: "Default Profile", onboardingCompleted: false },
        { id: "work", name: "Work", onboardingCompleted: false, hasPassword: true },
        { id: "personal", name: "Personal", onboardingCompleted: false, hasPassword: false },
      ],
      activeProfileId: "default",
      masterPasswordSet: false,
      globalOnboardingCompleted: false,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not offer Set Password or Remove Password for the default profile (audit 2026-07-08 #2)", () => {
    render(<ProfilePanel />);

    // Default profile is the unprotected system fallback; lock options are hidden.
    expect(
      screen.queryByRole("button", { name: /Set password for Default Profile/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Remove password for Default Profile/i }),
    ).not.toBeInTheDocument();
  });

  it("clears an orphan default-profile verifier without updating reserved default metadata", async () => {
    vi.mocked(desktopProfilePassword.isSet).mockImplementation(async (profileId) => profileId === "default");
    const updateProfile = vi.spyOn(useProfileStore.getState(), "updateProfile");

    render(<ProfilePanel />);

    await waitFor(() => {
      expect(desktopProfilePassword.clear).toHaveBeenCalledWith("default");
    });
    expect(updateProfile).not.toHaveBeenCalledWith("default", expect.anything());
    expect(
      screen.queryByRole("button", { name: /Remove password for Default Profile/i }),
    ).not.toBeInTheDocument();
  });

  it("produces a store-level error when updateProfile is called for the reserved default id", () => {
    // Real store: confirms assertUserCreatableProfileId rejects "default"
    // — this is the regression guard the previous mock-based test hid.
    expect(() =>
      useProfileStore.getState().updateProfile("default", { hasPassword: true }),
    ).toThrow(/reserved/);
  });

  it("allows updateProfile metadata changes for non-default profiles", () => {
    expect(() =>
      useProfileStore.getState().updateProfile("work", { hasPassword: false }),
    ).not.toThrow();
    expect(useProfileStore.getState().profiles.find((p) => p.id === "work")?.hasPassword).toBe(false);
  });

  it("offers password and delete administration only for the active Electron profile", () => {
    useProfileStore.setState({ activeProfileId: "personal" });
    render(<ProfilePanel />);

    expect(screen.getByRole("button", { name: /Set password for Personal/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Delete Personal/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove password for Work/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete Work/i })).not.toBeInTheDocument();
  });

  it("sets the active non-default profile password through the secure bridge", async () => {
    useProfileStore.setState({ activeProfileId: "personal" });
    render(<ProfilePanel />);

    await userEvent.click(screen.getByRole("button", { name: /Set password for Personal/i }));
    await userEvent.type(screen.getByLabelText("Profile password"), "secret-pass");
    await userEvent.type(screen.getByLabelText("Confirm profile password"), "secret-pass");
    await userEvent.click(screen.getByRole("button", { name: "Save Password" }));

    await waitFor(() => {
      expect(desktopProfilePassword.set).toHaveBeenCalledWith("personal", "secret-pass");
    });
    expect(screen.queryByLabelText("Profile password")).not.toBeInTheDocument();
  });

  it("requires a successful unlock before switching to a password-protected profile", async () => {
    render(<ProfilePanel />);

    await userEvent.click(screen.getByRole("button", { name: /Switch to Work/i }));
    await userEvent.type(screen.getByLabelText("Unlock password"), "correct-pass");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() => {
      expect(desktopProfilePassword.activate).toHaveBeenCalledWith("work", "correct-pass");
    });
  });

  it("clears the unlock input and surfaces the error after a failed unlock", async () => {
    vi.mocked(desktopProfilePassword.activate).mockResolvedValue({
      ok: true,
      verified: false,
      lockedOutSeconds: 0,
      error: "Incorrect password",
    });

    render(<ProfilePanel />);

    await userEvent.click(screen.getByRole("button", { name: /Switch to Work/i }));
    const input = screen.getByLabelText("Unlock password");
    await userEvent.type(input, "wrong-pass");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() => {
      expect(screen.getByText("Incorrect password")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Unlock password")).toHaveValue("");
  });
});
