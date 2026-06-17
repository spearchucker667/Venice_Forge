import { describe, it, expect } from "vitest";
import { type StorageStoreInventoryItem, type SafePrivacySummary, type StorageMaintenancePlan } from "./storage-privacy";
import { buildSafeApiKeyMetadata } from "./api-connectivity";

describe("Storage / Privacy Types", () => {
  it("can create a safe inventory item", () => {
    const item: StorageStoreInventoryItem = {
      id: "prompts",
      label: "Prompt Library",
      category: "prompts",
      count: 10,
      encrypted: true,
      containsSecrets: false,
      containsUserContent: true,
      exportableInSafeSummary: true,
      severity: "ok",
      summary: "10 prompts saved",
    };
    expect(item.id).toBe("prompts");
    expect(item.exportableInSafeSummary).toBe(true);
  });

  it("marks api_keys as non-exportable", () => {
    const item: StorageStoreInventoryItem = {
      id: "api_keys",
      label: "API Keys",
      category: "api_keys",
      encrypted: true,
      containsSecrets: true,
      containsUserContent: false,
      exportableInSafeSummary: false,
      severity: "ok",
      summary: "Keys present",
    };
    expect(item.exportableInSafeSummary).toBe(false);
  });

  it("can create a safe privacy summary", () => {
    const summary: SafePrivacySummary = {
      version: 1,
      generatedAt: new Date().toISOString(),
      app: "Venice Forge",
      stores: [],
      counts: { projects: 5 },
      issues: [],
      exclusions: ["API Keys", "Raw Prompts"],
      apiKey: buildSafeApiKeyMetadata({ configured: false, storage: "unavailable" }),
    };
    expect(summary.version).toBe(1);
    expect(summary.app).toBe("Venice Forge");
    expect(summary.exclusions).toContain("API Keys");
  });

  it("maintenance plan distinguishes destructive/non-destructive", () => {
    const plan: StorageMaintenancePlan = {
      version: 1,
      generatedAt: new Date().toISOString(),
      actions: [
        {
          id: "refresh",
          label: "Refresh",
          description: "Refresh inventory",
          destructive: false,
          requiresConfirmation: false,
          affectedCategories: ["unknown"],
        },
        {
          id: "clear-cache",
          label: "Clear Cache",
          description: "Clear temporary data",
          destructive: true,
          requiresConfirmation: true,
          affectedCategories: ["cache"],
        },
      ],
      issues: [],
      warnings: [],
    };
    expect(plan.actions[0].destructive).toBe(false);
    expect(plan.actions[1].destructive).toBe(true);
    expect(plan.actions[1].requiresConfirmation).toBe(true);
  });
});
