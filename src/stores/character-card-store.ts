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
import type { CharacterCardV1, CharacterCardExport, CharacterCardVersion } from "../types/rp";
import { RP_CARD_EXPORT_VERSION } from "../types/rp";
import { toast } from "./toast-store";
import { useRpChatStore } from "./rp-chat-store";
import { validateCharacterForPersistence } from "../services/rpTokenCounter";

const PAGE_SIZE = 60;

/** Safe, non-disclosing user-facing messages for persistence failures.
 *  Raw exception text (paths, driver internals, secrets) must never reach
 *  the UI or the store's `error` field. See T-185. */
const SAFE_LOAD_ERROR = "Could not load character cards. Please try again.";
const SAFE_UPSERT_ERROR = "Could not save character. Please try again.";
const SAFE_REMOVE_ERROR = "Could not delete character. Please try again.";

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
  importCards: (json: string) => Promise<number>;
  exportCards: () => string;
  archiveCard: (id: string) => Promise<CharacterCardV1 | null>;
  unarchiveCard: (id: string) => Promise<CharacterCardV1 | null>;
  addVersion: (id: string, reason?: string) => Promise<CharacterCardV1 | null>;
  setCurrentVersion: (id: string, versionId: string) => Promise<CharacterCardV1 | null>;
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
    } catch {
      set({ isLoading: false, error: SAFE_LOAD_ERROR });
      toast.error("Could not load characters", "Please try again.");
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
    const budgetCheck = validateCharacterForPersistence(normalized);
    if (!budgetCheck.ok) {
      set({ error: budgetCheck.message });
      toast.error("Could not save character", budgetCheck.message);
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
    } catch {
      set({ error: SAFE_UPSERT_ERROR });
      toast.error("Could not save character", "Please try again.");
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

      // Cascading cleanup for RP chats that reference this character
      const rpStore = useRpChatStore.getState();
      for (const chat of rpStore.chats) {
        if (chat.characterIds.includes(id)) {
          const survivingIds = chat.characterIds.filter((cid) => cid !== id);
          if (survivingIds.length === 0) {
            await rpStore.remove(chat.id);
          } else {
            await rpStore.upsert({ ...chat, characterIds: survivingIds });
          }
        }
      }

      return true;
    } catch {
      set({ error: SAFE_REMOVE_ERROR });
      toast.error("Could not delete character", "Please try again.");
      return false;
    }
  },

  importCards: async (json) => {
    let parsed: unknown;
    try { parsed = JSON.parse(json); } catch { return 0; }
    if (!parsed || typeof parsed !== "object") return 0;
    const p = parsed as Record<string, unknown>;
    if (p.version !== RP_CARD_EXPORT_VERSION || p.app !== "Venice Forge") return 0;
    const arr = Array.isArray(p.cards) ? p.cards : [];
    let count = 0;
    for (const raw of arr) {
      const normalized = normalizeCard(raw);
      if (!normalized) continue;
      const saved = await get().upsert(normalized);
      if (saved) count++;
    }
    return count;
  },

  exportCards: () => {
    const list = get().cards;
    const safe: CharacterCardV1[] = list.map((c) => {
      const copy = JSON.parse(JSON.stringify(c)) as CharacterCardV1;
      delete copy.archivedAt;
      return copy;
    });
    const env: CharacterCardExport = {
      version: RP_CARD_EXPORT_VERSION,
      app: "Venice Forge",
      exportedAt: Date.now(),
      cards: safe,
    };
    return JSON.stringify(env, null, 2);
  },

  archiveCard: async (id) => {
    const current = get().cards.find((c) => c.id === id);
    if (!current) return null;
    return get().upsert({ ...current, archivedAt: Date.now() });
  },

  unarchiveCard: async (id) => {
    const current = get().cards.find((c) => c.id === id);
    if (!current) return null;
    const next = { ...current };
    delete next.archivedAt;
    return get().upsert(next);
  },

  addVersion: async (id, reason) => {
    const current = get().cards.find((c) => c.id === id);
    if (!current) return null;
    const ver: CharacterCardVersion = {
      id: svcGenerateId(),
      createdAt: Date.now(),
      reason,
      snapshot: {
        name: current.name,
        description: current.description,
        systemPrompt: current.systemPrompt,
        scenario: current.scenario,
        tags: current.tags,
        modelId: current.modelId,
        author: current.author,
        adult: current.adult,
        exampleDialogues: current.exampleDialogues,
        firstMessage: current.firstMessage,
      },
    };
    const versions = [...(current.versions ?? []), ver];
    const saved = await get().upsert({ ...current, versions, currentVersionId: ver.id });
    return saved;
  },

  setCurrentVersion: async (id, versionId) => {
    const current = get().cards.find((c) => c.id === id);
    if (!current) return null;
    const ver = current.versions?.find((v) => v.id === versionId);
    if (!ver) return null;
    const restored: CharacterCardV1 = {
      ...current,
      name: ver.snapshot.name,
      description: ver.snapshot.description,
      systemPrompt: ver.snapshot.systemPrompt,
      scenario: ver.snapshot.scenario,
      tags: ver.snapshot.tags,
      modelId: ver.snapshot.modelId,
      author: ver.snapshot.author,
      adult: ver.snapshot.adult,
      exampleDialogues: ver.snapshot.exampleDialogues,
      firstMessage: ver.snapshot.firstMessage,
      currentVersionId: versionId,
      updatedAt: Date.now(),
    };
    const saved = get().upsert(restored);
    return saved;
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
    if (c.archivedAt) continue;
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
