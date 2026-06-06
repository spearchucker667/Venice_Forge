/** @fileoverview State for the local Character Card library (distinct from the
 *  Venice-hosted `character-store`).
 *
 *  This store manages the *user's own* CharacterCardV1 records — author/edit
 *  metadata, full descriptions, scenarios, greetings, and avatar references.
 *  All persistence flows through `characterCardService`, which selects the
 *  Electron IPC bridge in desktop mode and IndexedDB in web mode.
 *
 *  No safety guard runs in this store. The character-import safety guard runs
 *  at the service boundary (`assessCharacterImport` in
 *  `src/shared/safety/characterImportSafety.ts`) before any save. */

import { create } from "zustand";
import {
  listCharacterCards,
  saveCharacterCard as svcSave,
  deleteCharacterCard as svcDelete,
  generateId as svcGenerateId,
  normalizeCard,
} from "../services/rp/characterCardService";
import type { CharacterCardV1 } from "../types/rp";
import { toast } from "./toast-store";

const PAGE_SIZE = 60;

export interface CharacterCardState {
  cards: CharacterCardV1[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
  searchQuery: string;
  includeAdult: boolean;
  editingId: string | null;

  load: () => Promise<void>;
  refresh: () => Promise<void>;
  createBlank: () => string;
  setSearchQuery: (q: string) => void;
  setIncludeAdult: (include: boolean) => void;
  setEditing: (id: string | null) => void;
  upsert: (card: CharacterCardV1) => Promise<CharacterCardV1 | null>;
  remove: (id: string) => Promise<boolean>;
  getById: (id: string) => CharacterCardV1 | undefined;
}

export const useCharacterCardStore = create<CharacterCardState>((set, get) => ({
  cards: [],
  isLoading: false,
  hasLoaded: false,
  error: null,
  searchQuery: "",
  includeAdult: false,
  editingId: null,

  load: async () => {
    if (get().isLoading) return;
    set({ isLoading: true, error: null });
    try {
      const items = await listCharacterCards();
      const sorted = items.slice().sort((a, b) => b.updatedAt - a.updatedAt);
      set({ cards: sorted, isLoading: false, hasLoaded: true, error: null });
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  refresh: async () => {
    set({ hasLoaded: false });
    await get().load();
  },

  createBlank: () => {
    const id = svcGenerateId();
    const now = Date.now();
    const card: CharacterCardV1 = {
      schema: "CharacterCardV1",
      id,
      name: "New Character",
      description: "",
      systemPrompt: "",
      scenario: "",
      tags: [],
      adult: false,
      exampleDialogues: [],
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ cards: [card, ...s.cards], editingId: id }));
    return id;
  },

  setSearchQuery: (q) => set({ searchQuery: q }),
  setIncludeAdult: (include) => set({ includeAdult: include }),
  setEditing: (id) => set({ editingId: id }),

  upsert: async (card) => {
    const normalized = normalizeCard(card);
    if (!normalized) {
      const msg = "Invalid character card data.";
      set({ error: msg });
      toast.error("Could not save character", msg);
      return null;
    }
    try {
      const saved = await svcSave(normalized);
      set((s) => {
        const idx = s.cards.findIndex((c) => c.id === saved.id);
        const next = idx >= 0 ? [...s.cards] : [saved, ...s.cards];
        if (idx >= 0) next[idx] = saved;
        next.sort((a, b) => b.updatedAt - a.updatedAt);
        return { cards: next, editingId: saved.id, error: null };
      });
      return saved;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ error: msg });
      toast.error("Could not save character", msg);
      return null;
    }
  },

  remove: async (id) => {
    try {
      const ok = await svcDelete(id);
      if (!ok) {
        toast.error("Could not delete character", "Storage rejected the request.");
        return false;
      }
      set((s) => ({
        cards: s.cards.filter((c) => c.id !== id),
        editingId: s.editingId === id ? null : s.editingId,
      }));
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ error: msg });
      toast.error("Could not delete character", msg);
      return false;
    }
  },

  getById: (id) => get().cards.find((c) => c.id === id),
}));

/** Filtered card list — convenience for the library view. */
export function useFilteredCharacterCards(): CharacterCardV1[] {
  const cards = useCharacterCardStore((s) => s.cards);
  const q = useCharacterCardStore((s) => s.searchQuery);
  const includeAdult = useCharacterCardStore((s) => s.includeAdult);
  const needle = q.trim().toLowerCase();
  const out: CharacterCardV1[] = [];
  for (const c of cards) {
    if (!includeAdult && c.adult) continue;
    if (needle) {
      const hay = `${c.name}\n${c.description}\n${c.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(c);
    if (out.length >= PAGE_SIZE) break;
  }
  return out;
}
