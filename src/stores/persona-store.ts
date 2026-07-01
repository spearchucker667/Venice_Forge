/** @fileoverview State for the user's local persona library.
 *  A "persona" describes the user side of the RP — name, role, brief
 *  background, optional style hints. */

import { create } from "zustand";
import {
  listPersonas,
  savePersona as svcSave,
  deletePersona as svcDelete,
  generateId as svcGenerateId,
  normalizePersona,
} from "../services/rp/personaService";
import type { UserPersonaV1, PersonaExport } from "../types/rp";
import { RP_PERSONA_EXPORT_VERSION } from "../types/rp";
import { toast } from "./toast-store";
import { getActivePersonaId, setActivePersonaId } from "../services/rp/personaPreferenceService";
import { redactErrorMessage } from "../shared/redaction";

export interface PersonaState {
  personas: UserPersonaV1[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
  activePersonaId: string | null;
  searchQuery: string;

  load: () => Promise<void>;
  createBlank: () => string;
  setActive: (id: string | null) => Promise<void>;
  setSearchQuery: (q: string) => void;
  upsert: (persona: UserPersonaV1) => Promise<UserPersonaV1 | null>;
  remove: (id: string) => Promise<boolean>;
  getById: (id: string) => UserPersonaV1 | undefined;
  importPersonas: (json: string) => Promise<number>;
  exportPersonas: () => string;
}

export const usePersonaStore = create<PersonaState>((set, get) => ({
  personas: [],
  isLoading: false,
  hasLoaded: false,
  error: null,
  activePersonaId: null,
  searchQuery: "",

  load: async () => {
    if (get().isLoading) return;
    set({ isLoading: true, error: null });
    try {
      const items = await listPersonas();
      const sorted = items.slice().sort((a, b) => b.updatedAt - a.updatedAt);
      const persistedId = await getActivePersonaId();
      const activePersonaId = persistedId && sorted.some((p) => p.id === persistedId) ? persistedId : null;
      set({ personas: sorted, isLoading: false, hasLoaded: true, activePersonaId });
    } catch (e) {
      set({ isLoading: false, error: redactErrorMessage(e) });
    }
  },

  createBlank: () => {
    const id = svcGenerateId();
    const now = Date.now();
    const persona: UserPersonaV1 = {
      schema: "UserPersonaV1",
      id,
      name: "Me",
      description: "",
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ personas: [persona, ...s.personas], activePersonaId: id }));
    return id;
  },

  setActive: async (id) => {
    await setActivePersonaId(id);
    set({ activePersonaId: id });
  },
  setSearchQuery: (q) => set({ searchQuery: q }),

  upsert: async (persona) => {
    const normalized = normalizePersona(persona);
    if (!normalized) {
      const msg = "Invalid persona data.";
      set({ error: msg });
      toast.error("Could not save persona", msg);
      return null;
    }
    try {
      const saved = await svcSave(normalized);
      set((s) => {
        const idx = s.personas.findIndex((p) => p.id === saved.id);
        const next = idx >= 0 ? [...s.personas] : [saved, ...s.personas];
        if (idx >= 0) next[idx] = saved;
        next.sort((a, b) => b.updatedAt - a.updatedAt);
        return { personas: next, error: null };
      });
      return saved;
    } catch (e) {
      const msg = redactErrorMessage(e);
      set({ error: msg });
      toast.error("Could not save persona", msg);
      return null;
    }
  },

  remove: async (id) => {
    try {
      const ok = await svcDelete(id);
      if (!ok) {
        toast.error("Could not delete persona", "Storage rejected the request.");
        return false;
      }
      set((s) => ({
        personas: s.personas.filter((p) => p.id !== id),
        activePersonaId: s.activePersonaId === id ? null : s.activePersonaId,
      }));
      return true;
    } catch (e) {
      const msg = redactErrorMessage(e);
      set({ error: msg });
      toast.error("Could not delete persona", msg);
      return false;
    }
  },

  importPersonas: async (json) => {
    let parsed: unknown;
    try { parsed = JSON.parse(json); } catch { return 0; }
    if (!parsed || typeof parsed !== "object") return 0;
    const p = parsed as Record<string, unknown>;
    if (p.version !== RP_PERSONA_EXPORT_VERSION || p.app !== "Venice Forge") return 0;
    const arr = Array.isArray(p.personas) ? p.personas : [];
    let count = 0;
    for (const raw of arr) {
      const normalized = normalizePersona(raw);
      if (!normalized) continue;
      const saved = await get().upsert(normalized);
      if (saved) count++;
    }
    return count;
  },

  exportPersonas: () => {
    const list = get().personas;
    const env: PersonaExport = {
      version: RP_PERSONA_EXPORT_VERSION,
      app: "Venice Forge",
      exportedAt: Date.now(),
      personas: list,
    };
    return JSON.stringify(env, null, 2);
  },

  getById: (id) => get().personas.find((p) => p.id === id),
}));
