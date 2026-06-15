/** @fileoverview State for the local lorebook library.
 *  Lorebooks are keyed sets of world-info entries that trigger on keywords
 *  found in the chat history. They are bound to RP chats at chat-creation
 *  time (snapshot, not live-linked). */

import { create } from "zustand";
import {
  listLorebooks,
  saveLorebook as svcSave,
  deleteLorebook as svcDelete,
  generateId as svcGenerateId,
  normalizeLorebook,
} from "../services/rp/lorebookRendererService";
import type { LorebookV1 } from "../types/rp";
import { toast } from "./toast-store";

export interface LorebookState {
  lorebooks: LorebookV1[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
  searchQuery: string;
  editingId: string | null;

  load: () => Promise<void>;
  createBlank: () => string;
  setSearchQuery: (q: string) => void;
  setEditing: (id: string | null) => void;
  upsert: (book: LorebookV1) => Promise<LorebookV1 | null>;
  remove: (id: string) => Promise<boolean>;
  getById: (id: string) => LorebookV1 | undefined;
}

export const useLorebookStore = create<LorebookState>((set, get) => ({
  lorebooks: [],
  isLoading: false,
  hasLoaded: false,
  error: null,
  searchQuery: "",
  editingId: null,

  load: async () => {
    if (get().isLoading) return;
    set({ isLoading: true, error: null });
    try {
      const items = await listLorebooks();
      const sorted = items.slice().sort((a, b) => b.updatedAt - a.updatedAt);
      set({ lorebooks: sorted, isLoading: false, hasLoaded: true });
    } catch {
      set({ isLoading: false, error: "Could not load lorebooks." });
      toast.error("Could not load lorebooks", "Please try again.");
    }
  },

  createBlank: () => {
    const id = svcGenerateId();
    const now = Date.now();
    const book: LorebookV1 = {
      schema: "LorebookV1",
      id,
      name: "New Lorebook",
      description: "",
      tags: [],
      entries: [],
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ lorebooks: [book, ...s.lorebooks], editingId: id }));
    return id;
  },

  setSearchQuery: (q) => set({ searchQuery: q }),
  setEditing: (id) => set({ editingId: id }),

  upsert: async (book) => {
    const normalized = normalizeLorebook(book);
    if (!normalized) {
      const msg = "Invalid lorebook data.";
      set({ error: msg });
      toast.error("Could not save lorebook", msg);
      return null;
    }
    try {
      const saved = await svcSave(normalized);
      set((s) => {
        const idx = s.lorebooks.findIndex((b) => b.id === saved.id);
        const next = idx >= 0 ? [...s.lorebooks] : [saved, ...s.lorebooks];
        if (idx >= 0) next[idx] = saved;
        next.sort((a, b) => b.updatedAt - a.updatedAt);
        return { lorebooks: next, editingId: saved.id, error: null };
      });
      return saved;
    } catch {
      set({ error: "Could not save lorebook." });
      toast.error("Could not save lorebook", "Please try again.");
      return null;
    }
  },

  remove: async (id) => {
    try {
      const ok = await svcDelete(id);
      if (!ok) {
        toast.error("Could not delete lorebook", "Storage rejected the request.");
        return false;
      }
      set((s) => ({
        lorebooks: s.lorebooks.filter((b) => b.id !== id),
        editingId: s.editingId === id ? null : s.editingId,
      }));
      return true;
    } catch {
      set({ error: "Could not delete lorebook." });
      toast.error("Could not delete lorebook", "Please try again.");
      return false;
    }
  },

  getById: (id) => get().lorebooks.find((b) => b.id === id),
}));
