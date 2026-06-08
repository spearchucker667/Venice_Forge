import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StoragePrivacyDashboard } from "./StoragePrivacyDashboard";
import { useStoragePrivacyStore } from "../../stores/storage-privacy-store";

// Mock the store
vi.mock("../../stores/storage-privacy-store", () => ({
  useStoragePrivacyStore: vi.fn(),
}));

describe("StoragePrivacyDashboard", () => {
  const mockInventory = {
    stores: [
      { id: "projects", label: "Projects", category: "projects", count: 2, encrypted: true, severity: "ok", summary: "2 items", storeName: "projects", exportableInSafeSummary: true },
      { id: "api_keys", label: "API Keys", category: "api_keys", count: 1, encrypted: true, severity: "ok", summary: "Keys present", storeName: "settings", exportableInSafeSummary: false, containsSecrets: true },
    ],
    issues: [],
    generatedAt: new Date().toISOString(),
  };

  const mockMaintenancePlan = {
    actions: [
      { id: "refresh", label: "Refresh Inventory", description: "Recount", destructive: false, requiresConfirmation: false, affectedCategories: [] },
    ],
  };

  beforeEach(() => {
    (useStoragePrivacyStore as any).mockReturnValue({
      inventory: mockInventory,
      maintenancePlan: mockMaintenancePlan,
      refreshing: false,
      refreshInventory: vi.fn(),
      copySafeSummary: vi.fn(),
      exportSafeSummary: vi.fn(),
      runMaintenanceAction: vi.fn(),
    });
  });

  it("renders the dashboard with category counts", () => {
    render(<StoragePrivacyDashboard />);
    expect(screen.getAllByText("Projects").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("API Keys").length).toBeGreaterThan(0);
  });

  it("shows encrypted badges", () => {
    render(<StoragePrivacyDashboard />);
    const badges = screen.getAllByText("ENCRYPTED");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("calls refreshInventory on mount", () => {
    const refreshInventory = vi.fn();
    (useStoragePrivacyStore as any).mockReturnValue({
      inventory: null,
      maintenancePlan: null,
      refreshing: false,
      refreshInventory,
    });
    render(<StoragePrivacyDashboard />);
    expect(refreshInventory).toHaveBeenCalled();
  });

  it("calls runMaintenanceAction when button is clicked", () => {
    const runMaintenanceAction = vi.fn();
    (useStoragePrivacyStore as any).mockReturnValue({
      inventory: mockInventory,
      maintenancePlan: mockMaintenancePlan,
      refreshing: false,
      refreshInventory: vi.fn(),
      runMaintenanceAction,
    });
    render(<StoragePrivacyDashboard />);
    const runBtn = screen.getByText("Run Action");
    fireEvent.click(runBtn);
    expect(runMaintenanceAction).toHaveBeenCalledWith("refresh");
  });
});
