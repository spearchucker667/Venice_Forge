/** @fileoverview Unit tests for persona-store.ts. */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { usePersonaStore } from "./persona-store";
import * as personaService from "../services/rp/personaService";
import * as personaPref from "../services/rp/personaPreferenceService";
import { toast } from "./toast-store";
import type { UserPersonaV1 } from "../types/rp";

vi.mock("../services/rp/personaService", () => ({
  listPersonas: vi.fn(),
  savePersona: vi.fn(),
  deletePersona: vi.fn(),
  generateId: vi.fn(),
  normalizePersona: vi.fn(),
}));

vi.mock("../services/rp/personaPreferenceService", () => ({
  getActivePersonaId: vi.fn(),
  setActivePersonaId: vi.fn(),
}));

vi.mock("./toast-store", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const basePersona = (): UserPersonaV1 => ({
  schema: "UserPersonaV1",
  id: "p_1",
  name: "Me",
  description: "Desc",
  tags: [],
  createdAt: 100,
  updatedAt: 100,
  scope: "global",
});

describe("persona-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePersonaStore.setState({ personas: [], isLoading: false, hasLoaded: false, error: null, activePersonaId: null, searchQuery: "" });
  });

  it("loads personas and active id", async () => {
    vi.mocked(personaService.listPersonas).mockResolvedValue([basePersona()]);
    vi.mocked(personaPref.getActivePersonaId).mockResolvedValue("p_1");

    await usePersonaStore.getState().load();

    expect(usePersonaStore.getState().hasLoaded).toBe(true);
    expect(usePersonaStore.getState().personas.length).toBe(1);
    expect(usePersonaStore.getState().activePersonaId).toBe("p_1");
  });

  it("handles load error", async () => {
    vi.mocked(personaService.listPersonas).mockRejectedValue(new Error("Load fail"));
    await usePersonaStore.getState().load();
    expect(usePersonaStore.getState().error).toBe("Load fail");
  });

  it("creates blank persona", () => {
    vi.mocked(personaService.generateId).mockReturnValue("p_blank");
    const id = usePersonaStore.getState().createBlank();
    expect(id).toBe("p_blank");
    expect(usePersonaStore.getState().personas.length).toBe(1);
    expect(usePersonaStore.getState().personas[0].id).toBe("p_blank");
    expect(usePersonaStore.getState().activePersonaId).toBe("p_blank");
  });

  it("sets active persona", async () => {
    await usePersonaStore.getState().setActive("p_new");
    expect(personaPref.setActivePersonaId).toHaveBeenCalledWith("p_new");
    expect(usePersonaStore.getState().activePersonaId).toBe("p_new");
  });

  it("sets search query", () => {
    usePersonaStore.getState().setSearchQuery("foo");
    expect(usePersonaStore.getState().searchQuery).toBe("foo");
  });

  it("upserts persona successfully", async () => {
    vi.mocked(personaService.normalizePersona).mockReturnValue(basePersona());
    vi.mocked(personaService.savePersona).mockResolvedValue({ ...basePersona(), name: "Saved" });

    const saved = await usePersonaStore.getState().upsert(basePersona());
    expect(saved?.name).toBe("Saved");
    expect(usePersonaStore.getState().personas.length).toBe(1);
    expect(usePersonaStore.getState().personas[0].name).toBe("Saved");
  });

  it("upserts existing persona updates the list", async () => {
    usePersonaStore.setState({ personas: [basePersona()] });
    vi.mocked(personaService.normalizePersona).mockReturnValue(basePersona());
    vi.mocked(personaService.savePersona).mockResolvedValue({ ...basePersona(), name: "Updated", updatedAt: 200 });

    await usePersonaStore.getState().upsert(basePersona());
    expect(usePersonaStore.getState().personas.length).toBe(1);
    expect(usePersonaStore.getState().personas[0].name).toBe("Updated");
  });

  it("handles upsert validation error", async () => {
    vi.mocked(personaService.normalizePersona).mockReturnValue(null);
    const saved = await usePersonaStore.getState().upsert(basePersona());
    expect(saved).toBeNull();
    expect(toast.error).toHaveBeenCalled();
  });

  it("handles upsert service error", async () => {
    vi.mocked(personaService.normalizePersona).mockReturnValue(basePersona());
    vi.mocked(personaService.savePersona).mockRejectedValue(new Error("Save fail"));
    const saved = await usePersonaStore.getState().upsert(basePersona());
    expect(saved).toBeNull();
    expect(toast.error).toHaveBeenCalled();
  });

  it("removes persona successfully", async () => {
    usePersonaStore.setState({ personas: [basePersona()], activePersonaId: "p_1" });
    vi.mocked(personaService.deletePersona).mockResolvedValue(true);

    const ok = await usePersonaStore.getState().remove("p_1");
    expect(ok).toBe(true);
    expect(usePersonaStore.getState().personas.length).toBe(0);
    expect(usePersonaStore.getState().activePersonaId).toBeNull();
  });

  it("handles remove rejection", async () => {
    usePersonaStore.setState({ personas: [basePersona()] });
    vi.mocked(personaService.deletePersona).mockResolvedValue(false);

    const ok = await usePersonaStore.getState().remove("p_1");
    expect(ok).toBe(false);
    expect(toast.error).toHaveBeenCalled();
  });

  it("handles remove error", async () => {
    usePersonaStore.setState({ personas: [basePersona()] });
    vi.mocked(personaService.deletePersona).mockRejectedValue(new Error("Delete fail"));

    const ok = await usePersonaStore.getState().remove("p_1");
    expect(ok).toBe(false);
    expect(toast.error).toHaveBeenCalled();
  });

  it("getById returns the correct persona", () => {
    usePersonaStore.setState({ personas: [basePersona()] });
    const found = usePersonaStore.getState().getById("p_1");
    expect(found).not.toBeUndefined();
    expect(found!.id).toBe("p_1");
  });
});
