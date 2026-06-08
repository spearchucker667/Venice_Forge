/** @fileoverview Phase 2F — RP Studio Scenario Zustand store.
 *
 * Mirrors the slim pattern used by `usePersonaStore` and the fuller
 * pattern used by `useSceneComposerStore`. All mutations route through
 * the `scenarioService` so the local Family Safe Mode safety guard
 * runs at the persistence boundary. */
import { create } from "zustand";
import {
  deleteScenario as svcDelete,
  generateId as svcGenerateId,
  listScenarios,
  saveScenario as svcSave,
} from "../services/rp/scenarioService";
import {
  type ScenarioExport,
  type ScenarioV1,
  normalizeScenario,
} from "../types/rp";
import { toast } from "./toast-store";

export interface ScenarioState {
  scenarios: ScenarioV1[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
  activeScenarioId: string | null;
  searchQuery: string;

  load: () => Promise<void>;
  reloadFromStorage: () => Promise<void>;
  createBlank: (overrides?: Partial<ScenarioV1>) => string;
  setActive: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  upsert: (scenario: ScenarioV1) => Promise<ScenarioV1 | null>;
  remove: (id: string) => Promise<boolean>;
  toggleFavorite: (id: string) => Promise<ScenarioV1 | null>;
  archiveScenario: (id: string) => Promise<ScenarioV1 | null>;
  unarchiveScenario: (id: string) => Promise<ScenarioV1 | null>;
  importScenarios: (payload: unknown) => Promise<{
    imported: ScenarioV1[];
    skipped: Array<{ reason: string; name?: string }>;
  }>;
  exportScenarios: (ids?: string[]) => ScenarioExport;
  getById: (id: string) => ScenarioV1 | undefined;
  selectForProject: (projectId: string | null) => ScenarioV1[];
}

function buildImportResult(input: unknown): {
  imported: ScenarioV1[];
  skipped: Array<{ reason: string; name?: string }>;
} {
  if (!input || typeof input !== "object") {
    return { imported: [], skipped: [{ reason: "Invalid envelope" }] };
  }
  const r = input as Record<string, unknown>;
  const raw = Array.isArray(r.scenarios)
    ? r.scenarios
    : Array.isArray(r.items)
      ? r.items
      : null;
  if (!raw) return { imported: [], skipped: [{ reason: "Missing scenarios array" }] };
  const imported: ScenarioV1[] = [];
  const skipped: Array<{ reason: string; name?: string }> = [];
  for (const candidate of raw) {
    const normalized = normalizeScenario({
      ...(candidate as Record<string, unknown>),
      id: svcGenerateId(),
    });
    if (!normalized) {
      skipped.push({
        reason: "Failed to validate scenario",
        name:
          candidate && typeof candidate === "object" && "name" in candidate
            ? String((candidate as { name?: unknown }).name ?? "")
            : undefined,
      });
      continue;
    }
    imported.push(normalized);
  }
  return { imported, skipped };
}

export const useScenarioStore = create<ScenarioState>((set, get) => ({
  scenarios: [],
  isLoading: false,
  hasLoaded: false,
  error: null,
  activeScenarioId: null,
  searchQuery: "",

  load: async () => {
    if (get().isLoading) return;
    set({ isLoading: true, error: null });
    try {
      const items = await listScenarios();
      const sorted = items.slice().sort((a, b) => b.updatedAt - a.updatedAt);
      set({ scenarios: sorted, isLoading: false, hasLoaded: true });
    } catch (e) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  reloadFromStorage: async () => {
    set({ hasLoaded: false });
    await get().load();
  },

  createBlank: (overrides) => {
    const id = svcGenerateId();
    const now = Date.now();
    const scenario: ScenarioV1 = {
      schema: "ScenarioV1",
      id,
      scope: overrides?.scope ?? "global",
      name: overrides?.name ?? "New scenario",
      description: overrides?.description ?? "",
      content: overrides?.content ?? "",
      tags: overrides?.tags ?? [],
      favorite: overrides?.favorite ?? false,
      createdAt: overrides?.createdAt ?? now,
      updatedAt: now,
    };
    if (overrides?.projectId !== undefined) scenario.projectId = overrides.projectId;
    if (overrides?.characterId !== undefined) scenario.characterId = overrides.characterId;
    if (overrides?.sceneId !== undefined) scenario.sceneId = overrides.sceneId;
    if (overrides?.firstUserMessage !== undefined)
      scenario.firstUserMessage = overrides.firstUserMessage;
    set((s) => ({
      scenarios: [scenario, ...s.scenarios],
      activeScenarioId: id,
    }));
    return id;
  },

  setActive: (id) => set({ activeScenarioId: id }),
  setSearchQuery: (q) => set({ searchQuery: q }),

  upsert: async (scenario) => {
    const normalized = normalizeScenario(scenario);
    if (!normalized) {
      const msg = "Invalid scenario data.";
      set({ error: msg });
      toast.error("Could not save scenario", msg);
      return null;
    }
    try {
      const saved = await svcSave(normalized);
      set((s) => {
        const idx = s.scenarios.findIndex((p) => p.id === saved.id);
        const next = idx >= 0 ? [...s.scenarios] : [saved, ...s.scenarios];
        if (idx >= 0) next[idx] = saved;
        next.sort((a, b) => b.updatedAt - a.updatedAt);
        return { scenarios: next, error: null };
      });
      return saved;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ error: msg });
      toast.error("Could not save scenario", msg);
      return null;
    }
  },

  remove: async (id) => {
    try {
      const ok = await svcDelete(id);
      if (!ok) {
        toast.error("Could not delete scenario", "Storage rejected the request.");
        return false;
      }
      set((s) => ({
        scenarios: s.scenarios.filter((p) => p.id !== id),
        activeScenarioId: s.activeScenarioId === id ? null : s.activeScenarioId,
      }));
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ error: msg });
      toast.error("Could not delete scenario", msg);
      return false;
    }
  },

