// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  const switchProfile = vi.fn();
  const updateProfile = vi.fn();
  const deleteProfile = vi.fn();
  const setMasterPasswordSet = vi.fn();

  beforeEach(() => {
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
      switchProfile,
      updateProfile,
      deleteProfile,
      setMasterPasswordSet,
    });
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
    render(<ProfilePanel />);

    await userEvent.click(screen.getByRole("button", { name: /Switch to Work/i }));
    await userEvent.type(screen.getByLabelText("Unlock password"), "correct-pass");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() => {
      expect(desktopProfilePassword.verify).toHaveBeenCalledWith("work", "correct-pass");
    });
    expect(switchProfile).toHaveBeenCalledWith("work");
  });

  it("clears the unlock input and does not switch after a failed unlock", async () => {
    vi.mocked(desktopProfilePassword.verify).mockResolvedValueOnce({ ok: true, verified: false });

    render(<ProfilePanel />);

    await userEvent.click(screen.getByRole("button", { name: /Switch to Work/i }));
    const input = screen.getByLabelText("Unlock password");
    await userEvent.type(input, "wrong-pass");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() => {
      expect(screen.getByText("Incorrect password")).toBeInTheDocument();
    });
    expect(switchProfile).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Unlock password")).toHaveValue("");
  });
});
