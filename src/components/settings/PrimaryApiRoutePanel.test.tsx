import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { PrimaryApiRoutePanel } from "./PrimaryApiRoutePanel";
import { useSettingsStore } from "../../stores/settings-store";
import { FRATERNA_DOCS_URL } from "../../shared/primaryApiRoute";

const updateMock = vi.hoisted(() => vi.fn());
const getMock = vi.hoisted(() => vi.fn());
const isElectronMock = vi.hoisted(() => vi.fn());

vi.mock("../../services/desktopBridge", () => ({
  isElectron: isElectronMock,
  desktopProviderSettings: {
    update: updateMock,
    get: getMock,
  },
}));

describe("PrimaryApiRoutePanel (FRAT-AUD-005, FRAT-AUD-006, FRAT-AUD-007)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isElectronMock.mockReturnValue(true);
    useSettingsStore.setState({ primaryApiRoute: "venice" });
    updateMock.mockResolvedValue({ ok: true });
    getMock.mockResolvedValue({ primaryApiRoute: "venice" });
  });

  it("renders with Venice as the default selected route", () => {
    render(<PrimaryApiRoutePanel />);
    const select = screen.getByRole("combobox", {
      name: /select primary api route/i,
    }) as HTMLSelectElement;
    expect(select.value).toBe("venice");
    expect(
      screen.getByRole("heading", { level: 3, name: /primary api route/i }),
    ).toBeInTheDocument();
  });

  it("renders safe external link to Fraterna documentation", () => {
    render(<PrimaryApiRoutePanel />);
    const link = screen.getByRole("link", {
      name: /fraterna documentation/i,
    });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", FRATERNA_DOCS_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("updates route and store on successful selection change", async () => {
    updateMock.mockResolvedValueOnce({ ok: true });
    render(<PrimaryApiRoutePanel />);

    const select = screen.getByRole("combobox", {
      name: /select primary api route/i,
    });
    fireEvent.change(select, { target: { value: "fraterna" } });

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({ primaryApiRoute: "fraterna" });
    });
    expect(useSettingsStore.getState().primaryApiRoute).toBe("fraterna");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("handles { ok: false } from settings bridge and rehydrates previous route", async () => {
    updateMock.mockResolvedValueOnce({ ok: false });
    getMock.mockResolvedValueOnce({ primaryApiRoute: "venice" });
    render(<PrimaryApiRoutePanel />);

    const select = screen.getByRole("combobox", {
      name: /select primary api route/i,
    });
    fireEvent.change(select, { target: { value: "fraterna" } });

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({ primaryApiRoute: "fraterna" });
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/failed to update primary api route/i);
    expect(getMock).toHaveBeenCalled();
    expect(useSettingsStore.getState().primaryApiRoute).toBe("venice");
  });

  it("handles rejected IPC promise from settings bridge and rehydrates previous route", async () => {
    updateMock.mockRejectedValueOnce(new Error("IPC invocation timeout"));
    getMock.mockResolvedValueOnce({ primaryApiRoute: "venice" });
    render(<PrimaryApiRoutePanel />);

    const select = screen.getByRole("combobox", {
      name: /select primary api route/i,
    });
    fireEvent.change(select, { target: { value: "fraterna" } });

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({ primaryApiRoute: "fraterna" });
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/failed to update primary api route/i);
    expect(getMock).toHaveBeenCalled();
    expect(useSettingsStore.getState().primaryApiRoute).toBe("venice");
  });

  it("disables select control while save is pending and ignores subsequent change", async () => {
    let resolveUpdate: (val: { ok: boolean }) => void;
    updateMock.mockReturnValue(
      new Promise<{ ok: boolean }>((resolve) => {
        resolveUpdate = resolve;
      }),
    );

    render(<PrimaryApiRoutePanel />);
    const select = screen.getByRole("combobox", {
      name: /select primary api route/i,
    });

    fireEvent.change(select, { target: { value: "fraterna" } });
    expect(select).toBeDisabled();

    // Secondary change while pending is ignored
    fireEvent.change(select, { target: { value: "venice" } });
    expect(updateMock).toHaveBeenCalledTimes(1);

    // Resolve initial update
    resolveUpdate!({ ok: true });

    await waitFor(() => {
      expect(select).not.toBeDisabled();
    });
    expect(useSettingsStore.getState().primaryApiRoute).toBe("fraterna");
  });

  it("disables selector and displays web notice in web mode when showWebNotice is true", () => {
    isElectronMock.mockReturnValue(false);
    render(<PrimaryApiRoutePanel showWebNotice={true} />);

    const select = screen.getByRole("combobox", {
      name: /select primary api route/i,
    });
    expect(select).toBeDisabled();
    expect(
      screen.getByText(/configured per-profile in the desktop app/i),
    ).toBeInTheDocument();
  });

  it("omits web notice in web mode when showWebNotice is false", () => {
    isElectronMock.mockReturnValue(false);
    render(<PrimaryApiRoutePanel showWebNotice={false} />);

    const select = screen.getByRole("combobox", {
      name: /select primary api route/i,
    });
    expect(select).toBeDisabled();
    expect(
      screen.queryByText(/configured per-profile in the desktop app/i),
    ).not.toBeInTheDocument();
  });
});
