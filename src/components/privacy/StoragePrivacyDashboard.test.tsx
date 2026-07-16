// VERIFY-056 + VERIFY-131 regression guards
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StoragePrivacyDashboard, mapPrivacyCategoryToTab } from "./StoragePrivacyDashboard";
import { useStoragePrivacyStore, type StoragePrivacyState } from "../../stores/storage-privacy-store";
import type { StorageInventoryResult, StorageMaintenancePlan, StoragePrivacyCategory } from "../../types/storage-privacy";

// Mock the store
vi.mock("../../stores/storage-privacy-store", () => ({
  useStoragePrivacyStore: vi.fn(),
}));

function mockStore(partial: Partial<StoragePrivacyState>) {
  const full: StoragePrivacyState = {
    inventory: null,
    maintenancePlan: null,
    hydrated: true,
    refreshing: false,
    error: null,
    lastRefreshedAt: null,
    refreshInventory: vi.fn(),
    copySafeSummary: vi.fn(),
    exportSafeSummary: vi.fn(),
    runMaintenanceAction: vi.fn(),
    clear: vi.fn(),
    ...partial,
  };
  vi.mocked(useStoragePrivacyStore).mockReturnValue(full);
}

const setActiveTab = vi.fn();
vi.mock("../../stores/settings-store", () => ({
  useSettingsStore: vi.fn((selector?: (state: { setActiveTab: typeof setActiveTab }) => unknown) =>
    selector ? selector({ setActiveTab }) : { setActiveTab }
  ),
}));

describe("StoragePrivacyDashboard", () => {
  const mockInventory = {
    stores: [
      { id: "projects", label: "Projects", category: "projects" as StoragePrivacyCategory, count: 2, encrypted: true, severity: "ok" as const, summary: "2 items", storeName: "projects", exportableInSafeSummary: true, containsUserContent: true, containsSecrets: false },
      { id: "api_keys", label: "API Keys", category: "api_keys" as StoragePrivacyCategory, count: 1, encrypted: true, severity: "ok" as const, summary: "Keys present", storeName: "settings", exportableInSafeSummary: false, containsUserContent: false, containsSecrets: true },
    ],
    issues: [],
    generatedAt: new Date().toISOString(),
  } satisfies StorageInventoryResult;

  const mockMaintenancePlan = {
    version: 1 as const,
    generatedAt: new Date().toISOString(),
    actions: [
      { id: "refresh", label: "Refresh Inventory", description: "Recount", destructive: false, requiresConfirmation: false, affectedCategories: [] as StoragePrivacyCategory[], dryRunOnly: false },
    ],
    issues: [],
    warnings: [],
  } satisfies StorageMaintenancePlan;

  beforeEach(() => {
    mockStore({ inventory: mockInventory, maintenancePlan: mockMaintenancePlan });
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
    mockStore({ inventory: null, maintenancePlan: null, refreshInventory });
    render(<StoragePrivacyDashboard />);
    expect(refreshInventory).toHaveBeenCalled();
  });

  it("renders a visible loading spinner with a contrasting top border", () => {
    mockStore({ inventory: null, maintenancePlan: null });
    render(<StoragePrivacyDashboard />);
    const spinner = document.querySelector('[data-testid="privacy-loading"] .animate-spin');
    expect(spinner).not.toBeNull();
    expect(spinner?.className).toContain("border-t-accent");
  });

  it("calls runMaintenanceAction when button is clicked", () => {
    const runMaintenanceAction = vi.fn();
    mockStore({ inventory: mockInventory, maintenancePlan: mockMaintenancePlan, runMaintenanceAction });
    render(<StoragePrivacyDashboard />);
    const runBtn = screen.getByText("Run Action");
    fireEvent.click(runBtn);
    expect(runMaintenanceAction).toHaveBeenCalledWith("refresh");
  });

  it("maps privacy categories to canonical tab ids", () => {
    expect(mapPrivacyCategoryToTab("conversations")).toBe("history");
    expect(mapPrivacyCategoryToTab("media")).toBe("media");
    expect(mapPrivacyCategoryToTab("prompts")).toBe("prompts");
    expect(mapPrivacyCategoryToTab("scenes")).toBe("scenes");
    expect(mapPrivacyCategoryToTab("rp")).toBe("rp-studio");
    expect(mapPrivacyCategoryToTab("workflows")).toBe("workflows");
    expect(mapPrivacyCategoryToTab("settings")).toBe("settings");
    expect(mapPrivacyCategoryToTab("api_keys")).toBe("settings");
    expect(mapPrivacyCategoryToTab("diagnostics")).toBe("status");
    expect(mapPrivacyCategoryToTab("projects")).toBe("settings");
    expect(mapPrivacyCategoryToTab("cache")).toBe("privacy");
    expect(mapPrivacyCategoryToTab("unknown")).toBe("privacy");
  });

  it("navigates to the mapped tab when a repairable issue Review button is clicked", () => {
    const inventoryWithIssue = {
      ...mockInventory,
      issues: [
        {
          id: "issue-1",
          severity: "warn" as const,
          sourceCategory: "media" as StoragePrivacyCategory,
          targetCategory: "projects" as StoragePrivacyCategory,
          message: "Orphaned media reference",
          repairable: true,
        },
      ],
    };
    mockStore({ inventory: inventoryWithIssue, maintenancePlan: mockMaintenancePlan });
    render(<StoragePrivacyDashboard />);
    const reviewBtn = screen.getByText("Review");
    fireEvent.click(reviewBtn);
    expect(setActiveTab).toHaveBeenCalledWith("media");
  });
});

