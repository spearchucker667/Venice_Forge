/** @fileoverview Unit tests for the renderer-side persona service. */

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  generateId,
  normalizePersona,
  normalizePersonaImage,
  listPersonas,
  readPersona,
  savePersona,
  deletePersona,
  MAX_PERSONA_IMAGE_BYTES,
} from "./personaService";
import type { UserPersonaV1 } from "../../types/rp";
import * as desktopBridge from "../desktopBridge";
import * as safetyImport from "../../shared/safety/characterImportSafety";
import * as safetyHydration from "../../safetyHydration";
import { SafetyGuardBlockedError } from "../../shared/safety";
import StorageService from "../storageService";

vi.mock("../desktopBridge", () => ({
  isElectron: vi.fn(),
  desktopPersonas: {
    list: vi.fn(),
    get: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../shared/safety/characterImportSafety", () => ({
  assessPersonaImport: vi.fn(),
}));

vi.mock("../../safetyHydration", () => ({
  getEffectiveRendererLocalFamilySafeModeEnabled: vi.fn(),
}));

const basePersona = (): UserPersonaV1 => ({
  schema: "UserPersonaV1",
  id: "p_test_01",
  name: "Me",
  description: "I am me.",
  tags: ["test"],
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  scope: "global",
});

const imageFixture = {
  mimeType: "image/png" as const,
  data: "iVBORw0KGgo=",
  byteLength: 12,
  contentHash: "abcd".repeat(16),
};

const personaWithImage = (): UserPersonaV1 => ({ ...basePersona(), image: imageFixture });

describe("personaService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(desktopBridge.isElectron).mockReturnValue(false);
    vi.mocked(safetyHydration.getEffectiveRendererLocalFamilySafeModeEnabled).mockReturnValue(false);
    vi.mocked(safetyImport.assessPersonaImport).mockReturnValue({ 
      allow: true,
      action: "skipped" as any,
    } as any);
  });

  describe("normalizePersona", () => {
    it("returns a normalized persona for a valid record", () => {
      const out = normalizePersona(basePersona());
      expect(out).not.toBeNull();
      expect(out!.id).toBe("p_test_01");
      expect(out!.name).toBe("Me");
    });

    it("rejects null / non-object input", () => {
      expect(normalizePersona(null)).toBeNull();
      expect(normalizePersona(undefined)).toBeNull();
      expect(normalizePersona("string")).toBeNull();
      expect(normalizePersona(42)).toBeNull();
    });

    it("rejects records whose id fails the validator", () => {
      expect(normalizePersona({ ...basePersona(), id: "" })).toBeNull();
      expect(normalizePersona({ ...basePersona(), id: "../etc/passwd" })).toBeNull();
    });

    it("rejects records with missing required fields", () => {
      const p = basePersona();
      delete (p as any).name;
      expect(normalizePersona(p)).toBeNull();
    });
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
      vi.spyOn(StorageService, "getItems").mockResolvedValue([basePersona()]);
      vi.spyOn(StorageService, "getItem").mockResolvedValue(basePersona());
      vi.spyOn(StorageService, "saveItem").mockResolvedValue(undefined as any);
      vi.spyOn(StorageService, "deleteItem").mockResolvedValue(true);
    });

    it("listPersonas returns items from StorageService", async () => {
      const items = await listPersonas();
      expect(items.length).toBe(1);
      expect(items[0].id).toBe("p_test_01");
    });

    it("readPersona returns item from StorageService", async () => {
      const item = await readPersona("p_test_01");
      expect(item).not.toBeNull();
      expect(item!.id).toBe("p_test_01");
    });

    it("savePersona validates safety and saves via StorageService", async () => {
      const item = await savePersona(basePersona());
      expect(item.id).toBe("p_test_01");
      expect(safetyImport.assessPersonaImport).toHaveBeenCalled();
      expect(StorageService.saveItem).toHaveBeenCalled();
    });

    it("deletePersona calls StorageService", async () => {
      const ok = await deletePersona("p_test_01");
      expect(ok).toBe(true);
      expect(StorageService.deleteItem).toHaveBeenCalledWith("personas", "p_test_01");
    });
  });

  describe("Storage Operations (Electron mode)", () => {
    beforeEach(() => {
      vi.mocked(desktopBridge.isElectron).mockReturnValue(true);
      vi.mocked(desktopBridge.desktopPersonas.list).mockResolvedValue({ ok: true, personas: [basePersona()] });
      vi.mocked(desktopBridge.desktopPersonas.get).mockResolvedValue({ ok: true, persona: basePersona() });
      vi.mocked(desktopBridge.desktopPersonas.save).mockResolvedValue({ ok: true, persona: basePersona() });
      vi.mocked(desktopBridge.desktopPersonas.delete).mockResolvedValue({ ok: true });
    });

    it("listPersonas calls desktopBridge", async () => {
      const items = await listPersonas();
      expect(items.length).toBe(1);
      expect(desktopBridge.desktopPersonas.list).toHaveBeenCalled();
    });

    it("readPersona calls desktopBridge", async () => {
      const item = await readPersona("p_test_01");
      expect(item).not.toBeNull();
      expect(desktopBridge.desktopPersonas.get).toHaveBeenCalledWith("p_test_01");
    });

    it("savePersona validates safety and saves via desktopBridge", async () => {
      const item = await savePersona(basePersona());
      expect(item.id).toBe("p_test_01");
      expect(desktopBridge.desktopPersonas.save).toHaveBeenCalled();
    });

    it("deletePersona calls desktopBridge", async () => {
      const ok = await deletePersona("p_test_01");
      expect(ok).toBe(true);
      expect(desktopBridge.desktopPersonas.delete).toHaveBeenCalledWith("p_test_01");
    });
  });

  describe("Safety Enforcement", () => {
    it("savePersona throws SafetyGuardBlockedError when blocked", async () => {
      vi.mocked(safetyImport.assessPersonaImport).mockReturnValue({ 
        allow: false,
        action: "block",
      } as any);
      await expect(savePersona(basePersona())).rejects.toThrow(SafetyGuardBlockedError);
    });
  });

  // VERIFY-080 regression guard — persona images survive normalize/save/read round-trips
  // in both web (IndexedDB) and Electron (IPC + filesystem) modes.
  describe("Persona image persistence", () => {
    it("normalizePersonaImage preserves a valid image and its optional contentHash", () => {
      const out = normalizePersonaImage(imageFixture);
      expect(out).toEqual(imageFixture);
    });

    it("normalizePersonaImage rejects invalid mime types and oversized images", () => {
      expect(normalizePersonaImage({ ...imageFixture, mimeType: "image/svg+xml" })).toBeUndefined();
      expect(normalizePersonaImage({ ...imageFixture, byteLength: MAX_PERSONA_IMAGE_BYTES + 1 })).toBeUndefined();
      expect(normalizePersonaImage({ ...imageFixture, data: "not-base64!" })).toBeUndefined();
    });

    it("web mode save + read round-trips a persona image", async () => {
      vi.mocked(desktopBridge.isElectron).mockReturnValue(false);
      vi.spyOn(StorageService, "getItem").mockResolvedValue(personaWithImage());
      vi.spyOn(StorageService, "saveItem").mockResolvedValue(undefined as any);

      const saved = await savePersona(personaWithImage());
      expect(saved.image).toEqual(imageFixture);

      const loaded = await readPersona("p_test_01");
      expect(loaded).not.toBeNull();
      expect(loaded!.image).toEqual(imageFixture);
    });

    it("Electron IPC save + read round-trips a persona image", async () => {
      vi.mocked(desktopBridge.isElectron).mockReturnValue(true);
      vi.mocked(desktopBridge.desktopPersonas.save).mockResolvedValue({ ok: true, persona: personaWithImage() });
      vi.mocked(desktopBridge.desktopPersonas.get).mockResolvedValue({ ok: true, persona: personaWithImage() });

      const saved = await savePersona(personaWithImage());
      expect(saved.image).toEqual(imageFixture);

      const loaded = await readPersona("p_test_01");
      expect(loaded).not.toBeNull();
      expect(loaded!.image).toEqual(imageFixture);
      expect(desktopBridge.desktopPersonas.get).toHaveBeenCalledWith("p_test_01");
    });
  });
});
