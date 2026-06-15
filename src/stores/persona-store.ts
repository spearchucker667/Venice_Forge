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
import type { UserPersonaV1 } from "../types/rp";
import { toast } from "./toast-store";
import { getActivePersonaId, setActivePersonaId } from "../services/rp/personaPreferenceService";

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
      set({ isLoading: false, error: e instanceof Error ? e.message : String(e) });
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
      const msg = e instanceof Error ? e.message : String(e);
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
      const msg = e instanceof Error ? e.message : String(e);
      set({ error: msg });
      toast.error("Could not delete persona", msg);
      return false;
    }
  },

  getById: (id) => get().personas.find((p) => p.id === id),
}));
