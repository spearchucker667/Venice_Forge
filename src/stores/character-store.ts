/** @fileoverview State for the Venice character discovery UI. */

import { create } from "zustand";
import { listCharacters, getCharacter } from "../services/characterService";
import { redactErrorMessage } from "../shared/redaction";
import * as logger from "../shared/logger";
import type {
  CharacterSortBy,
  CharacterSortOrder,
  VeniceCharacter,
} from "../types/characters";

/** Number of characters to request per page. Capped at 100 by the service. */
const DEFAULT_PAGE_SIZE = 30;

/** Default search state — Venice returns featured characters when no
 *  search or sortBy is supplied. */
const DEFAULT_SORT_BY: CharacterSortBy = "featured";
const DEFAULT_SORT_ORDER: CharacterSortOrder = "desc";

export interface CharacterState {
  /** Current search box value (debounced before request). */
  searchQuery: string;
  /** Last results returned by the Venice list endpoint. */
  results: VeniceCharacter[];
  /** Character selected for the "Chat" button. */
  selectedCharacter: VeniceCharacter | null;
  /** Persisted character slug for the next character chat. */
  selectedCharacterSlug: string | null;
  /** When false, adult characters are filtered out client-side. */
  includeAdultCharacters: boolean;
  /** When true, only web-enabled characters are returned. */
  webEnabledOnly: boolean;
  /** Loading state for the current search. */
  isLoading: boolean;
  /** Last error message (redacted / safe for the UI). */
  error: string | null;
  /** Current sort key. */
  sortBy: CharacterSortBy;
  /** Current sort direction. */
  sortOrder: CharacterSortOrder;
  /** Result offset for pagination. */
  offset: number;
  /** True when the last request returned a full page, indicating
   *  more results may exist. */
  hasMore: boolean;

  setSearchQuery: (q: string) => void;
  setSortBy: (sortBy: CharacterSortBy) => void;
  setSortOrder: (order: CharacterSortOrder) => void;
  setIncludeAdult: (include: boolean) => void;
  setWebEnabledOnly: (only: boolean) => void;
  searchCharacters: (query?: string) => Promise<void>;
  loadMore: () => Promise<void>;
  selectCharacter: (character: VeniceCharacter) => void;
  clearCharacter: () => void;
  fetchBySlug: (slug: string) => Promise<VeniceCharacter | null>;
}

/** Filters a list of characters by the UI's adult/web-enabled toggles.
 *  The service still receives the raw `isAdult` flag; this is purely a
 *  client-side second line of defense. */
function applyClientFilters(
  characters: VeniceCharacter[],
  includeAdult: boolean,
  webEnabledOnly: boolean,
): VeniceCharacter[] {
  return characters.filter((c) => {
    if (!includeAdult && c.adult) return false;
    if (webEnabledOnly && !c.webEnabled) return false;
    return true;
  });
}

export const useCharacterStore = create<CharacterState>((set, get) => ({
  searchQuery: "",
  results: [],
  selectedCharacter: null,
  selectedCharacterSlug: null,
  includeAdultCharacters: false,
  webEnabledOnly: false,
  isLoading: false,
  error: null,
  sortBy: DEFAULT_SORT_BY,
  sortOrder: DEFAULT_SORT_ORDER,
  offset: 0,
  hasMore: false,

  setSearchQuery: (q) => set({ searchQuery: q }),
  setSortBy: (sortBy) => {
    set({ sortBy, offset: 0 });
    void get().searchCharacters();
  },
  setSortOrder: (sortOrder) => {
    set({ sortOrder, offset: 0 });
    void get().searchCharacters();
  },
  setIncludeAdult: (includeAdultCharacters) => {
    set({ includeAdultCharacters, offset: 0 });
    void get().searchCharacters();
  },
  setWebEnabledOnly: (webEnabledOnly) => {
    set({ webEnabledOnly, offset: 0 });
    void get().searchCharacters();
  },

  searchCharacters: async (queryOverride) => {
    const state = get();
    const search = (queryOverride ?? state.searchQuery).trim();
    set({ isLoading: true, error: null, offset: 0 });
    try {
      const list = await listCharacters({
        search: search || undefined,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
        isAdult: state.includeAdultCharacters || undefined,
        isWebEnabled: state.webEnabledOnly || undefined,
        limit: DEFAULT_PAGE_SIZE,
        offset: 0,
      });
      const filtered = applyClientFilters(list, state.includeAdultCharacters, state.webEnabledOnly);
      set({
        results: filtered,
        isLoading: false,
        offset: filtered.length,
        hasMore: list.length >= DEFAULT_PAGE_SIZE,
      });
    } catch (err) {
      logger.error("[character-store] Failed to load characters", err);
      set({ isLoading: false, error: redactErrorMessage(err) });
    }
  },

  loadMore: async () => {
    const state = get();
    if (state.isLoading || !state.hasMore) return;
    set({ isLoading: true, error: null });
    try {
      const list = await listCharacters({
        search: state.searchQuery.trim() || undefined,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
        isAdult: state.includeAdultCharacters || undefined,
        isWebEnabled: state.webEnabledOnly || undefined,
        limit: DEFAULT_PAGE_SIZE,
        offset: state.offset,
      });
      const filtered = applyClientFilters(list, state.includeAdultCharacters, state.webEnabledOnly);
      set((s) => ({
        results: [...s.results, ...filtered],
        isLoading: false,
        offset: s.offset + filtered.length,
        hasMore: list.length >= DEFAULT_PAGE_SIZE,
      }));
    } catch (err) {
      logger.error("[character-store] Failed to load more characters", err);
      set({ isLoading: false, error: redactErrorMessage(err) });
    }
  },

  selectCharacter: (character) => {
    set({
      selectedCharacter: character,
      selectedCharacterSlug: character.slug,
    });
  },

  clearCharacter: () => {
    set({ selectedCharacter: null, selectedCharacterSlug: null });
  },

  fetchBySlug: async (slug) => {
    try {
      const character = await getCharacter(slug);
      set({ selectedCharacter: character, selectedCharacterSlug: character.slug });
      return character;
    } catch (err) {
      logger.error("[character-store] Failed to fetch character", err);
      set({ error: redactErrorMessage(err) });
      return null;
    }
  },
}));
