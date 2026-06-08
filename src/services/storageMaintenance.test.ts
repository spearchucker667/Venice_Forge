import { describe, it, expect, vi } from "vitest";
import { createStorageMaintenancePlan, applyMaintenanceAction } from "./storageMaintenance";

describe("storageMaintenance", () => {
  const mockInventory = {
    stores: [],
    issues: [],
    generatedAt: new Date().toISOString(),
  };

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
    const removeItemSpy = vi.spyOn(Storage.prototype, "removeItem");
    const result = await applyMaintenanceAction("clear-model-cache");
    expect(removeItemSpy).toHaveBeenCalledWith("venice-forge-models-cache");
    expect(result.succeeded).toContain("model-cache");
    removeItemSpy.mockRestore();
  });
});