  toggleFavorite: async (id) => {
    const current = get().scenarios.find((s) => s.id === id);
    if (!current) return null;
    const next: ScenarioV1 = { ...current, favorite: !current.favorite };
    return get().upsert(next);
  },

  archiveScenario: async (id) => {
    const current = get().scenarios.find((s) => s.id === id);
    if (!current) return null;
    return get().upsert({ ...current, archivedAt: Date.now() });
  },

  unarchiveScenario: async (id) => {
    const current = get().scenarios.find((s) => s.id === id);
    if (!current) return null;
    const next: ScenarioV1 = { ...current };
    delete next.archivedAt;
    return get().upsert(next);
  },

  importScenarios: async (payload) => {
    const built = buildImportResult(payload);
    if (built.imported.length === 0) {
      return built;
    }
    const accepted: ScenarioV1[] = [];
    for (const candidate of built.imported) {
      const saved = await get().upsert(candidate);
      if (saved) accepted.push(saved);
    }
    return { imported: accepted, skipped: built.skipped };
  },

  exportScenarios: (ids) => {
    const list = get().scenarios;
    const subset =
      !ids || ids.length === 0
        ? list
        : list.filter((s) => ids.includes(s.id));
    const safe: ScenarioV1[] = subset.map((s) => {
      const copy: ScenarioV1 = { ...s };
      delete copy.archivedAt;
      return copy;
    });
    return {
      version: 1,
      app: "Venice Forge",
      exportedAt: Date.now(),
      scenarios: safe,
    };
  },

  getById: (id) => get().scenarios.find((s) => s.id === id),

  selectForProject: (projectId) => {
    const list = get().scenarios.filter((s) => !s.archivedAt);
    if (projectId === null) {
      return list.filter(
        (s) => s.scope === "global" || s.scope === "character" || !s.projectId,
      );
    }
    return list.filter(
      (s) => s.scope === "global" || s.scope === "character" || s.projectId === projectId,
    );
  },
}));

export type { ScenarioV1, ScenarioExport };