// VERIFY-131 — P1 #8 dashboard wording rewrite (false "never" claim replaced with truth table)
describe("StoragePrivacyDashboard VERIFY-131 privacy exclusions truth table", () => {
  beforeEach(() => {
    mockStore({
      inventory: {
        stores: [],
        issues: [],
        generatedAt: new Date().toISOString(),
      } satisfies StorageInventoryResult,
      maintenancePlan: {
        version: 1 as const,
        generatedAt: new Date().toISOString(),
        actions: [],
        issues: [],
        warnings: [],
      } satisfies StorageMaintenancePlan,
    });
  });

  it("does not advertise the false 'never' wording (P1 #8)", () => {
    render(<StoragePrivacyDashboard />);
    // The old badge copy claimed prompts/history/media "strictly local and never included" — that wording must be gone.
    expect(screen.queryByText(/strictly local/i)).toBeNull();
    expect(screen.queryByText(/never\s+included\s+in\s+safe\s+summaries/i)).toBeNull();
  });

  it("renders a 4-row privacy-exclusions truth table", () => {
    render(<StoragePrivacyDashboard />);
    const section = screen.getByTestId("privacy-exclusions-section");
    expect(section).toBeTruthy();
    const rowsContainer = screen.getByTestId("privacy-exclusions-rows");
    expect(rowsContainer.children.length).toBe(4);
    expect(rowsContainer.textContent).toContain("Safe privacy summary");
    expect(rowsContainer.textContent).toContain("Safe diagnostics JSON");
    expect(rowsContainer.textContent).toContain("Encrypted backup");
    expect(rowsContainer.textContent).toContain("Sync folder");
  });

  it('marks media blobs as "Opt-in only" for backup and sync rows', () => {
    render(<StoragePrivacyDashboard />);
    const optInBadges = screen.getAllByText("Opt-in only");
    expect(optInBadges.length).toBeGreaterThanOrEqual(2);
  });

  it('marks safe-summary and safe-diagnostics surfaces as "Always redacted" for every column (P1 #8)', () => {
    render(<StoragePrivacyDashboard />);
    // Safe privacy summary (4 cols) + Safe diagnostics JSON (4 cols) = 8 "Always redacted" badges.
    const alwaysRedacted = screen.getAllByText("Always redacted");
    expect(alwaysRedacted.length).toBeGreaterThanOrEqual(8);
  });
});
