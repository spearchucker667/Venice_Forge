// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStorageMaintenancePlan, applyMaintenanceAction } from "./storageMaintenance";

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
});
