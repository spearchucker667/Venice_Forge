/** @fileoverview State for the local RP asset gallery.
 *  Assets are images generated for RP chats (scene images, character portraits)
 *  plus their provenance (prompt, model, seed, source messageId). */

import { create } from "zustand";
import {
  listAssets,
  saveAsset as svcSave,
  deleteAsset as svcDelete,
  generateId as svcGenerateId,
  normalizeAsset,
} from "../services/rp/assetService";
import type { RpAssetV1 } from "../types/rp";
import { toast } from "./toast-store";

export interface SceneAssetState {
  assets: RpAssetV1[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
  searchQuery: string;
  filterChatId: string | null;
  selectedAssetId: string | null;

  load: (filter?: { chatId?: string }) => Promise<void>;
  setSearchQuery: (q: string) => void;
  setFilterChat: (chatId: string | null) => void;
  setSelected: (id: string | null) => void;
  upsert: (asset: RpAssetV1) => Promise<RpAssetV1 | null>;
  remove: (id: string) => Promise<boolean>;
  getById: (id: string) => RpAssetV1 | undefined;
}

export const useSceneAssetStore = create<SceneAssetState>((set, get) => ({
  assets: [],
  isLoading: false,
  hasLoaded: false,
  error: null,
  searchQuery: "",
  filterChatId: null,
  selectedAssetId: null,

  load: async (filter) => {
    if (get().isLoading) return;
    set({ isLoading: true, error: null });
    try {
      const items = await listAssets(filter);
      const sorted = items.slice().sort((a, b) => b.createdAt - a.createdAt);
      set({ assets: sorted, isLoading: false, hasLoaded: true });
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  setSearchQuery: (q) => set({ searchQuery: q }),
  setFilterChat: (chatId) => set({ filterChatId: chatId }),
  setSelected: (id) => set({ selectedAssetId: id }),

  upsert: async (asset) => {
    const normalized = normalizeAsset(asset);
    if (!normalized) {
      const msg = "Invalid asset data.";
      set({ error: msg });
      toast.error("Could not save asset", msg);
      return null;
    }
    try {
      const saved = await svcSave(normalized);
      set((s) => {
        const idx = s.assets.findIndex((a) => a.id === saved.id);
        const next = idx >= 0 ? [...s.assets] : [saved, ...s.assets];
        if (idx >= 0) next[idx] = saved;
        next.sort((a, b) => b.createdAt - a.createdAt);
        return { assets: next, selectedAssetId: saved.id, error: null };
      });
      return saved;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ error: msg });
      toast.error("Could not save asset", msg);
      return null;
    }
  },

  remove: async (id) => {
    try {
      const ok = await svcDelete(id);
      if (!ok) {
        toast.error("Could not delete asset", "Storage rejected the request.");
        return false;
      }
      set((s) => ({
        assets: s.assets.filter((a) => a.id !== id),
        selectedAssetId: s.selectedAssetId === id ? null : s.selectedAssetId,
      }));
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ error: msg });
      toast.error("Could not delete asset", msg);
      return false;
    }
  },

  getById: (id) => get().assets.find((a) => a.id === id),
}));

export { svcGenerateId as generateAssetId };

export function useFilteredSceneAssets(): RpAssetV1[] {
  const assets = useSceneAssetStore((s) => s.assets);
  const filterChatId = useSceneAssetStore((s) => s.filterChatId);
  const q = useSceneAssetStore((s) => s.searchQuery);
  const needle = q.trim().toLowerCase();
  const out: RpAssetV1[] = [];
  for (const a of assets) {
    if (filterChatId && a.chatId !== filterChatId) continue;
    if (needle) {
      const hay = `${a.prompt} ${a.model}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(a);
  }
  return out;
}
