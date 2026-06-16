/** @fileoverview Unit tests for the renderer-side scenario service. */

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  generateId,
  listScenarios,
  readScenario,
  saveScenario,
  deleteScenario,
} from "./scenarioService";
import type { ScenarioV1 } from "../../types/rp";
import * as desktopBridge from "../desktopBridge";
import * as safetyImport from "../../shared/safety/characterImportSafety";
import * as safetyHydration from "../../safetyHydration";
import { SafetyGuardBlockedError } from "../../shared/safety";
import StorageService from "../storageService";

vi.mock("../desktopBridge", () => ({
  isElectron: vi.fn(),
  desktopScenarios: {
    list: vi.fn(),
    get: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../shared/safety/characterImportSafety", () => ({
  assessScenario: vi.fn(),
}));

vi.mock("../../safetyHydration", () => ({
  getEffectiveRendererLocalFamilySafeModeEnabled: vi.fn(),
}));

const baseScenario = (): ScenarioV1 => ({
  schema: "ScenarioV1",
  id: "s_test_01",
  name: "Test Scenario",
  description: "A test scenario.",
  content: "Scenario content here",
  tags: ["test"],
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  scope: "global", favorite: false,
});

describe("scenarioService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(desktopBridge.isElectron).mockReturnValue(false);
    vi.mocked(safetyHydration.getEffectiveRendererLocalFamilySafeModeEnabled).mockReturnValue(false);
    vi.mocked(safetyImport.assessScenario).mockReturnValue({ 
      allow: true,
      action: "skipped" as any,
    } as any);
  });

  describe("generateId", () => {
    it("returns a non-empty string", () => {
      const id = generateId();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });
  });

  describe("Storage Operations (Web mode)", () => {
    beforeEach(() => {
      vi.mocked(desktopBridge.isElectron).mockReturnValue(false);
      vi.spyOn(StorageService, "getItems").mockResolvedValue([baseScenario()]);
      vi.spyOn(StorageService, "getItem").mockResolvedValue(baseScenario());
      vi.spyOn(StorageService, "saveItem").mockResolvedValue(undefined as any);
      vi.spyOn(StorageService, "deleteItem").mockResolvedValue(true);
    });

    it("listScenarios returns items from StorageService", async () => {
      const items = await listScenarios();
      expect(items.length).toBe(1);
      expect(items[0].id).toBe("s_test_01");
    });

    it("readScenario returns item from StorageService", async () => {
      const item = await readScenario("s_test_01");
      expect(item).not.toBeNull();
      expect(item!.id).toBe("s_test_01");
    });

    it("saveScenario validates safety and saves via StorageService", async () => {
      const item = await saveScenario(baseScenario());
      expect(item.id).toBe("s_test_01");
      expect(safetyImport.assessScenario).toHaveBeenCalled();
      expect(StorageService.saveItem).toHaveBeenCalled();
    });

    it("deleteScenario calls StorageService", async () => {
      const ok = await deleteScenario("s_test_01");
      expect(ok).toBe(true);
      expect(StorageService.deleteItem).toHaveBeenCalledWith("rpScenarios", "s_test_01");
    });
  });

  describe("Storage Operations (Electron mode)", () => {
    beforeEach(() => {
      vi.mocked(desktopBridge.isElectron).mockReturnValue(true);
      vi.mocked(desktopBridge.desktopScenarios.list).mockResolvedValue({ ok: true, scenarios: [baseScenario()] });
      vi.mocked(desktopBridge.desktopScenarios.get).mockResolvedValue({ ok: true, scenario: baseScenario() });
      vi.mocked(desktopBridge.desktopScenarios.save).mockResolvedValue({ ok: true, scenario: baseScenario() });
      vi.mocked(desktopBridge.desktopScenarios.delete).mockResolvedValue({ ok: true });
    });

    it("listScenarios calls desktopBridge", async () => {
      const items = await listScenarios();
      expect(items.length).toBe(1);
      expect(desktopBridge.desktopScenarios.list).toHaveBeenCalled();
    });

    it("readScenario calls desktopBridge", async () => {
      const item = await readScenario("s_test_01");
      expect(item).not.toBeNull();
      expect(desktopBridge.desktopScenarios.get).toHaveBeenCalledWith("s_test_01");
    });

    it("saveScenario validates safety and saves via desktopBridge", async () => {
      const item = await saveScenario(baseScenario());
      expect(item.id).toBe("s_test_01");
      expect(desktopBridge.desktopScenarios.save).toHaveBeenCalled();
    });

    it("deleteScenario calls desktopBridge", async () => {
      const ok = await deleteScenario("s_test_01");
      expect(ok).toBe(true);
      expect(desktopBridge.desktopScenarios.delete).toHaveBeenCalledWith("s_test_01");
    });
  });

  describe("Safety Enforcement", () => {
    it("saveScenario throws SafetyGuardBlockedError when blocked", async () => {
      vi.mocked(safetyImport.assessScenario).mockReturnValue({ 
        allow: false,
        action: "block",
      } as any);
      await expect(saveScenario(baseScenario())).rejects.toThrow(SafetyGuardBlockedError);
    });
  });
});
