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
  const addProfile = vi.fn();
  const requestSwitchProfile = vi.fn();
  const updateProfile = vi.fn();
  const deleteProfile = vi.fn();
  const setMasterPasswordSet = vi.fn();
  let reloadFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reloadFn = vi.fn();
    vi.stubGlobal("location", { reload: reloadFn });
    vi.clearAllMocks();
    vi.mocked(isElectron).mockReturnValue(true);
    vi.mocked(desktopProfilePassword.set).mockResolvedValue({ ok: true });
    vi.mocked(desktopProfilePassword.verify).mockResolvedValue({ ok: true, verified: true });
    vi.mocked(desktopProfilePassword.clear).mockResolvedValue({ ok: true });
    vi.mocked(desktopProfilePassword.isSet).mockImplementation(async (profileId) => profileId === "work");
    useProfileStore.setState({
      profiles: [
        { id: "default", name: "Default Profile", onboardingCompleted: false },
        { id: "work", name: "Work", onboardingCompleted: false, hasPassword: true },
      ],
      activeProfileId: "default",
      masterPasswordSet: false,
      globalOnboardingCompleted: false,
      setGlobalOnboardingCompleted: vi.fn(),
      addProfile,
      requestSwitchProfile,
      updateProfile,
      deleteProfile,
      setMasterPasswordSet,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sets a profile password through the secure bridge and marks the profile locked", async () => {
    render(<ProfilePanel />);

    await userEvent.click(screen.getByRole("button", { name: /Set password for Default Profile/i }));
    await userEvent.type(screen.getByLabelText("Profile password"), "secret-pass");
    await userEvent.type(screen.getByLabelText("Confirm profile password"), "secret-pass");
    await userEvent.click(screen.getByRole("button", { name: "Save Password" }));

    await waitFor(() => {
      expect(desktopProfilePassword.set).toHaveBeenCalledWith("default", "secret-pass");
    });
    expect(updateProfile).toHaveBeenCalledWith("default", { hasPassword: true });
    expect(screen.queryByLabelText("Profile password")).not.toBeInTheDocument();
  });

  it("requires a successful unlock before switching to a password-protected profile", async () => {
    requestSwitchProfile.mockResolvedValue({ ok: true });

    render(<ProfilePanel />);

    await userEvent.click(screen.getByRole("button", { name: /Switch to Work/i }));
    await userEvent.type(screen.getByLabelText("Unlock password"), "correct-pass");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() => {
      expect(requestSwitchProfile).toHaveBeenCalledWith("work", "correct-pass");
    });
  });

  it("clears the unlock input and does not switch after a failed unlock", async () => {
    requestSwitchProfile.mockResolvedValue({ ok: false, error: "Incorrect password" });

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
