// @vitest-environment jsdom
// VERIFY-053 regression guard: Storage & Privacy surfaces the character image
// cache inventory and a destructive clear-maintenance action.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStorageMaintenancePlan, applyMaintenanceAction } from "./storageMaintenance";
import { desktopCharacterImage } from "./desktopBridge";
import type { StorageInventoryResult } from "../types/storage-privacy";

// Polyfill localStorage for Node 26+ so vi.spyOn can intercept removeItem.
const localStorageStore: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, value: string) => { localStorageStore[key] = String(value) },
  removeItem: (key: string) => { delete localStorageStore[key] },
  clear: () => { for (const k of Object.keys(localStorageStore)) delete localStorageStore[k] },
  key: (i: number) => Object.keys(localStorageStore)[i] ?? null,
  get length() { return Object.keys(localStorageStore).length },
}
;(globalThis as { localStorage?: Storage }).localStorage = localStorageMock as unknown as Storage

// BUG-2026-06-08 storageMaintenance.test.ts regression guard:
// the original test spied on Storage.prototype.removeItem, which jsdom does
// not invoke via the prototype chain when localStorage is accessed through the
// own property installed on the global. The polyfill-and-spy pattern used by
// src/lib/safe-storage.test.ts is the only reliable way to assert the call.

describe("storageMaintenance", () => {
  const mockInventory = {
    stores: [],
    issues: [],
    generatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    for (const k of Object.keys(localStorageStore)) delete localStorageStore[k]
    vi.restoreAllMocks()
  });

  it("creates non-destructive actions", () => {
    const plan = createStorageMaintenancePlan(mockInventory);
    const refresh = plan.actions.find((a) => a.id === "refresh-inventory");
    expect(refresh?.destructive).toBe(false);
  });

  it("destructive actions require confirmation", () => {
    const plan = createStorageMaintenancePlan(mockInventory);
    const clearCache = plan.actions.find((a) => a.id === "clear-model-cache");
    expect(clearCache?.destructive).toBe(true);
    expect(clearCache?.requiresConfirmation).toBe(true);
  });

  it("does not create forbidden actions like delete-all", () => {
    const plan = createStorageMaintenancePlan(mockInventory);
    const deleteAll = plan.actions.find((a) => a.id.includes("delete-all"));
    expect(deleteAll).toBeUndefined();
  });

  it("applies clear-model-cache", async () => {
    localStorageStore["venice-forge-models-cache"] = "cached"
    const removeItemSpy = vi.spyOn(localStorageMock, "removeItem");
    const result = await applyMaintenanceAction("clear-model-cache");
    expect(removeItemSpy).toHaveBeenCalledWith("venice-forge-models-cache");
    expect(result.succeeded).toContain("model-cache");
    expect(localStorageStore["venice-forge-models-cache"]).toBeUndefined();
  });

  it("includes a clear-character-image-cache action", () => {
    const plan = createStorageMaintenancePlan(mockInventory);
    const action = plan.actions.find((a) => a.id === "clear-character-image-cache");
    expect(action).toBeDefined();
    expect(action?.destructive).toBe(true);
    expect(action?.affectedCategories).toContain("cache");
  });

  it("applies clear-character-image-cache through the desktop bridge", async () => {
    vi.spyOn(desktopCharacterImage, "clearCache").mockResolvedValueOnce({ ok: true, deletedCount: 3 });
    const result = await applyMaintenanceAction("clear-character-image-cache");
    expect(desktopCharacterImage.clearCache).toHaveBeenCalled();
    expect(result.succeeded).toContain("character-image-cache");
  });

  // Regression guard: archive-orphans is dryRunOnly in the plan; apply must
  // return a typed rejection (`dryRunOnly: true`, `reasonCode: "dry-run-only"`)
  // instead of the generic "not implemented" string from the default switch arm.
  it("rejects archive-orphans as a typed dry-run-only result", async () => {
    const inventoryWithIssues: StorageInventoryResult ={
      stores: [],
      issues: [{ id: "issue-1", severity: "warn", sourceCategory: "prompts", message: "missing project", repairable: true }],
      generatedAt: new Date().toISOString(),
    };
    const plan = createStorageMaintenancePlan(inventoryWithIssues);
    const archiveOrphans = plan.actions.find((a) => a.id === "archive-orphans");
    expect(archiveOrphans).toBeDefined();
    expect(archiveOrphans?.dryRunOnly).toBe(true);

    const result = await applyMaintenanceAction("archive-orphans");
    expect(result.succeeded).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.id).toBe("archive-orphans");
    expect(result.dryRunOnly).toBe(true);
    expect(result.reasonCode).toBe("dry-run-only");
    // The dry-run-only message must not include "not implemented".
    expect(result.failed[0]?.reason).not.toMatch(/not implemented/i);
  });

  // Regression guard: unknown action ids still fall through to the generic
  // not-implemented result with the stable reasonCode.
  it("rejects unknown actions with a typed not-implemented result", async () => {
    const result = await applyMaintenanceAction("delete-everything");
    expect(result.succeeded).toHaveLength(0);
    expect(result.reasonCode).toBe("not-implemented");
    expect(result.dryRunOnly).toBeUndefined();
  });
});
